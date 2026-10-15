import {
  isFolder,
  type PostmanFolder,
  type PostmanItem,
  type PostmanRequestItem,
} from './collection-types';
import { FLOW } from './flow';
import { LOCAL_ONLY } from './guards';
import { sandbox } from './testing/sandbox';

const requestsOf = (items: PostmanItem[]): PostmanRequestItem[] =>
  items.flatMap((item) => (isFolder(item) ? requestsOf(item.item) : [item]));
const all = requestsOf(FLOW.item);
const named = (name: string): PostmanRequestItem => {
  const found = all.find((item) => item.name === name);
  if (!found) throw new Error(`no step ${name}`);
  return found;
};
const execOf = (item: PostmanRequestItem, listen: 'test' | 'prerequest'): string =>
  (item.event ?? []).find((event) => event.listen === listen)?.script.exec.join('\n') ?? '';
const writes = FLOW.item.find(
  (item): item is PostmanFolder => isFolder(item) && item.name === 'Escrituras (solo local)',
);

const failed = (results: { passed: boolean }[]) => results.filter((result) => !result.passed);

const MAILPIT_STEP = 'Leer el enlace de activación';

const LOGIN = {
  accessToken: 'jwt-admin',
  refreshToken: 'refresh-admin',
  user: { role: 'SYSTEM_ADMIN', branchId: null },
};
const PAGE = { items: [{ id: 'one' }], total: 1, page: 1, pageSize: 20 };

