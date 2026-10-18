import { Module } from '@nestjs/common';
import { CashboxModule } from '../cashbox/cashbox.module';
import { ContributionsModule } from '../contributions/contributions.module';
import { GroupsModule } from '../groups/groups.module';
import { TontineCyclesController } from './tontine-cycles.controller';
import { TontineCyclesService } from './tontine-cycles.service';
import { TontinesController } from './tontines.controller';

@Module({
  imports: [GroupsModule, CashboxModule, ContributionsModule],
  controllers: [TontinesController, TontineCyclesController],
  providers: [TontineCyclesService],
})
export class TontinesModule {}
