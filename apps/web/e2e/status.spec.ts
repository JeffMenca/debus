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

async function mockGateway(page: Page) {
  await page.route('**/api/system/status', (route) =>
    fulfillJson(route, 200, {
      environment: 'local',
      checkedAt: new Date().toISOString(),
      units: units.map((unit) => ({ unit, status: 'up', latencyMs: 12 })),
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
