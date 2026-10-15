import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BranchNames {
  constructor(private readonly prisma: PrismaService) {}

  async nameOf(branchId: string): Promise<string | null> {
    const branch = await this.prisma.branchCopy.findUnique({
      where: { id: branchId },
      select: { name: true },
    });
    return branch?.name ?? null;
  }
}
