import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { SystemExpensesController } from './system-expenses.controller';
import { SystemExpensesService } from './system-expenses.service';

@Module({
  imports: [CommonModule],
  controllers: [SystemExpensesController],
  providers: [SystemExpensesService],
})
export class SystemExpensesModule {}
