import { expect, type Page, test } from '@playwright/test';
import { isReachable, mailpitUrl } from './support/mailpit';
import { signInAsRealAdmin } from './support/real-admin';
import { expectNoHorizontalScroll, fulfillJson, signInAs } from './support/session';

const realApi = Boolean(process.env.E2E_REAL_API);
const probeId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const units = [
  'gateway',
  'administracion',
  'flota',
  'viajes',
  'ventas',
  'clientes',
  'reportes',
  'notificaciones',
];
const backends = units.slice(1);

type Circuit = {
  target: string;
  state: 'closed' | 'open' | 'half-open';
  failures: number;
  retryAt: string | null;
};

async function mockGateway(page: Page, circuits: Record<string, Circuit[]> = {}) {
  await page.route('**/api/system/status', (route) =>
    fulfillJson(route, 200, {
      environment: 'local',
      checkedAt: new Date().toISOString(),
      units: units.map((unit) => ({
        unit,
        status: 'up',
        latencyMs: 12,
        ...(circuits[unit] && { circuits: circuits[unit] }),
      })),
    }),
  );
  await page.route('**/api/system/probes', (route) => fulfillJson(route, 202, { probeId }));
  await page.route(`**/api/system/probes/${probeId}`, (route) =>
    fulfillJson(route, 200, {
      probeId,
      services: backends.map((service) => ({ service, state: 'received' })),
    }),
  );
}

test('shows every service online and the probe delivered (mocked gateway)', async ({
  page,
  baseURL,
}) => {
  test.skip(realApi, 'runs only without a real gateway');
  await signInAs(page, baseURL!, 'SYSTEM_ADMIN');
  await mockGateway(page);
  await page.goto('/admin/estado');

  await expect(page.getByRole('heading', { level: 1, name: 'Estado del sistema' })).toBeVisible();
  await expect(page.getByText('En línea')).toHaveCount(8);
  await page.getByRole('button', { name: 'Enviar aviso de prueba' }).click();
  await expect(page.getByText('Recibido')).toHaveCount(7);
  await expectNoHorizontalScroll(page);
});

test('shows which connection between services is paused and until when (mocked gateway)', async ({
  page,
  baseURL,
}) => {
  test.skip(realApi, 'runs only without a real gateway');
  await signInAs(page, baseURL!, 'SYSTEM_ADMIN');
  await mockGateway(page, {
    ventas: [
      { target: 'clientes', state: 'open', failures: 5, retryAt: '2026-10-19T16:32:05.000Z' },
      { target: 'viajes', state: 'closed', failures: 0, retryAt: null },
    ],
  });
  await page.goto('/admin/estado');

  const ventas = page.getByRole('listitem').filter({ hasText: 'Conexión con Clientes' }).first();
  await expect(ventas.getByText('Conexión con Clientes')).toBeVisible();
  await expect(ventas.getByText('En pausa hasta 10:32:05')).toBeVisible();
  await expect(ventas.getByText('Conexión con Viajes')).toBeVisible();
  await expect(ventas.getByText('Normal')).toBeVisible();
  await expect(page.getByText(/Conexión con/)).toHaveCount(2);
  await expectNoHorizontalScroll(page);
});

test('a connection that is being tested pulses unless the person asked for less motion (mocked gateway)', async ({
  page,
  baseURL,
}) => {
  test.skip(realApi, 'runs only without a real gateway');
  await signInAs(page, baseURL!, 'SYSTEM_ADMIN');
  await mockGateway(page, {
    ventas: [
      { target: 'clientes', state: 'half-open', failures: 5, retryAt: '2026-10-19T16:32:05.000Z' },
    ],
  });
  const dot = () => page.getByText('Probando de nuevo').locator('span').first();

  await page.goto('/admin/estado');
  await expect(page.getByText('Probando de nuevo')).toBeVisible();
  await expect(dot()).not.toHaveCSS('animation-name', 'none');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(dot()).toHaveCSS('animation-name', 'none');
  await expectNoHorizontalScroll(page);
});

test('the old /estado address leads to the status inside the admin panel', async ({
  page,
  baseURL,
}) => {
  test.skip(realApi, 'runs only without a real gateway');
  await signInAs(page, baseURL!, 'SYSTEM_ADMIN');
  await mockGateway(page);
  await page.goto('/estado');

  await expect(page).toHaveURL(/\/admin\/estado$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Estado del sistema' })).toBeVisible();
});

test('talks to the real gateway and every service receives the probe', async ({
  page,
  baseURL,
}) => {
  test.skip(
    !realApi || !process.env.E2E_ADMIN_EMAIL,
    'runs only against a running gateway with an admin',
  );
  test.setTimeout(180_000);
  const inbox = mailpitUrl(baseURL);
  test.skip(!inbox || !(await isReachable(inbox)), 'needs a reachable Mailpit');
  await signInAsRealAdmin(page, inbox!, process.env.E2E_ADMIN_EMAIL!);
  await page.goto('/admin/estado');

  await expect(page.getByText('En línea')).toHaveCount(8, { timeout: 60_000 });
  await page.getByRole('button', { name: 'Enviar aviso de prueba' }).click();
  await expect(page.getByText('Recibido')).toHaveCount(7, { timeout: 45_000 });
  await expectNoHorizontalScroll(page);
});
