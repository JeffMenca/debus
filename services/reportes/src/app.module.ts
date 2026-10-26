import { MessagingModule, SqlInboxStore, httpLoggerOptions } from '@debus/messaging';
import { HttpExceptionFilter, RolesGuard } from '@debus/server';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { CommonModule } from './common/common.module';
import { HealthModule } from './health/health.module';
import { BranchBusesModule } from './reports/branch-buses/branch-buses.module';
import { BranchDepreciationModule } from './reports/branch-depreciation/branch-depreciation.module';
import { BranchDriversModule } from './reports/branch-drivers/branch-drivers.module';
import { BranchRentalIncomeModule } from './reports/branch-rental-income/branch-rental-income.module';
import { BranchReadModelModule } from './reports/branch-read-model/branch-read-model.module';
import { BranchRepairExpensesModule } from './reports/branch-repair-expenses/branch-repair-expenses.module';
import { BranchTicketIncomeModule } from './reports/branch-ticket-income/branch-ticket-income.module';
import { SystemBusOptionsModule } from './reports/system-bus-options/system-bus-options.module';
import { SystemExpensesModule } from './reports/system-expenses/system-expenses.module';
import { SystemIncomeModule } from './reports/system-income/system-income.module';
import { SystemProfitModule } from './reports/system-profit/system-profit.module';
import { SystemReadModelModule } from './reports/system-read-model/system-read-model.module';
import { SystemRepairExpensesModule } from './reports/system-repair-expenses/system-repair-expenses.module';
import { SystemRoutesMapModule } from './reports/system-routes-map/system-routes-map.module';
import { SystemTopRoutesModule } from './reports/system-top-routes/system-top-routes.module';
import { PrismaModule } from './prisma/prisma.module';
import { PrismaService } from './prisma/prisma.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({ pinoHttp: httpLoggerOptions() }),
    HealthModule,
    PrismaModule,
    CommonModule,
    BranchReadModelModule,
    SystemReadModelModule,
    SystemIncomeModule,
    SystemExpensesModule,
    SystemProfitModule,
    SystemTopRoutesModule,
    SystemRepairExpensesModule,
    SystemBusOptionsModule,
    SystemRoutesMapModule,
    BranchBusesModule,
    BranchDriversModule,
    BranchDepreciationModule,
    BranchRepairExpensesModule,
    BranchTicketIncomeModule,
    BranchRentalIncomeModule,
    MessagingModule.forRoot({
      service: 'reportes',
      inbox: {
        inject: [PrismaService],
        useFactory: (prisma: PrismaService) => new SqlInboxStore(prisma),
      },
      outbox: { inject: [PrismaService], useFactory: (prisma: PrismaService) => prisma },
    }),
  ],
  providers: [
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
