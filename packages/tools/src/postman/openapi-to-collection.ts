import {
  PDF_TEST,
  bearerAuth,
  jsonBody,
  pmTest,
  script,
  type PostmanAuth,
  type PostmanBody,
  type PostmanCollection,
  type PostmanFolder,
  type PostmanHeader,
  type PostmanQuery,
  type PostmanRequestItem,
} from './collection-types';
import { exampleFor, type ExampleOptions } from './example-for';
import { LOCAL_ONLY, neverRun } from './guards';
import {
  HTTP_METHODS,
  type HttpMethod,
  type OpenApiDocument,
  type OperationObject,
  type ParameterObject,
} from './openapi-types';

const SCHEMA_URL = 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json';
const HEALTH_FOLDER = 'Salud';
const DEFAULT_BASE_URL = 'http://localhost:4000';

const COLLECTION_DESCRIPTION = [
  'Colección generada del Swagger del gateway (`/docs-json`): una carpeta por etiqueta con todas las peticiones, más el recorrido de uso.',
  '',
  '- **Recorrido**: inicia sesión como admin del sistema y como admin de sucursal, recorre pantallas, reportes y un PDF, y guarda los tokens y los ids que usan las demás carpetas, así que se ejecuta primero. Su carpeta "Escrituras (solo local)" crea sucursales, un chofer, un bus, una ruta, viajes y gastos de prueba (con el prefijo y el correo `@debus.test` que borra `pnpm test:clean`) y deja los ids `test…` que usan las escrituras generadas.',
  '- **Salud**: el estado del gateway; no necesita sesión.',
  '- Variables: `baseUrl`, `mailpitUrl`, `adminEmail`, `adminPassword`, `branchAdminEmail` y `branchPassword` (ver el entorno local).',
  '- Toda petición que cambia datos se salta si `baseUrl` no es de esta máquina (`localhost`), así que apuntar la colección a producción solo lee. Las escrituras generadas usan solo los ids de prueba (`testBusId`, `testTripId`…) y la sesión del admin de prueba, nunca los datos de demostración.',
  '- Cada petición comprueba que la respuesta sea uno de los códigos que documenta su operación. Las pocas que no se ejecutan dicen por qué en su descripción.',
].join('\n');

// The date in Guatemala (UTC-6) is the "today" of the API.
const COLLECTION_PREREQUEST = [
  "pm.variables.set('today', new Date(Date.now() - 6 * 3600 * 1000).toISOString().slice(0, 10));",
  "if (!pm.collectionVariables.get('runId')) {",
  "  pm.collectionVariables.set('runId', Math.random().toString(16).slice(2, 10).padEnd(8, '0'));",
  '}',
];

// A response is checked against what the operation documents. The codes that say the session or
// the role is wrong (401, 403) are not accepted for an operation that needs a session, and the
// ones that say another service failed (5xx) never are.
const statusTest = (codes: number[]): string[] =>
  pmTest(`Responde con un código documentado (${codes.join(', ')})`, [
    `pm.expect([${codes.join(', ')}]).to.include(pm.response.code);`,
  ]);

function acceptedStatuses(operation: OperationObject, authenticated: boolean): number[] {
  const documented = Object.keys(operation.responses ?? {})
    .map(Number)
    .filter((code) => code < 500 && !(authenticated && (code === 401 || code === 403)))
    .sort((a, b) => a - b);
  return documented.length > 0 ? documented : [200];
}

const QUERY_HINTS: Record<string, string> = {
  page: '1',
  pageSize: '20',
  limit: '20',
  from: '{{today}}',
  to: '{{today}}',
};

// The operations the collection leaves out, with the reason. Everything else runs.
const LEFT_OUT: { method: HttpMethod; path: RegExp; reason: string }[] = [
  {
    method: 'post',
    path: /^\/api\/administracion\/settings$/,
    reason:
      'crea una versión de configuración global e inmutable con el admin real como autor, y `pnpm test:clean` no la quita',
  },
  {
    method: 'post',
    path: /^\/api\/administracion\/users$/,
    reason:
      'el cuerpo de ejemplo crea una cuenta con rol de admin del sistema; el recorrido de escrituras lo ejercita con un cajero de prueba',
  },
  {
    method: 'put',
    path: /^\/api\/flota\/(buses|drivers)\/\{id\}\/photo$/,
    reason: 'necesita un archivo de imagen en disco, que una colección no puede llevar',
  },
  {
    method: 'post',
    path: /^\/api\/viajes\/rental-requests\/\{id\}\/assignment$/,
    reason: 'necesita una solicitud de alquiler que crea `ventas`, y el seed todavía no las carga',
  },
  {
    method: 'post',
    path: /\/dead-letters\/\{messageId\}\/replay$/,
    reason: 'necesita un mensaje real en la cola de errores de ese servicio',
  },
  {
    method: 'delete',
    path: /\/dead-letters\/\{messageId\}$/,
    reason: 'necesita un mensaje real en la cola de errores de ese servicio',
  },
];

