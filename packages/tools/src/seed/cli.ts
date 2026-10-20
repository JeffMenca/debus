#!/usr/bin/env node
import { formatReport } from './report';
import { createSeedContext, runSeed, seedConfigFrom, seedOptionsFrom } from './run-seed';

async function main(): Promise<void> {
  const options = seedOptionsFrom(process.argv.slice(2), process.env);
  const config = seedConfigFrom(options, process.env);
  console.log(`Seeding ${options.target}: ${config.apiUrl}`);
  const ctx = await createSeedContext(config, options.daysAhead, { log: console.log });
  const reports = await runSeed(options, { ctx });
  console.log(`\n${formatReport(reports)}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
