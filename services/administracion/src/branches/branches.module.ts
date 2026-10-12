import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { AdminEvents } from '../common/admin-events';
import { BranchesController } from './branches.controller';
import { BranchesService } from './branches.service';

@Module({
  imports: [AccountsModule],
  controllers: [BranchesController],
  providers: [BranchesService, AdminEvents],
  exports: [BranchesService],
})
export class BranchesModule {}
