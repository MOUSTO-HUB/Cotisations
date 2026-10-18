import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { type AuthContext, CurrentAuth } from '../auth/auth-context';
import { ReasonDto } from '../contributions/dto/reason.dto';
import {
  CompleteProjectDto,
  CreateProjectDto,
  OpenCollectionDto,
  ProjectUpdateDto,
  SetBudgetDto,
} from './dto/project.dto';
import { ProjectsService } from './projects.service';

@Controller('groups/:groupId/projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  /** 1. Proposer un projet. */
  @Post()
  create(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: CreateProjectDto,
  ) {
    return this.projects.create(groupId, auth.user, dto);
  }

  @Get()
  list(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ) {
    return this.projects.list(groupId, auth.user.id);
  }

  /** Fiche et rapport du projet. */
  @Get(':projectId')
  get(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.projects.get(groupId, auth.user.id, projectId);
  }

  /** 2. Budgétiser (révisable jusqu'à la validation). */
  @Put(':projectId/budget')
  setBudget(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: SetBudgetDto,
  ) {
    return this.projects.setBudget(groupId, auth.user, projectId, dto);
  }

  /** 3. Valider (décision du bureau ou de l'assemblée). */
  @Post(':projectId/approve')
  @HttpCode(200)
  approve(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.projects.approve(groupId, auth.user, projectId);
  }

  /** 4. Ouvrir la collecte. */
  @Post(':projectId/collection')
  @HttpCode(200)
  openCollection(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: OpenCollectionDto,
  ) {
    return this.projects.openCollection(groupId, auth.user, projectId, dto);
  }

  /** 5. Démarrer la réalisation. */
  @Post(':projectId/start')
  @HttpCode(200)
  start(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.projects.start(groupId, auth.user, projectId);
  }

  /** Jalon d'avancement (photo de chantier). */
  @Post(':projectId/updates')
  addUpdate(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: ProjectUpdateDto,
  ) {
    return this.projects.addUpdate(groupId, auth.user, projectId, dto);
  }

  /** 6. Achever et publier le rapport final. */
  @Post(':projectId/complete')
  @HttpCode(200)
  complete(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CompleteProjectDto,
  ) {
    return this.projects.complete(groupId, auth.user, projectId, dto);
  }

  @Post(':projectId/cancel')
  @HttpCode(200)
  cancel(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: ReasonDto,
  ) {
    return this.projects.cancel(groupId, auth.user, projectId, dto.reason);
  }
}
