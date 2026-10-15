import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { BranchRentalIncomeController } from './branch-rental-income.controller';
import { BranchRentalIncomeService } from './branch-rental-income.service';

@Module({
  imports: [CommonModule],
  controllers: [BranchRentalIncomeController],
  providers: [BranchRentalIncomeService],
})
export class BranchRentalIncomeModule {}
