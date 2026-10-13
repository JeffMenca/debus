import { apiErrors, apiSuccess, ZodBody, apiBody } from '@debus/server';
import {
  ACCEPTED_MESSAGE,
  CORRELATION_HEADER,
  type LinkStatus,
  type SetPasswordRequest,
  type SignupRequest,
  emailRequestSchema,
  linkTokenRequestSchema,
  setPasswordRequestSchema,
  signupRequestSchema,
} from '@debus/contracts';
import { Body, Controller, Headers, Post, UseInterceptors } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MinimumDurationInterceptor } from '../common/minimum-duration.interceptor';
import { RegistrationService } from './registration.service';

// The slowest case (sending the link) takes tens of milliseconds; this hides the difference.
const PRIVATE_ANSWER_MIN_MS = 300;
const accepted = { message: ACCEPTED_MESSAGE };
const sameTime = () => new MinimumDurationInterceptor(PRIVATE_ANSWER_MIN_MS);

@ApiTags('accounts')
@Controller('auth')
export class AccountsController {
  constructor(private readonly registration: RegistrationService) {}

  @Post('signup')
  @apiSuccess(202)
  @UseInterceptors(sameTime())
  @apiErrors(400)
  @apiBody(signupRequestSchema)
  async signUp(
    @Body(new ZodBody(signupRequestSchema)) body: SignupRequest,
    @Headers(CORRELATION_HEADER) correlationId?: string,
  ) {
    await this.registration.signUp(body, correlationId);
    return accepted;
  }

  @Post('password/forgot')
  @apiSuccess(202)
  @UseInterceptors(sameTime())
  @apiErrors(400)
  @apiBody(emailRequestSchema)
  async forgot(
    @Body(new ZodBody(emailRequestSchema)) body: { email: string },
    @Headers(CORRELATION_HEADER) correlationId?: string,
  ) {
    await this.registration.forgotPassword(body.email, correlationId);
    return accepted;
  }

  @Post('links/status')
  @apiSuccess(200)
  @apiErrors(400)
  @apiBody(linkTokenRequestSchema)
  status(@Body(new ZodBody(linkTokenRequestSchema)) body: { token: string }): Promise<LinkStatus> {
    return this.registration.linkStatus(body.token);
  }

  @Post('links/renew')
  @apiSuccess(202)
  @UseInterceptors(sameTime())
  @apiErrors(400, 409)
  @apiBody(linkTokenRequestSchema)
  async renew(
    @Body(new ZodBody(linkTokenRequestSchema)) body: { token: string },
    @Headers(CORRELATION_HEADER) correlationId?: string,
  ) {
    await this.registration.renewLink(body.token, correlationId);
    return accepted;
  }

  @Post('password')
  @apiSuccess(204)
  @apiErrors(400, 409, 410)
  @apiBody(setPasswordRequestSchema)
  setPassword(
    @Body(new ZodBody(setPasswordRequestSchema)) body: SetPasswordRequest,
    @Headers(CORRELATION_HEADER) correlationId?: string,
  ): Promise<void> {
    return this.registration.setPassword(body, correlationId);
  }
}
