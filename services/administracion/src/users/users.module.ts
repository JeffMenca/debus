import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AccountsModule } from '../accounts/accounts.module';
import { RolesGuard } from '../identity/identity';
import { BootstrapAdmin } from './bootstrap-admin';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AccountsModule],
  controllers: [UsersController],
  providers: [UsersService, BootstrapAdmin, { provide: APP_GUARD, useClass: RolesGuard }],
  exports: [UsersService],
})
export class UsersModule {}
