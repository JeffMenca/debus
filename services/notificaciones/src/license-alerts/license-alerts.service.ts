import { todayInGuatemala } from '@debus/contracts';
import type { SqlClient } from '@debus/messaging';
import { Injectable } from '@nestjs/common';
import { emailKeys } from '../mail/email-keys';
import { EmailQueue, type QueuedEmail } from '../mail/email-queue';
import { PrismaService } from '../prisma/prisma.service';
import { inTransaction } from '../prisma/transaction';
import { licenseAdminEmail, licenseDriverEmail } from './license-emails';
import { DAY_MS, addDays, daysUntil, dueThreshold, toDate, toIsoDate } from './license-rules';

export interface DriverCopy {
  driverId: string;
  branchId: string;
  email: string;
  fullName: string;
  licenseExpiresOn: string;
  active: boolean;
}

export interface LicenseRunResult {
  drivers: number;
  queued: number;
}

const ALERT_WINDOW_DAYS = 30;
// A trip can no longer be deleted once it left; a day of margin covers a late departure.
const TICKET_COPY_TTL_MS = DAY_MS;
// Far longer than any Pub/Sub retry: a TicketSold that late is not coming.
const CANCELLED_TRIP_TTL_MS = 30 * DAY_MS;

@Injectable()
export class LicenseAlerts {
  constructor(
    private readonly queue: EmailQueue,
    private readonly prisma: PrismaService,
  ) {}

  // The alerts are not stored ahead: the copy of the driver is the schedule, and this decides which
  // threshold is due today. The key carries the expiry date, so a new date gets its own alerts.
  async scheduleFor(
    tx: SqlClient | undefined,
    driver: DriverCopy,
    today: string,
    eventId: string,
  ): Promise<number> {
    const threshold = driver.active ? dueThreshold(driver.licenseExpiresOn, today) : null;
    if (threshold === null) return 0;
    const admins = await inTransaction(tx, this.prisma).branchAdmin.findMany({
      where: { branchId: driver.branchId, active: true },
      orderBy: { userId: 'asc' },
    });
    const daysLeft = daysUntil(driver.licenseExpiresOn, today);
    const alert = (template: string, message: QueuedEmail['message']): QueuedEmail => ({
      eventId,
      dedupeKey: emailKeys.license(driver.driverId, driver.licenseExpiresOn, threshold),
      template,
      message,
    });
    return this.queue.enqueue(tx, [
      alert('LICENSE_DRIVER', licenseDriverEmail(driver, daysLeft)),
      ...admins.map((admin) => alert('LICENSE_ADMIN', licenseAdminEmail(driver, admin, daysLeft))),
    ]);
  }

  // The daily job: every driver whose licence expires within the window gets what is due today.
  async run(today = todayInGuatemala()): Promise<LicenseRunResult> {
    const drivers = await this.prisma.driverLicense.findMany({
      where: {
        active: true,
        licenseExpiresOn: { gte: toDate(today), lte: toDate(addDays(today, ALERT_WINDOW_DAYS)) },
      },
      orderBy: { driverId: 'asc' },
    });
    let queued = 0;
    for (const driver of drivers) {
      const copy = { ...driver, licenseExpiresOn: toIsoDate(driver.licenseExpiresOn) };
      queued += await this.scheduleFor(undefined, copy, today, `license-alerts:${today}`);
    }
    await this.prune();
    return { drivers: drivers.length, queued };
  }

  private async prune(): Promise<void> {
    const now = Date.now();
    await this.prisma.ticketCopy.deleteMany({
      where: { departureAt: { lt: new Date(now - TICKET_COPY_TTL_MS) } },
    });
    await this.prisma.cancelledTrip.deleteMany({
      where: { cancelledAt: { lt: new Date(now - CANCELLED_TRIP_TTL_MS) } },
    });
  }
}
