import {
  type Branch,
  CORRELATION_HEADER,
  type CreateBranchRequest,
  type UpdateBranchRequest,
  createBranchRequestSchema,
  updateBranchRequestSchema,
} from '@debus/contracts';
import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { apiErrors, apiSuccess } from '../common/api-errors';
import { ZodBody, apiBody } from '../common/zod-body.pipe';
import { CurrentIdentity, type Identity, Roles } from '../identity/identity';
import { BranchesService } from './branches.service';

@ApiTags('branches')
@ApiBearerAuth()
@Controller('branches')
export class BranchesController {
  constructor(private readonly branches: BranchesService) {}

  @Get()
  @apiSuccess(200)
  @apiErrors(401)
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  list(
    @CurrentIdentity() actor: Identity,
    @Query('includeInactive', new ParseBoolPipe({ optional: true })) includeInactive?: boolean,
  ): Promise<Branch[]> {
    return this.branches.list(actor, includeInactive ?? false);
  }

  @Get(':id')
  @apiSuccess(200)
  @apiErrors(400, 401, 403, 404)
  get(
    @CurrentIdentity() actor: Identity,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<Branch> {
    return this.branches.get(actor, id);
  }

  @Post()
  @apiSuccess(201)
  @Roles('SYSTEM_ADMIN')
  @apiErrors(400, 409)
  @apiBody(createBranchRequestSchema)
  create(
    @CurrentIdentity() actor: Identity,
    @Body(new ZodBody(createBranchRequestSchema)) body: CreateBranchRequest,
    @Headers(CORRELATION_HEADER) correlationId?: string,
  ): Promise<Branch> {
    return this.branches.create(actor, body, correlationId);
  }

  @Patch(':id')
  @apiSuccess(200)
  @Roles('SYSTEM_ADMIN')
  @apiErrors(400, 404, 409)
  @apiBody(updateBranchRequestSchema)
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodBody(updateBranchRequestSchema)) body: UpdateBranchRequest,
    @Headers(CORRELATION_HEADER) correlationId?: string,
  ): Promise<Branch> {
    return this.branches.update(id, body, correlationId);
  }

  @Post(':id/deactivate')
  @apiSuccess(204)
  @Roles('SYSTEM_ADMIN')
  @apiErrors(400, 404)
  deactivate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers(CORRELATION_HEADER) correlationId?: string,
  ): Promise<void> {
    return this.branches.setActive(id, false, correlationId);
  }

  @Post(':id/reactivate')
  @apiSuccess(204)
  @Roles('SYSTEM_ADMIN')
  @apiErrors(400, 404)
  reactivate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers(CORRELATION_HEADER) correlationId?: string,
  ): Promise<void> {
    return this.branches.setActive(id, true, correlationId);
  }
}
