import { EXPENSE_CATEGORIES } from '../catalog';
import { GatewayError, type Gateway, type Session } from '../gateway-client';
import type { Mailbox } from '../mailbox';
import { guatemalaDayRange, type ExpenseCategory } from '@debus/contracts';
import type { z } from 'zod';
import { FakeClients } from './fake-clients';
import { FakeRentals } from './fake-rentals';
import { FakeSales } from './fake-sales';
import {
  NO_ROUTE,
  conflict,
  notFound,
  page,
  uuid,
  type Body,
  type FakeExtension,
  type Row,
} from './fake-support';

// An in-memory stand-in for the parts of the API the seed uses, strict enough that a stage which
// is not idempotent, or breaks a rule the real services enforce, fails against it.

export interface RecordedRequest {
  email: string | null;
  method: string;
  path: string;
  body: unknown;
  headers: Record<string, string>;
}

const overlaps = (a: Row, b: Row) =>
  Date.parse(a.departureAt as string) < Date.parse(b.estimatedArrivalAt as string) &&
  Date.parse(b.departureAt as string) < Date.parse(a.estimatedArrivalAt as string);

export class FakeGateway implements Gateway {
  readonly requests: RecordedRequest[] = [];
  readonly branches: Row[] = [];
  readonly users: Row[] = [];
  readonly drivers: Row[] = [];
  readonly buses: Row[] = [];
  readonly routes: Row[] = [];
  readonly trips: Row[] = [];
  readonly expenses: Row[] = [];
  readonly settings: Row[] = [];
  // The parts of the API that live in their own files.
  readonly clients = new FakeClients(this);
  readonly sales = new FakeSales(this);
  readonly rentals = new FakeRentals(this);
  private readonly extensions: FakeExtension[] = [this.clients, this.sales, this.rentals];
  // The most rows a page may carry, whatever the request asks for.
  maxPageSize = 100;
  readonly passwords = new Map<string, string>([['admin@debus.local', 'clave-admin-1']]);
  readonly forgot: string[] = [];
  private next = 1;
  private readonly failures: { pattern: RegExp; error: GatewayError; times: number }[] = [];
  readonly categories: ExpenseCategory[] = EXPENSE_CATEGORIES.map((name, index) => ({
    id: uuid(9_000 + index),
    name,
    active: true,
    inUse: false,
  }));

  // What the fake takes as "now"; a test can move it to another day.
  constructor(public now: () => Date) {}

  readonly systemAdmin: Session = {
    accessToken: 'system',
    user: {
      id: uuid(1),
      fullName: 'Admin del sistema',
      email: 'admin@debus.local',
      role: 'SYSTEM_ADMIN',
      branchId: null,
    },
  };

  // The next `times` requests whose "METHOD path" matches fail with the given error.
  failNext(pattern: RegExp, error: GatewayError, times = 1): void {
    this.failures.push({ pattern, error, times });
  }

  count(method: string, pattern: RegExp): number {
    return this.requests.filter(
      (request) => request.method === method && pattern.test(request.path),
    ).length;
  }

  async login(email: string, password: string): Promise<Session> {
    const user = [this.systemAdmin.user, ...this.users].find(
      (candidate) => candidate.email === email,
    );
    const expected = this.passwords.get(email);
    if (!user || expected !== password) {
      throw new GatewayError(401, 'Correo o contraseña incorrectos.');
    }
    return { accessToken: `token-${email}`, user: user as unknown as Session['user'] };
  }

  async upload(): Promise<void> {
    throw new Error('not used by the seed');
  }

  async request<T>(
    session: Session | null,
    method: string,
    path: string,
    body?: unknown,
    schema?: z.ZodType<T>,
    headers: Record<string, string> = {},
  ): Promise<T> {
    this.requests.push({ email: session?.user.email ?? null, method, path, body, headers });
    const failure = this.failures.find(
      (candidate) => candidate.times > 0 && candidate.pattern.test(`${method} ${path}`),
    );
    if (failure) {
      failure.times -= 1;
      throw failure.error;
    }
    const url = new URL(path, 'http://fake');
    const result = this.route(session, method, url, (body ?? {}) as Body, headers);
    // Through JSON, like the wire, so the schema sees what a real answer would be.
    const wire = result === undefined ? undefined : (JSON.parse(JSON.stringify(result)) as unknown);
    return (schema ? schema.parse(wire) : wire) as T;
  }

  private branchOf(session: Session | null): string {
    const branchId = session?.user.branchId;
    if (!branchId) throw new GatewayError(403, 'Tu rol no permite esta acción.');
    return branchId;
  }

