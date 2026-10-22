import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { BootstrapAdmin } from './bootstrap-admin';
import { UserRepublishController } from './user-republish.controller';
import { UserRepublishService } from './user-republish.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AccountsModule],
  controllers: [UsersController, UserRepublishController],
  providers: [UsersService, BootstrapAdmin, UserRepublishService],
  exports: [UsersService],
})
export class UsersModule {}
