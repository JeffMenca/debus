import type { SystemBranchGroup } from '@debus/contracts';

export interface BranchGroupRecord {
  branch_id: string;
  branch_name: string;
  entries: number;
  amount: number;
}

export const toBranchGroups = (records: BranchGroupRecord[]): SystemBranchGroup[] =>
  records.map((record) => ({
    branchId: record.branch_id,
    branchName: record.branch_name,
    entries: record.entries,
    amount: record.amount,
  }));
