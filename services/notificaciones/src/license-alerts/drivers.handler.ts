import { type EventEnvelope, driverChangedPayloadSchema, todayInGuatemala } from '@debus/contracts';
import { OnEvent, type SqlClient } from '@debus/messaging';
import { Injectable } from '@nestjs/common';
import { emailKeys } from '../mail/email-keys';
import { EmailQueue } from '../mail/email-queue';
import { PrismaService } from '../prisma/prisma.service';
import { inTransaction } from '../prisma/transaction';
import { type DriverCopy, LicenseAlerts } from './license-alerts.service';
import { alertsOutdated, toDate, toIsoDate } from './license-rules';

interface StoredDriver {
  branch_id: string;
  email: string;
  license_expires_on: Date;
  active: boolean;
  version: number;
}

@Injectable()
export class DriversHandler {
  constructor(
    private readonly queue: EmailQueue,
    private readonly alerts: LicenseAlerts,
    private readonly prisma: PrismaService,
  ) {}

  @OnEvent('DriverAdded')
  added(payload: unknown, envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    return this.changed(payload, envelope, tx);
  }

  @OnEvent('DriverUpdated')
  updated(payload: unknown, envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    return this.changed(payload, envelope, tx);
  }

  private async changed(payload: unknown, envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    const snapshot = driverChangedPayloadSchema.parse(payload);
    const db = inTransaction(tx, this.prisma);
    // Locked, so two snapshots of the same driver handled at once are compared one after the other.
    const [stored] = await db.$queryRaw<StoredDriver[]>`
      SELECT branch_id, email, license_expires_on, active, version FROM driver_licenses
      WHERE driver_id = ${snapshot.driverId}::uuid FOR UPDATE`;
    if (stored && stored.version >= snapshot.version) return;

    const driver: DriverCopy = {
      driverId: snapshot.driverId,
      branchId: snapshot.branchId,
      email: snapshot.email,
      fullName: snapshot.fullName,
      licenseExpiresOn: snapshot.licenseExpiresOn,
      active: snapshot.active,
    };
    const { driverId, ...fields } = driver;
    const data = {
      ...fields,
      licenseExpiresOn: toDate(fields.licenseExpiresOn),
      version: snapshot.version,
    };
    await db.driverLicense.upsert({
      where: { driverId },
      create: { driverId, ...data },
      update: data,
    });
    const before = stored && {
      branchId: stored.branch_id,
      email: stored.email,
      licenseExpiresOn: toIsoDate(stored.license_expires_on),
      active: stored.active,
    };
    if (before && alertsOutdated(before, driver)) {
      await this.queue.cancelPending(tx, emailKeys.licenseOf(driverId));
    }
    await this.alerts.scheduleFor(tx, driver, todayInGuatemala(), envelope.eventId);
  }
}
