import { Module } from '@nestjs/common';
import { GroupsModule } from '../groups/groups.module';
import { AuditController } from './audit.controller';

/** Consultation du journal d'audit (l'écriture passe par AuditModule, global). */
@Module({
  imports: [GroupsModule],
  controllers: [AuditController],
})
export class AuditReadModule {}
