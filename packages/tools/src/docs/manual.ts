import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BackendService } from '@debus/contracts';
import type { OpenApiDocument } from '../postman/openapi-types';
import { deploymentDiagram } from './deployment';
import { endpointsTable } from './endpoints';
import { eventsTable } from './events-table';
import { replaceBetween } from './markers';
import { erdFromPrisma } from './prisma-erd';

export type DocService = BackendService | 'gateway';

// The services whose manual is generated: every one of them has its manual in docs/<service>.
export const DOC_SERVICES: readonly DocService[] = [
  'gateway',
  'administracion',
  'flota',
  'viajes',
  'ventas',
  'clientes',
  'reportes',
  'notificaciones',
];

export interface ManualInputs {
  service: DocService;
  schemaText: string | null;
  openapi: OpenApiDocument;
}

const fenced = (language: string, body: string): string => `\`\`\`${language}\n${body}\n\`\`\``;

// Rewrites the four generated blocks of a manual: the rest of the page is written by hand.
export function renderManual(
  markdown: string,
  { service, schemaText, openapi }: ManualInputs,
): string {
  if (service !== 'gateway' && schemaText === null) {
    throw new Error(`The service ${service} has no Prisma schema to draw its tables from`);
  }
  const tables =
    schemaText === null
      ? 'El gateway no tiene base de datos.'
      : fenced('mermaid', erdFromPrisma(schemaText));
  const blocks: [string, string][] = [
    ['tablas', tables],
    ['despliegue', fenced('mermaid', deploymentDiagram(service))],
    ['eventos', eventsTable(service)],
    ['endpoints', endpointsTable(openapi, service)],
  ];
  return blocks.reduce(
    (text, [marker, content]) => replaceBetween(text, marker, content),
    markdown,
  );
}

// A service keeps its schema in one file, or in a folder of files that Prisma reads together.
export function readSchemaText(root: string, service: DocService): string | null {
  if (service === 'gateway') return null;
  const prisma = join(root, 'services', service, 'prisma');
  const folder = join(prisma, 'schema');
  if (existsSync(folder)) {
    return readdirSync(folder)
      .filter((file) => file.endsWith('.prisma'))
      .sort()
      .map((file) => readFileSync(join(folder, file), 'utf8'))
      .join('\n');
  }
  const single = join(prisma, 'schema.prisma');
  if (!existsSync(single)) throw new Error(`The service ${service} has no schema in ${prisma}`);
  return readFileSync(single, 'utf8');
}

// Brings every manual up to date and returns the ones that were out of date. In check mode it
// writes nothing, so the CI can fail when somebody changed the code and forgot the manual.
export function syncManuals(root: string, { check }: { check: boolean }): string[] {
  const openapi = JSON.parse(
    readFileSync(join(root, 'postman/openapi.json'), 'utf8'),
  ) as OpenApiDocument;
  const changed: string[] = [];
  for (const service of DOC_SERVICES) {
    const relative = `docs/${service}/README.md`;
    const file = join(root, relative);
    if (!existsSync(file)) throw new Error(`The manual ${relative} does not exist`);
    const current = readFileSync(file, 'utf8');
    const next = renderManual(current, {
      service,
      schemaText: readSchemaText(root, service),
      openapi,
    });
    if (next === current) continue;
    changed.push(relative);
    if (!check) writeFileSync(file, next);
  }
  return changed;
}
