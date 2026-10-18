import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { type AuthContext, CurrentAuth } from '../auth/auth-context';
import { CloseCampaignDto, OpenCampaignDto } from './dto/campaign.dto';
import { SolidarityService } from './solidarity.service';

@Controller('groups/:groupId/solidarity')
export class SolidarityController {
  constructor(private readonly solidarity: SolidarityService) {}

  /** Ouvrir une collecte d'urgence (malade grave, décès, sinistre). */
  @Post()
  open(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: OpenCampaignDto,
  ) {
    return this.solidarity.open(groupId, auth.user, dto);
  }

  @Get()
  list(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ) {
    return this.solidarity.list(groupId, auth.user.id);
  }

  @Get(':campaignId')
  get(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
  ) {
    return this.solidarity.get(groupId, auth.user.id, campaignId);
  }

  @Post(':campaignId/close')
  @HttpCode(200)
  close(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Body() dto: CloseCampaignDto,
  ) {
    return this.solidarity.close(groupId, auth.user, campaignId, dto);
  }
}
