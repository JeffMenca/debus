import { randomUUID } from 'node:crypto';
import { TEST_BRANCH_PREFIX, TEST_RUN, testEmail } from '@debus/config/test-data';
import {
  type APIRequestContext,
  expect,
  request as playwrightRequest,
  test,
} from '@playwright/test';
import { cleanUpTestRun } from './support/clean-up';
import { guatemalaAgo } from './support/guatemala-time';
import { isLocalStack } from './support/local-stack';
import { queryLocal } from './support/local-sql';
import { isReachable, latestLink, mailpitUrl } from './support/mailpit';
import { signInAsRealAdmin } from './support/real-admin';
import {
  ACTION_TIMEOUT,
  createBranch,
  createRoute,
  randomLetters,
  registerBus,
  registerDriver,
  scheduleTrip,
  signInAsBranchAdmin,
} from './support/real-fleet';

const GATEWAY = process.env.E2E_GATEWAY_URL ?? 'http://localhost:4000';
const PASSWORD = 'clave-segura-1';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Waits for what an event brings to another service: the copies live in the database of ventas.
async function untilInVentas(sql: string, what: string): Promise<string> {
  const deadline = Date.now() + ACTION_TIMEOUT;
  while (Date.now() < deadline) {
    const [found] = queryLocal('ventas', sql);
    if (found) return found;
    await sleep(500);
  }
  throw new Error(`${what} never reached ventas`);
}

async function signUpClient(
  api: APIRequestContext,
  inbox: string,
  email: string,
  fullName: string,
) {
  const signup = await api.post('/api/administracion/auth/signup', {
    data: { fullName, email, dpi: '2345678901234', phone: '55550000' },
  });
  expect(signup.status()).toBe(202);
  const link = await latestLink(inbox, email, '/crear-contrasena');
  const token = new URL(link, 'http://localhost').searchParams.get('token');
  const created = await api.post('/api/administracion/auth/password', {
    data: { token, password: PASSWORD },
  });
  expect(created.ok()).toBe(true);
  const login = await api.post('/api/administracion/auth/login', {
    data: { email, password: PASSWORD },
  });
  expect(login.status()).toBe(200);
  const { accessToken, user } = (await login.json()) as {
    accessToken: string;
    user: { id: string };
  };
  return { accessToken, clientId: user.id };
}

