import { expect, type Page, test } from '@playwright/test';

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
    route.fulfill({
      json: {
        environment: 'local',
        checkedAt: new Date().toISOString(),
        units: units.map((unit) => ({ unit, status: 'up', latencyMs: 12 })),
      },
    }),
  );
  await page.route('**/api/system/probes', (route) =>
    route.fulfill({ status: 202, json: { probeId } }),
  );
  await page.route(`**/api/system/probes/${probeId}`, (route) =>
    route.fulfill({
      json: { probeId, services: backends.map((service) => ({ service, state: 'received' })) },
    }),
  );
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
}

test('shows every service online and the probe delivered (mocked gateway)', async ({ page }) => {
  test.skip(realApi, 'runs only without a real gateway');
  await mockGateway(page);
  await page.goto('/estado');

  await expect(page.getByRole('heading', { level: 1, name: 'Estado del sistema' })).toBeVisible();
  await expect(page.getByText('En línea')).toHaveCount(8);
  await page.getByRole('button', { name: 'Enviar aviso de prueba' }).click();
  await expect(page.getByText('Recibido')).toHaveCount(7);
  await expectNoHorizontalScroll(page);
});

test('talks to the real gateway and every service receives the probe', async ({ page }) => {
  test.skip(!realApi, 'runs only against a running gateway');
  test.setTimeout(120_000);
  await page.goto('/estado');

  await expect(page.getByText('En línea')).toHaveCount(8, { timeout: 60_000 });
  await page.getByRole('button', { name: 'Enviar aviso de prueba' }).click();
  await expect(page.getByText('Recibido')).toHaveCount(7, { timeout: 45_000 });
  await expectNoHorizontalScroll(page);
});
