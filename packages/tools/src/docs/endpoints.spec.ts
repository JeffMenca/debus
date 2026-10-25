import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ACTIONS } from './actions-es';
import { DOC_SERVICES } from './manual';
import { endpointsTable } from './endpoints';
import type { OpenApiDocument } from '../postman/openapi-types';

const OPENAPI: OpenApiDocument = {
  openapi: '3.0.0',
  info: { title: 'debus API', version: '1.0' },
  paths: {
    '/health': { get: { operationId: 'HealthController_check', responses: {} } },
    '/api/system/status': {
      get: {
        operationId: 'SystemController_status',
        description: 'Allowed roles: SYSTEM_ADMIN.',
        security: [{ bearer: [] }],
        responses: {},
      },
    },
    '/api/flota/health': { get: { operationId: 'flota_HealthController_check', responses: {} } },
    '/api/flota/buses': {
      get: {
        operationId: 'flota_BusesController_list',
        description: 'Allowed roles: BRANCH_ADMIN.',
        security: [{ bearer: [] }],
        responses: {},
      },
      post: {
        operationId: 'flota_BusesController_create',
        summary: 'Registrar un bus',
        description: 'Allowed roles: BRANCH_ADMIN.',
        security: [{ bearer: [] }],
        responses: {},
      },
    },
    '/api/flota/buses/locations': {
      get: { operationId: 'flota_Open_list', security: [], responses: {} },
    },
    '/api/flota/buses/{id}/deactivate': {
      post: {
        operationId: 'flota_BusesController_deactivate',
        description: 'Allowed roles: SYSTEM_ADMIN, BRANCH_ADMIN.',
        security: [{ bearer: [] }],
        responses: {},
      },
    },
    '/api/flota/internal/buses/republish': {
      post: { operationId: 'flota_Republish_run', security: [{ bearer: [] }], responses: {} },
    },
    '/api/flota/auth/me': {
      get: { operationId: 'flota_Me_get', security: [{ bearer: [] }], responses: {} },
    },
    '/api/viajes/trips': {
      get: {
        operationId: 'viajes_TripsController_list',
        security: [{ bearer: [] }],
        responses: {},
      },
    },
  },
};

describe('endpointsTable', () => {
  const table = endpointsTable(OPENAPI, 'flota');

  it('is a Markdown table with a header', () => {
    expect(table.split('\n')[0]).toBe('| Método | Ruta | Qué hace | Roles |');
    expect(table.split('\n')[1]).toBe('| --- | --- | --- | --- |');
  });

  it('lists only the routes of that service, without its prefix', () => {
    expect(table).toContain('| `GET` | `/buses` |');
    expect(table).toContain('| `POST` | `/buses/{id}/deactivate` |');
    expect(table).not.toContain('trips');
    expect(table).not.toContain('/api/flota');
  });

  it('leaves out the internal routes', () => {
    expect(table).not.toContain('republish');
    expect(table).not.toContain('internal');
  });

  it('takes the roles from "Allowed roles"', () => {
    expect(table).toMatch(/\| `GET` \| `\/buses` \| .* \| BRANCH_ADMIN \|/);
    expect(table).toMatch(/deactivate` \| .* \| SYSTEM_ADMIN, BRANCH_ADMIN \|/);
  });

  it('says "Cualquier sesión" for a route that needs a session but no role', () => {
    expect(table).toMatch(/`\/auth\/me` \| .* \| Cualquier sesión \|/);
  });

  it('says "Cualquier sesión" for the health route of a service, which the gateway protects', () => {
    expect(table).toMatch(/`\/health` \| .* \| Cualquier sesión \|/);
  });

  it('says "Público" for a route that the gateway lets through without a session', () => {
    const open = endpointsTable(
      {
        ...OPENAPI,
        paths: {
          '/api/flota/auth/login': { post: { operationId: 'flota_S_login', responses: {} } },
          '/health': { get: { operationId: 'HealthController_check', responses: {} } },
        },
      },
      'flota',
    );
    expect(open).toMatch(/`\/auth\/login` \| .* \| Público \|/);
    const gateway = endpointsTable(OPENAPI, 'gateway');
    expect(gateway).toMatch(/`\/health` \| .* \| Público \|/);
  });

  it('describes each route in Spanish: its summary or, failing that, the text written for it', () => {
    expect(table).toContain('Registrar un bus');
    expect(table).toMatch(/`\/buses` \| Lista los buses \|/);
    expect(table).toMatch(/deactivate` \| Desactiva un bus \|/);
  });

  it('falls back to the name of the handler for a route that has no text yet', () => {
    expect(table).toMatch(/`\/auth\/me` \| get \|/);
  });

  it('says "Público" for a route that opts out of the session of its controller', () => {
    expect(table).toMatch(/`\/buses\/locations` \| .* \| Público \|/);
  });

  it('orders the routes by path and then by method', () => {
    const lines = table.split('\n').slice(2);
    const keys = lines.map((line) => line.split('|').slice(1, 3).join('|').trim());
    expect(keys.join('\n')).toBe(
      [
        '`GET` | `/auth/me`',
        '`GET` | `/buses`',
        '`POST` | `/buses`',
        '`GET` | `/buses/locations`',
        '`POST` | `/buses/{id}/deactivate`',
        '`GET` | `/health`',
      ].join('\n'),
    );
  });

  it('gives the gateway its own routes and the diagnostics', () => {
    const gateway = endpointsTable(OPENAPI, 'gateway');
    expect(gateway).toContain('`/api/system/status`');
    expect(gateway).toContain('`/health`');
    expect(gateway).not.toContain('buses');
    expect(gateway).toMatch(/`\/api\/system\/status` \| .* \| SYSTEM_ADMIN \|/);
  });

  it('says there is nothing when a service has no routes', () => {
    expect(endpointsTable(OPENAPI, 'ventas')).toBe(
      'Este servicio no publica endpoints en el Swagger.',
    );
  });
});

describe('the Spanish text of the routes', () => {
  const real = JSON.parse(
    readFileSync(join(__dirname, '../../../../postman/openapi.json'), 'utf8'),
  ) as OpenApiDocument;

  it('covers every public route of the services that have a manual, so a new route needs its text', () => {
    const missing = DOC_SERVICES.flatMap((service) =>
      endpointsTable(real, service)
        .split('\n')
        .slice(2)
        .map((row) => row.split(' | '))
        // The text of a route without an entry is the camelCase name of its handler.
        .filter((cells) => /^[a-z][A-Za-z]*$/.test(cells[2] ?? ''))
        .map((cells) => `${service} ${cells[0]} ${cells[1]}`),
    );
    expect(missing).toEqual([]);
  });

  it('has no text for a route that no longer exists', () => {
    // A text is kept under the name of the handler, or under the full name when two services have
    // a handler with the same name and say different things (`ventas_TripsController_list`).
    const known = new Set(
      Object.values(real.paths)
        .flatMap((operations) => Object.values(operations))
        .flatMap((operation) => [
          operation?.operationId,
          operation?.operationId?.replace(/^[a-z]+_/, ''),
        ]),
    );
    expect(Object.keys(ACTIONS).filter((key) => !known.has(key))).toEqual([]);
  });

  it('writes every text in Spanish, with a capital letter and no final period', () => {
    for (const text of Object.values(ACTIONS)) {
      expect(text).toMatch(/^[A-ZÁÉÍÓÚ]/);
      expect(text.endsWith('.')).toBe(false);
    }
  });
});
