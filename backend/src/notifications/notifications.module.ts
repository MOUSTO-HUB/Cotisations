import { Global, Module } from '@nestjs/common';
import { ConsoleSmsSender, SmsSender } from '../auth/sms/sms-sender';
import { NotificationsService } from './notifications.service';

/** SMS (console en développement) et notifications aux membres. */
@Global()
@Module({
  providers: [
    { provide: SmsSender, useClass: ConsoleSmsSender },
    NotificationsService,
  ],
  exports: [SmsSender, NotificationsService],
})
export class NotificationsModule {}
