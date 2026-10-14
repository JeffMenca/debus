import {
  type AssignRentalRequest,
  type RentalRequestListQuery,
  type RentalRequestPage,
  type Trip,
  pageArgs,
  toPage,
} from '@debus/contracts';
import { Outbox, REQUEST_FLUSH } from '@debus/messaging';
import { type Identity, requireBranch } from '@debus/server';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FleetClient } from '../trips/fleet-client';
import { toTrip, toTripScheduledPayload } from '../trips/trip-mappers';
import { TRIP_MESSAGES } from '../trips/trip-messages';
import { availabilityProblem } from '../trips/trip-rules';
import { TripWrites } from '../trips/trip-writes';
import { toRentalRequest } from './rental-mappers';
import { assignmentProblem } from './rental-rules';
import { rentalListWhere, rentalOrder } from './rental-scope';

@Injectable()
export class RentalRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fleet: FleetClient,
    private readonly outbox: Outbox,
    private readonly writes: TripWrites,
  ) {}

  async list(branchId: string, query: RentalRequestListQuery): Promise<RentalRequestPage> {
    const where = rentalListWhere(branchId, query);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.rentalRequest.findMany({ where, orderBy: rentalOrder(), ...pageArgs(query) }),
      this.prisma.rentalRequest.count({ where }),
    ]);
    return toPage(rows.map(toRentalRequest), total, query);
  }

  // Gives a paid rental its bus and driver, under the same rules as a regular trip.
  async assign(
    actor: Identity,
    rentalId: string,
    input: AssignRentalRequest,
    correlationId?: string,
  ): Promise<Trip> {
    const branchId = requireBranch(actor);
    const [request, bus, driver] = await Promise.all([
      this.prisma.rentalRequest.findFirst({ where: { id: rentalId, branchId } }),
      this.prisma.busCopy.findUnique({ where: { id: input.busId } }),
      this.prisma.driverCopy.findUnique({ where: { id: input.driverId } }),
    ]);
    if (!request) throw new NotFoundException(TRIP_MESSAGES.rentalNotFound);
    const problem = assignmentProblem({
      request,
      bus,
      driver,
      branchId,
      estimatedArrivalAt: input.estimatedArrivalAt,
      now: new Date(),
    });
    if (problem || !bus || !driver) {
      throw new ConflictException(TRIP_MESSAGES[problem ?? 'busNotFound']);
    }

    // The question to flota goes before the write; the exclusion constraints decide the race.
    const departureAt = request.departureAt.toISOString();
    const availability = await this.fleet.availability(
      {
        branchId,
        busId: bus.id,
        driverId: driver.id,
        departureAt,
        estimatedArrivalAt: input.estimatedArrivalAt,
      },
      correlationId,
    );
    const unavailable = availabilityProblem(availability);
    if (unavailable) throw new ConflictException(TRIP_MESSAGES[unavailable]);

    const row = await this.writes.write(
      { busId: bus.id, driverId: driver.id, routeId: null },
      async (tx) => {
        // Two admins may assign the same rental at once: the second one finds it taken.
        await tx.$queryRawUnsafe(
          'SELECT id FROM rental_requests WHERE id = $1::uuid FOR UPDATE',
          rentalId,
        );
        const locked = await tx.rentalRequest.findUnique({ where: { id: rentalId } });
        if (locked?.status !== 'PENDING') throw new ConflictException(TRIP_MESSAGES.rentalAssigned);
        const trip = await tx.trip.create({
          data: {
            type: 'RENTAL',
            status: 'SCHEDULED',
            branchId,
            routeId: null,
            busId: bus.id,
            busPlate: bus.plate,
            capacity: bus.capacity,
            driverId: driver.id,
            driverName: driver.fullName,
            originLabel: request.originLabel,
            destinationLabel: request.destinationLabel,
            departureAt: request.departureAt,
            estimatedArrivalAt: new Date(input.estimatedArrivalAt),
            ticketPrice: null,
            rentalId,
            createdById: actor.userId,
          },
        });
        await tx.rentalRequest.update({
          where: { id: rentalId },
          data: { status: 'ASSIGNED', tripId: trip.id },
        });
        await this.outbox.add(tx, 'TripScheduled', toTripScheduledPayload(trip), correlationId);
        return trip;
      },
    );
    await this.outbox.flush(REQUEST_FLUSH);
    return toTrip(row);
  }
}
