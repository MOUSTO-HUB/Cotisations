import { Module } from '@nestjs/common';
import { CashboxModule } from '../cashbox/cashbox.module';
import { GroupsModule } from '../groups/groups.module';
import { SolidarityController } from './solidarity.controller';
import { SolidarityService } from './solidarity.service';

@Module({
  imports: [GroupsModule, CashboxModule],
  controllers: [SolidarityController],
  providers: [SolidarityService],
})
export class SolidarityModule {}
