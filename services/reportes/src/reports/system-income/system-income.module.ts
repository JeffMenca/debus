import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { SystemIncomeController } from './system-income.controller';
import { SystemIncomeService } from './system-income.service';

@Module({
  imports: [CommonModule],
  controllers: [SystemIncomeController],
  providers: [SystemIncomeService],
})
export class SystemIncomeModule {}
