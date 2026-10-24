import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { SystemRoutesMapController } from './system-routes-map.controller';
import { SystemRoutesMapService } from './system-routes-map.service';

@Module({
  imports: [CommonModule],
  controllers: [SystemRoutesMapController],
  providers: [SystemRoutesMapService],
})
export class SystemRoutesMapModule {}
