import { type SaleStatus } from '@debus/contracts';
import { apiErrors, apiSuccess } from '@debus/server';
import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SaleStatusService } from './sale-status.service';

// Called by ventas with the identity token of its service account; there is no user and the
// gateway never publishes this path.
@ApiTags('internal')
@Controller('internal/trips')
export class SaleStatusController {
  constructor(private readonly status: SaleStatusService) {}

  @Get(':id/sale-status')
  @apiSuccess(200)
  @apiErrors(400)
  saleStatus(@Param('id', new ParseUUIDPipe()) id: string): Promise<SaleStatus> {
    return this.status.of(id);
  }
}
