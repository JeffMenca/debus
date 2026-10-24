import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { SystemRepairExpensesController } from './system-repair-expenses.controller';
import { SystemRepairExpensesService } from './system-repair-expenses.service';

@Module({
  imports: [CommonModule],
  controllers: [SystemRepairExpensesController],
  providers: [SystemRepairExpensesService],
})
export class SystemRepairExpensesModule {}
