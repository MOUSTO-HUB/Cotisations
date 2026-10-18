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
import { CastBallotDto, CreateVoteDto, ProjectVoteDto } from './dto/vote.dto';
import { VotesService } from './votes.service';

@Controller('groups/:groupId')
export class VotesController {
  constructor(private readonly votes: VotesService) {}

  /** Ouvrir un vote ou un sondage (président, secrétaire). */
  @Post('votes')
  create(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: CreateVoteDto,
  ) {
    return this.votes.create(groupId, auth.user, dto);
  }

  @Get('votes')
  list(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ) {
    return this.votes.list(groupId, auth.user.id);
  }

  @Get('votes/:voteId')
  get(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('voteId', ParseUUIDPipe) voteId: string,
  ) {
    return this.votes.get(groupId, auth.user.id, voteId);
  }

  /** Voter (une fois, bulletin secret). */
  @Post('votes/:voteId/ballots')
  cast(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('voteId', ParseUUIDPipe) voteId: string,
    @Body() dto: CastBallotDto,
  ) {
    return this.votes.cast(groupId, auth.user, voteId, dto.optionIndex);
  }

  @Post('votes/:voteId/close')
  @HttpCode(200)
  close(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('voteId', ParseUUIDPipe) voteId: string,
  ) {
    return this.votes.close(groupId, auth.user, voteId);
  }

  /** Soumettre un projet budgétisé au vote (Pour / Contre). */
  @Post('projects/:projectId/vote')
  projectVote(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: ProjectVoteDto,
  ) {
    return this.votes.createForProject(groupId, auth.user, projectId, dto);
  }
}
