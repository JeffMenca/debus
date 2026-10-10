import {
  CORRELATION_HEADER,
  type CreateUserRequest,
  type ManagedUser,
  createUserRequestSchema,
} from '@debus/contracts';
import { Body, Controller, Headers, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { apiErrors, apiSuccess } from '../common/api-errors';
import { ZodBody, apiBody } from '../common/zod-body.pipe';
import { CurrentIdentity, type Identity, Roles } from '../identity/identity';
import { UsersService } from './users.service';

@ApiTags('usuarios')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post()
  @apiSuccess(201)
  @Roles('SYSTEM_ADMIN', 'BRANCH_ADMIN')
  @apiErrors(400, 409)
  @apiBody(createUserRequestSchema)
  create(
    @CurrentIdentity() actor: Identity,
    @Body(new ZodBody(createUserRequestSchema)) body: CreateUserRequest,
    @Headers(CORRELATION_HEADER) correlationId?: string,
  ): Promise<ManagedUser> {
    return this.users.create(actor, body, correlationId);
  }

  @Post(':id/deactivate')
  @apiSuccess(204)
  @Roles('SYSTEM_ADMIN')
  @apiErrors(400, 404, 409)
  deactivate(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.users.deactivate(id);
  }

  @Post(':id/reactivate')
  @apiSuccess(204)
  @Roles('SYSTEM_ADMIN')
  @apiErrors(400, 404)
  reactivate(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.users.reactivate(id);
  }
}
