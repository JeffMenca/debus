import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { AdminEvents } from '../common/admin-events';
import { BranchRepublishController } from './branch-republish.controller';
import { BranchRepublishService } from './branch-republish.service';
import { BranchesController } from './branches.controller';
import { BranchesService } from './branches.service';

@Module({
  imports: [AccountsModule],
  controllers: [BranchesController, BranchRepublishController],
  providers: [BranchesService, BranchRepublishService, AdminEvents],
  exports: [BranchesService],
})
export class BranchesModule {}