export function leftOutReason(method: HttpMethod, path: string): string | undefined {
  return LEFT_OUT.find((entry) => entry.method === method && entry.path.test(path))?.reason;
}

// Opening, refreshing or closing a session and checking a link change no business data.
const isSessionEndpoint = (path: string): boolean =>
  /\/auth\/(login|refresh|logout|links\/status)$/.test(path);
const isWrite = (method: HttpMethod, path: string): boolean =>
  method !== 'get' && !isSessionEndpoint(path);

const capitalize = (word: string): string => `${word.charAt(0).toUpperCase()}${word.slice(1)}`;

// The variables of the test records that the walkthrough creates, for requests that change data.
const TEST_VARIABLES: Record<string, string> = {
  assignedDriverId: 'testDriverId',
  destinationBranchId: 'testDestinationBranchId',
};
const testVariable = (name: string): string => TEST_VARIABLES[name] ?? `test${capitalize(name)}`;

// A request that changes data uses only test records, so what it makes or breaks is cleaned up.
const TEST_EXAMPLES: ExampleOptions = {
  variable: testVariable,
  text: { name: '{{testBranchPrefix}}texto' },
};

const singular = (word: string): string => {
  if (word === 'buses') return 'bus';
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (/(ch|sh|x)es$/.test(word)) return word.slice(0, -2);
  return word.endsWith('s') ? word.slice(0, -1) : word;
};
const camel = (kebab: string): string =>
  kebab.replace(/-(\w)/g, (_match, letter: string) => letter.toUpperCase());

// `{id}` in `/api/flota/buses/{id}` is the bus: `{{busId}}`, the variable the walkthrough fills in.
function pathVariable(segments: string[], name: string, write: boolean): string {
  const variable =
    name === 'id'
      ? `${camel(singular(segments[segments.indexOf(`{${name}}`) - 1] ?? 'item'))}Id`
      : name;
  return `{{${write ? testVariable(variable) : variable}}}`;
}

const rolesOf = (operation: OperationObject): string[] | null => {
  const match = /Allowed roles: ([A-Z_, ]+)\./.exec(operation.description ?? '');
  return match?.[1] ? match[1].split(',').map((role) => role.trim()) : null;
};

// The gateway asks for a session on everything under /api except the account endpoints, and the
// services document their health as open.
const isPublic = (path: string, operation: OperationObject): boolean =>
  !operation.security && !(path.startsWith('/api/') && path.endsWith('/health'));

function authFor(path: string, operation: OperationObject, write: boolean): PostmanAuth {
  if (isPublic(path, operation)) return { type: 'noauth' };
  const roles = rolesOf(operation);
  if (!roles || roles.includes('SYSTEM_ADMIN')) return bearerAuth('{{accessToken}}');
  return bearerAuth(write ? '{{testBranchAccessToken}}' : '{{branchAccessToken}}');
}

function headersOf(parameters: ParameterObject[]): PostmanHeader[] {
  return parameters
    .filter((parameter) => parameter.in === 'header')
    .map((parameter) => {
      const generated = /^(x-correlation-id|idempotency-key)$/i.test(parameter.name);
      return {
        key: parameter.name,
        value: generated ? '{{$guid}}' : `{{${parameter.name}}}`,
        ...(!parameter.required && { disabled: true }),
      };
    });
}

function queryOf(parameters: ParameterObject[]): PostmanQuery[] {
  return parameters
    .filter((parameter) => parameter.in === 'query')
    .map((parameter) => ({
      key: parameter.name,
      value: QUERY_HINTS[parameter.name] ?? '',
      ...(!parameter.required && { disabled: true }),
    }));
}

function bodyOf(
  operation: OperationObject,
  options: ExampleOptions,
): { body: PostmanBody; contentType?: string } | null {
  const content = operation.requestBody?.content;
  if (!content) return null;
  const json = content['application/json']?.schema;
  if (json) {
    return { body: jsonBody(exampleFor(json, '', options)), contentType: 'application/json' };
  }
  const form = content['multipart/form-data']?.schema;
  if (!form) return null;
  const files = Object.entries(form.properties ?? {}).filter(
    ([, property]) => property.format === 'binary',
  );
  return {
    body: {
      mode: 'formdata',
      formdata: files.map(([key]) => ({ key, type: 'file' as const, src: null })),
    },
  };
}