  nextId(): string {
    return uuid(this.next++);
  }

  private route(
    session: Session | null,
    method: string,
    url: URL,
    body: Body,
    headers: Record<string, string>,
  ): unknown {
    for (const extension of this.extensions) {
      const answer = extension.route({ session, method, url, body, headers });
      if (answer !== NO_ROUTE) return answer;
    }
    const key = `${method} ${url.pathname}`;
    const q = url.searchParams;
    const id = url.pathname.split('/')[4];
    const handlers: [RegExp, () => unknown][] = [
      [/^POST \/api\/administracion\/auth\/password\/forgot$/, () => this.forgotPassword(body)],
      [/^POST \/api\/administracion\/auth\/password$/, () => this.setPassword(body)],
      [/^GET \/api\/administracion\/settings$/, () => this.listSettings()],
      [/^POST \/api\/administracion\/settings$/, () => this.addSettings(session, body)],
      [/^GET \/api\/administracion\/branches$/, () => this.listBranches(q)],
      [/^POST \/api\/administracion\/branches$/, () => this.addBranch(body)],
      [/^GET \/api\/administracion\/users$/, () => this.listUsers(q)],
      [/^POST \/api\/administracion\/users$/, () => this.addUser(body)],
      [/^GET \/api\/administracion\/expense-categories$/, () => this.listCategories(q)],
      [/^POST \/api\/administracion\/expense-categories$/, () => this.addCategory(body)],
      [
        /^PATCH \/api\/administracion\/expense-categories\/[^/]+$/,
        () => this.updateCategory(id, body),
      ],
      [/^GET \/api\/administracion\/repair-expenses$/, () => this.listExpenses(session, q)],
      [/^POST \/api\/administracion\/repair-expenses$/, () => this.addExpense(session, body)],
      [/^GET \/api\/flota\/drivers$/, () => this.listDrivers(session, q)],
      [/^POST \/api\/flota\/drivers$/, () => this.addDriver(session, body)],
      [/^GET \/api\/flota\/buses$/, () => this.listBuses(session, q)],
      [/^POST \/api\/flota\/buses$/, () => this.addBus(session, body)],
      [/^GET \/api\/flota\/routes$/, () => this.listRoutes(session)],
      [/^POST \/api\/flota\/routes$/, () => this.addRoute(session, body)],
      [/^GET \/api\/viajes\/trips$/, () => this.listTrips(session, q)],
      [/^POST \/api\/viajes\/trips$/, () => this.scheduleTrip(session, body)],
      [/^GET \/api\/viajes\/trips\/[^/]+$/, () => this.tripDetail(id)],
      [/^DELETE \/api\/viajes\/trips\/[^/]+$/, () => this.deleteTrip(id)],
      [/^POST \/api\/viajes\/trips\/[^/]+\/departure$/, () => this.depart(id, body)],
      [/^POST \/api\/viajes\/trips\/[^/]+\/arrival$/, () => this.arrive(id, body)],
    ];
    const handler = handlers.find(([pattern]) => pattern.test(key));
    if (!handler) throw new GatewayError(404, `The fake gateway has no ${key}`);
    return handler[1]();
  }

  private forgotPassword(body: Body): void {
    this.forgot.push(String(body.email));
  }

  private setPassword(body: Body): void {
    const email = String(body.token);
    this.passwords.set(email, String(body.password));
    const user = this.users.find((candidate) => candidate.email === email);
    if (user) user.status = 'ACTIVE';
  }

  private listSettings() {
    const today = this.now().toISOString().slice(0, 10);
    const current = this.settings
      .filter((version) => (version.effectiveFrom as string) <= today)
      .at(-1);
    return page(this.settings, { current: current ?? null, upcoming: null });
  }

  private addSettings(session: Session | null, body: Body) {
    const version = {
      ...body,
      id: uuid(this.next++),
      createdAt: this.now().toISOString(),
      createdByName: session?.user.fullName ?? null,
    };
    this.settings.push(version);
    return version;
  }

  private listBranches(q: URLSearchParams) {
    const term = (q.get('q') ?? '').toLowerCase();
    const items = this.branches
      .filter((branch) =>
        `${branch.name} ${branch.code} ${branch.municipality}`.toLowerCase().includes(term),
      )
      .map((branch) => ({
        ...branch,
        admins: this.users.filter(
          (user) => user.role === 'BRANCH_ADMIN' && user.branchId === branch.id,
        ),
      }));
    return page(items, { statusCounts: { active: items.length, inactive: 0 } });
  }

