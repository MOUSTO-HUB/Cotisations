import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { CashboxService } from '../cashbox/cashbox.service';
import { fromDbDate, todayIn, toDbDate } from '../common/calendar';
import { formatDayFr, formatMoney } from '../common/format';
import { parseAmount } from '../common/money';
import { displayedStatus } from '../contributions/domain/contribution-rules';
import { PaymentsService } from '../contributions/payments.service';
import { readGroupRules } from '../groups/domain/group-rules';
import { GroupsService } from '../groups/groups.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SmsSender } from '../auth/sms/sms-sender';
import { PrismaService } from '../prisma/prisma.service';
import { drawOrder } from './domain/draw-order';
import {
  assertSwappable,
  collectedForRound,
  isDefaulter,
  roundStatus,
  TontineRuleError,
  turnsFromOrder,
} from './domain/tontine-rounds';
import {
  computeTontineSchedule,
  TontineParamsError,
} from './domain/tontine-schedule';
import {
  CreateCycleDto,
  RequestSwapDto,
  RoundPaymentDto,
  SetOrderDto,
  SetSharesDto,
} from './dto/cycle.dto';

const CYCLE_INCLUDE = {
  group: true,
  shares: {
    include: { membership: { include: { user: true } } },
    orderBy: [{ turn: 'asc' }, { id: 'asc' }],
  },
  rounds: {
    include: {
      dues: true,
      beneficiary: { include: { membership: { include: { user: true } } } },
    },
    orderBy: { number: 'asc' },
  },
  swaps: { orderBy: { createdAt: 'desc' } },
} satisfies Prisma.TontineCycleInclude;

type CycleWithDetails = Prisma.TontineCycleGetPayload<{
  include: typeof CYCLE_INCLUDE;
}>;

