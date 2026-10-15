import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { BranchDepreciationController } from './branch-depreciation.controller';
import { BranchDepreciationService } from './branch-depreciation.service';

@Module({
  imports: [CommonModule],
  controllers: [BranchDepreciationController],
  providers: [BranchDepreciationService],
})
export class BranchDepreciationModule {}
