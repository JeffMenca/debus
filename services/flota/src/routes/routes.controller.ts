import {
  CORRELATION_HEADER,
  type CreateRouteRequest,
  type Route,
  type RouteListQuery,
  type RoutePage,
  type UpdateRouteRequest,
  createRouteRequestSchema,
  routeListQuerySchema,
  updateRouteRequestSchema,
} from '@debus/contracts';
import {
  CurrentIdentity,
  type Identity,
  Roles,
  ZodBody,
  apiBody,
  apiErrors,
  apiQuery,
  apiSuccess,
  requireBranch,
} from '@debus/server';
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoutesService } from './routes.service';

@ApiTags('routes')
@ApiBearerAuth()
@Roles('BRANCH_ADMIN')
@Controller('routes')
export class RoutesController {
  constructor(private readonly routes: RoutesService) {}

  @Get()
  @apiSuccess(200)
  @apiErrors(400)
  @apiQuery(routeListQuerySchema)
  list(
    @CurrentIdentity() actor: Identity,
    @Query(new ZodBody(routeListQuerySchema)) query: RouteListQuery,
  ): Promise<RoutePage> {
    return this.routes.list(requireBranch(actor), query);
  }

  @Post()
  @apiSuccess(201)
  @apiErrors(400, 409)
  @apiBody(createRouteRequestSchema)
  create(
    @CurrentIdentity() actor: Identity,
    @Body(new ZodBody(createRouteRequestSchema)) body: CreateRouteRequest,
    @Headers(CORRELATION_HEADER) correlationId?: string,
  ): Promise<Route> {
    return this.routes.create(requireBranch(actor), body, correlationId);
  }

  @Patch(':id')
  @apiSuccess(200)
  @apiErrors(400, 404)
  @apiBody(updateRouteRequestSchema)
  update(
    @CurrentIdentity() actor: Identity,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodBody(updateRouteRequestSchema)) body: UpdateRouteRequest,
    @Headers(CORRELATION_HEADER) correlationId?: string,
  ): Promise<Route> {
    return this.routes.update(requireBranch(actor), id, body, correlationId);
  }

  @Delete(':id')
  @apiSuccess(204)
  @apiErrors(404, 409)
  remove(
    @CurrentIdentity() actor: Identity,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers(CORRELATION_HEADER) correlationId?: string,
  ): Promise<void> {
    return this.routes.remove(requireBranch(actor), id, correlationId);
  }
}
