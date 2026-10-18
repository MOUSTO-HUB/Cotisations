import { Module } from '@nestjs/common';
import { CashboxService } from '../cashbox/cashbox.service';
import { GroupsModule } from '../groups/groups.module';
import { ContributionsController } from './contributions.controller';
import { ContributionsService } from './contributions.service';
import { PaymentsService } from './payments.service';

@Module({
  imports: [GroupsModule],
  controllers: [ContributionsController],
  providers: [ContributionsService, PaymentsService, CashboxService],
})
export class ContributionsModule {}
