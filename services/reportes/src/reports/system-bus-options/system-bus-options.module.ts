import { Module } from '@nestjs/common';
import { SystemBusOptionsController } from './system-bus-options.controller';
import { SystemBusOptionsService } from './system-bus-options.service';

@Module({
  controllers: [SystemBusOptionsController],
  providers: [SystemBusOptionsService],
})
export class SystemBusOptionsModule {}
