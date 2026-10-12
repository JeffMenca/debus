import {
  apiErrors,
  apiSuccess,
  ZodBody,
  apiBody,
  CurrentIdentity,
  type Identity,
} from '@debus/server';
import {
  type AuthTokens,
  type LoginRequest,
  type SessionUser,
  loginRequestSchema,
  refreshRequestSchema,
} from '@debus/contracts';
import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SessionsService } from './sessions.service';

@ApiTags('sessions')
@Controller('auth')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Post('login')
  @apiSuccess(200)
  @apiErrors(400, 401, 423)
  @apiBody(loginRequestSchema)
  login(@Body(new ZodBody(loginRequestSchema)) body: LoginRequest): Promise<AuthTokens> {
    return this.sessions.login(body);
  }

  @Post('refresh')
  @apiSuccess(200)
  @apiErrors(400, 401)
  @apiBody(refreshRequestSchema)
  refresh(
    @Body(new ZodBody(refreshRequestSchema)) body: { refreshToken: string },
  ): Promise<AuthTokens> {
    return this.sessions.refresh(body.refreshToken);
  }

  @Post('logout')
  @apiSuccess(204)
  @apiErrors(400)
  @apiBody(refreshRequestSchema)
  logout(@Body(new ZodBody(refreshRequestSchema)) body: { refreshToken: string }): Promise<void> {
    return this.sessions.logout(body.refreshToken);
  }

  @Get('me')
  @apiSuccess(200)
  @ApiBearerAuth()
  @apiErrors(401)
  me(@CurrentIdentity() identity: Identity): Promise<SessionUser> {
    return this.sessions.me(identity.userId);
  }
}
