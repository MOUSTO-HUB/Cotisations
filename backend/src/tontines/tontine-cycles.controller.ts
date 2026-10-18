import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { type AuthContext, CurrentAuth } from '../auth/auth-context';
import { ReasonDto } from '../contributions/dto/reason.dto';
import {
  CreateCycleDto,
  DecideSwapDto,
  RequestSwapDto,
  RoundPaymentDto,
  SetOrderDto,
  SetSharesDto,
} from './dto/cycle.dto';
import { TontineCyclesService } from './tontine-cycles.service';

@Controller('groups/:groupId/tontines')
export class TontineCyclesController {
  constructor(private readonly cycles: TontineCyclesService) {}

  /** 1. Créer le cycle (brouillon). */
  @Post()
  create(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: CreateCycleDto,
  ) {
    return this.cycles.create(groupId, auth.user, dto);
  }

  @Get()
  list(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ) {
    return this.cycles.list(groupId, auth.user.id);
  }

  /** Calendrier, avancement des tours, défaillances. */
  @Get(':cycleId')
  get(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('cycleId', ParseUUIDPipe) cycleId: string,
  ) {
    return this.cycles.get(groupId, auth.user.id, cycleId);
  }

  /** 2. Inscrire les parts des membres. */
  @Put(':cycleId/shares')
  setShares(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('cycleId', ParseUUIDPipe) cycleId: string,
    @Body() dto: SetSharesDto,
  ) {
    return this.cycles.setShares(groupId, auth.user, cycleId, dto);
  }

  /** 3a. Fixer l'ordre des bénéficiaires (mode FIXED). */
  @Put(':cycleId/order')
  setOrder(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('cycleId', ParseUUIDPipe) cycleId: string,
    @Body() dto: SetOrderDto,
  ) {
    return this.cycles.setOrder(groupId, auth.user, cycleId, dto);
  }

  /** 3b. Tirage au sort (mode DRAW), une seule fois. */
  @Post(':cycleId/draw')
  @HttpCode(200)
  draw(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('cycleId', ParseUUIDPipe) cycleId: string,
  ) {
    return this.cycles.draw(groupId, auth.user, cycleId);
  }

  /** 4. Démarrer : calendrier et échéances générés, paramètres verrouillés. */
  @Post(':cycleId/start')
  @HttpCode(200)
  start(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('cycleId', ParseUUIDPipe) cycleId: string,
  ) {
    return this.cycles.start(groupId, auth.user, cycleId);
  }

  @Post(':cycleId/cancel')
  @HttpCode(200)
  cancel(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('cycleId', ParseUUIDPipe) cycleId: string,
    @Body() dto: ReasonDto,
  ) {
    return this.cycles.cancel(groupId, auth.user, cycleId, dto.reason);
  }

  /** Versement d'un membre pour un tour (saisi par le trésorier). */
  @Post(':cycleId/rounds/:round/payments')
  pay(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('cycleId', ParseUUIDPipe) cycleId: string,
    @Param('round', ParseIntPipe) round: number,
    @Body() dto: RoundPaymentDto,
  ) {
    return this.cycles.pay(groupId, auth.user, cycleId, round, dto);
  }

  /** Remise du pot au bénéficiaire (tour complet uniquement). */
  @Post(':cycleId/rounds/:round/payout')
  @HttpCode(200)
  payout(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('cycleId', ParseUUIDPipe) cycleId: string,
    @Param('round', ParseIntPipe) round: number,
  ) {
    return this.cycles.payout(groupId, auth.user, cycleId, round);
  }

  /** Le bénéficiaire confirme avoir reçu le pot. */
  @Post(':cycleId/rounds/:round/confirm-receipt')
  @HttpCode(200)
  confirmReceipt(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('cycleId', ParseUUIDPipe) cycleId: string,
    @Param('round', ParseIntPipe) round: number,
  ) {
    return this.cycles.confirmReceipt(groupId, auth.user, cycleId, round);
  }

  /** Proposer un échange de tours. */
  @Post(':cycleId/swaps')
  requestSwap(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('cycleId', ParseUUIDPipe) cycleId: string,
    @Body() dto: RequestSwapDto,
  ) {
    return this.cycles.requestSwap(groupId, auth.user, cycleId, dto);
  }

  @Post(':cycleId/swaps/:swapId/accept')
  @HttpCode(200)
  acceptSwap(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('cycleId', ParseUUIDPipe) cycleId: string,
    @Param('swapId', ParseUUIDPipe) swapId: string,
  ) {
    return this.cycles.acceptSwap(groupId, auth.user, cycleId, swapId);
  }

  @Post(':cycleId/swaps/:swapId/decision')
  @HttpCode(200)
  decideSwap(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('cycleId', ParseUUIDPipe) cycleId: string,
    @Param('swapId', ParseUUIDPipe) swapId: string,
    @Body() dto: DecideSwapDto,
  ) {
    return this.cycles.decideSwap(
      groupId,
      auth.user,
      cycleId,
      swapId,
      dto.decision,
    );
  }
}
