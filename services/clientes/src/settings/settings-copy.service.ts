import { isoDateSchema } from '@debus/contracts';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface EffectiveSettings {
  versionId: string;
  depreciationPerKm: number;
  rentalRatePerKm: number;
  effectiveFrom: string;
}

@Injectable()
export class SettingsCopyService {
  constructor(private readonly prisma: PrismaService) {}

  async effectiveOn(date: string): Promise<EffectiveSettings | null> {
    const day = isoDateSchema.parse(date);
    const row = await this.prisma.settingsVersionCopy.findFirst({
      where: { effectiveFrom: { lte: new Date(`${day}T00:00:00.000Z`) } },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    });
    if (!row) return null;
    return {
      versionId: row.id,
      depreciationPerKm: row.depreciationPerKm.toNumber(),
      rentalRatePerKm: row.rentalRatePerKm.toNumber(),
      effectiveFrom: row.effectiveFrom.toISOString().slice(0, 10),
    };
  }
}
