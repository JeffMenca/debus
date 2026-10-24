import type { SystemBranchGroup } from '@debus/contracts';
import type { PdfRow } from '../../common/pdf/report-document';
import { NO_BRANCH_NAME } from './branch-entries.sql';
import { groupedSections } from './grouped-sections.pdf';

// The filter line of the chosen branch; its label is null when the branch has no copy yet.
export const branchFilter = (
  branchId: string | undefined,
  branchLabel: string | null,
  caption = 'Sucursal',
): string[] => (branchId ? [`${caption}: ${branchLabel ?? NO_BRANCH_NAME}`] : []);

interface BranchEntry {
  branchId: string;
}

interface BranchSectionsInput<R extends BranchEntry> {
  rows: R[];
  groups: SystemBranchGroup[];
  columnCount: number;
  amountColumn: number;
  cellsOf: (row: R) => string[];
  formatAmount: (amount: number) => string;
  totalLabel: string;
  totalAmount: number;
}

// One section per branch, in the order of the groups. The rows come ordered by branch from the
// server, so a section is a filter on its id.
export const branchSections = <R extends BranchEntry>({
  groups,
  ...rest
}: BranchSectionsInput<R>): PdfRow[] =>
  groupedSections({
    ...rest,
    groups: groups.map((group) => ({
      key: group.branchId,
      label: group.branchName,
      amount: group.amount,
    })),
    keyOf: (row) => row.branchId,
    subtotalLabel: (label) => `Subtotal ${label}`,
  });
