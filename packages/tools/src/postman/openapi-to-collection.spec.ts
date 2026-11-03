import {
  isFolder,
  type PostmanCollection,
  type PostmanFolder,
  type PostmanItem,
  type PostmanRequestItem,
} from './collection-types';
import { leftOutReason, toCollection } from './openapi-to-collection';
import type { OpenApiDocument } from './openapi-types';

const BUS_BODY = {
  type: 'object',
  properties: {
    plate: { type: 'string' },
    capacity: { type: 'integer', minimum: 10 },
    assignedDriverId: { type: 'string', format: 'uuid' },
  },
  required: ['plate', 'capacity', 'assignedDriverId'],
};
const bearer = [{ bearer: [] }];

const OPENAPI: OpenApiDocument = {
  openapi: '3.0.0',
  info: { title: 'debus API', version: '1.0' },
  paths: {
    '/health': {
      get: { tags: ['gateway · health'], responses: { '200': { description: 'Done.' } } },
    },
    '/api/flota/health': { get: { tags: ['flota · health'], responses: { '200': {} } } },
    '/api/administracion/auth/login': {
      post: {
        tags: ['administracion · sessions'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string' },
                  password: { type: 'string', minLength: 1 },
                },
                required: ['email', 'password'],
              },
            },
          },
        },
        responses: { '200': { description: 'Done.' }, '401': { description: 'No.' } },
      },
    },
    '/api/flota/buses/{id}': {
      get: {
        tags: ['flota · buses'],
        description: 'Allowed roles: BRANCH_ADMIN.',
        security: bearer,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Done.' } },
      },
      delete: {
        tags: ['flota · buses'],
        description: 'Allowed roles: BRANCH_ADMIN.',
        security: bearer,
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'x-correlation-id', in: 'header', required: true, schema: { type: 'string' } },
        ],
        responses: { '204': { description: 'Done, no content.' } },
      },
    },
    '/api/flota/buses': {
      post: {
        tags: ['flota · buses'],
        description: 'Allowed roles: BRANCH_ADMIN.',
        security: bearer,
        parameters: [
          { name: 'x-correlation-id', in: 'header', required: true, schema: { type: 'string' } },
        ],
        requestBody: { required: true, content: { 'application/json': { schema: BUS_BODY } } },
        responses: { '201': { description: 'Created.' }, '409': { description: 'Conflict.' } },
      },
      get: {
        tags: ['flota · buses'],
        description: 'Allowed roles: BRANCH_ADMIN.',
        security: bearer,
        parameters: [
          { name: 'status', in: 'query', required: false, schema: {} },
          { name: 'page', in: 'query', required: false, schema: {} },
          { name: 'pageSize', in: 'query', required: false, schema: {} },
        ],
        responses: { '200': { description: 'Done.' } },
      },
    },
    '/api/flota/buses/{id}/photo': {
      put: {
        tags: ['flota · buses'],
        description: 'Allowed roles: BRANCH_ADMIN.',
        security: bearer,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: { photo: { type: 'string', format: 'binary' } },
              },
            },
          },
        },
        responses: { '204': {} },
      },
    },
    '/api/administracion/branches': {
      get: {
        tags: ['administracion · branches'],
        security: bearer,
        parameters: [{ name: 'q', in: 'query', required: false, schema: {} }],
        responses: { '200': {} },
      },
    },
    '/api/administracion/users': {
      get: {
        tags: ['administracion · users'],
        description: 'Allowed roles: SYSTEM_ADMIN, BRANCH_ADMIN.',
        security: bearer,
        responses: { '200': {} },
      },
    },
    '/api/administracion/expense-categories/{id}': {
      patch: {
        tags: ['administracion · expense-categories'],
        description: 'Allowed roles: SYSTEM_ADMIN.',
        security: bearer,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: { type: 'object', properties: { name: { type: 'string', minLength: 2 } } },
            },
          },
        },
        responses: { '200': {} },
      },
    },
    '/api/administracion/dead-letters/{messageId}/replay': {
      post: {
        tags: ['administracion · dead-letters'],
        description: 'Allowed roles: SYSTEM_ADMIN.',
        security: bearer,
        parameters: [{ name: 'messageId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': {} },
      },
    },
    '/api/reportes/reports/branch-buses/pdf': {
      get: {
        tags: ['reportes · reports'],
        description: 'Allowed roles: BRANCH_ADMIN.',
        security: bearer,
        parameters: [{ name: 'q', in: 'query', required: false, schema: {} }],
        responses: { '200': {} },
      },
    },
    '/api/ventas/tickets': {
      post: {
        tags: ['ventas · tickets'],
        description: 'Allowed roles: CASHIER.',
        security: bearer,
        parameters: [
          { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string' } },
        ],
        responses: { '201': {} },
      },
    },
    '/api/clientes/rentals': {
      post: {
        tags: ['clientes · rentals'],
        description: 'Allowed roles: CLIENT.',
        security: bearer,
        responses: { '201': {} },
      },
    },
    '/api/clientes/rentals/mine': {
      get: {
        tags: ['clientes · rentals'],
        description: 'Allowed roles: CLIENT.',
        security: bearer,
        responses: { '200': {} },
      },
    },
    '/api/clientes/rentals/{id}/pay': {
      post: {
        tags: ['clientes · rentals'],
        description: 'Allowed roles: CLIENT, BRANCH_ADMIN.',
        security: bearer,
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string' } },
        ],
        responses: { '201': {} },
      },
    },
  },
};

