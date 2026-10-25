import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DOC_SERVICES, readSchemaText, renderManual, syncManuals } from './manual';
import type { OpenApiDocument } from '../postman/openapi-types';

const OPENAPI: OpenApiDocument = {
  openapi: '3.0.0',
  info: { title: 'debus API', version: '1.0' },
  paths: {
    '/api/flota/buses': {
      get: { operationId: 'flota_BusesController_list', security: [{ bearer: [] }], responses: {} },
    },
    '/health': { get: { operationId: 'HealthController_check', responses: {} } },
  },
};
const SCHEMA = 'model Bus {\n  id String @id\n  @@map("buses")\n}\n';
const SKELETON = [
  '# Manual',
  '## Tablas',
  '<!-- generado:tablas -->',
  '<!-- /generado:tablas -->',
  '## Despliegue',
  '<!-- generado:despliegue -->',
  '<!-- /generado:despliegue -->',
  '## Eventos',
  '<!-- generado:eventos -->',
  '<!-- /generado:eventos -->',
  '## Endpoints',
  '<!-- generado:endpoints -->',
  '<!-- /generado:endpoints -->',
  'Texto a mano.',
  '',
].join('\n');

describe('renderManual', () => {
  const rendered = renderManual(SKELETON, {
    service: 'flota',
    schemaText: SCHEMA,
    openapi: OPENAPI,
  });

  it('fills the four blocks and keeps what is written by hand', () => {
    expect(rendered).toContain('```mermaid\nerDiagram');
    expect(rendered).toContain('  buses {');
    expect(rendered).toContain('```mermaid\nflowchart LR');
    expect(rendered).toContain('Cloud Run flota');
    expect(rendered).toContain('**Publica**');
    expect(rendered).toContain('| Método | Ruta |');
    expect(rendered).toContain('Texto a mano.');
  });

  it('is stable: rendering what was rendered changes nothing', () => {
    expect(renderManual(rendered, { service: 'flota', schemaText: SCHEMA, openapi: OPENAPI })).toBe(
      rendered,
    );
  });

  it('says the gateway has no database', () => {
    const gateway = renderManual(SKELETON, {
      service: 'gateway',
      schemaText: null,
      openapi: OPENAPI,
    });
    expect(gateway).toContain('El gateway no tiene base de datos.');
    expect(gateway).not.toContain('erDiagram');
  });

  it('fails when a service that has a database comes without its schema', () => {
    expect(() =>
      renderManual(SKELETON, { service: 'flota', schemaText: null, openapi: OPENAPI }),
    ).toThrow('flota');
  });

  it('fails when the manual lacks a marker', () => {
    expect(() =>
      renderManual('# Manual', { service: 'flota', schemaText: SCHEMA, openapi: OPENAPI }),
    ).toThrow('generado:tablas');
  });
});

describe('DOC_SERVICES', () => {
  it('are the services with a manual of this team', () => {
    expect(DOC_SERVICES).toEqual([
      'gateway',
      'administracion',
      'flota',
      'viajes',
      'ventas',
      'clientes',
      'reportes',
      'notificaciones',
    ]);
  });
});

function project(): string {
  const root = mkdtempSync(join(tmpdir(), 'debus-docs-'));
  mkdirSync(join(root, 'postman'), { recursive: true });
  writeFileSync(join(root, 'postman/openapi.json'), JSON.stringify(OPENAPI));
  for (const service of DOC_SERVICES) {
    mkdirSync(join(root, 'docs', service), { recursive: true });
    writeFileSync(join(root, 'docs', service, 'README.md'), SKELETON);
    if (service === 'gateway') continue;
    mkdirSync(join(root, 'services', service, 'prisma'), { recursive: true });
    writeFileSync(join(root, 'services', service, 'prisma/schema.prisma'), SCHEMA);
  }
  return root;
}

describe('readSchemaText', () => {
  it('reads the single schema file of a service', () => {
    const root = project();
    expect(readSchemaText(root, 'flota')).toBe(SCHEMA);
  });

  it('puts together the files of a folder of schemas, in name order', () => {
    const root = project();
    const folder = join(root, 'services/viajes/prisma/schema');
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'b.prisma'), 'model B {\n  id String @id\n}\n');
    writeFileSync(join(folder, 'a.prisma'), 'model A {\n  id String @id\n}\n');
    writeFileSync(join(folder, 'notes.txt'), 'not a schema');

    const text = readSchemaText(root, 'viajes') ?? '';

    expect(text.indexOf('model A')).toBeLessThan(text.indexOf('model B'));
    expect(text).not.toContain('not a schema');
    expect(text).not.toContain('Bus');
  });

  it('is null for the gateway, which has no database', () => {
    expect(readSchemaText(project(), 'gateway')).toBeNull();
  });

  it('fails when a service has no schema at all', () => {
    const root = mkdtempSync(join(tmpdir(), 'debus-docs-'));
    expect(() => readSchemaText(root, 'flota')).toThrow('flota');
  });
});

describe('syncManuals', () => {
  it('writes the blocks of every manual and reports the files it changed', () => {
    const root = project();

    const changed = syncManuals(root, { check: false });

    expect(changed).toEqual(DOC_SERVICES.map((service) => `docs/${service}/README.md`));
    expect(readFileSync(join(root, 'docs/flota/README.md'), 'utf8')).toContain('Cloud Run flota');
  });

  it('changes nothing the second time', () => {
    const root = project();
    syncManuals(root, { check: false });

    expect(syncManuals(root, { check: false })).toEqual([]);
  });

  it('only reports in check mode and leaves the files as they are', () => {
    const root = project();

    const stale = syncManuals(root, { check: true });

    expect(stale).toHaveLength(DOC_SERVICES.length);
    expect(readFileSync(join(root, 'docs/flota/README.md'), 'utf8')).toBe(SKELETON);
    syncManuals(root, { check: false });
    expect(syncManuals(root, { check: true })).toEqual([]);
  });

  it('notices a manual that fell behind the code', () => {
    const root = project();
    syncManuals(root, { check: false });
    writeFileSync(
      join(root, 'services/flota/prisma/schema.prisma'),
      `${SCHEMA}model Driver {\n  id String @id\n  @@map("drivers")\n}\n`,
    );

    expect(syncManuals(root, { check: true })).toEqual(['docs/flota/README.md']);
  });

  it('fails when a manual does not exist', () => {
    const root = project();
    writeFileSync(join(root, 'docs/viajes/README.md'), '');
    expect(() => syncManuals(root, { check: true })).toThrow('generado:tablas');
    const empty = mkdtempSync(join(tmpdir(), 'debus-docs-'));
    mkdirSync(join(empty, 'postman'));
    writeFileSync(join(empty, 'postman/openapi.json'), JSON.stringify(OPENAPI));
    expect(() => syncManuals(empty, { check: true })).toThrow('docs/gateway/README.md');
  });
});
