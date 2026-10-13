import { Module } from '@nestjs/common';
import { SaleStatusController } from './sale-status.controller';
import { SaleStatusService } from './sale-status.service';

@Module({ controllers: [SaleStatusController], providers: [SaleStatusService] })
export class SaleStatusModule {}
