import { Module } from '@nestjs/common';
import { AccountEvents } from './account-events';
import { AccountLinksService } from './account-links.service';
import { AccountsController } from './accounts.controller';
import { AUTH_SETTINGS, loadAuthSettings } from './auth-settings';
import { RegistrationService } from './registration.service';

@Module({
  controllers: [AccountsController],
  providers: [
    { provide: AUTH_SETTINGS, useFactory: () => loadAuthSettings(process.env) },
    AccountEvents,
    AccountLinksService,
    RegistrationService,
  ],
  exports: [AUTH_SETTINGS, AccountEvents, AccountLinksService],
})
export class AccountsModule {}
