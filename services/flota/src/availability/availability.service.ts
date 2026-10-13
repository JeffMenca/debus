import { type Availability, type AvailabilityQuery, todayInGuatemala } from '@debus/contracts';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { busVerdict, driverVerdict, overlaps } from './availability-rules';

const ACTIVE_TRIPS = ['SCHEDULED', 'IN_TRANSIT'] as const;

@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async check(query: AvailabilityQuery): Promise<Availability> {
    const window = {
      departureAt: new Date(query.departureAt),
      estimatedArrivalAt: new Date(query.estimatedArrivalAt),
    };
    const [bus, driver, busyBus, busyDriver] = await Promise.all([
      this.prisma.bus.findUnique({ where: { id: query.busId } }),
      this.prisma.driver.findUnique({ where: { id: query.driverId } }),
      this.crosses({ busId: query.busId }, window, query.ignoreTripId),
      this.crosses({ driverId: query.driverId }, window, query.ignoreTripId),
    ]);
    // The licence counts on the Guatemalan day of the departure, not the UTC one.
    const departureDay = todayInGuatemala(window.departureAt);
    return {
      bus: busVerdict(bus, query.branchId, busyBus),
      driver: driverVerdict(driver, query.branchId, departureDay, busyDriver),
    };
  }

  // Only trips that end after the departure can still cross it; the rule itself is `overlaps`.
  private async crosses(
    owner: Prisma.TripCopyWhereInput,
    window: { departureAt: Date; estimatedArrivalAt: Date },
    ignoreTripId?: string,
  ): Promise<boolean> {
    const trips = await this.prisma.tripCopy.findMany({
      where: {
        ...owner,
        status: { in: [...ACTIVE_TRIPS] },
        estimatedArrivalAt: { gt: window.departureAt },
        ...(ignoreTripId && { NOT: { tripId: ignoreTripId } }),
      },
      select: { departureAt: true, estimatedArrivalAt: true },
    });
    return trips.some((trip) => overlaps(window, trip));
  }
}
