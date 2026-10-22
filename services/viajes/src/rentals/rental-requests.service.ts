import {
  type AssignRentalRequest,
  type RentalRequestListQuery,
  type RentalRequestPage,
  type RentalToAssign,
  type Trip,
  pageArgs,
  toPage,
} from '@debus/contracts';
import { Outbox, REQUEST_FLUSH } from '@debus/messaging';
import { type Identity, requireBranch } from '@debus/server';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FleetClient } from '../trips/fleet-client';
import { deleteTripIn } from '../trips/trip-deletion';
import { toTrip, toTripScheduledPayload } from '../trips/trip-mappers';
import { TRIP_MESSAGES } from '../trips/trip-messages';
import { availabilityProblem } from '../trips/trip-rules';
import { TripWrites } from '../trips/trip-writes';
import { toRentalCancelledPayload, toRentalRequest } from './rental-mappers';
import {
  assignmentProblem,
  cancellationProblem,
  tripDepartureFor,
  unassignableProblem,
} from './rental-rules';
import { rentalListWhere, rentalOrder } from './rental-scope';

const LOCK_TRIP = 'SELECT id FROM trips WHERE id = $1::uuid FOR UPDATE';
const LOCK_REQUEST = 'SELECT id FROM rental_requests WHERE id = $1::uuid FOR UPDATE';

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
    const now = new Date();
    const problem = assignmentProblem({
      request,
      bus,
      driver,
      branchId,
      estimatedArrivalAt: input.estimatedArrivalAt,
      now,
    });
    if (problem || !bus || !driver) {
      throw new ConflictException(TRIP_MESSAGES[problem ?? 'busNotFound']);
    }

    // The question to flota goes before the write; the exclusion constraints decide the race.
    const departureAt = tripDepartureFor(request.departureAt, now);
    const availability = await this.fleet.availability(
      {
        branchId,
        busId: bus.id,
        driverId: driver.id,
        departureAt: departureAt.toISOString(),
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
        await tx.$queryRawUnsafe(LOCK_REQUEST, rentalId);
        const locked = await tx.rentalRequest.findUnique({ where: { id: rentalId } });
        const taken = locked ? unassignableProblem(locked.status) : 'rentalAssigned';
        if (taken) throw new ConflictException(TRIP_MESSAGES[taken]);
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
            departureAt,
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

  // Pivot of the cancellation saga of a paid rental: here it is decided, in one transaction, that
  // the rental ends (its trip goes too if it had not left). clientes then refunds and reportes drops
  // the income, both from RentalCancelled and retried until they apply.
  async cancel(actor: Identity, rentalId: string, correlationId?: string): Promise<RentalToAssign> {
    const branchId = requireBranch(actor);
    const row = await this.prisma.$transaction(async (tx) => {
      const ofBranch = { where: { id: rentalId, branchId } };
      // Trip before rental, the order in which deleting a trip locks them.
      const seen = await tx.rentalRequest.findFirst(ofBranch);
      const trip = seen?.tripId ? await this.lockTrip(tx, seen.tripId) : null;
      await tx.$queryRawUnsafe(LOCK_REQUEST, rentalId);
      const request = await tx.rentalRequest.findFirst(ofBranch);
      if (request && request.tripId !== (seen?.tripId ?? null)) {
        throw new ConflictException(TRIP_MESSAGES.tripContended);
      }
      const problem = cancellationProblem(request, trip);
      if (problem === 'rentalPaymentPending' || !request) {
        throw new NotFoundException(TRIP_MESSAGES.rentalPaymentPending);
      }
      if (problem) throw new ConflictException(TRIP_MESSAGES[problem]);
      if (request.status === 'CANCELLED') return request;

      if (trip) await deleteTripIn(tx, this.outbox, trip, correlationId);
      const cancelled = await tx.rentalRequest.update({
        where: { id: rentalId },
        data: { status: 'CANCELLED', tripId: null, cancelledAt: new Date() },
      });
      await this.outbox.add(
        tx,
        'RentalCancelled',
        toRentalCancelledPayload(cancelled, trip?.id ?? null),
        correlationId,
      );
      return cancelled;
    });
    await this.outbox.flush(REQUEST_FLUSH);
    return toRentalRequest(row);
  }

  private async lockTrip(tx: Prisma.TransactionClient, tripId: string) {
    await tx.$queryRawUnsafe(LOCK_TRIP, tripId);
    return tx.trip.findUnique({ where: { id: tripId } });
  }
}
