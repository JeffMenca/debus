export interface SeedCount {
  created: number;
  existing: number;
  // Only present when something was left undone on purpose.
  skipped?: number;
  // Only present when the seed took something away.
  removed?: number;
}

export interface SeedReport {
  area: string;
  counts: Record<string, SeedCount>;
}

// Counts what an area created and what it found already there, so the summary can tell a first
// run from a repeat.
export class Tally {
  private readonly counts: Record<string, SeedCount> = {};

  constructor(private readonly area: string) {}

  created(kind: string, amount = 1): void {
    this.entry(kind).created += amount;
  }

  existing(kind: string, amount = 1): void {
    this.entry(kind).existing += amount;
  }

  skipped(kind: string, amount = 1): void {
    const entry = this.entry(kind);
    entry.skipped = (entry.skipped ?? 0) + amount;
  }

  removed(kind: string, amount = 1): void {
    const entry = this.entry(kind);
    entry.removed = (entry.removed ?? 0) + amount;
  }

  report(): SeedReport {
    return { area: this.area, counts: { ...this.counts } };
  }

  private entry(kind: string): SeedCount {
    return (this.counts[kind] ??= { created: 0, existing: 0 });
  }
}

export const createdIn = (report: SeedReport): number =>
  Object.values(report.counts).reduce((sum, count) => sum + count.created, 0);

export function formatReport(reports: readonly SeedReport[]): string {
  return reports
    .map(({ area, counts }) => {
      const lines = Object.entries(counts).map(
        ([kind, { created, existing, skipped, removed }]) =>
          `  ${kind}: ${created} created, ${existing} already there${skipped ? `, ${skipped} skipped` : ''}${removed ? `, ${removed} removed` : ''}`,
      );
      return [`${area}`, ...(lines.length > 0 ? lines : ['  nothing to do'])].join('\n');
    })
    .join('\n');
}
