import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  isFolder,
  type PostmanCollection,
  type PostmanItem,
  type PostmanRequestItem,
} from './collection-types';
import { FLOW } from './flow';
import { toCollection } from './openapi-to-collection';
import type { OpenApiDocument } from './openapi-types';
import { sandbox } from './testing/sandbox';

// The collection as it is committed: built from the real OpenAPI document of the gateway.
const OPENAPI = JSON.parse(
  readFileSync(join(__dirname, '../../../../postman/openapi.json'), 'utf8'),
) as OpenApiDocument;
const collection: PostmanCollection = toCollection(OPENAPI, FLOW);

interface Located {
  folder: string;
  item: PostmanRequestItem;
  inheritedGuard: boolean;
}

function locate(items: PostmanItem[], folder = '', guarded = false): Located[] {
  return items.flatMap((item) => {
    if (!isFolder(item)) return [{ folder, item, inheritedGuard: guarded }];
    const ownGuard = (item.event ?? []).some((event) =>
      event.script.exec.join('\n').includes("pm.variables.get('baseUrl')"),
    );
    return locate(item.item, item.name, guarded || ownGuard);
  });
}
const everything = locate(collection.item);
const generated = everything.filter(
  ({ folder }) => !['Recorrido', 'Escrituras (solo local)'].includes(folder),
);
const chain = everything.filter(({ folder }) => folder === 'Escrituras (solo local)');
const prerequestOf = (item: PostmanRequestItem): string =>
  (item.event ?? []).find((event) => event.listen === 'prerequest')?.script.exec.join('\n') ?? '';

const isSession = (item: PostmanRequestItem) =>
  /\/auth\/(login|refresh|logout|links\/status)$/.test('/' + item.request.url.path.join('/'));
const isWrite = (item: PostmanRequestItem) => item.request.method !== 'GET' && !isSession(item);
const generatedWrites = generated.filter(({ item }) => isWrite(item));
const variablesIn = (item: PostmanRequestItem): string[] =>
  [
    ...JSON.stringify({ ...item.request, auth: undefined, description: undefined }).matchAll(
      /\{\{([^}]+)\}\}/g,
    ),
  ].map((match) => match[1] ?? '');