  private addBranch(body: Body) {
    const { admin, ...fields } = body as Body & { admin: { fullName: string; email: string } };
    if (this.branches.some((branch) => branch.code === fields.code)) {
      throw conflict('Ya existe una sucursal con ese código.');
    }
    const branch = { ...fields, id: uuid(this.next++), active: true, version: 1 };
    this.branches.push(branch);
    this.users.push({
      id: uuid(this.next++),
      fullName: admin.fullName,
      email: admin.email,
      role: 'BRANCH_ADMIN',
      branchId: branch.id,
      status: 'PENDING',
    });
    return branch;
  }

  private listUsers(q: URLSearchParams) {
    const term = (q.get('q') ?? '').toLowerCase();
    const items = this.users
      .filter((user) => `${user.fullName} ${user.email}`.toLowerCase().includes(term))
      .map((user) => ({ ...user, branchName: null }));
    return page(items, { statusCounts: { PENDING: 0, ACTIVE: 0, INACTIVE: 0 } });
  }

  private addUser(body: Body) {
    if (this.users.some((user) => user.email === body.email)) {
      throw conflict('Ya existe una cuenta con ese correo.');
    }
    const user = { ...body, id: uuid(this.next++), status: 'PENDING' };
    this.users.push(user);
    return user;
  }

  private listDrivers(session: Session | null, q: URLSearchParams) {
    const branchId = this.branchOf(session);
    const term = (q.get('q') ?? '').toLowerCase();
    const items = this.drivers
      .filter((driver) => driver.branchId === branchId)
      .filter((driver) =>
        `${driver.fullName} ${driver.licenseNumber} ${driver.email}`.toLowerCase().includes(term),
      );
    return page(items, { statusCounts: { active: items.length, inactive: 0 } });
  }

  private addDriver(session: Session | null, body: Body) {
    const branchId = this.branchOf(session);
    if (this.drivers.some((driver) => driver.licenseNumber === body.licenseNumber)) {
      throw conflict('Ya existe un chofer con ese número de licencia.');
    }
    const driver = {
      ...body,
      id: uuid(this.next++),
      branchId,
      active: true,
      assignedBusPlate: null,
      completedTrips: 0,
      hasPhoto: false,
      version: 1,
    };
    this.drivers.push(driver);
    this.users.push({
      id: uuid(this.next++),
      fullName: body.fullName,
      email: body.email,
      role: 'DRIVER',
      branchId,
      status: 'PENDING',
    });
    return driver;
  }

  private listBuses(session: Session | null, q: URLSearchParams) {
    const branchId = this.branchOf(session);
    const term = (q.get('q') ?? '').toLowerCase();
    const items = this.buses
      .filter((bus) => bus.branchId === branchId)
      .filter((bus) => String(bus.plate).toLowerCase().includes(term));
    return page(items, {
      statusCounts: { IN_TRANSIT: 0, AVAILABLE: items.length, IN_WORKSHOP: 0, INACTIVE: 0 },
    });
  }

  private addBus(session: Session | null, body: Body) {
    const branchId = this.branchOf(session);
    if (this.buses.some((bus) => bus.plate === body.plate)) {
      throw conflict('Ya existe un bus con esa placa.');
    }
    const driver = this.drivers.find((candidate) => candidate.id === body.assignedDriverId);
    const bus = {
      ...body,
      id: uuid(this.next++),
      branchId,
      active: true,
      displayStatus: 'AVAILABLE',
      assignedDriverName: (driver?.fullName as string | undefined) ?? null,
      completedTrips: 0,
      hasPhoto: false,
      version: 1,
    };
    this.buses.push(bus);
    return bus;
  }

  private listRoutes(session: Session | null) {
    const branchId = this.branchOf(session);
    const items = this.routes.filter((route) => route.originBranchId === branchId);
    return page(items, { statusCounts: { active: items.length, inactive: 0 } });
  }

  private addRoute(session: Session | null, body: Body) {
    const originBranchId = this.branchOf(session);
    const origin = this.branches.find((branch) => branch.id === originBranchId);
    const destination = this.branches.find((branch) => branch.id === body.destinationBranchId);
    if (!destination) throw conflict('Elige otra sucursal activa como destino.');
    if (
      this.routes.some(
        (route) =>
          route.originBranchId === originBranchId && route.destinationBranchId === destination.id,
      )
    ) {
      throw conflict('Ya existe una ruta hacia esa sucursal. Edítala en lugar de crear otra.');
    }
    const route = {
      id: uuid(this.next++),
      originBranchId,
      originName: origin?.name,
      destinationBranchId: destination.id,
      destinationName: destination.name,
      distanceKm: body.distanceKm,
      ticketPrice: body.ticketPrice,
      active: true,
      hasTrips: false,
      version: 1,
    };
    this.routes.push(route);
    return route;
  }

