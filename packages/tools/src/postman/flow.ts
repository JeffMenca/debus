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

const report = (name: string, slug: string, query = 'pageSize=20'): Step => ({
  name,
  method: 'GET',
  path: `/api/reportes/reports/${slug}`,
  query,
  session: 'branch',
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

const ENDING: Step[] = [
  logout('Cerrar sesión (admin de sucursal)', 'branchRefreshToken'),
  logout('Cerrar sesión (admin del sistema)', 'adminRefreshToken'),
];

const items: PostmanItem[] = [
  ...SYSTEM_STEPS.map(toItem),
  ...BRANCH_STEPS.map(toItem),
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
