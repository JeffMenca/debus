import { type Availability, type AvailabilityQuery, availabilitySchema } from '@debus/contracts';
import { ServiceHttpClient } from '@debus/server';
import { Injectable } from '@nestjs/common';

@Injectable()
export class FleetClient {
  constructor(private readonly http: ServiceHttpClient) {}

  availability(query: AvailabilityQuery, correlationId?: string): Promise<Availability> {
    const search = new URLSearchParams(
      Object.entries(query).filter(([, value]) => value !== undefined) as [string, string][],
    );
    return this.http.get('flota', `/internal/availability?${search}`, availabilitySchema, {
      correlationId,
    });
  }
}