@Injectable()
export class TontineCyclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly groups: GroupsService,
    private readonly cashbox: CashboxService,
    private readonly payments: PaymentsService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly sms: SmsSender,
  ) {}

  // ---------- Préparation (brouillon) ----------

  /** Le président crée le cycle : montant par part, période, date de début, mode d'ordre. */
  async create(groupId: string, actor: User, dto: CreateCycleDto) {
    await this.groups.requireMembership(groupId, actor.id, {
      permission: 'group.update',
    });
    const group = await this.prisma.group.findUniqueOrThrow({
      where: { id: groupId },
    });
    if (group.type !== 'TONTINE') {
      throw new BadRequestException(
        'Les cycles de tontine se créent dans un groupe de type tontine.',
      );
    }
    const contributionAmount = parseAmount(dto.contributionAmount);
    // Valide les paramètres (période, intervalle, date) avec le moteur de calcul.
    this.schedule({ ...dto, contributionAmount, shareCount: 2 });

    const cycle = await this.prisma.$transaction(async (tx) => {
      const name = dto.name.trim();
      const cashbox = await tx.cashbox.create({
        data: { groupId, kind: 'TONTINE', name: `Tontine : ${name}` },
      });
      const created = await tx.tontineCycle.create({
        data: {
          groupId,
          cashboxId: cashbox.id,
          name,
          createdById: actor.id,
          contributionAmount,
          shareCount: 0,
          periodicity: dto.periodicity,
          intervalDays:
            dto.periodicity === 'CUSTOM_DAYS' ? dto.intervalDays : null,
          startDate: toDbDate(dto.startDate),
          orderMode: dto.orderMode,
        },
      });
      await this.log(tx, groupId, actor.id, 'tontine.created', created.id, {
        name,
        contributionAmount: dto.contributionAmount,
        periodicity: dto.periodicity,
        orderMode: dto.orderMode,
      });
      return created;
    });
    return this.get(groupId, actor.id, cycle.id);
  }

  /**
   * Inscrit les parts (RG-T5 : seulement avant le début du cycle).
   * Un membre peut détenir plusieurs parts : il recevra le pot plusieurs fois.
   */
  async setShares(
    groupId: string,
    actor: User,
    cycleId: string,
    dto: SetSharesDto,
  ) {
    await this.groups.requireMembership(groupId, actor.id, {
      permission: 'group.update',
    });
    const cycle = await this.findDraft(groupId, cycleId);
    if (cycle.drawSeed) {
      throw new ConflictException(
        'Le tirage au sort a déjà eu lieu : les parts ne peuvent plus changer.',
      );
    }
    const ids = dto.members.map((m) => m.membershipId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException(
        'Un membre apparaît deux fois : indiquez plutôt son nombre de parts.',
      );
    }
    const active = await this.prisma.membership.count({
      where: { id: { in: ids }, groupId, status: 'ACTIVE' },
    });
    if (active !== ids.length) {
      throw new BadRequestException(
        'Seuls les membres actifs du groupe peuvent prendre des parts.',
      );
    }
    const shares = dto.members.flatMap((m) =>
      Array.from({ length: m.parts ?? 1 }, () => ({
        cycleId,
        membershipId: m.membershipId,
      })),
    );
    if (shares.length < 2 || shares.length > 100) {
      throw new BadRequestException(
        'Une tontine compte entre 2 et 100 parts au total.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // Brouillon : aucune échéance ni aucun tour n'existe encore.
      await tx.tontineShare.deleteMany({ where: { cycleId } });
      await tx.tontineShare.createMany({ data: shares });
      await tx.tontineCycle.update({
        where: { id: cycleId },
        data: { shareCount: shares.length },
      });
      await this.log(tx, groupId, actor.id, 'tontine.shares_set', cycleId, {
        shareCount: shares.length,
        members: dto.members.map((m) => ({
          membershipId: m.membershipId,
          parts: m.parts ?? 1,
        })),
      });
    });
    return this.get(groupId, actor.id, cycleId);
  }

  /** Ordre fixé par le président (mode FIXED). */
  async setOrder(
    groupId: string,
    actor: User,
    cycleId: string,
    dto: SetOrderDto,
  ) {
    await this.groups.requireMembership(groupId, actor.id, {
      permission: 'group.update',
    });
    const cycle = await this.findDraft(groupId, cycleId);
    if (cycle.orderMode !== 'FIXED') {
      throw new ConflictException(
        "Cette tontine fonctionne par tirage au sort : l'ordre ne se fixe pas à la main.",
      );
    }
    const turns = this.rule(() =>
      turnsFromOrder(
        cycle.shares.map((s) => s.id),
        dto.shareIds,
      ),
    );
    await this.prisma.$transaction(async (tx) => {
      for (const [shareId, turn] of turns) {
        await tx.tontineShare.update({
          where: { id: shareId },
          data: { turn },
        });
      }
      await this.log(tx, groupId, actor.id, 'tontine.order_set', cycleId, {
        order: dto.shareIds,
      });
    });
    return this.get(groupId, actor.id, cycleId);
  }

  /**
   * RG-T4 : tirage au sort fait par le serveur, horodaté, archivé, et qui ne
   * peut jamais être relancé.
   */
  async draw(groupId: string, actor: User, cycleId: string) {
    await this.groups.requireMembership(groupId, actor.id, {
      permission: 'group.update',
    });
    const cycle = await this.findDraft(groupId, cycleId);
    if (cycle.orderMode !== 'DRAW') {
      throw new ConflictException(
        'Cette tontine a un ordre fixé, pas de tirage.',
      );
    }
    if (cycle.shares.length < 2) {
      throw new ConflictException("Inscrivez d'abord les parts des membres.");
    }

    await this.prisma.$transaction(async (tx) => {
      // Garde atomique : un seul tirage, même en cas de double clic.
      const claimed = await tx.tontineCycle.updateMany({
        where: { id: cycleId, drawSeed: { equals: Prisma.AnyNull } },
        data: { drawSeed: { pending: true } },
      });
      if (claimed.count !== 1) {
        throw new ConflictException(
          'Le tirage au sort a déjà eu lieu et ne peut pas être relancé.',
        );
      }
      const order = drawOrder(cycle.shares.map((s) => s.id));
      for (const [i, shareId] of order.entries()) {
        await tx.tontineShare.update({
          where: { id: shareId },
          data: { turn: i + 1 },
        });
      }
      const seed = {
        drawnAt: new Date().toISOString(),
        drawnById: actor.id,
        order,
      };
      await tx.tontineCycle.update({
        where: { id: cycleId },
        data: { drawSeed: seed },
      });
      await this.log(tx, groupId, actor.id, 'tontine.drawn', cycleId, seed);
    });
    return this.get(groupId, actor.id, cycleId);
  }

  /**
   * Démarre le cycle : calendrier des tours (RG-T1 : pot = montant × parts),
   * bénéficiaire de chaque tour, et une échéance par part et par tour.
   * Les paramètres sont dès lors verrouillés.
   */
  async start(groupId: string, actor: User, cycleId: string) {
    await this.groups.requireMembership(groupId, actor.id, {
      permission: 'group.update',
    });
    const cycle = await this.findDraft(groupId, cycleId);
    if (cycle.shares.length < 2) {
      throw new ConflictException("Inscrivez d'abord les parts des membres.");
    }
    if (cycle.shares.some((s) => s.turn === null)) {
      throw new ConflictException(
        cycle.orderMode === 'DRAW'
          ? "Faites d'abord le tirage au sort."
          : "Fixez d'abord l'ordre des bénéficiaires.",
      );
    }
    const schedule = this.schedule({
      contributionAmount: cycle.contributionAmount,
      shareCount: cycle.shares.length,
      periodicity: cycle.periodicity,
      intervalDays: cycle.intervalDays ?? undefined,
      startDate: fromDbDate(cycle.startDate),
    });

    await this.prisma.$transaction(async (tx) => {
      for (const r of schedule.rounds) {
        const beneficiary = cycle.shares.find((s) => s.turn === r.number)!;
        const round = await tx.tontineRound.create({
          data: {
            cycleId,
            number: r.number,
            dueDate: toDbDate(r.dueDate),
            potAmount: r.potAmount,
            beneficiaryId: beneficiary.id,
          },
        });
        await tx.due.createMany({
          data: cycle.shares.map((s) => ({
            membershipId: s.membershipId,
            roundId: round.id,
            amountDue: (cycle.contributionAmount * BigInt(s.fraction)) / 100n,
            dueDate: toDbDate(r.dueDate),
          })),
        });
      }
      await tx.tontineCycle.update({
        where: { id: cycleId },
        data: { status: 'ACTIVE', startedAt: new Date(), lockedAt: new Date() },
      });
      await this.log(tx, groupId, actor.id, 'tontine.started', cycleId, {
        potAmount: schedule.potAmount.toString(),
        rounds: schedule.roundCount,
        endDate: schedule.endDate,
      });
    });

    await this.notifications.notifyActiveMembers(
      groupId,
      `${cycle.group.name} : la tontine « ${cycle.name} » commence le ${formatDayFr(fromDbDate(cycle.startDate))}. ` +
        `${formatMoney(cycle.contributionAmount, cycle.group.currency)} par part, pot de ${formatMoney(schedule.potAmount, cycle.group.currency)}. ` +
        `Votre tour est indiqué dans le calendrier.`,
      { excludeUserIds: [actor.id] },
    );
    return this.get(groupId, actor.id, cycleId);
  }

  async cancel(groupId: string, actor: User, cycleId: string, reason: string) {
    await this.groups.requireMembership(groupId, actor.id, {
      permission: 'group.update',
    });
    await this.findDraft(groupId, cycleId);
    await this.prisma.$transaction(async (tx) => {
      await tx.tontineCycle.update({
        where: { id: cycleId },
        data: { status: 'CANCELLED', cancelReason: reason.trim() },
      });
      await this.log(tx, groupId, actor.id, 'tontine.cancelled', cycleId, {
        reason: reason.trim(),
      });
    });
    return this.get(groupId, actor.id, cycleId);
  }

  // ---------- Consultation ----------

  async list(groupId: string, userId: string) {
    await this.groups.requireMembership(groupId, userId);
    const cycles = await this.prisma.tontineCycle.findMany({
      where: { groupId },
      orderBy: { createdAt: 'desc' },
    });
    return cycles.map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      contributionAmount: c.contributionAmount.toString(),
      shareCount: c.shareCount,
      potAmount: (c.contributionAmount * BigInt(c.shareCount)).toString(),
      periodicity: c.periodicity,
      startDate: fromDbDate(c.startDate),
      orderMode: c.orderMode,
    }));
  }

  /** Calendrier visible de tous : qui reçoit quand, avancement de chaque tour, défaillances. */
  async get(groupId: string, userId: string, cycleId: string) {
    await this.groups.requireMembership(groupId, userId);
    return this.view(await this.findCycle(groupId, cycleId));
  }

  // ---------- Déroulement ----------

  /** Le trésorier enregistre le versement d'un membre pour un tour. */
  async pay(
    groupId: string,
    actor: User,
    cycleId: string,
    roundNumber: number,
    dto: RoundPaymentDto,
  ) {
    const cycle = await this.findActive(groupId, cycleId);
    const round = this.findRound(cycle, roundNumber);
    const owed = round.dues
      .filter((d) => d.membershipId === dto.membershipId)
      .reduce((sum, d) => sum + d.amountDue - d.amountPaid, 0n);
    if (owed === 0n && !dto.amount) {
      throw new ConflictException(
        "Ce membre n'a rien à verser pour ce tour (déjà payé ou sans part).",
      );
    }
    return this.payments.recordTontineCash(groupId, actor, {
      membershipId: dto.membershipId,
      roundId: round.id,
      amount: dto.amount ? parseAmount(dto.amount) : owed,
      idempotencyKey: dto.idempotencyKey,
      cashboxId: cycle.cashboxId,
      label: `${cycle.name} — tour ${round.number}`,
    });
  }

  /**
   * Le trésorier remet le pot au bénéficiaire. RG-T2 : seulement quand toutes
   * les parts du tour ont payé ; le tour n'est clos qu'à la confirmation du
   * bénéficiaire.
   */
  async payout(
    groupId: string,
    actor: User,
    cycleId: string,
    roundNumber: number,
  ) {
    await this.groups.requireMembership(groupId, actor.id, {
      permission: 'finance.record',
    });
    const cycle = await this.findActive(groupId, cycleId);
    const round = this.findRound(cycle, roundNumber);
    if (round.paidOutAt) {
      throw new ConflictException('Le pot de ce tour a déjà été versé.');
    }
    const unpaid = round.dues.filter(
      (d) => d.status !== 'PAID' && d.status !== 'EXEMPT',
    ).length;
    if (unpaid > 0) {
      throw new ConflictException(
        `Tour incomplet : ${unpaid} part(s) n'ont pas encore payé (RG-T2).`,
      );
    }
    const pot = collectedForRound(round.dues);
    const beneficiary = round.beneficiary!.membership;

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.tontineRound.updateMany({
        where: { id: round.id, paidOutAt: null },
        data: {
          paidOutAt: new Date(),
          paidOutById: actor.id,
          status: 'PAID_OUT',
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('Le pot de ce tour a déjà été versé.');
      }
      const balance = await this.cashbox.lockAndGetBalance(tx, cycle.cashboxId);
      if (balance < pot) {
        throw new ConflictException(
          `Solde de la tontine insuffisant (${balance}) pour verser le pot (${pot}).`,
        );
      }
      await tx.movement.create({
        data: {
          cashboxId: cycle.cashboxId,
          direction: 'OUT',
          amount: pot,
          category: 'tontine_pot',
          label: `${cycle.name} — pot du tour ${round.number} à ${beneficiary.user.fullName}`,
          authorId: actor.id,
        },
      });
      await this.log(tx, groupId, actor.id, 'tontine.pot_paid_out', cycleId, {
        round: round.number,
        amount: pot.toString(),
        beneficiaryMembershipId: beneficiary.id,
      });
    });

    await this.notifyUser(
      beneficiary.user.phone,
      `${cycle.group.name} : le pot du tour ${round.number} de « ${cycle.name} » ` +
        `(${formatMoney(pot, cycle.group.currency)}) vous a été remis. Confirmez la réception dans l'application.`,
    );
    return this.get(groupId, actor.id, cycleId);
  }

  /** Le bénéficiaire confirme avoir reçu le pot ; le dernier tour confirmé clôt le cycle. */
  async confirmReceipt(
    groupId: string,
    user: User,
    cycleId: string,
    roundNumber: number,
  ) {
    await this.groups.requireMembership(groupId, user.id);
    const cycle = await this.findActive(groupId, cycleId);
    const round = this.findRound(cycle, roundNumber);
    if (round.beneficiary?.membership.userId !== user.id) {
      throw new ForbiddenException(
        'Seul le bénéficiaire du tour peut confirmer la réception du pot.',
      );
    }
    if (!round.paidOutAt) {
      throw new ConflictException(
        "Le pot de ce tour n'a pas encore été versé.",
      );
    }
    if (round.receiptConfirmed) {
      throw new ConflictException('Réception déjà confirmée.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.tontineRound.update({
        where: { id: round.id },
        data: { receiptConfirmed: true, receiptConfirmedAt: new Date() },
      });
      const remaining = await tx.tontineRound.count({
        where: { cycleId, receiptConfirmed: false },
      });
      if (remaining === 0) {
        await tx.tontineCycle.update({
          where: { id: cycleId },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });
      }
      await this.log(tx, groupId, user.id, 'tontine.pot_received', cycleId, {
        round: round.number,
        cycleCompleted: remaining === 0,
      });
    });
    return this.get(groupId, user.id, cycleId);
  }

  // ---------- Échanges de tours ----------

  /** Le bénéficiaire d'un tour propose d'échanger avec un autre tour. */
  async requestSwap(
    groupId: string,
    user: User,
    cycleId: string,
    dto: RequestSwapDto,
  ) {
    await this.groups.requireMembership(groupId, user.id);
    const cycle = await this.findActive(groupId, cycleId);
    const mine = this.findRound(cycle, dto.myRound);
    const other = this.findRound(cycle, dto.otherRound);
    if (mine.beneficiary?.membership.userId !== user.id) {
      throw new ForbiddenException(
        "Vous n'êtes pas le bénéficiaire de ce tour.",
      );
    }
    this.rule(() =>
      assertSwappable(
        {
          paidOutAt: mine.paidOutAt,
          beneficiaryMembershipId: mine.beneficiary!.membershipId,
        },
        {
          paidOutAt: other.paidOutAt,
          beneficiaryMembershipId: other.beneficiary?.membershipId ?? null,
        },
      ),
    );
    const open = cycle.swaps.some(
      (s) =>
        ['REQUESTED', 'ACCEPTED'].includes(s.status) &&
        [s.roundAId, s.roundBId].some(
          (id) => id === mine.id || id === other.id,
        ),
    );
    if (open) {
      throw new ConflictException(
        'Un échange est déjà en cours pour l’un de ces tours.',
      );
    }
    const swap = await this.prisma.$transaction(async (tx) => {
      const created = await tx.tontineSwap.create({
        data: {
          cycleId,
          roundAId: mine.id,
          roundBId: other.id,
          requestedById: user.id,
        },
      });
      await this.log(tx, groupId, user.id, 'tontine.swap_requested', cycleId, {
        swapId: created.id,
        rounds: [mine.number, other.number],
      });
      return created;
    });
    await this.notifyUser(
      other.beneficiary!.membership.user.phone,
      `${cycle.group.name} : ${user.fullName} propose d'échanger son tour ${mine.number} contre votre tour ${other.number} dans « ${cycle.name} ». Répondez dans l'application.`,
    );
    return { swapId: swap.id, status: swap.status };
  }

  /** Le bénéficiaire de l'autre tour accepte l'échange. */
  async acceptSwap(
    groupId: string,
    user: User,
    cycleId: string,
    swapId: string,
  ) {
    await this.groups.requireMembership(groupId, user.id);
    const cycle = await this.findActive(groupId, cycleId);
    const swap = this.findSwap(cycle, swapId, 'REQUESTED');
    const roundB = cycle.rounds.find((r) => r.id === swap.roundBId)!;
    if (roundB.beneficiary?.membership.userId !== user.id) {
      throw new ForbiddenException(
        "Seul le bénéficiaire du tour demandé peut accepter l'échange.",
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.tontineSwap.update({
        where: { id: swap.id },
        data: { status: 'ACCEPTED', acceptedById: user.id },
      });
      await this.log(tx, groupId, user.id, 'tontine.swap_accepted', cycleId, {
        swapId,
      });
    });
    return { swapId, status: 'ACCEPTED' };
  }

  /** Le président valide (les tours sont échangés) ou refuse. */
  async decideSwap(
    groupId: string,
    actor: User,
    cycleId: string,
    swapId: string,
    decision: 'APPROVE' | 'REJECT',
  ) {
    await this.groups.requireMembership(groupId, actor.id, {
      permission: 'group.update',
    });
    const cycle = await this.findActive(groupId, cycleId);
    const swap = this.findSwap(cycle, swapId, 'ACCEPTED');
    const a = cycle.rounds.find((r) => r.id === swap.roundAId)!;
    const b = cycle.rounds.find((r) => r.id === swap.roundBId)!;

    await this.prisma.$transaction(async (tx) => {
      if (decision === 'APPROVE') {
        this.rule(() =>
          assertSwappable(
            {
              paidOutAt: a.paidOutAt,
              beneficiaryMembershipId: a.beneficiary!.membershipId,
            },
            {
              paidOutAt: b.paidOutAt,
              beneficiaryMembershipId: b.beneficiary!.membershipId,
            },
          ),
        );
        await tx.tontineRound.update({
          where: { id: a.id },
          data: { beneficiaryId: b.beneficiaryId },
        });
        await tx.tontineRound.update({
          where: { id: b.id },
          data: { beneficiaryId: a.beneficiaryId },
        });
        await tx.tontineShare.update({
          where: { id: a.beneficiaryId! },
          data: { turn: b.number },
        });
        await tx.tontineShare.update({
          where: { id: b.beneficiaryId! },
          data: { turn: a.number },
        });
      }
      await tx.tontineSwap.update({
        where: { id: swap.id },
        data: {
          status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
          decidedById: actor.id,
          decidedAt: new Date(),
        },
      });
      await this.log(
        tx,
        groupId,
        actor.id,
        decision === 'APPROVE'
          ? 'tontine.swap_approved'
          : 'tontine.swap_rejected',
        cycleId,
        { swapId, rounds: [a.number, b.number] },
      );
    });
    return this.get(groupId, actor.id, cycleId);
  }

  // ---------- interne ----------

  private view(cycle: CycleWithDetails) {
    const today = todayIn(cycle.group.timezone);
    const { graceDays } = readGroupRules(
      cycle.group.rules,
      cycle.group.currency,
    );
    const potAmount = cycle.contributionAmount * BigInt(cycle.shareCount);

    // RG-T3 : retards par membre et défaillance après avoir été servi.
    const lateByMember = new Map<string, number>();
    const servedMembers = new Set<string>();
    for (const r of cycle.rounds) {
      if (r.paidOutAt && r.beneficiary)
        servedMembers.add(r.beneficiary.membershipId);
      for (const d of r.dues) {
        const status = displayedStatus(
          {
            status: d.status === 'LATE' ? 'PENDING' : d.status,
            dueDate: fromDbDate(d.dueDate),
          },
          today,
          graceDays,
        );
        if (status === 'LATE') {
          lateByMember.set(
            d.membershipId,
            (lateByMember.get(d.membershipId) ?? 0) + 1,
          );
        }
      }
    }
    const nameOf = new Map(
      cycle.shares.map((s) => [s.membershipId, s.membership.user.fullName]),
    );

    return {
      id: cycle.id,
      name: cycle.name,
      status: cycle.status,
      cashboxId: cycle.cashboxId,
      contributionAmount: cycle.contributionAmount.toString(),
      currency: cycle.group.currency,
      periodicity: cycle.periodicity,
      intervalDays: cycle.intervalDays,
      startDate: fromDbDate(cycle.startDate),
      orderMode: cycle.orderMode,
      shareCount: cycle.shareCount,
      potAmount: potAmount.toString(),
      draw: cycle.drawSeed,
      startedAt: cycle.startedAt,
      completedAt: cycle.completedAt,
      cancelReason: cycle.cancelReason,
      shares: cycle.shares.map((s) => ({
        id: s.id,
        membershipId: s.membershipId,
        memberName: s.membership.user.fullName,
        turn: s.turn,
      })),
      rounds: cycle.rounds.map((r) => {
        const dues = r.dues.map((d) => ({
          membershipId: d.membershipId,
          amountDue: d.amountDue,
          amountPaid: d.amountPaid,
          status: d.status,
        }));
        return {
          number: r.number,
          dueDate: fromDbDate(r.dueDate),
          potAmount: r.potAmount.toString(),
          beneficiary: r.beneficiary
            ? {
                shareId: r.beneficiary.id,
                membershipId: r.beneficiary.membershipId,
                memberName: r.beneficiary.membership.user.fullName,
                userId: r.beneficiary.membership.userId,
              }
            : null,
          status: roundStatus(
            { dueDate: fromDbDate(r.dueDate), paidOutAt: r.paidOutAt, dues },
            today,
          ),
          collected: collectedForRound(dues).toString(),
          paidShares: dues.filter(
            (d) => d.status === 'PAID' || d.status === 'EXEMPT',
          ).length,
          totalShares: dues.length,
          unpaidMembers: [
            ...new Set(
              dues
                .filter((d) => d.status !== 'PAID' && d.status !== 'EXEMPT')
                .map((d) => nameOf.get(d.membershipId) ?? d.membershipId),
            ),
          ],
          paidOutAt: r.paidOutAt,
          receiptConfirmed: r.receiptConfirmed,
        };
      }),
      members: [...nameOf.entries()].map(([membershipId, memberName]) => {
        const lateDueCount = lateByMember.get(membershipId) ?? 0;
        const hasReceivedPot = servedMembers.has(membershipId);
        return {
          membershipId,
          memberName,
          parts: cycle.shares.filter((s) => s.membershipId === membershipId)
            .length,
          lateDueCount,
          hasReceivedPot,
          defaulter: isDefaulter({ hasReceivedPot, lateDueCount }),
        };
      }),
      swaps: cycle.swaps.map((s) => ({
        id: s.id,
        status: s.status,
        rounds: [
          cycle.rounds.find((r) => r.id === s.roundAId)?.number,
          cycle.rounds.find((r) => r.id === s.roundBId)?.number,
        ],
        requestedById: s.requestedById,
        createdAt: s.createdAt,
      })),
    };
  }

  private schedule(params: Parameters<typeof computeTontineSchedule>[0]) {
    try {
      return computeTontineSchedule(params);
    } catch (error) {
      if (error instanceof TontineParamsError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  private rule<T>(fn: () => T): T {
    try {
      return fn();
    } catch (error) {
      if (error instanceof TontineRuleError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }

  private async findCycle(groupId: string, cycleId: string) {
    const cycle = await this.prisma.tontineCycle.findFirst({
      where: { id: cycleId, groupId },
      include: CYCLE_INCLUDE,
    });
    if (!cycle) throw new NotFoundException('Tontine introuvable.');
    return cycle;
  }

  private async findDraft(groupId: string, cycleId: string) {
    const cycle = await this.findCycle(groupId, cycleId);
    if (cycle.status !== 'DRAFT') {
      throw new ConflictException(
        'La tontine a commencé : ses paramètres et ses parts sont verrouillés.',
      );
    }
    return cycle;
  }

  private async findActive(groupId: string, cycleId: string) {
    const cycle = await this.findCycle(groupId, cycleId);
    if (cycle.status !== 'ACTIVE') {
      throw new ConflictException("Cette tontine n'est pas en cours.");
    }
    return cycle;
  }

  private findRound(cycle: CycleWithDetails, number: number) {
    const round = cycle.rounds.find((r) => r.number === number);
    if (!round) throw new NotFoundException(`Tour ${number} introuvable.`);
    return round;
  }

  private findSwap(cycle: CycleWithDetails, swapId: string, expected: string) {
    const swap = cycle.swaps.find((s) => s.id === swapId);
    if (!swap) throw new NotFoundException('Échange introuvable.');
    if (swap.status !== expected) {
      throw new ConflictException(`Cet échange est déjà ${swap.status}.`);
    }
    return swap;
  }

  private async notifyUser(phone: string, message: string) {
    try {
      await this.sms.send(phone, message);
    } catch {
      // un SMS non envoyé n'annule jamais l'action
    }
  }

  private log(
    tx: Prisma.TransactionClient,
    groupId: string,
    actorId: string,
    action: string,
    cycleId: string,
    data?: Prisma.InputJsonValue,
  ) {
    return this.audit.log(
      {
        groupId,
        actorId,
        action,
        entity: 'TontineCycle',
        entityId: cycleId,
        data,
      },
      tx,
    );
  }
}
