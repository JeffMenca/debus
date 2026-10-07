import { Module } from '@nestjs/common';
import { ProbeService } from './probe.service';
import { SystemController } from './system.controller';
import { SystemStatusService } from './system-status.service';

@Module({ controllers: [SystemController], providers: [SystemStatusService, ProbeService] })
export class SystemModule {}
