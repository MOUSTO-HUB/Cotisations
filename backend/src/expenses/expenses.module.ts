import { Module } from '@nestjs/common';
import { CashboxModule } from '../cashbox/cashbox.module';
import { GroupsModule } from '../groups/groups.module';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';

@Module({
  imports: [GroupsModule, CashboxModule],
  controllers: [ExpensesController],
  providers: [ExpensesService],
})
export class ExpensesModule {}
