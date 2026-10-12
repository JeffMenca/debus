import {
  apiErrors,
  apiSuccess,
  ZodBody,
  apiBody,
  apiQuery,
  CurrentIdentity,
  type Identity,
  Roles,
} from '@debus/server';
import {
  CORRELATION_HEADER,
  type CreateUserRequest,
  type ManagedUser,
  type UpdateUserRequest,
  type UserListQuery,
  type UserPage,
  createUserRequestSchema,
  updateUserRequestSchema,
  userListQuerySchema,
} from '@debus/contracts';
import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @apiSuccess(200)
  @Roles('SYSTEM_ADMIN', 'BRANCH_ADMIN')
  @apiErrors(400)
  @apiQuery(userListQuerySchema)
  list(
    @CurrentIdentity() actor: Identity,
    @Query(new ZodBody(userListQuerySchema)) query: UserListQuery,
  ): Promise<UserPage> {
    return this.users.list(actor, query);
  }

  @Get(':id')
  @apiSuccess(200)
  @Roles('SYSTEM_ADMIN', 'BRANCH_ADMIN')
  @apiErrors(400, 404)
  get(
    @CurrentIdentity() actor: Identity,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ManagedUser> {
    return this.users.get(actor, id);
  }

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

  @Patch(':id')
  @apiSuccess(200)
  @Roles('SYSTEM_ADMIN')
  @apiErrors(400, 404, 409)
  @apiBody(updateUserRequestSchema)
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodBody(updateUserRequestSchema)) body: UpdateUserRequest,
  ): Promise<ManagedUser> {
    return this.users.update(id, body);
  }

  @Post(':id/invitation')
  @apiSuccess(202)
  @Roles('SYSTEM_ADMIN', 'BRANCH_ADMIN')
  @apiErrors(400, 404, 409, 429)
  resendInvitation(
    @CurrentIdentity() actor: Identity,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers(CORRELATION_HEADER) correlationId?: string,
  ): Promise<{ message: string }> {
    return this.users.resendInvitation(actor, id, correlationId);
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
  @apiErrors(400, 404, 409)
  reactivate(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.users.reactivate(id);
  }
}
