import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AccountsModule } from '../accounts/accounts.module';
import { AUTH_SETTINGS, type AuthSettings } from '../accounts/auth-settings';
import { AccessTokensService, jwtModuleOptions } from './access-tokens.service';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

@Module({
  imports: [
    AccountsModule,
    JwtModule.registerAsync({
      imports: [AccountsModule],
      inject: [AUTH_SETTINGS],
      useFactory: (settings: AuthSettings) => jwtModuleOptions(settings),
    }),
  ],
  controllers: [SessionsController],
  providers: [AccessTokensService, SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
