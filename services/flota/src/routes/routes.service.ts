import {
  type CreateRouteRequest,
  type Route,
  type RouteListQuery,
  type RoutePage,
  type UpdateRouteRequest,
  escapeLikePattern,
  pageArgs,
  toPage,
} from '@debus/contracts';
import { isUniqueViolation } from '@debus/server';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { toActiveCounts } from '../common/active-counts';
import { assertBranchActive } from '../common/branch-guard';
import { FleetEvents } from '../common/fleet-events';
import { FLEET_MESSAGES } from '../common/messages';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ROUTE_INCLUDE, toRoute, toRoutePayload } from './route-mappers';
import { canDeleteRoute, isValidDestination } from './route-rules';

const STATUS = { active: { active: true }, inactive: { active: false }, all: {} } as const;
// The id breaks ties, so a route never shows up on two pages or on none.
const BY_DESTINATION: Prisma.RouteOrderByWithRelationInput[] = [
  { destination: { name: 'asc' } },
  { id: 'asc' },
];

@Injectable()
export class RoutesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: FleetEvents,
  ) {}

  async list(branchId: string, query: RouteListQuery): Promise<RoutePage> {
    // The numbers on the tabs ignore the selected tab, so switching tabs keeps them still.
    const scope: Prisma.RouteWhereInput = {
      originBranchId: branchId,
      ...(query.q && { searchText: { contains: escapeLikePattern(query.q) } }),
    };
    const where = { ...scope, ...STATUS[query.status] };
    const [rows, total, groups] = await this.prisma.$transaction([
      this.prisma.route.findMany({
        where,
        include: ROUTE_INCLUDE,
        orderBy: BY_DESTINATION,
        ...pageArgs(query),
      }),
      this.prisma.route.count({ where }),
      this.prisma.route.groupBy({
        by: ['active'],
        where: scope,
        orderBy: { active: 'asc' },
        _count: { _all: true },
      }),
    ]);
    return {
      ...toPage(rows.map(toRoute), total, query),
      summary: { statusCounts: toActiveCounts(groups) },
    };
  }

  async create(
    branchId: string,
    input: CreateRouteRequest,
    correlationId?: string,
  ): Promise<Route> {
    const row = await this.translateConflicts(() =>
      this.prisma.$transaction(async (tx) => {
        await assertBranchActive(tx, branchId);
        const destination = await tx.branchCopy.findUnique({
          where: { id: input.destinationBranchId },
        });
        if (!isValidDestination(branchId, destination)) {
          throw new ConflictException(FLEET_MESSAGES.routeDestination);
        }
        const route = await tx.route.create({
          data: {
            originBranchId: branchId,
            destinationBranchId: input.destinationBranchId,
            distanceKm: input.distanceKm,
            ticketPrice: input.ticketPrice,
          },
          include: ROUTE_INCLUDE,
        });
        await this.events.route(tx, 'RouteCreated', toRoutePayload(route), correlationId);
        return route;
      }),
    );
    await this.events.flush();
    return toRoute(row);
  }

  async update(
    branchId: string,
    id: string,
    input: UpdateRouteRequest,
    correlationId?: string,
  ): Promise<Route> {
    const row = await this.prisma.$transaction(async (tx) => {
      await this.found(tx, branchId, id);
      const route = await tx.route.update({
        where: { id },
        data: { ...input, version: { increment: 1 } },
        include: ROUTE_INCLUDE,
      });
      await this.events.route(tx, 'RouteUpdated', toRoutePayload(route), correlationId);
      return route;
    });
    await this.events.flush();
    return toRoute(row);
  }

  async remove(branchId: string, id: string, correlationId?: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Locks the route so a TripScheduled handled meanwhile waits and marks it before this reads it.
      await tx.$queryRaw`SELECT id FROM routes WHERE id = ${id}::uuid FOR UPDATE`;
      const route = await this.found(tx, branchId, id);
      if (!canDeleteRoute(route)) throw new ConflictException(FLEET_MESSAGES.routeHasTrips);
      await tx.route.delete({ where: { id } });
      await this.events.route(tx, 'RouteDeleted', { routeId: id }, correlationId);
    });
    await this.events.flush();
  }

  private async found(db: Prisma.TransactionClient, branchId: string, id: string) {
    const route = await db.route.findFirst({
      where: { id, originBranchId: branchId },
      include: ROUTE_INCLUDE,
    });
    if (!route) throw new NotFoundException(FLEET_MESSAGES.routeNotFound);
    return route;
  }

  private async translateConflicts<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      throw new ConflictException(FLEET_MESSAGES.routeTaken);
    }
  }
}