  private listTrips(session: Session | null, q: URLSearchParams) {
    const branchId = this.branchOf(session);
    const range = guatemalaDayRange(q.get('from') ?? undefined, q.get('to') ?? undefined);
    const items = this.trips
      .filter((trip) => trip.branchId === branchId)
      .filter(
        (trip) => !q.get('status') || q.get('status') === 'all' || trip.status === q.get('status'),
      )
      .filter((trip) => {
        const at = Date.parse(trip.departureAt as string);
        return (!range.gte || at >= range.gte.getTime()) && (!range.lt || at < range.lt.getTime());
      })
      .map((trip) => ({ ...trip, departure: undefined, arrival: undefined }));
    const pageSize = Math.min(Number(q.get('pageSize') ?? 100), this.maxPageSize);
    const page = Number(q.get('page') ?? 1);
    return {
      items: items.slice((page - 1) * pageSize, page * pageSize),
      total: items.length,
      page,
      pageSize,
    };
  }

  private deleteTrip(id: string | undefined): void {
    const trip = this.trip(id);
    if (trip.status !== 'SCHEDULED') {
      throw conflict('Este viaje ya salió. Solo se eliminan viajes que no han salido.');
    }
    this.trips.splice(this.trips.indexOf(trip), 1);
  }

  private scheduleTrip(session: Session | null, body: Body) {
    const branchId = this.branchOf(session);
    const route = this.routes.find((candidate) => candidate.id === body.routeId);
    const bus = this.buses.find((candidate) => candidate.id === body.busId);
    const driver = this.drivers.find((candidate) => candidate.id === body.driverId);
    if (!route || route.originBranchId !== branchId) {
      throw conflict('Elige una ruta activa que salga de tu sucursal.');
    }
    if (!bus)
      throw conflict('Estamos terminando de registrar ese bus. Intenta de nuevo en unos segundos.');
    if (!driver)
      throw conflict(
        'Estamos terminando de registrar ese chofer. Intenta de nuevo en unos segundos.',
      );
    if (Date.parse(body.departureAt as string) <= this.now().getTime()) {
      throw conflict('La salida debe ser en el futuro.');
    }
    if (Date.parse(driver.licenseExpiresOn as string) < Date.parse(body.departureAt as string)) {
      throw conflict('La licencia de ese chofer estará vencida el día del viaje.');
    }
    const trip: Row = {
      id: uuid(this.next++),
      type: 'REGULAR',
      status: 'SCHEDULED',
      branchId,
      routeId: route.id,
      originName: route.originName,
      destinationName: route.destinationName,
      busId: bus.id,
      busPlate: bus.plate,
      driverId: driver.id,
      driverName: driver.fullName,
      departureAt: body.departureAt,
      estimatedArrivalAt: body.estimatedArrivalAt,
      ticketPrice: route.ticketPrice,
      capacity: bus.capacity,
      departedAt: null,
    };
    if (this.trips.some((other) => other.busId === bus.id && overlaps(other, trip))) {
      throw conflict('Ese bus ya tiene un viaje en ese horario.');
    }
    if (this.trips.some((other) => other.driverId === driver.id && overlaps(other, trip))) {
      throw conflict('Ese chofer ya tiene un viaje en ese horario.');
    }
    this.trips.push(trip);
    return trip;
  }

  private trip(id: string | undefined): Row {
    const trip = this.trips.find((candidate) => candidate.id === id);
    if (!trip) throw new GatewayError(404, 'No encontramos ese viaje.');
    return trip;
  }

  private tripDetail(id: string | undefined) {
    const trip = this.trip(id);
    const route = this.routes.find((candidate) => candidate.id === trip.routeId);
    const bus = this.buses.find((candidate) => candidate.id === trip.busId);
    return {
      ...trip,
      distanceKm: route?.distanceKm ?? null,
      busActive: true,
      driverActive: true,
      suggestedStartMileageKm: bus?.mileageKm ?? 0,
      depreciationPerKmToday: 1.25,
      expectedDriverPay: 0,
      canDelete: trip.status === 'SCHEDULED',
      departure: trip.departure ?? null,
      arrival: trip.arrival ?? null,
    };
  }