test.describe('real purchase with the wallet', () => {
  test.skip(
    !process.env.E2E_REAL_API || !process.env.E2E_ADMIN_EMAIL,
    'runs only against a running stack with an admin',
  );
  test.skip(
    ({ baseURL }) => !isLocalStack(baseURL),
    'creates accounts, branches and purchases: runs only on the local stack',
  );
  test.setTimeout(420_000);
  test.use({ actionTimeout: ACTION_TIMEOUT, navigationTimeout: ACTION_TIMEOUT });
  test.afterAll(() => cleanUpTestRun());

  test('a client pays a ticket through ventas, viajes and clientes, and the seats come back when the balance is short', async ({
    page,
    baseURL,
    browser,
  }, testInfo) => {
    const inbox = mailpitUrl(baseURL);
    test.skip(!inbox || !(await isReachable(inbox)), 'needs a reachable Mailpit');
    const stamp = `${testInfo.project.name}-${Date.now()}`;
    const branchAdmin = testEmail(`purchase-${testInfo.project.name}`);
    const plate = `Y${Math.floor(100 + Math.random() * 900)}${randomLetters(3)}`;
    const plateTail = new RegExp(plate.slice(-3));
    const api = await playwrightRequest.newContext({ baseURL: GATEWAY });

    // The client signs up and sets a password with the emailed link, like a person would.
    const buyer = await signUpClient(
      api,
      inbox!,
      testEmail(`buyer-${testInfo.project.name}`),
      `${TEST_BRANCH_PREFIX}${TEST_RUN} Compradora ${stamp}`,
    );
    const asClient = { authorization: `Bearer ${buyer.accessToken}` };
    // ProfileUpdated carries the NIT of the client to ventas; the purchase needs that copy.
    await untilInVentas(
      `SELECT client_id FROM client_nits WHERE client_id = '${buyer.clientId}'`,
      'the copy of the client',
    );
    const today = guatemalaAgo(0).day;
    const topUp = await api.post('/api/clientes/wallet/top-ups', {
      headers: { ...asClient, 'idempotency-key': randomUUID() },
      data: { amount: 100, paidOn: today },
    });
    expect(topUp.status()).toBe(201);

    // The admin of a test branch schedules a trip of Q 85 that leaves within the hour.
    await signInAsRealAdmin(page, inbox!, process.env.E2E_ADMIN_EMAIL!);
    await createBranch(page, `${TEST_BRANCH_PREFIX}${TEST_RUN} compra ${stamp}`, branchAdmin);
    await createBranch(
      page,
      `${TEST_BRANCH_PREFIX}${TEST_RUN} destino ${stamp}`,
      testEmail(`purchase-dest-${testInfo.project.name}`),
    );
    const { page: branch, context } = await signInAsBranchAdmin(
      browser,
      baseURL!,
      inbox!,
      branchAdmin,
    );
    await createRoute(branch, `destino ${stamp}`, '214.3', '85');
    await registerDriver(branch, {
      name: 'Chofer de Compras',
      email: testEmail(`purchase-driver-${testInfo.project.name}`),
      license: `L${Math.floor(10_000_000 + Math.random() * 89_999_999)}`,
      salary: '175',
    });
    await registerBus(branch, { plate, driverName: 'Chofer de Compras', mileageKm: '1000' });
    const soon = guatemalaAgo(-45);
    await scheduleTrip(branch, {
      destination: `destino ${stamp}`,
      plate,
      day: soon.day,
      time: soon.time,
    });
    await expect(branch.getByRole('row', { name: plateTail })).toBeVisible();
    // TripScheduled reaches ventas by Pub/Sub.
    const tripId = await untilInVentas(
      `SELECT trip_id FROM trips WHERE bus_plate = '${plate}'`,
      'the copy of the trip',
    );
    await context.close();

    const buy = (seats: number[], key = randomUUID()) =>
      api.post('/api/ventas/purchases', {
        headers: { ...asClient, 'idempotency-key': key },
        data: { tripId, seats, paidOn: today },
      });
    const wallet = async () =>
      (
        (await (await api.get('/api/clientes/wallet', { headers: asClient })).json()) as {
          balance: number;
        }
      ).balance;
    const takenSeats = async () =>
      (
        (await (
          await api.get(`/api/ventas/trips/${tripId}/seats`, { headers: asClient })
        ).json()) as {
          taken: number[];
        }
      ).taken;

    // The purchase is confirmed and the wallet shows the ticket with its own id as the reference.
    const ticketId = randomUUID();
    const bought = await buy([5], ticketId);
    expect(bought.status()).toBe(201);
    expect(await bought.json()).toMatchObject({
      ticketId,
      status: 'CONFIRMED',
      seats: [5],
      amount: 85,
      ticket: { id: ticketId, channel: 'ONLINE', status: 'CONFIRMED' },
    });
    expect(await wallet()).toBe(15);
    const movements = await api.get('/api/clientes/wallet/movements?kind=TICKET', {
      headers: asClient,
    });
    expect(((await movements.json()) as { items: unknown[] }).items).toEqual([
      expect.objectContaining({ kind: 'TICKET', amount: -85, reference: ticketId }),
    ]);

    // Repeating the request with the same key answers the same purchase and charges nothing more.
    const repeated = await buy([5], ticketId);
    expect(repeated.status()).toBe(201);
    expect(await repeated.json()).toMatchObject({ ticketId, status: 'CONFIRMED' });
    expect(await wallet()).toBe(15);

    // Without balance the purchase is refused and the compensation frees the seats it had held.
    const short = await buy([6, 7]);
    expect(short.status()).toBe(422);
    expect(((await short.json()) as { message: string }).message).toContain('saldo');
    expect(await takenSeats()).toEqual([5]);
    expect(await wallet()).toBe(15);
    expect(
      queryLocal(
        'ventas',
        `SELECT status || ' ' || failure FROM purchases WHERE trip_id = '${tripId}' AND status = 'FAILED'`,
      ),
    ).toEqual(['FAILED INSUFFICIENT_BALANCE']);

    // A seat that is already sold cannot be bought again.
    const taken = await buy([5]);
    expect(taken.status()).toBe(409);

    // The sale was announced: the read model of reportes, fed by TicketSold, has the ticket once.
    await expect
      .poll(
        () =>
          queryLocal(
            'reportes',
            `SELECT channel || ' ' || seats || ' ' || total FROM branch_report_ticket_sales WHERE id = '${ticketId}'`,
          ),
        { timeout: ACTION_TIMEOUT },
      )
      .toEqual(['ONLINE 1 85.00']);
    await api.dispose();
  });
});
