import { Module } from '@nestjs/common';
import { AdminEvents } from '../common/admin-events';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { RepairExpensesController } from './repair-expenses.controller';
import { RepairExpensesService } from './repair-expenses.service';
import { TripCostsHandler } from './trip-costs.handler';

@Module({
  controllers: [CategoriesController, RepairExpensesController],
  providers: [CategoriesService, RepairExpensesService, TripCostsHandler, AdminEvents],
})
export class ExpensesModule {}
