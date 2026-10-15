import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { BranchRepairExpensesController } from './branch-repair-expenses.controller';
import { BranchRepairExpensesService } from './branch-repair-expenses.service';

@Module({
  imports: [CommonModule],
  controllers: [BranchRepairExpensesController],
  providers: [BranchRepairExpensesService],
})
export class BranchRepairExpensesModule {}
