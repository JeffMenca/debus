import {
  type BranchRentalIncomePage,
  type BranchRentalIncomeQuery,
  toPage,
} from '@debus/contracts';
import { Injectable } from '@nestjs/common';
import { BranchNames } from '../../common/branch-names';
import { PdfRenderer } from '../../common/pdf/pdf-renderer';
import { assertPdfSize } from '../../common/report-rules';
import { PrismaService } from '../../prisma/prisma.service';
import { toReportDocument } from './branch-rental-income.pdf';
import {
  type RentalIncomeRecord,
  type RentalIncomeTotalsRecord,
  toRentalIncomeRow,
  toRentalIncomeTotals,
} from './branch-rental-income.rows';
import {
  allRentalIncomeQuery,
  rentalIncomePageQuery,
  rentalIncomeTotalsQuery,
} from './branch-rental-income.sql';

@Injectable()
export class BranchRentalIncomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly names: BranchNames,
    private readonly renderer: PdfRenderer,
  ) {}

  async page(branchId: string, query: BranchRentalIncomeQuery): Promise<BranchRentalIncomePage> {
    const [records, totalsRecords] = await this.prisma.$transaction([
      this.prisma.$queryRaw<RentalIncomeRecord[]>(rentalIncomePageQuery(branchId, query)),
      this.prisma.$queryRaw<RentalIncomeTotalsRecord[]>(rentalIncomeTotalsQuery(branchId, query)),
    ]);
    const totals = toRentalIncomeTotals(totalsRecords[0]);
    return {
      ...toPage(records.map(toRentalIncomeRow), totals.rentals, query),
      summary: { totals, groups: [] },
    };
  }

  async pdf(branchId: string, query: BranchRentalIncomeQuery): Promise<Buffer> {
    const [totalsRecord] = await this.prisma.$queryRaw<RentalIncomeTotalsRecord[]>(
      rentalIncomeTotalsQuery(branchId, query),
    );
    const totals = toRentalIncomeTotals(totalsRecord);
    assertPdfSize(totals.rentals);
    const [records, branchName] = await Promise.all([
      this.prisma.$queryRaw<RentalIncomeRecord[]>(allRentalIncomeQuery(branchId, query)),
      this.names.nameOf(branchId),
    ]);
    return this.renderer.render(
      toReportDocument({
        branchName,
        query,
        rows: records.map(toRentalIncomeRow),
        totals,
        now: new Date(),
      }),
    );
  }
}
