import { Module } from '@nestjs/common';
import { BranchNames } from './branch-names';
import { BranchesHandler } from './branches.handler';
import { PdfRenderer } from './pdf/pdf-renderer';

@Module({
  providers: [BranchesHandler, BranchNames, PdfRenderer],
  exports: [BranchNames, PdfRenderer],
})
export class CommonModule {}
