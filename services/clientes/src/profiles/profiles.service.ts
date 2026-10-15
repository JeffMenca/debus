import type { ClientProfile, UpdateProfileRequest } from '@debus/contracts';
import { isRecordMissing, isUniqueViolation } from '@debus/server';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { ClientProfile as ProfileRow } from '../generated/prisma/client';
import { MESSAGES } from '../messages';
import { PrismaService } from '../prisma/prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<ClientProfile> {
    const row = await this.prisma.clientProfile.findUnique({ where: { userId } });
    // The profile is created by UserRegistered, which may still be on its way.
    if (!row) throw new NotFoundException(MESSAGES.profilePending);
    return toProfile(row);
  }

  async update(userId: string, request: UpdateProfileRequest): Promise<ClientProfile> {
    try {
      const row = await this.prisma.clientProfile.update({
        where: { userId },
        data: {
          dpi: request.dpi,
          phone: request.phone,
          nit: request.nit ?? null,
          address: request.address ?? null,
        },
      });
      return toProfile(row);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(MESSAGES.nitTaken);
      if (isRecordMissing(error)) throw new NotFoundException(MESSAGES.profilePending);
      throw error;
    }
  }
}
