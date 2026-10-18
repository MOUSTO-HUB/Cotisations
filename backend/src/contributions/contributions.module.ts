import { Module } from '@nestjs/common';
import { GroupsModule } from '../groups/groups.module';
import { ContributionsController } from './contributions.controller';
import { ContributionsService } from './contributions.service';
import { PaymentsService } from './payments.service';
import { PenaltiesService } from './penalties.service';

@Module({
  imports: [GroupsModule],
  controllers: [ContributionsController],
  providers: [ContributionsService, PaymentsService, PenaltiesService],
  exports: [PaymentsService],
})
export class ContributionsModule {}
