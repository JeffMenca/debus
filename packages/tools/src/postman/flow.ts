import { PDF_TEST, pmTest, type PostmanFolder, type PostmanItem } from './collection-types';
import { PAGE_OF_ROWS, json, keep, status, toItem, type Session, type Step } from './steps';
import { WRITES_FOLDER } from './write-chain';

// A list whose first row gives the id the generated requests of the other folders use.
function listStep(spec: {
  name: string;
  path: string;
  query: string;
  session: Session;
  variable?: string;
  // How the row is chosen when it is not simply the first one.
  keepLines?: string[];
}): Step {
  return {
    name: spec.name,
    method: 'GET',
    path: spec.path,
    query: spec.query,
    session: spec.session,
    test: [
      ...status(200),
      ...PAGE_OF_ROWS,
      ...(spec.variable
        ? pmTest(`Guarda ${spec.variable}`, [
            json,
            ...(spec.keepLines ?? [
              'var first = json.items[0];',
              `pm.expect(first !== undefined).to.be.true;`,
              keep(spec.variable, 'first.id'),
            ]),
          ])
        : []),
    ],
  };
}

const report = (
  name: string,
  slug: string,
  session: 'admin' | 'branch' = 'branch',
  query = 'pageSize=20',
): Step => ({
  name,
  method: 'GET',
  path: `/api/reportes/reports/${slug}`,
  query,
  session,
  test: [...status(200), ...PAGE_OF_ROWS],
});

const ACCOUNTS = {
  admin: {
    email: '{{adminEmail}}',
    password: '{{adminPassword}}',
    role: 'SYSTEM_ADMIN',
    token: 'accessToken',
    refresh: 'adminRefreshToken',
  },
  branch: {
    email: '{{branchAdminEmail}}',
    password: '{{branchPassword}}',
    role: 'BRANCH_ADMIN',
    token: 'branchAccessToken',
    refresh: 'branchRefreshToken',
  },
  client: {
    email: '{{clientEmail}}',
    password: '{{clientPassword}}',
    role: 'CLIENT',
    token: 'clientAccessToken',
    refresh: 'clientRefreshToken',
  },
} as const;

const login = (name: string, who: keyof typeof ACCOUNTS): Step => {
  const { email, password, role, token, refresh } = ACCOUNTS[who];
  return {
    name,
    method: 'POST',
    path: '/api/administracion/auth/login',
    session: 'none',
    body: { email, password },
    test: [
      ...status(200),
      ...pmTest(`Inicia sesión como ${role}`, [
        json,
        `pm.expect(json.user.role).to.equal(${JSON.stringify(role)});`,
        keep(token, 'json.accessToken'),
        keep(refresh, 'json.refreshToken'),
        ...(who === 'branch' ? [keep('branchId', 'json.user.branchId')] : []),
      ]),
    ],
  };
};

const logout = (name: string, refreshVariable: string): Step => ({
  name,
  method: 'POST',
  path: '/api/administracion/auth/logout',
  session: 'none',
  body: { refreshToken: `{{${refreshVariable}}}` },
  test: status(204),
});

const SYSTEM_STEPS: Step[] = [
  login('Iniciar sesión como admin del sistema', 'admin'),
  {
    name: 'Estado del sistema',
    method: 'GET',
    path: '/api/system/status',
    session: 'admin',
    test: [
      ...status(200),
      ...pmTest('Responde el gateway y los 7 servicios', [
        json,
        'pm.expect(json.units.length).to.equal(8);',
      ]),
    ],
  },
  listStep({
    name: 'Sucursales',
    path: '/api/administracion/branches',
    query: 'status=all&pageSize=100',
    session: 'admin',
    variable: 'branchId',
    keepLines: [
      "var branch = json.items.find(function (item) { return item.code === 'XEL'; }) || json.items[0];",
      'pm.expect(branch !== undefined).to.be.true;',
      keep('branchId', 'branch.id'),
    ],
  }),
  listStep({
    name: 'Usuarios',
    path: '/api/administracion/users',
    query: 'pageSize=5',
    session: 'admin',
    variable: 'userId',
  }),
  {
    name: 'Configuración vigente',
    method: 'GET',
    path: '/api/administracion/settings',
    query: 'pageSize=1',
    session: 'admin',
    test: [
      ...status(200),
      ...pmTest('Hay una configuración vigente', [
        json,
        'pm.expect(json.summary.current !== null && json.summary.current.depreciationPerKm > 0).to.be.true;',
      ]),
    ],
  },
  {
    name: 'Categorías de gasto',
    method: 'GET',
    path: '/api/administracion/expense-categories',
    query: 'pageSize=100',
    session: 'admin',
    test: [
      ...status(200),
      ...PAGE_OF_ROWS,
      ...pmTest('Trae las 8 categorías del enunciado', [
        json,
        'pm.expect(json.items.length >= 8).to.be.true;',
        keep('expenseCategoryId', 'json.items[0].id'),
      ]),
    ],
  },
  report('Reporte del sistema: ingresos por sucursal', 'system-income', 'admin'),
  report('Reporte del sistema: gastos por sucursal', 'system-expenses', 'admin'),
  report('Reporte del sistema: ganancias', 'system-profit', 'admin'),
  report('Reporte del sistema: rutas más demandadas', 'system-top-routes', 'admin'),
  report('Reporte del sistema: gastos de taller por categoría', 'system-repair-expenses', 'admin'),
  {
    name: 'Reporte del sistema: mapa de rutas',
    method: 'GET',
    path: '/api/reportes/reports/system-routes-map',
    session: 'admin',
    test: [
      ...status(200),
      ...pmTest('Trae las sucursales y las rutas del mapa', [
        json,
        'pm.expect(Array.isArray(json.branches)).to.be.true;',
        'pm.expect(Array.isArray(json.routes)).to.be.true;',
      ]),
    ],
  },
  {
    name: 'Reporte del sistema en PDF: ingresos por sucursal',
    method: 'GET',
    path: '/api/reportes/reports/system-income/pdf',
    session: 'admin',
    test: [...status(200), ...PDF_TEST],
  },
];

