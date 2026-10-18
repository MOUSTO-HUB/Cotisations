import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ExpenseStatus } from '@prisma/client';
import { type AuthContext, CurrentAuth } from '../auth/auth-context';
import { ReasonDto } from '../contributions/dto/reason.dto';
import { CreateExpenseDto, JustificationDto } from './dto/create-expense.dto';
import { ExpensesService } from './expenses.service';

@Controller('groups/:groupId/expenses')
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Post()
  create(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: CreateExpenseDto,
  ) {
    return this.expenses.create(groupId, auth.user, dto);
  }

  @Get()
  list(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Query('status', new ParseEnumPipe(ExpenseStatus, { optional: true }))
    status?: ExpenseStatus,
  ) {
    return this.expenses.list(groupId, auth.user.id, status);
  }

  @Post(':expenseId/approve')
  @HttpCode(200)
  approve(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('expenseId', ParseUUIDPipe) expenseId: string,
  ) {
    return this.expenses.approve(groupId, auth.user, expenseId);
  }

  @Post(':expenseId/reject')
  @HttpCode(200)
  reject(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('expenseId', ParseUUIDPipe) expenseId: string,
    @Body() dto: ReasonDto,
  ) {
    return this.expenses.reject(groupId, auth.user, expenseId, dto.reason);
  }

  @Post(':expenseId/justification')
  @HttpCode(200)
  justify(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('expenseId', ParseUUIDPipe) expenseId: string,
    @Body() dto: JustificationDto,
  ) {
    return this.expenses.justify(
      groupId,
      auth.user,
      expenseId,
      dto.justificationUrl,
    );
  }

  @Post(':expenseId/reverse')
  @HttpCode(200)
  reverse(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('expenseId', ParseUUIDPipe) expenseId: string,
    @Body() dto: ReasonDto,
  ) {
    return this.expenses.reverse(groupId, auth.user, expenseId, dto.reason);
  }
}
