import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  groupId?: string;
  actorId?: string;
  /** Verbe au format `domaine.action`, ex. `membership.role_changed`. */
  action: string;
  entity: string;
  entityId: string;
  data?: Prisma.InputJsonValue;
}

/**
 * Journal d'audit (qui, quoi, quand). À appeler avec le client de la
 * transaction en cours, pour que l'audit et l'action réussissent ensemble.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(
    entry: AuditEntry,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    await tx.auditLog.create({ data: entry });
  }
}