function describeOperation(operation: OperationObject, notes: string[]): string {
  const roles = rolesOf(operation);
  const answers = Object.keys(operation.responses ?? {});
  return [
    roles ? `Roles permitidos: ${roles.join(', ')}.` : 'Cualquier sesión.',
    answers.length > 0 ? `Respuestas: ${answers.join(', ')}.` : '',
    ...notes,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function requestFor(
  method: HttpMethod,
  path: string,
  operation: OperationObject,
): PostmanRequestItem {
  const parameters = operation.parameters ?? [];
  const write = isWrite(method, path);
  const segments = path.split('/').filter(Boolean);
  const postmanSegments = segments.map((segment) => segment.replace(/^\{(.+)\}$/, ':$1'));
  const postmanPath = `/${postmanSegments.join('/')}`;
  const query = queryOf(parameters);
  const queryString = query
    .filter((param) => !param.disabled)
    .map((param) => `${param.key}=${param.value}`)
    .join('&');
  const variables = parameters
    .filter((parameter) => parameter.in === 'path')
    .map((parameter) => ({
      key: parameter.name,
      value: pathVariable(segments, parameter.name, write),
    }));
  const body = bodyOf(operation, write ? TEST_EXAMPLES : {});
  const isPdf = path.endsWith('/pdf');
  const reason = leftOutReason(method, path);
  const prerequest = reason ? neverRun(reason) : write ? LOCAL_ONLY : null;
  const events = [
    ...(prerequest ? [script('prerequest', prerequest)] : []),
    script('test', [
      ...statusTest(acceptedStatuses(operation, !isPublic(path, operation))),
      ...(isPdf ? PDF_TEST : []),
    ]),
  ];
  const upperMethod = method.toUpperCase();
  return {
    name: `${upperMethod} ${postmanPath}`,
    request: {
      method: upperMethod,
      header: [
        ...headersOf(parameters),
        ...(body?.contentType ? [{ key: 'Content-Type', value: body.contentType }] : []),
      ],
      url: {
        raw: `{{baseUrl}}${postmanPath}${queryString ? `?${queryString}` : ''}`,
        host: ['{{baseUrl}}'],
        path: postmanSegments,
        ...(query.length > 0 && { query }),
        ...(variables.length > 0 && { variable: variables }),
      },
      auth: authFor(path, operation, write),
      ...(body && { body: body.body }),
      description: describeOperation(
        operation,
        reason
          ? [`No se ejecuta: ${reason}.`]
          : write
            ? ['Solo corre contra una pila local y usa solo los datos de prueba del recorrido.']
            : [],
      ),
    },
    event: events,
  };
}

// The gateway's own documentation endpoint is not part of the OpenAPI document it serves.
const DOCS_REQUEST: PostmanRequestItem = {
  name: 'GET /docs-json',
  request: {
    method: 'GET',
    header: [],
    url: { raw: '{{baseUrl}}/docs-json', host: ['{{baseUrl}}'], path: ['docs-json'] },
    auth: { type: 'noauth' },
    description: 'El documento OpenAPI unido de todos los servicios.',
  },
  event: [script('test', statusTest([200]))],
};

const METHOD_ORDER = new Map<string, number>(HTTP_METHODS.map((method, index) => [method, index]));

interface Found {
  tag: string;
  path: string;
  method: HttpMethod;
  item: PostmanRequestItem;
}

function operationsOf(openapi: OpenApiDocument): Found[] {
  return Object.entries(openapi.paths).flatMap(([path, operations]) =>
    HTTP_METHODS.flatMap((method) => {
      const operation = operations[method];
      if (!operation) return [];
      const [tag = 'general'] = operation.tags ?? [];
      return [
        {
          tag: tag === 'health' ? HEALTH_FOLDER : tag,
          path,
          method,
          item: requestFor(method, path, operation),
        },
      ];
    }),
  );
}

function byPathThenMethod(a: Found, b: Found): number {
  if (a.path !== b.path) return a.path < b.path ? -1 : 1;
  return (METHOD_ORDER.get(a.method) ?? 0) - (METHOD_ORDER.get(b.method) ?? 0);
}

// One folder per tag with every operation of the API, after the walkthrough and the health check.
export function toCollection(openapi: OpenApiDocument, flow: PostmanFolder): PostmanCollection {
  const grouped = new Map<string, Found[]>();
  for (const found of operationsOf(openapi)) {
    grouped.set(found.tag, [...(grouped.get(found.tag) ?? []), found]);
  }
  const folder = (name: string, extra: PostmanRequestItem[] = []): PostmanFolder => ({
    name,
    item: [
      ...(grouped.get(name) ?? []).sort(byPathThenMethod).map((found) => found.item),
      ...extra,
    ],
  });
  const tags = [...grouped.keys()].filter((tag) => tag !== HEALTH_FOLDER).sort();
  return {
    info: { name: openapi.info.title, description: COLLECTION_DESCRIPTION, schema: SCHEMA_URL },
    variable: [{ key: 'baseUrl', value: DEFAULT_BASE_URL }],
    event: [script('prerequest', COLLECTION_PREREQUEST)],
    item: [flow, folder(HEALTH_FOLDER, [DOCS_REQUEST]), ...tags.map((tag) => folder(tag))],
  };
}
