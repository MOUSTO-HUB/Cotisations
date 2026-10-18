import { Module } from '@nestjs/common';
import { AuditReadModule } from './audit/audit-read.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CashboxModule } from './cashbox/cashbox.module';
import { ContributionsModule } from './contributions/contributions.module';
import { ExpensesModule } from './expenses/expenses.module';
import { GroupsModule } from './groups/groups.module';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { TontinesModule } from './tontines/tontines.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    AuthModule,
    UsersModule,
    GroupsModule,
    ContributionsModule,
    CashboxModule,
    ExpensesModule,
    AuditReadModule,
    TontinesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
