import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { SystemTopRoutesController } from './system-top-routes.controller';
import { SystemTopRoutesService } from './system-top-routes.service';

@Module({
  imports: [CommonModule],
  controllers: [SystemTopRoutesController],
  providers: [SystemTopRoutesService],
})
export class SystemTopRoutesModule {}
