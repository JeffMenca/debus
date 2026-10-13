import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { BootstrapAdmin } from './bootstrap-admin';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AccountsModule],
  controllers: [UsersController],
  providers: [UsersService, BootstrapAdmin],
  exports: [UsersService],
})
export class UsersModule {}
