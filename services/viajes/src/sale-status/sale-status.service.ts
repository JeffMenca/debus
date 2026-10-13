import type { SaleStatus } from '@debus/contracts';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { saleStatusOf } from './sale-status-rules';

@Injectable()
export class SaleStatusService {
  constructor(private readonly prisma: PrismaService) {}

  async of(tripId: string): Promise<SaleStatus> {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    return saleStatusOf(tripId, trip, new Date());
  }
}
