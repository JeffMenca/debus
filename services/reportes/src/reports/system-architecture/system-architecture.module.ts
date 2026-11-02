import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { SystemArchitectureController } from './system-architecture.controller';
import { SystemArchitectureService } from './system-architecture.service';

@Module({
  imports: [CommonModule],
  controllers: [SystemArchitectureController],
  providers: [SystemArchitectureService],
})
export class SystemArchitectureModule {}