describe('FLOW', () => {
  it('is the Recorrido folder', () => {
    expect(FLOW.name).toBe('Recorrido');
    expect(FLOW.description).toContain('primero');
  });

  describe('steps', () => {
    it('signs in as the system admin, reads its screens, signs in as a branch admin and reads theirs', () => {
      expect(FLOW.item.map((item) => item.name)).toEqual([
        'Iniciar sesión como admin del sistema',
        'Estado del sistema',
        'Sucursales',
        'Usuarios',
        'Configuración vigente',
        'Categorías de gasto',
        'Iniciar sesión como admin de sucursal',
        'Buses',
        'Choferes',
        'Rutas',
        'Viajes',
        'Gastos de taller',
        'Reporte: listado de buses',
        'Reporte: choferes',
        'Reporte: depreciación por bus',
        'Reporte: gastos de taller',
        'Reporte: ingresos por boletos',
        'Reporte: ingresos por alquiler',
        'Reporte en PDF: listado de buses',
        'Escrituras (solo local)',
        'Cerrar sesión (admin de sucursal)',
        'Cerrar sesión (admin del sistema)',
      ]);
    });

    it('covers the six branch reports and one PDF', () => {
      const reports = all.filter((item) => item.request.url.raw.includes('/api/reportes/reports/'));
      expect(reports.map((item) => item.request.url.path.slice(3).join('/'))).toEqual([
        'branch-buses',
        'branch-drivers',
        'branch-depreciation',
        'branch-repair-expenses',
        'branch-ticket-income',
        'branch-rental-income',
        'branch-buses/pdf',
      ]);
    });

    it('goes through the base URL and checks the status of every step', () => {
      for (const item of all.filter((entry) => entry.name !== MAILPIT_STEP)) {
        expect(item.request.url.raw.startsWith('{{baseUrl}}/')).toBe(true);
        expect(execOf(item, 'test')).toContain('pm.test(');
      }
    });

    it('uses each session for its own screens', () => {
      const tokenOf = (item: PostmanRequestItem) =>
        item.request.auth.type === 'bearer' ? item.request.auth.bearer[0]?.value : 'none';
      for (const name of [
        'Estado del sistema',
        'Sucursales',
        'Usuarios',
        'Configuración vigente',
        'Categorías de gasto',
      ]) {
        expect(tokenOf(named(name))).toBe('{{accessToken}}');
      }
      for (const name of [
        'Buses',
        'Choferes',
        'Rutas',
        'Viajes',
        'Gastos de taller',
        'Reporte: listado de buses',
        'Reporte en PDF: listado de buses',
      ]) {
        expect(tokenOf(named(name))).toBe('{{branchAccessToken}}');
      }
      expect(tokenOf(named('Iniciar sesión como admin del sistema'))).toBe('none');
      expect(tokenOf(named('Iniciar sesión como admin de sucursal'))).toBe('none');
    });

    it('signs in with the variables of the environment, never with literal credentials', () => {
      const body = (name: string) => (named(name).request.body as { raw: string }).raw;
      expect(body('Iniciar sesión como admin del sistema')).toContain('{{adminEmail}}');
      expect(body('Iniciar sesión como admin del sistema')).toContain('{{adminPassword}}');
      expect(body('Iniciar sesión como admin de sucursal')).toContain('{{branchAdminEmail}}');
      expect(body('Iniciar sesión como admin de sucursal')).toContain('{{branchPassword}}');
    });
  });

  describe('scripts', () => {
    it('keeps the token and the refresh token of the system admin', () => {
      const { run, variables, results } = sandbox(LOGIN);
      run(execOf(named('Iniciar sesión como admin del sistema'), 'test'));
      expect(failed(results)).toEqual([]);
      expect(variables.get('accessToken')).toBe('jwt-admin');
      expect(variables.get('adminRefreshToken')).toBe('refresh-admin');
    });

    it('fails when the system admin login answers another role', () => {
      const { run, results } = sandbox({ ...LOGIN, user: { role: 'CASHIER', branchId: null } });
      run(execOf(named('Iniciar sesión como admin del sistema'), 'test'));
      expect(failed(results)).not.toHaveLength(0);
    });

    it('keeps the session and the branch of the branch admin', () => {
      const { run, variables, results } = sandbox({
        accessToken: 'jwt-branch',
        refreshToken: 'refresh-branch',
        user: { role: 'BRANCH_ADMIN', branchId: 'branch-1' },
      });
      run(execOf(named('Iniciar sesión como admin de sucursal'), 'test'));
      expect(failed(results)).toEqual([]);
      expect(variables.get('branchAccessToken')).toBe('jwt-branch');
      expect(variables.get('branchRefreshToken')).toBe('refresh-branch');
      expect(variables.get('branchId')).toBe('branch-1');
    });

    it.each([
      ['Sucursales', 'branchId'],
      ['Usuarios', 'userId'],
      ['Buses', 'busId'],
      ['Choferes', 'driverId'],
      ['Rutas', 'routeId'],
      ['Viajes', 'tripId'],
      ['Gastos de taller', 'repairExpenseId'],
      ['Categorías de gasto', 'expenseCategoryId'],
    ])('%s keeps an id for the generated requests as {{%s}}', (step, variable) => {
      const items =
        step === 'Categorías de gasto'
          ? Array.from({ length: 8 }, (_unused, index) => ({ id: `cat-${index}`, name: 'x' }))
          : [
              { id: 'first', code: 'XEL' },
              { id: 'second', code: 'GUA' },
            ];
      const { run, variables, results } = sandbox({ ...PAGE, items, total: items.length });
      run(execOf(named(step), 'test'));
      expect(failed(results)).toEqual([]);
      expect(typeof variables.get(variable)).toBe('string');
    });

    it('prefers the Quetzaltenango branch for the branch id', () => {
      const { run, variables } = sandbox({
        ...PAGE,
        items: [
          { id: 'gua-id', code: 'GUA' },
          { id: 'xel-id', code: 'XEL' },
        ],
        total: 2,
      });
      run(execOf(named('Sucursales'), 'test'));
      expect(variables.get('branchId')).toBe('xel-id');
    });

    it('fails a list that is not a page', () => {
      const { run, results } = sandbox({ message: 'Algo falló' });
      run(execOf(named('Buses'), 'test'));
      expect(failed(results)).not.toHaveLength(0);
    });

    it('fails a step that does not answer 200', () => {
      const { run, results } = sandbox(PAGE, { status: 403 });
      run(execOf(named('Buses'), 'test'));
      expect(failed(results)).not.toHaveLength(0);
    });

    it('checks the shape of the system status', () => {
      const units = Array.from({ length: 8 }, (_unused, index) => ({
        unit: `u${index}`,
        status: 'up',
      }));
      const ok = sandbox({ environment: 'local', units });
      ok.run(execOf(named('Estado del sistema'), 'test'));
      expect(failed(ok.results)).toEqual([]);
      const down = sandbox({ environment: 'local', units: units.slice(0, 3) });
      down.run(execOf(named('Estado del sistema'), 'test'));
      expect(failed(down.results)).not.toHaveLength(0);
    });

    it('needs a configuration in force', () => {
      const ok = sandbox({ ...PAGE, summary: { current: { depreciationPerKm: 1.25 } } });
      ok.run(execOf(named('Configuración vigente'), 'test'));
      expect(failed(ok.results)).toEqual([]);
      const none = sandbox({ ...PAGE, summary: { current: null } });
      none.run(execOf(named('Configuración vigente'), 'test'));
      expect(failed(none.results)).not.toHaveLength(0);
    });

    it.each([
      'Reporte: listado de buses',
      'Reporte: choferes',
      'Reporte: depreciación por bus',
      'Reporte: gastos de taller',
      'Reporte: ingresos por boletos',
      'Reporte: ingresos por alquiler',
    ])('%s checks a page of rows with a total', (step) => {
      const ok = sandbox({ items: [], total: 0, page: 1, pageSize: 20, summary: {} });
      ok.run(execOf(named(step), 'test'));
      expect(failed(ok.results)).toEqual([]);
      const wrong = sandbox({ rows: [] });
      wrong.run(execOf(named(step), 'test'));
      expect(failed(wrong.results)).not.toHaveLength(0);
    });

    it('checks that the PDF is a PDF', () => {
      const ok = sandbox(null, { contentType: 'application/pdf' });
      ok.run(execOf(named('Reporte en PDF: listado de buses'), 'test'));
      expect(failed(ok.results)).toEqual([]);
      const json = sandbox(null, { contentType: 'application/json' });
      json.run(execOf(named('Reporte en PDF: listado de buses'), 'test'));
      expect(failed(json.results)).not.toHaveLength(0);
    });

    it('expects the logouts to answer 204', () => {
      for (const name of [
        'Cerrar sesión (admin de sucursal)',
        'Cerrar sesión (admin del sistema)',
      ]) {
        const ok = sandbox(null, { status: 204 });
        ok.run(execOf(named(name), 'test'));
        expect(failed(ok.results)).toEqual([]);
        const bad = sandbox(null, { status: 400 });
        bad.run(execOf(named(name), 'test'));
        expect(failed(bad.results)).not.toHaveLength(0);
      }
    });

    it('closes each session with its own refresh token', () => {
      const raw = (name: string) => (named(name).request.body as { raw: string }).raw;
      expect(raw('Cerrar sesión (admin de sucursal)')).toContain('{{branchRefreshToken}}');
      expect(raw('Cerrar sesión (admin del sistema)')).toContain('{{adminRefreshToken}}');
    });
  });

  describe('writes folder', () => {
    const steps = requestsOf(writes?.item ?? []);
    const stepNamed = (name: string): PostmanRequestItem => {
      const found = steps.find((step) => step.name === name);
      if (!found) throw new Error(`no write step ${name}`);
      return found;
    };
    const used = (item: PostmanRequestItem): string[] =>
      [
        ...JSON.stringify({ ...item.request, auth: undefined, description: undefined }).matchAll(
          /\{\{([^}]+)\}\}/g,
        ),
      ].map((match) => match[1] ?? '');
    const setBy = (item: PostmanRequestItem): string[] =>
      [
        ...(item.event ?? [])
          .flatMap((event) => event.script.exec)
          .join('\n')
          .matchAll(/(?:collectionVariables|variables)\.set\(\s*["']([^"']+)["']/g),
      ].map((match) => match[1] ?? '');

    it('creates test branches, an administrator, a driver, a bus, a route, trips and a repair, in that order', () => {
      expect(steps.map((step) => step.name)).toEqual([
        'Crear sucursal de prueba (origen)',
        'Crear sucursal de prueba (destino)',
        'Crear sucursal de prueba (otra)',
        'Consultar la sucursal de prueba',
        'Actualizar la sucursal de destino',
        'Leer el enlace de activación',
        'Consultar el enlace de activación',
        'Activar la cuenta del admin de prueba',
        'Pedir otro enlace con el que ya se usó',
        'Iniciar sesión como admin de prueba',
        'Consultar la sesión del admin de prueba',
        'Renovar la sesión del admin de prueba',
        'Registrar chofer de prueba',
        'Consultar el chofer de prueba',
        'Actualizar el chofer de prueba',
        'Registrar bus de prueba',
        'Consultar el bus de prueba',
        'Actualizar el bus de prueba',
        'Abrir una ruta de prueba',
        'Actualizar la ruta de prueba',
        'Programar un viaje de prueba',
        'Programar otro viaje para eliminarlo',
        'Consultar el viaje de prueba',
        'Eliminar el segundo viaje',
        'Registrar la salida del viaje',
        'Registrar la llegada del viaje',
        'Crear categoría de prueba (con gasto)',
        'Crear categoría de prueba (sin gasto)',
        'Actualizar la categoría sin gasto',
        'Eliminar la categoría sin gasto',
        'Registrar un gasto de taller',
        'Consultar el gasto de taller',
        'Desactivar el bus de prueba',
        'Reactivar el bus de prueba',
        'Desactivar el chofer de prueba',
        'Reactivar el chofer de prueba',
        'Abrir una ruta sin viajes',
        'Retirar la ruta sin viajes',
        'Crear cajero de prueba',
        'Consultar el cajero de prueba',
        'Actualizar el cajero de prueba',
        'Reenviar la invitación del cajero',
        'Desactivar el cajero de prueba',
        'Reactivar el cajero de prueba',
        'Desactivar la sucursal de destino',
        'Reactivar la sucursal de destino',
        'Registrarse como cliente de prueba',
        'Pedir restablecer la contraseña',
        'Enviar un aviso de prueba',
        'Consultar el aviso de prueba',
        'Cerrar la sesión del admin de prueba',
      ]);
    });

    it('exercises the business operations of the API', () => {
      const operations = steps.map(
        (step) => `${step.request.method} ${'/' + step.request.url.path.join('/')}`,
      );
      for (const expected of [
        'POST /api/flota/drivers',
        'PATCH /api/flota/drivers/:id',
        'POST /api/flota/drivers/:id/deactivate',
        'POST /api/flota/drivers/:id/reactivate',
        'POST /api/flota/buses',
        'PATCH /api/flota/buses/:id',
        'POST /api/flota/buses/:id/deactivate',
        'POST /api/flota/buses/:id/reactivate',
        'POST /api/flota/routes',
        'PATCH /api/flota/routes/:id',
        'DELETE /api/flota/routes/:id',
        'POST /api/viajes/trips',
        'DELETE /api/viajes/trips/:id',
        'POST /api/viajes/trips/:id/departure',
        'POST /api/viajes/trips/:id/arrival',
        'POST /api/administracion/repair-expenses',
        'POST /api/administracion/expense-categories',
        'PATCH /api/administracion/expense-categories/:id',
        'DELETE /api/administracion/expense-categories/:id',
        'POST /api/administracion/users',
        'PATCH /api/administracion/users/:id',
        'POST /api/administracion/users/:id/invitation',
        'POST /api/administracion/users/:id/deactivate',
        'POST /api/administracion/users/:id/reactivate',
        'POST /api/administracion/branches',
        'PATCH /api/administracion/branches/:id',
        'POST /api/administracion/branches/:id/deactivate',
        'POST /api/administracion/branches/:id/reactivate',
        'POST /api/administracion/auth/signup',
        'POST /api/administracion/auth/password/forgot',
        'POST /api/administracion/auth/password',
        'POST /api/administracion/auth/links/renew',
        'POST /api/administracion/auth/refresh',
        'POST /api/system/probes',
      ]) {
        expect(operations).toContain(expected);
      }
    });

    it('is skipped as a whole when the base URL is not a stack on this machine', () => {
      const guard = (writes?.event ?? []).find((event) => event.listen === 'prerequest');
      expect(guard?.script.exec).toEqual(LOCAL_ONLY);
      const remote = sandbox(null, {
        variables: { baseUrl: 'https://gateway-1.us-central1.run.app' },
      });
      remote.run(LOCAL_ONLY.join('\n'));
      expect(remote.variables.get('skipped')).toBe(true);
      for (const baseUrl of ['http://localhost:4000', 'http://127.0.0.1:4000']) {
        const local = sandbox(null, { variables: { baseUrl } });
        local.run(LOCAL_ONLY.join('\n'));
        expect(local.variables.get('skipped')).toBeUndefined();
      }
    });

    it('does not treat a deployed address that merely mentions localhost as local', () => {
      const tricky = sandbox(null, { variables: { baseUrl: 'https://localhost.evil.example' } });
      tricky.run(LOCAL_ONLY.join('\n'));
      expect(tricky.variables.get('skipped')).toBe(true);
    });

    it('goes through the base URL, apart from the mailbox of the local stack', () => {
      for (const step of steps) {
        const root = step.name === MAILPIT_STEP ? '{{mailpitUrl}}/' : '{{baseUrl}}/';
        expect(step.request.url.raw.startsWith(root)).toBe(true);
      }
    });

    it('only uses a value after an earlier step made it', () => {
      const known = new Set([
        'runId',
        'today',
        'testBranchPrefix',
        'baseUrl',
        'mailpitUrl',
        'email',
      ]);
      for (const step of steps) {
        // What a step prepares before it is sent counts for the step itself.
        for (const name of setBy(step)) known.add(name);
        for (const name of used(step)) {
          if (name.startsWith('$')) continue;
          expect([step.name, name, known.has(name)]).toEqual([step.name, name, true]);
        }
      }
    });

    it('marks everything it creates as test data', () => {
      const bodies = steps
        .map((step) => (step.request.body as { raw?: string } | undefined)?.raw)
        .filter((raw): raw is string => raw !== undefined);
      const emails = bodies.flatMap((raw) =>
        [...raw.matchAll(/"email": "([^"]+)"/g)].map((match) => match[1]),
      );
      expect(emails.length).toBeGreaterThan(5);
      for (const email of emails)
        expect(email).toMatch(/@debus\.test$|^\{\{test\w+Email\}\}$|^\{\{email\}\}$/);
      const names = bodies.flatMap((raw) =>
        [...raw.matchAll(/"name": "([^"]+)"/g)].map((match) => match[1]),
      );
      expect(names.length).toBeGreaterThan(3);
      for (const name of names) expect(name).toContain('{{testBranchPrefix}}');
    });

    it('prepares addresses, plate, licence and codes of the run in the first step', () => {
      const run = sandbox(null, { variables: { runId: 'ab12cd34', today: '2026-10-19' } });
      run.run(execOf(stepNamed('Crear sucursal de prueba (origen)'), 'prerequest'));
      expect(String(run.variables.get('testBranchCode'))).toMatch(/^P[A-Z]{4}$/);
      expect(String(run.variables.get('testDestinationCode'))).toMatch(/^P[A-Z]{4}$/);
      expect(run.variables.get('testAdminEmail')).toBe('postman-admin-ab12cd34@debus.test');
      expect(run.variables.get('testDriverEmail')).toBe('postman-driver-ab12cd34@debus.test');
      expect(run.variables.get('testCashierEmail')).toBe('postman-cashier-ab12cd34@debus.test');
      expect(run.variables.get('testSignupEmail')).toBe('postman-signup-ab12cd34@debus.test');
      expect(run.variables.get('testLicense')).toBe('PMAB12CD34');
      expect(String(run.variables.get('testPlate'))).toMatch(/^C\d{3}[A-Z]{3}$/);
      expect(run.variables.get('testLicenseExpiry')).toBe('2027-10-19');
      expect(String(run.variables.get('testPassword')).length).toBeGreaterThanOrEqual(8);
    });

    it('uses its own session for what only a branch can do, and the system admin for the rest', () => {
      const tokenOf = (step: PostmanRequestItem) =>
        step.request.auth.type === 'bearer' ? step.request.auth.bearer[0]?.value : 'none';
      for (const name of [
        'Registrar chofer de prueba',
        'Registrar bus de prueba',
        'Abrir una ruta de prueba',
        'Programar un viaje de prueba',
        'Registrar la salida del viaje',
        'Registrar un gasto de taller',
      ]) {
        expect(tokenOf(stepNamed(name))).toBe('{{testBranchAccessToken}}');
      }
      for (const name of [
        'Crear sucursal de prueba (origen)',
        'Crear cajero de prueba',
        'Crear categoría de prueba (con gasto)',
        'Enviar un aviso de prueba',
      ]) {
        expect(tokenOf(stepNamed(name))).toBe('{{accessToken}}');
      }
    });

    it('expects the status of each action, and keeps the ids the generated requests use', () => {
      for (const step of steps) {
        expect(execOf(step, 'test')).toMatch(/pm\.response\.to\.have\.status\(\d+\)|pm\.expect\(/);
      }
      const cases: [string, number, Record<string, unknown>, string][] = [
        ['Crear sucursal de prueba (origen)', 201, { id: 'b1', name: 'Prueba x' }, 'testBranchId'],
        [
          'Crear sucursal de prueba (destino)',
          201,
          { id: 'b2', name: 'Prueba y' },
          'testDestinationBranchId',
        ],
        ['Registrar chofer de prueba', 201, { id: 'd1' }, 'testDriverId'],
        ['Registrar bus de prueba', 201, { id: 'u1' }, 'testBusId'],
        ['Abrir una ruta de prueba', 201, { id: 'r1' }, 'testRouteId'],
        ['Programar un viaje de prueba', 201, { id: 't1' }, 'testTripId'],
        ['Programar otro viaje para eliminarlo', 201, { id: 't2' }, 'testSecondTripId'],
        ['Crear categoría de prueba (con gasto)', 201, { id: 'c1' }, 'testCategoryId'],
        ['Crear categoría de prueba (sin gasto)', 201, { id: 'c2' }, 'testExpenseCategoryId'],
        ['Registrar un gasto de taller', 201, { id: 'e1' }, 'testRepairExpenseId'],
        ['Crear cajero de prueba', 201, { id: 'x1' }, 'testUserId'],
        ['Enviar un aviso de prueba', 202, { probeId: 'p1' }, 'probeId'],
      ];
      for (const [name, status, body, variable] of cases) {
        const ok = sandbox(body, { status, variables: { testBranchPrefix: 'Prueba ' } });
        ok.run(execOf(stepNamed(name), 'test'));
        expect([name, ok.failed()]).toEqual([name, []]);
        expect(typeof ok.variables.get(variable)).toBe('string');
        const bad = sandbox(
          { message: 'no' },
          { status: 400, variables: { testBranchPrefix: 'Prueba ' } },
        );
        bad.run(execOf(stepNamed(name), 'test'));
        expect([name, bad.failed().length > 0]).toEqual([name, true]);
      }
    });

    it('keeps the activation token it reads from the mailbox of the stack', () => {
      const step = stepNamed(MAILPIT_STEP);
      const waiting = sandbox(null, {
        variables: {
          mailpitUrl: 'http://localhost:8025',
          testAdminEmail: 'postman-admin-ab12cd34@debus.test',
        },
      });
      waiting.run(execOf(step, 'prerequest'));
      expect(waiting.sent[0]).toBe(
        `http://localhost:8025/api/v1/search?query=${encodeURIComponent('to:postman-admin-ab12cd34@debus.test')}`,
      );
      const done = sandbox({ messages: [] }, { variables: { testToken: 'abc' } });
      done.run(execOf(step, 'test'));
      expect(done.failed()).toEqual([]);
      const lost = sandbox({ messages: [] });
      lost.run(execOf(step, 'test'));
      expect(lost.failed()).not.toHaveLength(0);
    });

    describe('while a copy has not reached the service', () => {
      const PENDING = 'Estamos terminando de registrar ese bus. Intenta de nuevo en unos segundos.';
      const RETRYING = [
        'Abrir una ruta de prueba',
        'Abrir una ruta sin viajes',
        'Programar un viaje de prueba',
        'Programar otro viaje para eliminarlo',
        'Registrar la llegada del viaje',
        'Registrar un gasto de taller',
        'Registrar bus de prueba',
      ];

      it.each(RETRYING)(
        '%s tries again, without failing, and gives up after 25 attempts',
        (name) => {
          const step = stepNamed(name);
          const waiting = sandbox(
            { message: PENDING },
            { status: 409, text: JSON.stringify({ message: PENDING }), requestName: name },
          );
          waiting.run(execOf(step, 'test'));
          expect(waiting.nextRequests).toEqual([name]);
          expect(waiting.failed()).toEqual([]);
          const tired = sandbox(
            { message: PENDING },
            { status: 409, text: PENDING, requestName: name, variables: { [`retry ${name}`]: 25 } },
          );
          tired.run(execOf(step, 'test'));
          expect(tired.nextRequests).toEqual([]);
          expect(tired.failed()).not.toHaveLength(0);
        },
      );

      it('does not try again for another conflict', () => {
        const other = sandbox(
          { message: 'Ese bus ya tiene un viaje en ese horario.' },
          { status: 409, text: 'Ese bus ya tiene un viaje en ese horario.', requestName: 'x' },
        );
        other.run(execOf(stepNamed('Programar un viaje de prueba'), 'test'));
        expect(other.nextRequests).toEqual([]);
        expect(other.failed()).not.toHaveLength(0);
      });
    });

    it('asks for the departure and arrival times when it sends them', () => {
      const trip = sandbox(null, {});
      trip.run(execOf(stepNamed('Programar un viaje de prueba'), 'prerequest'));
      const departure = Date.parse(String(trip.variables.get('testDeparture')));
      expect(departure).toBeGreaterThan(Date.now());
      expect(Date.parse(String(trip.variables.get('testArrival')))).toBeGreaterThan(departure);
      const left = sandbox(null, {});
      left.run(execOf(stepNamed('Registrar la salida del viaje'), 'prerequest'));
      expect(Date.parse(String(left.variables.get('testDepartedAt')))).toBeLessThan(Date.now());
      const arrived = sandbox(null, {});
      arrived.run(execOf(stepNamed('Registrar la llegada del viaje'), 'prerequest'));
      expect(Date.parse(String(arrived.variables.get('testArrivedAt')))).toBeLessThanOrEqual(
        Date.now(),
      );
      expect(Date.parse(String(arrived.variables.get('testArrivedAt')))).toBeGreaterThan(
        Date.parse(String(left.variables.get('testDepartedAt'))),
      );
    });
  });
});
