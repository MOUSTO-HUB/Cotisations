import { Module } from '@nestjs/common';
import { GroupsModule } from '../groups/groups.module';
import { CashboxController } from './cashbox.controller';
import { CashboxService } from './cashbox.service';

@Module({
  imports: [GroupsModule],
  controllers: [CashboxController],
  providers: [CashboxService],
  exports: [CashboxService],
})
export class CashboxModule {}
