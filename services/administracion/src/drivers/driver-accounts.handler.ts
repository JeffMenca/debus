import {
  type DriverChangedPayload,
  type EventEnvelope,
  driverChangedPayloadSchema,
} from '@debus/contracts';
import { OnEvent, type SqlClient } from '@debus/messaging';
import { Injectable, Logger } from '@nestjs/common';
import { AccountLinksService } from '../accounts/account-links.service';
import type { Prisma, User } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { driverAccountChange } from './driver-account-rules';

// An account that never set a password is still waiting for its first link.
const statusFor = (driver: DriverChangedPayload, user: Pick<User, 'passwordHash'>) =>
  driver.active ? (user.passwordHash ? 'ACTIVE' : 'PENDING') : 'INACTIVE';

@Injectable()
export class DriverAccountsHandler {
  private readonly logger = new Logger(DriverAccountsHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly links: AccountLinksService,
  ) {}

  @OnEvent('DriverAdded')
  added(payload: unknown, envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    return this.follow(payload, envelope, tx);
  }

  @OnEvent('DriverUpdated')
  updated(payload: unknown, envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    return this.follow(payload, envelope, tx);
  }

  // The inbox hands over its transaction, which is the Prisma transaction client of this service.
  private async follow(raw: unknown, envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    const driver = driverChangedPayloadSchema.parse(raw);
    const db = (tx ?? this.prisma) as unknown as Prisma.TransactionClient;
    const user = await db.user.findUnique({ where: { id: driver.driverId } });
    const change = driverAccountChange(user, driver);
    if (change === 'create') await this.open(db, driver, envelope);
    if (change === 'update' && user) await this.change(db, driver, user);
  }

  private async open(
    db: Prisma.TransactionClient,
    driver: DriverChangedPayload,
    envelope: EventEnvelope,
  ): Promise<void> {
    if (await db.user.findUnique({ where: { email: driver.email } })) {
      this.logger.warn(
        { driverId: driver.driverId },
        'Driver email already belongs to another account; no account created',
      );
      return;
    }
    const created = await db.user.create({
      data: {
        id: driver.driverId,
        email: driver.email,
        fullName: driver.fullName,
        role: 'DRIVER',
        branchId: driver.branchId,
        driverVersion: driver.version,
        status: driver.active ? 'PENDING' : 'INACTIVE',
      },
    });
    if (driver.active) {
      await this.links.writeLink(db, created, 'ACTIVATION', 'INVITATION', envelope.correlationId);
    }
  }

  private async change(
    db: Prisma.TransactionClient,
    driver: DriverChangedPayload,
    user: User,
  ): Promise<void> {
    await db.user.update({
      where: { id: driver.driverId },
      data: {
        fullName: driver.fullName,
        branchId: driver.branchId,
        status: statusFor(driver, user),
        driverVersion: driver.version,
        ...(await this.emailToKeep(db, driver, user)),
      },
    });
    if (!driver.active) {
      await db.refreshToken.updateMany({
        where: { userId: driver.driverId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  }

  // A new email that another account already uses must not block the rest of the changes. It is
  // checked first because a failed statement would abort the whole inbox transaction.
  private async emailToKeep(
    db: Prisma.TransactionClient,
    driver: DriverChangedPayload,
    user: User,
  ): Promise<{ email?: string }> {
    if (driver.email === user.email) return {};
    if (await db.user.findUnique({ where: { email: driver.email } })) {
      this.logger.warn(
        { driverId: driver.driverId },
        'Driver email already belongs to another account; the account keeps its email',
      );
      return {};
    }
    return { email: driver.email };
  }
}
