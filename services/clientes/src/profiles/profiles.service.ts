import {
  type ClientOptionPage,
  type ClientOptionQuery,
  type ClientProfile,
  type UpdateProfileRequest,
  escapeLikePattern,
  pageArgs,
  toPage,
} from '@debus/contracts';
import { Outbox, REQUEST_FLUSH } from '@debus/messaging';
import { isRecordMissing, isUniqueViolation } from '@debus/server';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { ClientProfile as ProfileRow } from '../generated/prisma/client';
import { MESSAGES } from '../messages';
import { PrismaService } from '../prisma/prisma.service';
import { toProfileUpdated } from './profile-rules';

function toProfile(row: ProfileRow): ClientProfile {
  return {
    userId: row.userId,
    email: row.email,
    fullName: row.fullName,
    dpi: row.dpi,
    phone: row.phone,
    nit: row.nit,
    address: row.address,
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class ProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: Outbox,
  ) {}

  async get(userId: string): Promise<ClientProfile> {
    const row = await this.prisma.clientProfile.findUnique({ where: { userId } });
    // The profile is created by UserRegistered, which may still be on its way.
    if (!row) throw new NotFoundException(MESSAGES.profilePending);
    return toProfile(row);
  }

  async clientOptions(query: ClientOptionQuery): Promise<ClientOptionPage> {
    const where = {
      role: 'CLIENT',
      active: true,
      ...(query.q && { searchText: { contains: escapeLikePattern(query.q) } }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.clientProfile.findMany({
        where,
        orderBy: [{ fullName: 'asc' }, { userId: 'asc' }],
        ...pageArgs(query),
      }),
      this.prisma.clientProfile.count({ where }),
    ]);
    return toPage(
      rows.map(({ userId, fullName, email, nit }) => ({ userId, fullName, email, nit })),
      total,
      query,
    );
  }

  async update(
    userId: string,
    request: UpdateProfileRequest,
    correlationId?: string,
  ): Promise<ClientProfile> {
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const saved = await tx.clientProfile.update({
          where: { userId },
          data: {
            dpi: request.dpi,
            phone: request.phone,
            nit: request.nit ?? null,
            address: request.address ?? null,
          },
        });
        await this.outbox.add(tx, 'ProfileUpdated', toProfileUpdated(saved), correlationId);
        return saved;
      });
      await this.outbox.flush(REQUEST_FLUSH);
      return toProfile(row);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(MESSAGES.nitTaken);
      if (isRecordMissing(error)) throw new NotFoundException(MESSAGES.profilePending);
      throw error;
    }
  }
}
