import { Module } from '@nestjs/common';
import { BranchesHandler } from './branches.handler';

@Module({ providers: [BranchesHandler] })
export class BranchesModule {}
