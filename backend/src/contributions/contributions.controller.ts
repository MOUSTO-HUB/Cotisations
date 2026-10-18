import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { type AuthContext, CurrentAuth } from '../auth/auth-context';
import { ContributionsService } from './contributions.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { ReasonDto } from './dto/reason.dto';
import { RecordCashPaymentDto } from './dto/record-cash-payment.dto';
import { PaymentsService } from './payments.service';

const uuid = new ParseUUIDPipe({ optional: true });

@Controller('groups/:groupId')
export class ContributionsController {
  constructor(
    private readonly contributions: ContributionsService,
    private readonly payments: PaymentsService,
  ) {}

  // ---- Cotisations et échéances ----

  @Post('plans')
  createPlan(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: CreatePlanDto,
  ) {
    return this.contributions.createPlan(groupId, auth.user, dto);
  }

  @Get('plans')
  listPlans(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ) {
    return this.contributions.listPlans(groupId, auth.user.id);
  }

  @Get('dues')
  listDues(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Query('membershipId', uuid) membershipId?: string,
    @Query('planId', uuid) planId?: string,
  ) {
    return this.contributions.listDues(groupId, auth.user.id, {
      membershipId,
      planId,
    });
  }

  @Get('me/dues')
  myDues(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ) {
    return this.contributions.myDues(groupId, auth.user.id);
  }

  @Post('dues/:dueId/exempt')
  @HttpCode(200)
  exemptDue(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('dueId', ParseUUIDPipe) dueId: string,
    @Body() dto: ReasonDto,
  ) {
    return this.contributions.exemptDue(groupId, auth.user, dueId, dto.reason);
  }

  // ---- Paiements et reçus ----

  @Post('payments/cash')
  recordCash(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: RecordCashPaymentDto,
  ) {
    return this.payments.recordCash(groupId, auth.user, dto);
  }

  @Get('payments')
  listPayments(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Query('membershipId', uuid) membershipId?: string,
  ) {
    return this.payments.listPayments(groupId, auth.user.id, { membershipId });
  }

  /** Reçu numérique d'un paiement. */
  @Get('payments/:paymentId')
  getReceipt(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
  ) {
    return this.payments.getReceipt(groupId, auth.user.id, paymentId);
  }

  @Post('payments/:paymentId/confirm')
  @HttpCode(200)
  confirm(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
  ) {
    return this.payments.confirm(groupId, auth.user, paymentId);
  }

  @Post('payments/:paymentId/dispute')
  @HttpCode(200)
  dispute(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() dto: ReasonDto,
  ) {
    return this.payments.dispute(groupId, auth.user, paymentId, dto.reason);
  }

  @Post('payments/:paymentId/reverse')
  @HttpCode(200)
  reverse(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() dto: ReasonDto,
  ) {
    return this.payments.reverse(groupId, auth.user, paymentId, dto.reason);
  }
}
