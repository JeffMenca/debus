import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { BranchBusesController } from './branch-buses.controller';
import { BranchBusesService } from './branch-buses.service';

@Module({
  imports: [CommonModule],
  controllers: [BranchBusesController],
  providers: [BranchBusesService],
})
export class BranchBusesModule {}