const setBy = (items: PostmanItem[]): Set<string> => {
  const names = new Set<string>();
  for (const { item } of locate(items)) {
    for (const event of item.event ?? []) {
      for (const match of event.script.exec
        .join('\n')
        .matchAll(/(?:collectionVariables|variables)\.set\(\s*["']([^"']+)["']/g)) {
        names.add(match[1] ?? '');
      }
    }
  }
  return names;
};
const REAL_DATA = [
  ...setBy(FLOW.item.filter((item) => !isFolder(item) || item.name !== 'Escrituras (solo local)')),
].filter((name) => !name.startsWith('test') && name !== 'today' && name !== 'runId');
const CHAIN_VARIABLES = new Set([...setBy(chain.map(({ item }) => item))]);
const ALWAYS_FINE = new Set(['email', 'today', 'runId', 'testBranchPrefix', 'baseUrl']);

describe('the collection against the data it must not touch', () => {
  it('has writes to check', () => {
    expect(generatedWrites.length).toBeGreaterThan(30);
    expect(chain.length).toBeGreaterThan(40);
  });

  it('knows which variables hold the demo data', () => {
    expect(REAL_DATA).toEqual(
      expect.arrayContaining(['branchId', 'busId', 'driverId', 'routeId', 'tripId', 'userId']),
    );
  });

  describe.each(generatedWrites)('$item.name', ({ item }) => {
    it('uses only test records, never a variable that holds demo data', () => {
      for (const name of variablesIn(item)) {
        if (name.startsWith('$') || ALWAYS_FINE.has(name)) continue;
        expect([item.name, name, REAL_DATA.includes(name)]).toEqual([item.name, name, false]);
        expect([item.name, name, name.startsWith('test')]).toEqual([item.name, name, true]);
      }
    });

    it('only uses test variables that the walkthrough fills in', () => {
      if (prerequestOf(item).includes('// Not run:')) return;
      for (const name of variablesIn(item)) {
        if (!name.startsWith('test') || name === 'testBranchPrefix') continue;
        expect([item.name, name, CHAIN_VARIABLES.has(name)]).toEqual([item.name, name, true]);
      }
    });

    it('acts with the system admin or the test branch admin, never with the demo branch admin', () => {
      const auth = item.request.auth;
      const token = auth.type === 'bearer' ? auth.bearer[0]?.value : 'none';
      expect(['{{accessToken}}', '{{testBranchAccessToken}}', 'none']).toContain(token);
    });

    it('does not run against a stack that is not on this machine', () => {
      const remote = sandbox(null, {
        variables: { baseUrl: 'https://gateway-1.us-central1.run.app' },
      });
      remote.run(prerequestOf(item));
      expect(remote.variables.get('skipped')).toBe(true);
    });
  });

  describe.each(chain)('$item.name', ({ item, inheritedGuard }) => {
    it('does not run against a stack that is not on this machine', () => {
      expect(inheritedGuard).toBe(true);
    });

    it('never writes with the session or the ids of the demo data', () => {
      for (const name of variablesIn(item)) {
        expect([item.name, name, REAL_DATA.includes(name) && isWrite(item)]).toEqual([
          item.name,
          name,
          false,
        ]);
      }
    });
  });

  describe('the operations that are left out', () => {
    const leftOut = generated.filter(({ item }) => prerequestOf(item).includes('// Not run:'));

    it('are few, never run and say why', () => {
      expect(leftOut.length).toBeGreaterThan(0);
      expect(leftOut.length).toBeLessThanOrEqual(23);
      for (const { item } of leftOut) {
        expect(prerequestOf(item)).toContain('pm.execution.skipRequest()');
        expect(item.request.description).toMatch(/No se ejecuta: \S/);
      }
    });

    it('are the ones that need something the collection cannot make', () => {
      expect(leftOut.map(({ item }) => item.name).sort()).toEqual(
        [
          'POST /api/administracion/settings',
          'POST /api/administracion/users',
          'PUT /api/flota/buses/:id/photo',
          'PUT /api/flota/drivers/:id/photo',
          'POST /api/viajes/rental-requests/:id/assignment',
          'POST /api/viajes/rental-requests/:id/cancel',
          'POST /api/clientes/rentals/:id/cancel',
          'POST /api/clientes/branch-rentals/:id/confirm',
          'POST /api/clientes/rentals',
          ...[
            'administracion',
            'flota',
            'viajes',
            'ventas',
            'clientes',
            'reportes',
            'notificaciones',
          ].flatMap((service) => [
            `POST /api/${service}/dead-letters/:messageId/replay`,
            `DELETE /api/${service}/dead-letters/:messageId`,
          ]),
        ].sort(),
      );
    });
  });

  it('checks every generated request against the codes its operation documents', () => {
    for (const { item } of generated) {
      const test =
        (item.event ?? []).find((event) => event.listen === 'test')?.script.exec.join('\n') ?? '';
      expect([item.name, test.includes('Responde con un código documentado')]).toEqual([
        item.name,
        true,
      ]);
    }
  });

  it('reads the resources that the walkthrough lists, so a read answers 200 and not a 400 of the validation', () => {
    const variableOf = (name: string) =>
      generated.find(({ item }) => item.name === name)?.item.request.url.variable?.[0]?.value;
    expect(variableOf('GET /api/administracion/users/:id')).toBe('{{userId}}');
    expect(variableOf('GET /api/system/probes/:probeId')).toBe('{{probeId}}');
    expect(setBy(FLOW.item).has('userId')).toBe(true);
    expect(setBy(FLOW.item).has('probeId')).toBe(true);
  });
});
