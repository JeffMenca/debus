import {
  type EventEnvelope,
  routeChangedPayloadSchema,
  routeDeletedPayloadSchema,
} from '@debus/contracts';
import { OnEvent, type SqlClient } from '@debus/messaging';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// A row is only replaced by a higher version and never once it carries a tombstone.
const UPSERT_ROUTE = `
  INSERT INTO system_report_routes (id, origin_branch_id, destination_branch_id, distance_km, ticket_price,
    active, version, updated_at)
  VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, now())
  ON CONFLICT (id) DO UPDATE
    SET origin_branch_id = EXCLUDED.origin_branch_id, destination_branch_id = EXCLUDED.destination_branch_id,
        distance_km = EXCLUDED.distance_km, ticket_price = EXCLUDED.ticket_price, active = EXCLUDED.active,
        version = EXCLUDED.version, updated_at = now()
    WHERE system_report_routes.version < EXCLUDED.version AND system_report_routes.deleted_at IS NULL`;

// The tombstone is inserted when RouteDeleted arrives before the route, with version 0 so nothing
// can follow it.
const DELETE_ROUTE = `
  INSERT INTO system_report_routes (id, origin_branch_id, destination_branch_id, distance_km, ticket_price,
    active, version, deleted_at, updated_at)
  VALUES ($1::uuid, $2::uuid, $3::uuid, 0, 0, false, 0, now(), now())
  ON CONFLICT (id) DO UPDATE
    SET deleted_at = COALESCE(system_report_routes.deleted_at, now()), active = false, updated_at = now()`;

@Injectable()
export class RoutesHandler {
  constructor(private readonly prisma: PrismaService) {}

  @OnEvent('RouteCreated')
  routeCreated(payload: unknown, _envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    return this.keepRoute(payload, tx);
  }

  @OnEvent('RouteUpdated')
  routeUpdated(payload: unknown, _envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    return this.keepRoute(payload, tx);
  }

  @OnEvent('RouteDeleted')
  async routeDeleted(payload: unknown, _envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    const route = routeDeletedPayloadSchema.parse(payload);
    await (tx ?? this.prisma).$executeRawUnsafe(
      DELETE_ROUTE,
      route.routeId,
      route.originBranchId ?? null,
      route.destinationBranchId ?? null,
    );
  }

  private async keepRoute(payload: unknown, tx?: SqlClient): Promise<void> {
    const route = routeChangedPayloadSchema.parse(payload);
    await (tx ?? this.prisma).$executeRawUnsafe(
      UPSERT_ROUTE,
      route.routeId,
      route.originBranchId,
      route.destinationBranchId,
      route.distanceKm,
      route.ticketPrice,
      route.active,
      route.version,
    );
  }
}