const FLOW: PostmanFolder = { name: 'Recorrido', item: [] };

const requestsOf = (items: PostmanItem[]): PostmanRequestItem[] =>
  items.flatMap((item) => (isFolder(item) ? requestsOf(item.item) : [item]));
const folder = (collection: PostmanCollection, name: string): PostmanFolder => {
  const found = collection.item.find(
    (item): item is PostmanFolder => isFolder(item) && item.name === name,
  );
  if (!found) throw new Error(`no folder ${name}`);
  return found;
};
const request = (collection: PostmanCollection, name: string): PostmanRequestItem => {
  const found = requestsOf(collection.item).find((item) => item.name === name);
  if (!found) throw new Error(`no request ${name}`);
  return found;
};
const scriptOf = (item: PostmanRequestItem, listen: 'test' | 'prerequest') =>
  (item.event ?? []).find((event) => event.listen === listen)?.script.exec.join('\n') ?? '';

describe('toCollection', () => {
  const collection = toCollection(OPENAPI, FLOW);

  describe('structure', () => {
    it('is a v2.1 collection with the walkthrough first and the health checks second', () => {
      expect(collection.info.name).toBe('debus API');
      expect(collection.info.schema).toBe(
        'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      );
      expect(collection.item.slice(0, 2).map((item) => item.name)).toEqual(['Recorrido', 'Salud']);
      expect(collection.item[0]).toBe(FLOW);
    });

    it('has one folder per tag, in order, with the health of the gateway under Salud', () => {
      expect(collection.item.map((item) => item.name)).toEqual([
        'Recorrido',
        'Salud',
        'administracion · branches',
        'administracion · dead-letters',
        'administracion · expense-categories',
        'administracion · sessions',
        'administracion · users',
        'clientes · rentals',
        'flota · buses',
        'flota · health',
        'reportes · reports',
        'ventas · tickets',
      ]);
      expect(requestsOf(folder(collection, 'Salud').item).map((item) => item.name)).toEqual([
        'GET /health',
        'GET /docs-json',
      ]);
    });

    it('follows the order of the tags of the document when it lists them', () => {
      const ordered = toCollection(
        {
          ...OPENAPI,
          tags: [
            { name: 'gateway · health' },
            { name: 'flota · health' },
            { name: 'flota · buses' },
            { name: 'administracion · sessions' },
          ],
        },
        FLOW,
      );

      expect(ordered.item.map((item) => item.name).slice(0, 5)).toEqual([
        'Recorrido',
        'Salud',
        'flota · health',
        'flota · buses',
        'administracion · sessions',
      ]);
      expect(ordered.item).toHaveLength(collection.item.length);
    });

    it('orders the requests of a folder by path and then by method', () => {
      const names = requestsOf(folder(collection, 'flota · buses').item).map((item) => item.name);
      expect(names).toEqual([
        'GET /api/flota/buses',
        'POST /api/flota/buses',
        'GET /api/flota/buses/:id',
        'DELETE /api/flota/buses/:id',
        'PUT /api/flota/buses/:id/photo',
      ]);
    });

    it('is the same whatever the order of the paths in the document', () => {
      const reversed: OpenApiDocument = {
        ...OPENAPI,
        paths: Object.fromEntries(Object.entries(OPENAPI.paths).reverse()),
      };
      expect(JSON.stringify(toCollection(reversed, FLOW))).toBe(JSON.stringify(collection));
    });

    it('does not change the document it is given', () => {
      const before = JSON.stringify(OPENAPI);
      toCollection(OPENAPI, FLOW);
      expect(JSON.stringify(OPENAPI)).toBe(before);
    });
  });

  describe('requests', () => {
    it('points at the base URL and turns path parameters into variables named after the thing', () => {
      const { url } = request(collection, 'GET /api/flota/buses/:id').request;
      expect(url.raw).toBe('{{baseUrl}}/api/flota/buses/:id');
      expect(url.host).toEqual(['{{baseUrl}}']);
      expect(url.path).toEqual(['api', 'flota', 'buses', ':id']);
      expect(url.variable).toEqual([{ key: 'id', value: '{{busId}}' }]);
      const category = request(collection, 'PATCH /api/administracion/expense-categories/:id');
      expect(category.request.url.variable).toEqual([
        { key: 'id', value: '{{testExpenseCategoryId}}' },
      ]);
      const replay = request(collection, 'POST /api/administracion/dead-letters/:messageId/replay');
      expect(replay.request.url.variable).toEqual([
        { key: 'messageId', value: '{{testMessageId}}' },
      ]);
    });

    it('keeps the optional query parameters, all disabled', () => {
      const { url } = request(collection, 'GET /api/flota/buses').request;
      expect(url.query?.map((param) => param.key)).toEqual(['status', 'page', 'pageSize']);
      expect(url.query?.every((param) => param.disabled === true)).toBe(true);
      expect(url.raw).toBe('{{baseUrl}}/api/flota/buses');
      expect(url.query?.find((param) => param.key === 'pageSize')?.value).toBe('20');
    });

    it('sends the example body as JSON', () => {
      const { body, header } = request(collection, 'POST /api/flota/buses').request;
      expect(body).toEqual({
        mode: 'raw',
        raw: JSON.stringify(
          { plate: 'C123ABC', capacity: 10, assignedDriverId: '{{testDriverId}}' },
          null,
          2,
        ),
        options: { raw: { language: 'json' } },
      });
      expect(header).toContainEqual({ key: 'Content-Type', value: 'application/json' });
    });

    it('sends a file field for a multipart body', () => {
      const { body } = request(collection, 'PUT /api/flota/buses/:id/photo').request;
      expect(body).toEqual({
        mode: 'formdata',
        formdata: [{ key: 'photo', type: 'file', src: null }],
      });
    });

    it('sends a fresh correlation id and idempotency key when the endpoint asks for them', () => {
      expect(request(collection, 'POST /api/flota/buses').request.header).toContainEqual({
        key: 'x-correlation-id',
        value: '{{$guid}}',
      });
      expect(request(collection, 'POST /api/ventas/tickets').request.header).toContainEqual({
        key: 'Idempotency-Key',
        value: '{{$guid}}',
      });
      expect(
        request(collection, 'GET /api/flota/buses').request.header.some(
          (header) => header.key === 'Idempotency-Key',
        ),
      ).toBe(false);
    });

    it('keys the payment of a record with the id of what it pays', () => {
      expect(
        request(collection, 'POST /api/clientes/rentals/:id/pay').request.header,
      ).toContainEqual({ key: 'Idempotency-Key', value: '{{testRentalId}}' });
    });

    it('describes who may call it, in Spanish', () => {
      expect(request(collection, 'GET /api/flota/buses').request.description).toContain(
        'Roles permitidos: BRANCH_ADMIN.',
      );
    });
  });

  describe('authentication', () => {
    const tokenOf = (name: string) => {
      const { auth } = request(collection, name).request;
      return auth.type === 'bearer' ? auth.bearer[0]?.value : auth.type;
    };

    it('reads with the branch admin session for what only a branch can do', () => {
      expect(tokenOf('GET /api/flota/buses')).toBe('{{branchAccessToken}}');
      expect(tokenOf('GET /api/flota/buses/:id')).toBe('{{branchAccessToken}}');
    });

    it('reads with the system admin session for what it may do, alone or with others, and for any session', () => {
      expect(tokenOf('GET /api/administracion/users')).toBe('{{accessToken}}');
      expect(tokenOf('GET /api/administracion/branches')).toBe('{{accessToken}}');
    });

    it('reads with the session of a client what only a client can see', () => {
      expect(tokenOf('GET /api/clientes/rentals/mine')).toBe('{{clientAccessToken}}');
    });

    it('keeps the branch admin session for what a client and a branch admin share', () => {
      expect(tokenOf('POST /api/clientes/rentals/:id/pay')).toBe('{{testBranchAccessToken}}');
    });

    it('writes with the test branch admin, never with the session of the demo branch', () => {
      expect(tokenOf('POST /api/flota/buses')).toBe('{{testBranchAccessToken}}');
      expect(tokenOf('DELETE /api/flota/buses/:id')).toBe('{{testBranchAccessToken}}');
      expect(tokenOf('POST /api/ventas/tickets')).toBe('{{testBranchAccessToken}}');
    });

    it('writes with the system admin only what the system admin may do', () => {
      expect(tokenOf('PATCH /api/administracion/expense-categories/:id')).toBe('{{accessToken}}');
    });

    it('sends no session to the public endpoints', () => {
      expect(tokenOf('POST /api/administracion/auth/login')).toBe('noauth');
      expect(tokenOf('GET /health')).toBe('noauth');
      expect(tokenOf('GET /docs-json')).toBe('noauth');
    });

    it('asks for a session on the health of a service, as the gateway does', () => {
      expect(tokenOf('GET /api/flota/health')).toBe('{{accessToken}}');
    });
  });

  describe('tests', () => {
    const testOf = (name: string) => scriptOf(request(collection, name), 'test');
    const walkthrough = requestsOf(FLOW.item);

    it('checks the status against the ones the operation documents, not just "no server error"', () => {
      for (const item of requestsOf(collection.item).filter(
        (entry) => !walkthrough.includes(entry),
      )) {
        expect(scriptOf(item, 'test')).toContain('Responde con un código documentado');
        expect(scriptOf(item, 'test')).not.toContain('below(500)');
      }
    });

    it('accepts what a read documents except the codes that say the session or role is wrong', () => {
      expect(testOf('GET /api/flota/buses')).toContain('[200]');
      expect(testOf('GET /api/flota/buses')).not.toContain('401');
      expect(testOf('POST /api/flota/buses')).toContain('[201, 409]');
    });

    it('keeps 401 for a public endpoint, where it is a legitimate answer', () => {
      expect(testOf('POST /api/administracion/auth/login')).toContain('[200, 401]');
    });

    it('checks that a PDF endpoint answers a PDF', () => {
      const script = testOf('GET /api/reportes/reports/branch-buses/pdf');
      expect(script).toContain('Devuelve un PDF');
      expect(script).toContain('application/pdf');
      expect(testOf('GET /api/flota/buses')).not.toContain('PDF');
    });
  });

  describe('writes', () => {
    const WRITES = [
      'POST /api/flota/buses',
      'DELETE /api/flota/buses/:id',
      'PATCH /api/administracion/expense-categories/:id',
      'POST /api/ventas/tickets',
    ];

    it('skips them unless the base URL is a stack on this machine', () => {
      for (const name of WRITES) {
        const script = scriptOf(request(collection, name), 'prerequest');
        expect(script).toContain("pm.variables.get('baseUrl')");
        expect(script).toContain('localhost');
        expect(script).toContain('pm.execution.skipRequest()');
      }
    });

    it('sends reads, the session endpoints and the account checks always', () => {
      for (const name of [
        'GET /api/flota/buses',
        'GET /health',
        'POST /api/administracion/auth/login',
      ]) {
        expect(scriptOf(request(collection, name), 'prerequest')).toBe('');
      }
    });

    it('points them at the test records, never at the ones the walkthrough reads', () => {
      const bus = request(collection, 'DELETE /api/flota/buses/:id').request;
      expect(bus.url.variable).toEqual([{ key: 'id', value: '{{testBusId}}' }]);
      const category = request(collection, 'PATCH /api/administracion/expense-categories/:id');
      expect(category.request.url.variable).toEqual([
        { key: 'id', value: '{{testExpenseCategoryId}}' },
      ]);
      const body = (request(collection, 'POST /api/flota/buses').request.body as { raw: string })
        .raw;
      expect(JSON.parse(body)).toEqual({
        plate: 'C123ABC',
        capacity: 10,
        assignedDriverId: '{{testDriverId}}',
      });
    });

    it('keeps reading by the ids of the demo data', () => {
      expect(request(collection, 'GET /api/flota/buses/:id').request.url.variable).toEqual([
        { key: 'id', value: '{{busId}}' },
      ]);
    });

    it('never runs the ones that are left out, and says why', () => {
      for (const name of [
        'PUT /api/flota/buses/:id/photo',
        'POST /api/administracion/dead-letters/:messageId/replay',
      ]) {
        const item = request(collection, name);
        const script = scriptOf(item, 'prerequest');
        expect(script).toContain('pm.execution.skipRequest()');
        expect(script).not.toContain('localhost');
        expect(item.request.description).toContain('No se ejecuta:');
      }
    });
  });

  describe('collection level', () => {
    it('sets the date and a run id before every request', () => {
      const script = collection.event
        .find((event) => event.listen === 'prerequest')
        ?.script.exec.join('\n');
      expect(script).toContain("'today'");
      expect(script).toContain("'runId'");
    });

    it('has a default base URL', () => {
      expect(collection.variable).toContainEqual({
        key: 'baseUrl',
        value: 'http://localhost:4000',
      });
    });
  });
});

describe('leftOutReason', () => {
  it.each([
    ['post', '/api/administracion/settings'],
    ['post', '/api/administracion/users'],
    ['put', '/api/flota/buses/{id}/photo'],
    ['put', '/api/flota/drivers/{id}/photo'],
    ['post', '/api/viajes/rental-requests/{id}/assignment'],
    ['post', '/api/clientes/rentals'],
    ['post', '/api/clientes/rentals/{id}/pay'],
    ['post', '/api/flota/dead-letters/{messageId}/replay'],
    ['delete', '/api/notificaciones/dead-letters/{messageId}'],
  ] as const)('leaves out %s %s with a reason', (method, path) => {
    expect(leftOutReason(method, path)?.length).toBeGreaterThan(20);
  });

  it.each([
    ['get', '/api/administracion/settings'],
    ['get', '/api/flota/dead-letters'],
    ['post', '/api/flota/buses'],
    ['patch', '/api/administracion/users/{id}'],
    ['post', '/api/administracion/auth/login'],
  ] as const)('does not leave out %s %s', (method, path) => {
    expect(leftOutReason(method, path)).toBeUndefined();
  });
});

describe('a route that opts out of the session of its controller', () => {
  const open: OpenApiDocument = {
    openapi: '3.0.0',
    info: { title: 'debus API', version: '1.0' },
    paths: {
      '/api/administracion/branches/locations': {
        get: {
          tags: ['administracion · branches'],
          security: [],
          parameters: [{ name: 'pageSize', in: 'query', required: false, schema: {} }],
          responses: { '200': { description: 'Done.' }, '400': { description: 'Invalid.' } },
        },
      },
    },
  };
  const found = requestsOf(toCollection(open, FLOW).item).find(
    (item) => item.name === 'GET /api/administracion/branches/locations',
  );

  it('is sent without a session, as the public routes are', () => {
    expect(found?.request.auth).toEqual({ type: 'noauth' });
  });

  it('is described as open to anybody and accepts the 401 of a public route', () => {
    expect(found?.request.description).toContain('Público.');
    expect(found?.request.description).not.toContain('Cualquier sesión');
    expect(scriptOf(found as PostmanRequestItem, 'test')).toContain('[200, 400]');
  });
});
