import { expect, type Page, test } from '@playwright/test';
import { expectNoHorizontalScroll, fulfillJson, signInAs } from './support/session';

const realApi = Boolean(process.env.E2E_REAL_API);

test.describe('pages for what cannot be shown (mocked gateway)', () => {
  test.skip(realApi, 'runs only without a real gateway');

  test('an address that does not exist says so in Spanish and leads back to the home page', async ({
    page,
  }) => {
    await page.goto('/esta-direccion-no-existe');

    await expect(
      page.getByRole('heading', { level: 1, name: 'No encontramos esta página' }),
    ).toBeVisible();
    await expect(page.getByText(/no existe o ya no está disponible/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ir al inicio' })).toHaveAttribute('href', '/');
    await expectNoHorizontalScroll(page);
  });

  test('a signed-in person is led to their own area', async ({ page, baseURL }) => {
    await signInAs(page, baseURL!, 'BRANCH_ADMIN', '9b2c7a10-1111-4c4c-8888-123456789abc');

    await page.goto('/sucursal/esta-direccion-no-existe');

    await expect(
      page.getByRole('heading', { level: 1, name: 'No encontramos esta página' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ir al inicio' })).toHaveAttribute(
      'href',
      '/sucursal',
    );
    await expectNoHorizontalScroll(page);
  });

  // The status page draws the time a paused connection will be tried again; when formatting dates
  // fails, drawing the screen throws, which is what an unexpected error looks like.
  const breakDates = (page: Page) =>
    page.addInitScript(() => {
      const original = Object.getOwnPropertyDescriptor(Intl.DateTimeFormat.prototype, 'format');
      Object.defineProperty(Intl.DateTimeFormat.prototype, 'format', {
        configurable: true,
        get() {
          if ((window as unknown as { __breakDates?: boolean }).__breakDates) {
            throw new Error('stack secreto: dates are broken');
          }
          return original?.get?.call(this);
        },
      });
      (window as unknown as { __breakDates?: boolean }).__breakDates = true;
    });

  test('a screen that throws shows a friendly text, never the error, and recovers when tried again', async ({
    page,
    baseURL,
  }) => {
    await signInAs(page, baseURL!, 'SYSTEM_ADMIN');
    await page.route('**/api/system/status', (route) =>
      fulfillJson(route, 200, {
        environment: 'local',
        checkedAt: '2026-10-19T16:00:00.000Z',
        units: [
          { unit: 'gateway', status: 'up', latencyMs: 0 },
          {
            unit: 'ventas',
            status: 'up',
            latencyMs: 12,
            circuits: [
              {
                target: 'clientes',
                state: 'open',
                failures: 5,
                retryAt: '2026-10-19T16:32:05.000Z',
              },
            ],
          },
        ],
      }),
    );
    await breakDates(page);
    await page.goto('/admin/estado');

    await expect(
      page.getByRole('heading', { level: 1, name: 'Algo salió mal al mostrar esta pantalla' }),
    ).toBeVisible();
    await expect(page.getByText(/secreto|dates are broken/)).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Ir al inicio' })).toBeVisible();
    await expectNoHorizontalScroll(page);

    await page.evaluate(() => {
      (window as unknown as { __breakDates?: boolean }).__breakDates = false;
    });
    await page.getByRole('button', { name: 'Intentar de nuevo' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Estado del sistema' })).toBeVisible();
    await expect(page.getByText('En pausa hasta 10:32:05')).toBeVisible();
  });
});
