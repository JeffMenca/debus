import {
  type EventEnvelope,
  userRegisteredPayloadSchema,
  userUpdatedPayloadSchema,
} from '@debus/contracts';
import { OnEvent, type SqlClient } from '@debus/messaging';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { inTransaction } from '../prisma/transaction';

// Keeps the branch admins of administracion, who are warned about the licences of their drivers.
@Injectable()
export class StaffHandler {
  constructor(private readonly prisma: PrismaService) {}

  // An activated account: version 0, so any UserUpdated about it wins.
  @OnEvent('UserRegistered')
  async registered(payload: unknown, _envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    const user = userRegisteredPayloadSchema.parse(payload);
    if (user.role !== 'BRANCH_ADMIN') return;
    await inTransaction(tx, this.prisma).branchAdmin.createMany({
      data: [
        {
          userId: user.userId,
          email: user.email,
          fullName: user.fullName,
          branchId: user.branchId,
          active: true,
          version: 0,
        },
      ],
      skipDuplicates: true,
    });
  }

  @OnEvent('UserUpdated')
  async updated(payload: unknown, _envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    const user = userUpdatedPayloadSchema.parse(payload);
    const db = inTransaction(tx, this.prisma);
    if (user.role !== 'BRANCH_ADMIN') {
      await db.branchAdmin.deleteMany({ where: { userId: user.userId } });
      return;
    }
    await db.$executeRaw`
      INSERT INTO branch_admins (user_id, branch_id, email, full_name, active, version)
      VALUES (${user.userId}::uuid, ${user.branchId}::uuid, ${user.email}, ${user.fullName},
        ${user.active}, ${user.version})
      ON CONFLICT (user_id) DO UPDATE SET branch_id = EXCLUDED.branch_id, email = EXCLUDED.email,
        full_name = EXCLUDED.full_name, active = EXCLUDED.active, version = EXCLUDED.version
      WHERE branch_admins.version < EXCLUDED.version`;
  }
}
