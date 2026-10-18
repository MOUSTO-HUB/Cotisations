import { Module } from '@nestjs/common';
import { GroupsModule } from '../groups/groups.module';
import { VotesController } from './votes.controller';
import { VotesService } from './votes.service';

@Module({
  imports: [GroupsModule],
  controllers: [VotesController],
  providers: [VotesService],
})
export class VotesModule {}
