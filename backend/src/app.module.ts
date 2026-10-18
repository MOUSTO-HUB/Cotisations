import { Module } from '@nestjs/common';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { ContributionsModule } from './contributions/contributions.module';
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
    TontinesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