const BRANCH_STEPS: Step[] = [
  login('Iniciar sesión como admin de sucursal', 'branch'),
  listStep({
    name: 'Buses',
    path: '/api/flota/buses',
    query: 'status=all&pageSize=100',
    session: 'branch',
    variable: 'busId',
  }),
  listStep({
    name: 'Choferes',
    path: '/api/flota/drivers',
    query: 'status=all&pageSize=100',
    session: 'branch',
    variable: 'driverId',
  }),
  listStep({
    name: 'Rutas',
    path: '/api/flota/routes',
    query: 'status=all&pageSize=100',
    session: 'branch',
    variable: 'routeId',
  }),
  listStep({
    name: 'Viajes',
    path: '/api/viajes/trips',
    query: 'pageSize=100',
    session: 'branch',
    variable: 'tripId',
  }),
  listStep({
    name: 'Gastos de taller',
    path: '/api/administracion/repair-expenses',
    query: 'pageSize=20',
    session: 'branch',
    variable: 'repairExpenseId',
  }),
  report('Reporte: listado de buses', 'branch-buses'),
  report('Reporte: choferes', 'branch-drivers'),
  report('Reporte: depreciación por bus', 'branch-depreciation'),
  report('Reporte: gastos de taller', 'branch-repair-expenses'),
  report('Reporte: ingresos por boletos', 'branch-ticket-income'),
  report('Reporte: ingresos por alquiler', 'branch-rental-income'),
  {
    name: 'Reporte en PDF: listado de buses',
    method: 'GET',
    path: '/api/reportes/reports/branch-buses/pdf',
    session: 'branch',
    test: [...status(200), ...PDF_TEST],
  },
];

// What a client of the demo sees: the wallet, the tickets and the rentals the seed loads for them.
// Everything here only reads: the writes of the clients use the test records of the writes folder.
const clientRead = (
  name: string,
  path: string,
  query: string | undefined,
  test: string[],
): Step => ({
  name,
  method: 'GET',
  path,
  ...(query && { query }),
  session: 'client',
  test: [...status(200), ...test],
});

const CLIENT_STEPS: Step[] = [
  login('Iniciar sesión como cliente', 'client'),
  clientRead('Perfil del cliente', '/api/clientes/profile', undefined, [
    ...pmTest('Trae el perfil del cliente', [
      json,
      "pm.expect(typeof json.userId === 'string' && json.email.length > 0).to.be.true;",
    ]),
  ]),
  clientRead('Cartera del cliente', '/api/clientes/wallet', undefined, [
    ...pmTest('Trae el saldo de la cartera', [
      json,
      "pm.expect(typeof json.balance === 'number' && json.balance >= 0).to.be.true;",
    ]),
  ]),
  clientRead(
    'Movimientos de la cartera',
    '/api/clientes/wallet/movements',
    'pageSize=20',
    PAGE_OF_ROWS,
  ),
  clientRead('Boletos del cliente', '/api/ventas/tickets', 'pageSize=20', PAGE_OF_ROWS),
  clientRead(
    'Alquileres del cliente',
    '/api/clientes/rentals/mine',
    'status=all&pageSize=20',
    PAGE_OF_ROWS,
  ),
  clientRead('Precio estimado de un alquiler', '/api/clientes/rentals/estimate', 'distanceKm=100', [
    ...pmTest('Calcula el precio con la tarifa vigente', [
      json,
      "pm.expect(typeof json.estimatedPrice === 'number' && json.estimatedPrice > 0).to.be.true;",
    ]),
  ]),
];

const ENDING: Step[] = [
  logout('Cerrar sesión (cliente)', 'clientRefreshToken'),
  logout('Cerrar sesión (admin de sucursal)', 'branchRefreshToken'),
  logout('Cerrar sesión (admin del sistema)', 'adminRefreshToken'),
];

const items: PostmanItem[] = [
  ...SYSTEM_STEPS.map(toItem),
  ...BRANCH_STEPS.map(toItem),
  ...CLIENT_STEPS.map(toItem),
  WRITES_FOLDER,
  ...ENDING.map(toItem),
];

// The walkthrough: what a person does in the product, step by step. It runs first, because the
// generated folders use the tokens and the ids it keeps.
export const FLOW: PostmanFolder = {
  name: 'Recorrido',
  description:
    'Ejecútalo primero: inicia sesión como admin del sistema y como admin de sucursal, recorre las pantallas y los reportes de una sucursal con datos y guarda los tokens y los ids que usan las demás carpetas. "Escrituras (solo local)" crea y deshace datos de prueba para ejercitar las operaciones que cambian datos.',
  item: items,
};
