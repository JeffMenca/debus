import { pmTest, script, type PostmanFolder } from './collection-types';
import { LOCAL_ONLY } from './guards';
import { json, keep, status, toItem, type Step } from './steps';

// Everything that changes data, done on records made for the occasion: two test branches (the name
// prefix and the `@debus.test` addresses are what `pnpm test:clean` looks for), their administrator,
// a driver, a bus, a route, trips, a repair and a cashier. Each step keeps the id the generated
// requests of the other folders use as `test…`, so none of them reaches the demo data.

const TEST_NAME = '{{testBranchPrefix}}Postman {{runId}}';

// Services keep copies of what the others own, filled by events: right after something is made,
// the copy another service needs may be a few seconds away.
const PENDING =
  'Estamos terminando de registrar|Elige otra sucursal|Aún no tenemos|Aún no hay monto|Elige una ruta activa|No encontramos ese bus|Tu sucursal no está activa';
const MAX_ATTEMPTS = 25;
const WAIT_MS = 2000;

function tryAgainWhilePending(checks: string[]): string[] {
  return [
    `var pending = /${PENDING}/;`,
    "var attemptsKey = 'retry ' + pm.info.requestName;",
    'var attempts = Number(pm.collectionVariables.get(attemptsKey) || 0);',
    `if (pm.response.code === 409 && pending.test(pm.response.text()) && attempts < ${MAX_ATTEMPTS}) {`,
    '  pm.collectionVariables.set(attemptsKey, attempts + 1);',
    `  setTimeout(function () { postman.setNextRequest(pm.info.requestName); }, ${WAIT_MS});`,
    '} else {',
    ...checks.map((line) => `  ${line}`),
    '}',
  ];
}

// The status of the action and, when it makes something, the id the other steps need.
const made = (code: number, variable: string, extra: string[] = []): string[] => [
  ...status(code),
  ...pmTest(`Guarda ${variable}`, [
    json,
    "pm.expect(typeof json.id === 'string').to.be.true;",
    ...extra,
    keep(variable, 'json.id'),
  ]),
];

const sets = (pairs: Record<string, string>): string[] =>
  Object.entries(pairs).map(([name, value]) => `pm.collectionVariables.set('${name}', ${value});`);

const PREPARE = [
  "var letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';",
  'function word(length) {',
  "  var text = '';",
  '  for (var i = 0; i < length; i++) {',
  '    text += letters.charAt(Math.floor(Math.random() * letters.length));',
  '  }',
  '  return text;',
  '}',
  "var run = pm.variables.get('runId');",
  "var today = pm.variables.get('today');",
  ...sets({
    testBranchCode: "'P' + word(4)",
    testDestinationCode: "'P' + word(4)",
    testSpareCode: "'P' + word(4)",
    testAdminEmail: "'postman-admin-' + run + '@debus.test'",
    testDriverEmail: "'postman-driver-' + run + '@debus.test'",
    testCashierEmail: "'postman-cashier-' + run + '@debus.test'",
    testSignupEmail: "'postman-signup-' + run + '@debus.test'",
    testLicense: "'PM' + run.toUpperCase()",
    testPlate: "'C' + (100 + Math.floor(Math.random() * 900)) + word(3)",
    testLicenseExpiry: 'new Date(Date.parse(today) + 365 * 86400000).toISOString().slice(0, 10)',
    testPassword: "'Clave-' + run + '-prueba'",
  }),
];

const inMinutes = (minutes: number): string =>
  `new Date(Date.now() + ${minutes} * 60000).toISOString()`;

const branchBody = (code: string, adminEmail: string, name = TEST_NAME) => ({
  code,
  name,
  department: 'Guatemala',
  municipality: 'Guatemala',
  address: 'Calle de prueba 1-23',
  phone: '22223333',
  latitude: 14.63,
  longitude: -90.51,
  admin: { fullName: 'Admin de prueba', email: adminEmail },
});

const driverBody = (phone: string) => ({
  fullName: 'Chofer de prueba',
  email: '{{testDriverEmail}}',
  phone,
  licenseNumber: '{{testLicense}}',
  licenseType: 'C',
  licenseExpiresOn: '{{testLicenseExpiry}}',
  baseSalary: 5000,
});

