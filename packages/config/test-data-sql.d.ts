export interface CleanupOptions {
  /** Limits the cleanup to what one test run created (its TEST_RUN). */
  run?: string | null;
  /** Ids of the settings versions that exist in administracion; copies of any other are removed. */
  settingsVersionIds?: readonly string[] | null;
  /**
   * Ids of the branches that exist in administracion; the read-model rows of reportes that belong to
   * any other branch are removed. With null or an empty list nothing is removed.
   */
  branchIds?: readonly string[] | null;
}
export declare function cleanupStatements(options?: CleanupOptions): string[];
export declare function keptBranchesQuery(run?: string | null): string;
/** Wraps a statement so a database that lacks any of the tables skips it. */
export declare function whenTablesExist(tables: readonly string[], sql: string): string;
/** Keys of the bucket photos of the buses and drivers in the test branches (flota only). */
export declare function photoKeysQuery(run?: string | null): string;
