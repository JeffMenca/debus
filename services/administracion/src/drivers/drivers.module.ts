import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { DriverAccountsHandler } from './driver-accounts.handler';

@Module({ imports: [AccountsModule], providers: [DriverAccountsHandler] })
export class DriversModule {}
