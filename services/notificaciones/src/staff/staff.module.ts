import { Module } from '@nestjs/common';
import { StaffHandler } from './staff.handler';

@Module({ providers: [StaffHandler] })
export class StaffModule {}
