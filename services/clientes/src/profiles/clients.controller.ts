import {
  type ClientOptionPage,
  type ClientOptionQuery,
  clientOptionQuerySchema,
} from '@debus/contracts';
import { Roles, ZodBody, apiErrors, apiQuery, apiSuccess } from '@debus/server';
import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProfilesService } from './profiles.service';

// The clients a branch admin may record a rental for.
@ApiTags('clients')
@ApiBearerAuth()
@Roles('BRANCH_ADMIN')
@Controller('clients')
export class ClientsController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get()
  @apiSuccess(200)
  @apiErrors(400)
  @apiQuery(clientOptionQuerySchema)
  list(
    @Query(new ZodBody(clientOptionQuerySchema)) query: ClientOptionQuery,
  ): Promise<ClientOptionPage> {
    return this.profiles.clientOptions(query);
  }
}
