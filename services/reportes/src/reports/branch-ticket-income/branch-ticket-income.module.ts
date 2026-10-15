import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { BranchTicketIncomeController } from './branch-ticket-income.controller';
import { BranchTicketIncomeService } from './branch-ticket-income.service';

@Module({
  imports: [CommonModule],
  controllers: [BranchTicketIncomeController],
  providers: [BranchTicketIncomeService],
})
export class BranchTicketIncomeModule {}