const busBody = (brand: string) => ({
  plate: '{{testPlate}}',
  brand,
  model: 'Modelo de prueba',
  year: 2020,
  capacity: 40,
  mileageKm: 1000,
  operationalStatus: 'AVAILABLE',
  assignedDriverId: '{{testDriverId}}',
});

const tripBody = (departure: string, arrival: string) => ({
  routeId: '{{testRouteId}}',
  busId: '{{testBusId}}',
  driverId: '{{testDriverId}}',
  departureAt: `{{${departure}}}`,
  estimatedArrivalAt: `{{${arrival}}}`,
});

const readsId = (name: string, path: string, variable: string, session: Step['session']): Step => ({
  name,
  method: 'GET',
  path,
  variables: { id: `{{${variable}}}` },
  session,
  test: status(200),
});

const act = (
  name: string,
  method: Step['method'],
  path: string,
  variable: string,
  session: Step['session'],
  code: number,
  body?: unknown,
): Step => ({
  name,
  method,
  path,
  variables: { id: `{{${variable}}}` },
  session,
  ...(body !== undefined && { body }),
  test: status(code),
});

const STEPS: Step[] = [
  {
    name: 'Crear sucursal de prueba (origen)',
    method: 'POST',
    path: '/api/administracion/branches',
    session: 'admin',
    prerequest: PREPARE,
    body: branchBody('{{testBranchCode}}', '{{testAdminEmail}}'),
    test: made(201, 'testBranchId', [
      "pm.expect(json.name.indexOf(pm.variables.get('testBranchPrefix')) === 0).to.be.true;",
    ]),
  },
  {
    name: 'Crear sucursal de prueba (destino)',
    method: 'POST',
    path: '/api/administracion/branches',
    session: 'admin',
    body: branchBody(
      '{{testDestinationCode}}',
      'postman-admin2-{{runId}}@debus.test',
      '{{testBranchPrefix}}Postman destino {{runId}}',
    ),
    test: made(201, 'testDestinationBranchId'),
  },
  {
    name: 'Crear sucursal de prueba (otra)',
    method: 'POST',
    path: '/api/administracion/branches',
    session: 'admin',
    body: branchBody(
      '{{testSpareCode}}',
      'postman-admin3-{{runId}}@debus.test',
      '{{testBranchPrefix}}Postman otra {{runId}}',
    ),
    test: made(201, 'testSpareBranchId'),
  },
  readsId(
    'Consultar la sucursal de prueba',
    '/api/administracion/branches/:id',
    'testBranchId',
    'admin',
  ),
  act(
    'Actualizar la sucursal de destino',
    'PATCH',
    '/api/administracion/branches/:id',
    'testDestinationBranchId',
    'admin',
    200,
    { address: 'Calle de prueba 4-56' },
  ),
  {
    name: 'Leer el enlace de activación',
    method: 'GET',
    path: '/api/v1/search',
    base: 'mailpitUrl',
    query: 'query=to:{{testAdminEmail}}',
    session: 'none',
    // The invitation is an email: it reaches the mailbox of the local stack a few seconds later.
    prerequest: [
      "var mailbox = pm.variables.get('mailpitUrl');",
      "var address = pm.variables.get('testAdminEmail');",
      'var tries = 0;',
      'function again() {',
      '  if (tries < 45) { setTimeout(poll, 2000); }',
      '}',
      'function poll() {',
      '  tries++;',
      "  pm.sendRequest(mailbox + '/api/v1/search?query=' + encodeURIComponent('to:' + address), function (error, found) {",
      '    var messages = (!error && found.json().messages) || [];',
      '    if (messages.length === 0) { return again(); }',
      "    pm.sendRequest(mailbox + '/api/v1/message/' + messages[0].ID, function (failure, message) {",
      "      var html = (!failure && message.json().HTML) || '';",
      '      var link = /href="[^"]*crear-contrasena\\?token=([^"&]+)/.exec(html);',
      "      if (link) { pm.collectionVariables.set('testToken', decodeURIComponent(link[1])); } else { again(); }",
      '    });',
      '  });',
      '}',
      'poll();',
    ],
    test: [
      ...status(200),
      ...pmTest('Guarda el token del enlace', [
        "pm.expect(!!pm.collectionVariables.get('testToken')).to.be.true;",
      ]),
    ],
  },
  {
    name: 'Consultar el enlace de activación',
    method: 'POST',
    path: '/api/administracion/auth/links/status',
    session: 'none',
    body: { token: '{{testToken}}' },
    test: [
      ...status(200),
      ...pmTest('El enlace sirve', [json, "pm.expect(json.state).to.equal('valid');"]),
    ],
  },
  {
    name: 'Activar la cuenta del admin de prueba',
    method: 'POST',
    path: '/api/administracion/auth/password',
    session: 'none',
    body: { token: '{{testToken}}', password: '{{testPassword}}' },
    test: status(204),
  },
  {
    name: 'Pedir otro enlace con el que ya se usó',
    method: 'POST',
    path: '/api/administracion/auth/links/renew',
    session: 'none',
    body: { token: '{{testToken}}' },
    test: status(409),
  },
  {
    name: 'Iniciar sesión como admin de prueba',
    method: 'POST',
    path: '/api/administracion/auth/login',
    session: 'none',
    body: { email: '{{testAdminEmail}}', password: '{{testPassword}}' },
    test: [
      ...status(200),
      ...pmTest('Inicia sesión como BRANCH_ADMIN', [
        json,
        "pm.expect(json.user.role).to.equal('BRANCH_ADMIN');",
        keep('testBranchAccessToken', 'json.accessToken'),
        keep('testRefreshToken', 'json.refreshToken'),
      ]),
    ],
  },
  {
    name: 'Consultar la sesión del admin de prueba',
    method: 'GET',
    path: '/api/administracion/auth/me',
    session: 'test',
    test: [
      ...status(200),
      ...pmTest('Es la cuenta de prueba', [
        json,
        "pm.expect(json.email).to.equal(pm.collectionVariables.get('testAdminEmail'));",
      ]),
    ],
  },
  {
    name: 'Renovar la sesión del admin de prueba',
    method: 'POST',
    path: '/api/administracion/auth/refresh',
    session: 'none',
    body: { refreshToken: '{{testRefreshToken}}' },
    test: [
      ...status(200),
      ...pmTest('Guarda la sesión renovada', [
        json,
        keep('testBranchAccessToken', 'json.accessToken'),
        keep('testRefreshToken', 'json.refreshToken'),
      ]),
    ],
  },
  {
    name: 'Registrar chofer de prueba',
    method: 'POST',
    path: '/api/flota/drivers',
    session: 'test',
    body: driverBody('55551234'),
    test: tryAgainWhilePending(made(201, 'testDriverId')),
  },
  readsId('Consultar el chofer de prueba', '/api/flota/drivers/:id', 'testDriverId', 'test'),
  act(
    'Actualizar el chofer de prueba',
    'PATCH',
    '/api/flota/drivers/:id',
    'testDriverId',
    'test',
    200,
    driverBody('55554321'),
  ),
  {
    name: 'Registrar bus de prueba',
    method: 'POST',
    path: '/api/flota/buses',
    session: 'test',
    body: busBody('Prueba'),
    test: tryAgainWhilePending(made(201, 'testBusId')),
  },
  readsId('Consultar el bus de prueba', '/api/flota/buses/:id', 'testBusId', 'test'),
  act(
    'Actualizar el bus de prueba',
    'PATCH',
    '/api/flota/buses/:id',
    'testBusId',
    'test',
    200,
    busBody('Prueba 2'),
  ),
  {
    name: 'Abrir una ruta de prueba',
    method: 'POST',
    path: '/api/flota/routes',
    session: 'test',
    body: {
      destinationBranchId: '{{testDestinationBranchId}}',
      distanceKm: 120,
      ticketPrice: 55,
    },
    test: tryAgainWhilePending(made(201, 'testRouteId')),
  },
  act(
    'Actualizar la ruta de prueba',
    'PATCH',
    '/api/flota/routes/:id',
    'testRouteId',
    'test',
    200,
    {
      distanceKm: 120,
      ticketPrice: 60,
      active: true,
    },
  ),
  {
    name: 'Programar un viaje de prueba',
    method: 'POST',
    path: '/api/viajes/trips',
    session: 'test',
    prerequest: sets({ testDeparture: inMinutes(10), testArrival: inMinutes(70) }),
    body: tripBody('testDeparture', 'testArrival'),
    test: tryAgainWhilePending(made(201, 'testTripId')),
  },
  {
    name: 'Programar otro viaje para eliminarlo',
    method: 'POST',
    path: '/api/viajes/trips',
    session: 'test',
    prerequest: sets({ testSecondDeparture: inMinutes(240), testSecondArrival: inMinutes(300) }),
    body: tripBody('testSecondDeparture', 'testSecondArrival'),
    test: tryAgainWhilePending(made(201, 'testSecondTripId')),
  },
  readsId('Consultar el viaje de prueba', '/api/viajes/trips/:id', 'testTripId', 'test'),
  act(
    'Eliminar el segundo viaje',
    'DELETE',
    '/api/viajes/trips/:id',
    'testSecondTripId',
    'test',
    204,
  ),
  {
    name: 'Registrar la salida del viaje',
    method: 'POST',
    path: '/api/viajes/trips/:id/departure',
    variables: { id: '{{testTripId}}' },
    session: 'test',
    prerequest: sets({ testDepartedAt: 'new Date(Date.now() - 60000).toISOString()' }),
    body: { departedAt: '{{testDepartedAt}}', startMileageKm: 1000 },
    test: status(201),
  },
  {
    name: 'Registrar la llegada del viaje',
    method: 'POST',
    path: '/api/viajes/trips/:id/arrival',
    variables: { id: '{{testTripId}}' },
    session: 'test',
    prerequest: sets({ testArrivedAt: 'new Date(Date.now() - 1000).toISOString()' }),
    body: { arrivedAt: '{{testArrivedAt}}', endMileageKm: 1120, fuelCost: 216 },
    test: tryAgainWhilePending(status(201)),
  },
  {
    name: 'Crear categoría de prueba (con gasto)',
    method: 'POST',
    path: '/api/administracion/expense-categories',
    session: 'admin',
    body: { name: TEST_NAME },
    test: made(201, 'testCategoryId'),
  },
  {
    name: 'Crear categoría de prueba (sin gasto)',
    method: 'POST',
    path: '/api/administracion/expense-categories',
    session: 'admin',
    body: { name: '{{testBranchPrefix}}Postman sin gasto {{runId}}' },
    test: made(201, 'testExpenseCategoryId'),
  },
  act(
    'Actualizar la categoría sin gasto',
    'PATCH',
    '/api/administracion/expense-categories/:id',
    'testExpenseCategoryId',
    'admin',
    200,
    { name: '{{testBranchPrefix}}Postman editada {{runId}}' },
  ),
  act(
    'Eliminar la categoría sin gasto',
    'DELETE',
    '/api/administracion/expense-categories/:id',
    'testExpenseCategoryId',
    'admin',
    204,
  ),
  {
    name: 'Registrar un gasto de taller',
    method: 'POST',
    path: '/api/administracion/repair-expenses',
    session: 'test',
    body: {
      id: '{{$guid}}',
      busId: '{{testBusId}}',
      serviceDate: '{{today}}',
      lines: [
        {
          categoryId: '{{testCategoryId}}',
          kind: 'PART',
          description: 'Repuesto de prueba',
          amount: 150,
        },
        {
          categoryId: '{{testCategoryId}}',
          kind: 'LABOR',
          description: 'Mano de obra de prueba',
          amount: 80,
        },
      ],
    },
    test: tryAgainWhilePending(made(201, 'testRepairExpenseId')),
  },
  readsId(
    'Consultar el gasto de taller',
    '/api/administracion/repair-expenses/:id',
    'testRepairExpenseId',
    'test',
  ),
  act(
    'Desactivar el bus de prueba',
    'POST',
    '/api/flota/buses/:id/deactivate',
    'testBusId',
    'test',
    204,
  ),
  act(
    'Reactivar el bus de prueba',
    'POST',
    '/api/flota/buses/:id/reactivate',
    'testBusId',
    'test',
    204,
  ),
  act(
    'Desactivar el chofer de prueba',
    'POST',
    '/api/flota/drivers/:id/deactivate',
    'testDriverId',
    'test',
    204,
  ),
  act(
    'Reactivar el chofer de prueba',
    'POST',
    '/api/flota/drivers/:id/reactivate',
    'testDriverId',
    'test',
    204,
  ),
  {
    name: 'Abrir una ruta sin viajes',
    method: 'POST',
    path: '/api/flota/routes',
    session: 'test',
    body: { destinationBranchId: '{{testSpareBranchId}}', distanceKm: 80, ticketPrice: 40 },
    test: tryAgainWhilePending(made(201, 'testSpareRouteId')),
  },
  act(
    'Eliminar la ruta sin viajes',
    'DELETE',
    '/api/flota/routes/:id',
    'testSpareRouteId',
    'test',
    204,
  ),
  {
    name: 'Crear cajero de prueba',
    method: 'POST',
    path: '/api/administracion/users',
    session: 'admin',
    body: {
      fullName: 'Cajero de prueba',
      email: '{{testCashierEmail}}',
      role: 'CASHIER',
      branchId: '{{testBranchId}}',
    },
    test: made(201, 'testUserId'),
  },
  readsId('Consultar el cajero de prueba', '/api/administracion/users/:id', 'testUserId', 'admin'),
  act(
    'Actualizar el cajero de prueba',
    'PATCH',
    '/api/administracion/users/:id',
    'testUserId',
    'admin',
    200,
    {
      fullName: 'Cajero de prueba editado',
    },
  ),
  act(
    'Reenviar la invitación del cajero',
    'POST',
    '/api/administracion/users/:id/invitation',
    'testUserId',
    'admin',
    202,
  ),
  act(
    'Desactivar el cajero de prueba',
    'POST',
    '/api/administracion/users/:id/deactivate',
    'testUserId',
    'admin',
    204,
  ),
  act(
    'Reactivar el cajero de prueba',
    'POST',
    '/api/administracion/users/:id/reactivate',
    'testUserId',
    'admin',
    204,
  ),
  act(
    'Desactivar la sucursal de destino',
    'POST',
    '/api/administracion/branches/:id/deactivate',
    'testDestinationBranchId',
    'admin',
    204,
  ),
  act(
    'Reactivar la sucursal de destino',
    'POST',
    '/api/administracion/branches/:id/reactivate',
    'testDestinationBranchId',
    'admin',
    204,
  ),
  {
    name: 'Registrarse como cliente de prueba',
    method: 'POST',
    path: '/api/administracion/auth/signup',
    session: 'none',
    body: {
      fullName: 'Cliente de prueba',
      email: '{{testSignupEmail}}',
      dpi: '2345678901234',
      phone: '55550000',
    },
    test: status(202),
  },
  {
    name: 'Pedir restablecer la contraseña',
    method: 'POST',
    path: '/api/administracion/auth/password/forgot',
    session: 'none',
    body: { email: '{{testCashierEmail}}' },
    test: status(202),
  },
  {
    name: 'Enviar un aviso de prueba',
    method: 'POST',
    path: '/api/system/probes',
    session: 'admin',
    test: [...status(202), ...pmTest('Guarda probeId', [json, keep('probeId', 'json.probeId')])],
  },
  {
    name: 'Consultar el aviso de prueba',
    method: 'GET',
    path: '/api/system/probes/:probeId',
    variables: { probeId: '{{probeId}}' },
    session: 'admin',
    test: status(200),
  },
  {
    name: 'Cerrar la sesión del admin de prueba',
    method: 'POST',
    path: '/api/administracion/auth/logout',
    session: 'none',
    body: { refreshToken: '{{testRefreshToken}}' },
    test: status(204),
  },
];

export const WRITES_FOLDER: PostmanFolder = {
  name: 'Escrituras (solo local)',
  description: [
    'Hace todo lo que cambia datos sobre registros de prueba: dos sucursales con el prefijo `Prueba ` y el correo `@debus.test` de su admin (que se activa con el enlace que llega a Mailpit), y con ese admin un chofer, un bus, una ruta, viajes con su salida y su llegada, un gasto de taller, además de categorías y un cajero. `pnpm test:clean` lo borra todo.',
    '',
    'Corre solo si `baseUrl` es de esta máquina: contra cualquier otra dirección se salta entera. Deja los ids `test…` que usan las escrituras generadas de las demás carpetas, que por eso nunca tocan los datos de demostración.',
  ].join('\n'),
  event: [script('prerequest', LOCAL_ONLY)],
  item: STEPS.map(toItem),
};
