import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { type AuthContext, CurrentAuth } from '../auth/auth-context';
import { GroupsService } from '../groups/groups.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('groups/:groupId/audit')
export class AuditController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly groups: GroupsService,
  ) {}

  /**
   * Journal d'audit du groupe, du plus récent au plus ancien.
   * Réservé au bureau (droit `audit.read`). Pagination par `before` (date ISO).
   */
  @Get()
  async list(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('before') before?: string,
  ) {
    await this.groups.requireMembership(groupId, auth.user.id, {
      permission: 'audit.read',
    });
    const beforeDate = before ? new Date(before) : undefined;
    const entries = await this.prisma.auditLog.findMany({
      where: {
        groupId,
        ...(beforeDate && !isNaN(beforeDate.getTime())
          ? { createdAt: { lt: beforeDate } }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    });
    return entries.map((e) => ({
      id: e.id,
      createdAt: e.createdAt,
      actorId: e.actorId,
      action: e.action,
      entity: e.entity,
      entityId: e.entityId,
      data: e.data,
    }));
  }
}
