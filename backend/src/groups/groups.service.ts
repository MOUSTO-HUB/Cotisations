import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Currency,
  GroupType,
  Membership,
  MembershipStatus,
  Prisma,
  Role,
  User,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import {
  countryOfPhone,
  InvalidPhoneError,
  isLaunchCountry,
  normalizePhone,
} from '../common/phone';
import { PrismaService } from '../prisma/prisma.service';
import { hasPermission, Permission } from './domain/permissions';
import { AddMemberDto } from './dto/add-member.dto';
import { CreateGroupDto } from './dto/create-group.dto';

const TIMEZONE_BY_COUNTRY: Record<string, string> = {
  GN: 'Africa/Conakry',
  SN: 'Africa/Dakar',
  CI: 'Africa/Abidjan',
};

/** Statuts qui comptent comme « dans le groupe ». */
const CURRENT_STATUSES: MembershipStatus[] = ['INVITED', 'ACTIVE'];

@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Crée le groupe ; le créateur en devient président (section 3). */
  async create(user: User, dto: CreateGroupDto) {
    const currency =
      dto.currency ??
      (user.country === 'SN' || user.country === 'CI'
        ? Currency.XOF
        : Currency.GNF);
    const timezone = TIMEZONE_BY_COUNTRY[user.country] ?? 'Africa/Conakry';

    return this.prisma.$transaction(async (tx) => {
      const group = await tx.group.create({
        data: {
          type: dto.type,
          name: dto.name.trim(),
          currency,
          timezone,
          memberships: {
            create: { userId: user.id, role: 'PRESIDENT', status: 'ACTIVE' },
          },
          cashboxes: { create: defaultCashboxes(dto.type) },
        },
        include: { cashboxes: true },
      });
      await this.audit.log(
        {
          groupId: group.id,
          actorId: user.id,
          action: 'group.created',
          entity: 'Group',
          entityId: group.id,
          data: { type: group.type, name: group.name, currency },
        },
        tx,
      );
      return {
        ...toGroupView(group),
        myRole: Role.PRESIDENT,
        myStatus: MembershipStatus.ACTIVE,
        cashboxes: group.cashboxes.map((c) => ({
          id: c.id,
          kind: c.kind,
          name: c.name,
        })),
      };
    });
  }

  async listMine(userId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: {
        userId,
        status: { in: CURRENT_STATUSES },
        group: { archived: false },
      },
      include: { group: true },
      orderBy: { joinedAt: 'desc' },
    });
    return memberships.map((m) => ({
      ...toGroupView(m.group),
      myRole: m.role,
      myStatus: m.status,
    }));
  }

  async get(groupId: string, userId: string) {
    const membership = await this.requireMembership(groupId, userId, {
      allowInvited: true,
    });
    const group = await this.prisma.group.findUniqueOrThrow({
      where: { id: groupId },
      include: {
        cashboxes: true,
        _count: { select: { memberships: { where: { status: 'ACTIVE' } } } },
      },
    });
    return {
      ...toGroupView(group),
      myRole: membership.role,
      myStatus: membership.status,
      activeMemberCount: group._count.memberships,
      cashboxes: group.cashboxes.map((c) => ({
        id: c.id,
        kind: c.kind,
        name: c.name,
      })),
    };
  }

  async listMembers(groupId: string, userId: string) {
    await this.requireMembership(groupId, userId);
    const memberships = await this.prisma.membership.findMany({
      where: { groupId, status: { in: CURRENT_STATUSES } },
      include: { user: true },
      orderBy: { joinedAt: 'asc' },
    });
    return memberships.map(toMemberView);
  }

  /**
   * Ajoute un membre. Une personne qui a déjà un compte est invitée et doit
   * accepter ; une personne sans compte (sans smartphone) est créée et
   * ajoutée directement, gérée par le bureau.
   */
  async addMember(groupId: string, actor: User, dto: AddMemberDto) {
    const actorMembership = await this.requireMembership(groupId, actor.id, {
      permission: 'members.invite',
    });
    const role = dto.role ?? Role.MEMBER;
    if (
      role !== Role.MEMBER &&
      !hasPermission(actorMembership.role, 'roles.assign')
    ) {
      throw new ForbiddenException(
        'Seul le président peut attribuer un rôle du bureau.',
      );
    }

    const phone = this.parsePhone(
      dto.phone,
      isLaunchCountry(actor.country) ? actor.country : 'GN',
    );

    return this.prisma.$transaction(async (tx) => {
      let user = await tx.user.findUnique({ where: { phone } });
      let status: MembershipStatus = 'INVITED';
      if (!user) {
        if (!dto.fullName?.trim()) {
          throw new BadRequestException({
            message:
              "Cette personne n'a pas encore de compte : indiquez son nom complet.",
            code: 'FULL_NAME_REQUIRED',
          });
        }
        const country = countryOfPhone(phone);
        user = await tx.user.create({
          data: {
            phone,
            fullName: dto.fullName.trim(),
            country: country === 'OTHER' ? actor.country : country,
          },
        });
        status = 'ACTIVE';
      }

      const existing = await tx.membership.findUnique({
        where: { userId_groupId: { userId: user.id, groupId } },
      });
      if (existing && existing.status !== 'LEFT') {
        throw new ConflictException('Cette personne est déjà dans le groupe.');
      }

      const data = { role, status, category: dto.category ?? null };
      const membership = existing
        ? await tx.membership.update({
            where: { id: existing.id },
            data: { ...data, joinedAt: new Date() },
            include: { user: true },
          })
        : await tx.membership.create({
            data: { ...data, userId: user.id, groupId },
            include: { user: true },
          });

      await this.audit.log(
        {
          groupId,
          actorId: actor.id,
          action: 'membership.added',
          entity: 'Membership',
          entityId: membership.id,
          data: { userId: user.id, role, status },
        },
        tx,
      );
      return toMemberView(membership);
    });
  }

  /** Accepte une invitation. */
  async join(groupId: string, userId: string) {
    const membership = await this.requireMembership(groupId, userId, {
      allowInvited: true,
    });
    if (membership.status === 'ACTIVE') {
      throw new ConflictException('Vous êtes déjà membre actif de ce groupe.');
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.membership.update({
        where: { id: membership.id },
        data: { status: 'ACTIVE', joinedAt: new Date() },
        include: { user: true },
      });
      await this.audit.log(
        {
          groupId,
          actorId: userId,
          action: 'membership.joined',
          entity: 'Membership',
          entityId: membership.id,
        },
        tx,
      );
      return toMemberView(updated);
    });
  }

  /** Change le rôle d'un membre ; l'historique est conservé dans l'audit. */
  async updateRole(
    groupId: string,
    actor: User,
    membershipId: string,
    role: Role,
  ) {
    await this.requireMembership(groupId, actor.id, {
      permission: 'roles.assign',
    });
    const target = await this.findTarget(groupId, membershipId);
    if (target.role === role) return toMemberView(target);

    return this.prisma.$transaction(async (tx) => {
      if (target.role === 'PRESIDENT') {
        await this.ensureAnotherPresident(tx, groupId, target.id);
      }
      const updated = await tx.membership.update({
        where: { id: target.id },
        data: { role },
        include: { user: true },
      });
      await this.audit.log(
        {
          groupId,
          actorId: actor.id,
          action: 'membership.role_changed',
          entity: 'Membership',
          entityId: target.id,
          data: { from: target.role, to: role },
        },
        tx,
      );
      return toMemberView(updated);
    });
  }

  /** Retire un membre, ou permet à un membre de quitter le groupe. */
  async removeMember(groupId: string, actor: User, membershipId: string) {
    const actorMembership = await this.requireMembership(groupId, actor.id, {
      allowInvited: true,
    });
    const target = await this.findTarget(groupId, membershipId);
    const isSelf = target.userId === actor.id;
    if (!isSelf && !hasPermission(actorMembership.role, 'members.remove')) {
      throw new ForbiddenException(
        "Vous n'avez pas le droit de retirer un membre.",
      );
    }

    await this.prisma.$transaction(async (tx) => {
      if (target.role === 'PRESIDENT') {
        await this.ensureAnotherPresident(tx, groupId, target.id);
      }
      await tx.membership.update({
        where: { id: target.id },
        data: { status: 'LEFT' },
      });
      await this.audit.log(
        {
          groupId,
          actorId: actor.id,
          action: isSelf ? 'membership.left' : 'membership.removed',
          entity: 'Membership',
          entityId: target.id,
        },
        tx,
      );
    });
  }

  /**
   * Vérifie que l'utilisateur appartient au groupe (et a le droit demandé).
   * Un non-membre reçoit 404 : l'existence du groupe ne lui est pas révélée.
   */
  async requireMembership(
    groupId: string,
    userId: string,
    options: { permission?: Permission; allowInvited?: boolean } = {},
  ): Promise<Membership> {
    const membership = await this.prisma.membership.findFirst({
      where: { groupId, userId, group: { archived: false } },
    });
    const allowed: MembershipStatus[] = options.allowInvited
      ? CURRENT_STATUSES
      : ['ACTIVE'];
    if (!membership || !allowed.includes(membership.status)) {
      throw new NotFoundException('Groupe introuvable.');
    }
    if (
      options.permission &&
      !hasPermission(membership.role, options.permission)
    ) {
      throw new ForbiddenException(
        'Votre rôle dans ce groupe ne permet pas cette action.',
      );
    }
    return membership;
  }

  private async findTarget(groupId: string, membershipId: string) {
    const target = await this.prisma.membership.findFirst({
      where: { id: membershipId, groupId, status: { in: CURRENT_STATUSES } },
      include: { user: true },
    });
    if (!target) throw new NotFoundException('Membre introuvable.');
    return target;
  }

  private async ensureAnotherPresident(
    tx: Prisma.TransactionClient,
    groupId: string,
    excludedMembershipId: string,
  ) {
    const others = await tx.membership.count({
      where: {
        groupId,
        role: 'PRESIDENT',
        status: 'ACTIVE',
        id: { not: excludedMembershipId },
      },
    });
    if (others === 0) {
      throw new BadRequestException(
        "Le groupe doit garder au moins un président. Nommez d'abord un autre président.",
      );
    }
  }

  private parsePhone(
    input: string,
    country: Parameters<typeof normalizePhone>[1],
  ) {
    try {
      return normalizePhone(input, country);
    } catch (error) {
      if (error instanceof InvalidPhoneError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}

function defaultCashboxes(type: GroupType) {
  const general = { kind: 'GENERAL' as const, name: 'Caisse générale' };
  if (type === 'TONTINE') return [general];
  return [
    general,
    { kind: 'SOLIDARITY' as const, name: 'Fonds de solidarité' },
  ];
}

function toGroupView(group: {
  id: string;
  type: GroupType;
  name: string;
  currency: Currency;
  timezone: string;
  createdAt: Date;
}) {
  return {
    id: group.id,
    type: group.type,
    name: group.name,
    currency: group.currency,
    timezone: group.timezone,
    createdAt: group.createdAt,
  };
}

function toMemberView(m: Membership & { user: User }) {
  return {
    membershipId: m.id,
    userId: m.userId,
    fullName: m.user.fullName,
    phone: m.user.phone,
    role: m.role,
    status: m.status,
    category: m.category,
    joinedAt: m.joinedAt,
  };
}
