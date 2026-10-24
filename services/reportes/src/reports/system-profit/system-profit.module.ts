import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { SystemProfitController } from './system-profit.controller';
import { SystemProfitService } from './system-profit.service';

@Module({
  imports: [CommonModule],
  controllers: [SystemProfitController],
  providers: [SystemProfitService],
})
export class SystemProfitModule {}
