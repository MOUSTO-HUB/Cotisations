import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { type AuthContext, CurrentAuth } from '../auth/auth-context';
import { AddMemberDto } from './dto/add-member.dto';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateMemberRoleDto } from './dto/update-member.dto';
import { GroupsService } from './groups.service';

@Controller('groups')
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  @Post()
  create(@CurrentAuth() auth: AuthContext, @Body() dto: CreateGroupDto) {
    return this.groups.create(auth.user, dto);
  }

  /** Mes groupes, y compris les invitations en attente. */
  @Get()
  listMine(@CurrentAuth() auth: AuthContext) {
    return this.groups.listMine(auth.user.id);
  }

  @Get(':groupId')
  get(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ) {
    return this.groups.get(groupId, auth.user.id);
  }

  @Get(':groupId/members')
  listMembers(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ) {
    return this.groups.listMembers(groupId, auth.user.id);
  }

  @Post(':groupId/members')
  addMember(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: AddMemberDto,
  ) {
    return this.groups.addMember(groupId, auth.user, dto);
  }

  /** Accepter une invitation. */
  @Post(':groupId/join')
  @HttpCode(200)
  join(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ) {
    return this.groups.join(groupId, auth.user.id);
  }

  @Patch(':groupId/members/:membershipId')
  updateRole(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.groups.updateRole(groupId, auth.user, membershipId, dto.role);
  }

  /** Retirer un membre, ou quitter le groupe (son propre membershipId). */
  @Delete(':groupId/members/:membershipId')
  @HttpCode(204)
  removeMember(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
  ) {
    return this.groups.removeMember(groupId, auth.user, membershipId);
  }
}
