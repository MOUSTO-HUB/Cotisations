import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { type AuthContext, CurrentAuth } from '../auth/auth-context';
import { CashboxService } from './cashbox.service';

@Controller('groups/:groupId/cashboxes')
export class CashboxController {
  constructor(private readonly cashbox: CashboxService) {}

  @Get()
  balances(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ) {
    return this.cashbox.balances(groupId, auth.user.id);
  }

  @Get(':cashboxId/movements')
  journal(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('cashboxId', ParseUUIDPipe) cashboxId: string,
  ) {
    return this.cashbox.journal(groupId, auth.user.id, cashboxId);
  }
}
