import { type Availability, type AvailabilityQuery, availabilitySchema } from '@debus/contracts';
import { ServiceHttpClient, ServiceUnavailableError } from '@debus/server';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { TRIP_MESSAGES } from './trip-messages';

@Injectable()
export class FleetClient {
  constructor(private readonly http: ServiceHttpClient) {}

  availability(query: AvailabilityQuery, correlationId?: string): Promise<Availability> {
    const search = new URLSearchParams(
      Object.entries(query).filter(([, value]) => value !== undefined) as [string, string][],
    );
    return this.http
      .get('flota', `/internal/availability?${search}`, availabilitySchema, { correlationId })
      .catch((error: unknown) => {
        // Nothing has been saved yet, so the person can simply try again.
        if (error instanceof ServiceUnavailableError) {
          throw new ServiceUnavailableException(TRIP_MESSAGES.fleetUnavailable);
        }
        throw error;
      });
  }
}
