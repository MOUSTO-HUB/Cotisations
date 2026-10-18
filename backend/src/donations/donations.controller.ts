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
import { ReasonDto } from '../contributions/dto/reason.dto';
import { DonationsService } from './donations.service';
import { RecordDonationDto } from './dto/record-donation.dto';

@Controller('groups/:groupId/donations')
export class DonationsController {
  constructor(private readonly donations: DonationsService) {}

  @Post()
  record(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: RecordDonationDto,
  ) {
    return this.donations.record(groupId, auth.user, dto);
  }

  @Get()
  list(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Query('cashboxId', new ParseUUIDPipe({ optional: true }))
    cashboxId?: string,
  ) {
    return this.donations.list(groupId, auth.user.id, cashboxId);
  }

  @Post(':donationId/reverse')
  @HttpCode(200)
  reverse(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('donationId', ParseUUIDPipe) donationId: string,
    @Body() dto: ReasonDto,
  ) {
    return this.donations.reverse(groupId, auth.user, donationId, dto.reason);
  }
}
