import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { BranchDriversController } from './branch-drivers.controller';
import { BranchDriversService } from './branch-drivers.service';

@Module({
  imports: [CommonModule],
  controllers: [BranchDriversController],
  providers: [BranchDriversService],
})
export class BranchDriversModule {}
