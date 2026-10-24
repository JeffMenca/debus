import { PrismaService } from '../../src/prisma/prisma.service';
import { type ReportesTestApp, startReportes } from './app';
import { isolatedSchema } from './isolated-schema';

export interface IsolatedReportesApp extends ReportesTestApp {
  // Closes the app and drops the schema.
  close(): Promise<void>;
}

// An app on a migrated schema of its own, for a report that lists whole tables: on the shared
// schema the rows of the local stack, or of another spec running at the same time, would be part
// of its totals. The label has no hyphens: it becomes part of an unquoted schema name.
export async function startIsolatedReportes(label: string): Promise<IsolatedReportesApp> {
  const isolated = await isolatedSchema(label);
  try {
    const started = await startReportes((builder) =>
      builder.overrideProvider(PrismaService).useValue(isolated.client),
    );
    return {
      ...started,
      close: async () => {
        try {
          await started.app.close();
        } finally {
          await isolated.drop();
        }
      },
    };
  } catch (error) {
    await isolated.drop().catch(() => undefined);
    throw error;
  }
}
