#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { changedFiles, renderFiles } from './generate';
import type { OpenApiDocument } from './openapi-types';

const OUT_DIR = join(process.cwd(), 'postman');

const read = (name: string): string | undefined => {
  try {
    return readFileSync(join(OUT_DIR, name), 'utf8');
  } catch {
    return undefined;
  }
};

async function main(): Promise<void> {
  const apiUrl = process.env.API_URL ?? 'http://localhost:4000';
  const response = await fetch(`${apiUrl}/docs-json`);
  if (!response.ok) throw new Error(`${apiUrl}/docs-json answered ${response.status}`);
  const files = renderFiles((await response.json()) as OpenApiDocument);
  if (process.argv.includes('--check')) {
    const changed = changedFiles(
      files,
      Object.fromEntries(Object.keys(files).map((name) => [name, read(name)])),
    );
    if (changed.length > 0) {
      console.error(`Out of date: ${changed.join(', ')}. Run pnpm postman.`);
      process.exit(1);
    }
    console.log('The Postman files are up to date.');
    return;
  }
  mkdirSync(OUT_DIR, { recursive: true });
  for (const [name, content] of Object.entries(files)) writeFileSync(join(OUT_DIR, name), content);
  console.log(
    `Wrote ${Object.keys(files)
      .map((name) => `postman/${name}`)
      .join(' and ')}`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
