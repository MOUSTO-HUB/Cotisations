import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { Request } from 'express';

export interface AuthContext {
  user: User;
  sessionId: string;
}

export interface AuthenticatedRequest extends Request {
  auth: AuthContext;
}

/** Injecte la session de l'utilisateur connecté dans un contrôleur. */
export const CurrentAuth = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext =>
    ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth,
);
