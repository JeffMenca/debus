import {
  type ClientProfile,
  type UpdateProfileRequest,
  updateProfileRequestSchema,
} from '@debus/contracts';
import {
  CurrentIdentity,
  type Identity,
  ZodBody,
  apiBody,
  apiErrors,
  apiSuccess,
} from '@debus/server';
import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProfilesService } from './profiles.service';

// Every signed-in person has a profile, whatever their role.
@ApiTags('profile')
@ApiBearerAuth()
@Controller('profile')
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get()
  @apiSuccess(200)
  @apiErrors(401, 404)
  get(@CurrentIdentity() actor: Identity): Promise<ClientProfile> {
    return this.profiles.get(actor.userId);
  }

  @Put()
  @apiSuccess(200)
  @apiErrors(400, 401, 404, 409)
  @apiBody(updateProfileRequestSchema)
  update(
    @CurrentIdentity() actor: Identity,
    @Body(new ZodBody(updateProfileRequestSchema)) body: UpdateProfileRequest,
  ): Promise<ClientProfile> {
    return this.profiles.update(actor.userId, body);
  }
}
