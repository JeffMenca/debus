import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { AccountLinksService } from '../accounts/account-links.service';
import { AUTH_SETTINGS, type AuthSettings } from '../accounts/auth-settings';
import { isUniqueViolation } from '../common/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BootstrapAdmin implements OnApplicationBootstrap {
  private readonly logger = new Logger(BootstrapAdmin.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AUTH_SETTINGS) private readonly settings: AuthSettings,
    private readonly links: AccountLinksService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      this.logger.log(`System admin ${await this.ensureSystemAdmin()}`);
    } catch (error) {
      this.logger.error(`Could not invite the first system admin: ${(error as Error).message}`);
    }
  }

  async ensureSystemAdmin(): Promise<'created' | 'exists' | 'skipped'> {
    const email = this.settings.bootstrapAdminEmail;
    if (!email) return 'skipped';
    if ((await this.countAdmins()) > 0) return 'exists';
    try {
      const admin = await this.prisma.user.create({
        data: { email, fullName: 'Administración', role: 'SYSTEM_ADMIN' },
      });
      await this.links.issue(admin, 'ACTIVATION', 'INVITATION');
      return 'created';
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // The email is taken: either another instance just created the admin, or it is someone else's.
      if ((await this.countAdmins()) > 0) return 'exists';
      throw new Error('BOOTSTRAP_ADMIN_EMAIL belongs to an account that is not a system admin', {
        cause: error,
      });
    }
  }

  private countAdmins(): Promise<number> {
    return this.prisma.user.count({
      where: { role: 'SYSTEM_ADMIN', status: { not: 'INACTIVE' } },
    });
  }
}
