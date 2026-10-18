import { Module } from '@nestjs/common';
import { GroupsModule } from '../groups/groups.module';
import { DonationsController } from './donations.controller';
import { DonationsService } from './donations.service';

@Module({
  imports: [GroupsModule],
  controllers: [DonationsController],
  providers: [DonationsService],
})
export class DonationsModule {}
