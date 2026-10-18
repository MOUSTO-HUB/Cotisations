import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { ConsoleSmsSender, SmsSender } from './sms/sms-sender';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    { provide: SmsSender, useClass: ConsoleSmsSender },
    // Toutes les routes exigent une session, sauf celles marquées @Public().
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AuthModule {}
