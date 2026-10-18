import { Module } from '@nestjs/common';
import { AuditReadModule } from './audit/audit-read.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CashboxModule } from './cashbox/cashbox.module';
import { ContributionsModule } from './contributions/contributions.module';
import { DonationsModule } from './donations/donations.module';
import { ExpensesModule } from './expenses/expenses.module';
import { GroupsModule } from './groups/groups.module';
import { HealthController } from './health/health.controller';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './projects/projects.module';
import { SolidarityModule } from './solidarity/solidarity.module';
import { TontinesModule } from './tontines/tontines.module';
import { UsersModule } from './users/users.module';
import { VotesModule } from './votes/votes.module';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    NotificationsModule,
    AuthModule,
    UsersModule,
    GroupsModule,
    ContributionsModule,
    CashboxModule,
    ExpensesModule,
    DonationsModule,
    ProjectsModule,
    SolidarityModule,
    VotesModule,
    AuditReadModule,
    TontinesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