  private depart(id: string | undefined, body: Body) {
    const trip = this.trip(id);
    if (trip.status !== 'SCHEDULED') throw conflict('La salida de este viaje ya fue registrada.');
    const departedAt = Date.parse(body.departedAt as string);
    if (departedAt > this.now().getTime())
      throw conflict('La hora real de salida no puede ser en el futuro.');
    if (Date.parse(trip.departureAt as string) - departedAt > 12 * 3_600_000) {
      throw conflict(
        'Ese viaje está programado para más tarde. No puedes registrar su salida con más de 12 horas de anticipación.',
      );
    }
    const bus = this.buses.find((candidate) => candidate.id === trip.busId);
    if (bus && (body.startMileageKm as number) < (bus.mileageKm as number)) {
      throw conflict('El kilometraje inicial no puede ser menor que el último registrado del bus.');
    }
    trip.status = 'IN_TRANSIT';
    trip.departure = { ...body, recordedByRole: 'BRANCH_ADMIN' };
    trip.departedAt = body.departedAt;
    return this.tripDetail(id);
  }

  private arrive(id: string | undefined, body: Body) {
    const trip = this.trip(id);
    if (trip.status !== 'IN_TRANSIT') throw conflict('Primero registra la salida de este viaje.');
    const departure = trip.departure as Body;
    if (Date.parse(body.arrivedAt as string) <= Date.parse(departure.departedAt as string)) {
      throw conflict('La llegada debe ser después de la salida.');
    }
    if (Date.parse(body.arrivedAt as string) > this.now().getTime()) {
      throw conflict('La hora real de llegada no puede ser en el futuro.');
    }
    const distanceKm = (body.endMileageKm as number) - (departure.startMileageKm as number);
    trip.status = 'COMPLETED';
    trip.arrival = {
      ...body,
      distanceKm,
      depreciationPerKm: 1.25,
      depreciationAmount: distanceKm * 1.25,
      driverPay: 100,
      recordedByRole: 'BRANCH_ADMIN',
    };
    const bus = this.buses.find((candidate) => candidate.id === trip.busId);
    if (bus) bus.mileageKm = body.endMileageKm;
    return this.tripDetail(id);
  }

  private listCategories(q: URLSearchParams) {
    const status = q.get('status') ?? 'active';
    const shown = this.categories.filter(
      (category) => status === 'all' || category.active === (status === 'active'),
    );
    return page(shown, undefined);
  }

  private addCategory(body: Body) {
    const category = { id: uuid(this.next++), name: String(body.name), active: true, inUse: false };
    this.categories.push(category);
    return category;
  }

  private updateCategory(id: string | undefined, body: Body) {
    const category = this.categories.find((row) => row.id === id);
    if (!category) throw notFound('No encontramos esa categoría.');
    if (typeof body.active === 'boolean') category.active = body.active;
    return category;
  }

  private listExpenses(session: Session | null, q: URLSearchParams) {
    const branchId = this.branchOf(session);
    const busId = q.get('busId');
    const items = this.expenses.filter(
      (expense) => expense.branchId === branchId && (!busId || expense.busId === busId),
    );
    return page(items, { total: items.length });
  }

  private addExpense(session: Session | null, body: Body) {
    const branchId = this.branchOf(session);
    const bus = this.buses.find((candidate) => candidate.id === body.busId);
    if (!bus || bus.branchId !== branchId) throw conflict('No encontramos ese bus en tu sucursal.');
    const saved = this.expenses.find((expense) => expense.id === body.id);
    if (saved) return saved;
    const lines: Body[] = (body.lines as Body[]).map((line) => ({
      ...line,
      categoryName:
        this.categories.find((category) => category.id === line.categoryId)?.name ?? '?',
    }));
    const sum = (kind?: string) =>
      lines
        .filter((line) => !kind || line.kind === kind)
        .reduce((total, line) => total + (line.amount as number), 0);
    const expense = {
      id: body.id as string,
      branchId,
      busId: bus.id,
      busPlate: bus.plate,
      serviceDate: body.serviceDate,
      total: sum(),
      laborTotal: sum('LABOR'),
      partsTotal: sum('PART'),
      lines,
    };
    this.expenses.push(expense);
    return expense;
  }
}

// Reads the "email" the fake gateway pretends to have sent: the link carries the address as its token.
export class FakeMailbox implements Mailbox {
  constructor(private readonly gateway: FakeGateway) {}

  async latestLink(to: string): Promise<string> {
    if (!this.gateway.forgot.includes(to)) throw new Error(`No email reached ${to}`);
    return `/restablecer?token=${encodeURIComponent(to)}`;
  }

  async links(): Promise<string[]> {
    return [];
  }
}
