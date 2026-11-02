import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockAdminGateway, sampleBranch, sampleUser } from './support/admin-gateway';
import { mockExpensesGateway, sampleCategory } from './support/expenses-gateway';
import {
  FLEET_BRANCH_ID,
  mockFleetGateway,
  sampleBus,
  sampleDriver,
  sampleRoute,
} from './support/fleet-gateway';
import { expectNoHorizontalScroll, signInAs } from './support/session';
import { sampleRental } from './support/trip-cycle-gateway';
import { mockTripsGateway } from './support/trips-gateway';

// Every tab keeps its label and its count together: nothing leaves its tab, no tab covers its
// neighbour, and the page itself never scrolls sideways (a bar that does not fit scrolls inside).
async function expectReadableTabBars(page: Page, expected: number) {
  const bars = page.getByRole('tablist');
  await expect(bars).toHaveCount(expected);
  for (const bar of await bars.all()) {
    const tabs = await bar.getByRole('tab').all();
    let previousRight = -Infinity;
    for (const tab of tabs) {
      const box = (await tab.boundingBox())!;
      expect(box.x, 'tabs do not overlap').toBeGreaterThanOrEqual(previousRight - 0.5);
      previousRight = box.x + box.width;
      const overflows = await tab.evaluate((element) => {
        const own = element.getBoundingClientRect();
        const outside = [...element.querySelectorAll('*')].some((child) => {
          const rect = child.getBoundingClientRect();
          return rect.right > own.right + 0.5 || rect.left < own.left - 0.5;
        });
        return outside || element.scrollWidth > element.clientWidth + 1;
      });
      expect(overflows, `${await tab.innerText()} stays inside its tab`).toBe(false);
    }
  }
  await expectNoHorizontalScroll(page);
}

// The indicator sits exactly under the tab that is active, whatever width each column got.
async function expectIndicatorOn(page: Page, tab: Locator) {
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  const indicator = page.getByTestId('tab-indicator').first();
  await expect
    .poll(async () => {
      const [tabBox, indicatorBox] = [await tab.boundingBox(), await indicator.boundingBox()];
      return Math.max(
        Math.abs(tabBox!.x - indicatorBox!.x),
        Math.abs(tabBox!.width - indicatorBox!.width),
      );
    })
    .toBeLessThanOrEqual(2);
}

async function expectIndicatorFollowsEveryTab(page: Page) {
  const tabs = await page.getByRole('tab').all();
  for (const tab of tabs) {
    await tab.scrollIntoViewIfNeeded();
    await tab.click();
    await expectIndicatorOn(page, tab);
  }
}

async function expectActiveTabInView(page: Page) {
  const active = page.getByRole('tab', { selected: true });
  await expect
    .poll(async () => {
      const frame = await page.locator('[data-tabs-frame]').first().boundingBox();
      const box = await active.boundingBox();
      return box!.x >= frame!.x - 0.5 && box!.x + box!.width <= frame!.x + frame!.width + 0.5;
    })
    .toBe(true);
}

const fleetSeed = () => ({
  buses: [sampleBus({ plate: 'C482BTX' }), sampleBus({ plate: 'C731PLR', brand: 'Scania' })],
  drivers: [sampleDriver({ fullName: 'Julio Pérez' })],
  routes: [sampleRoute({ destinationName: 'Guatemala' })],
});

test.describe('tab bars', () => {
  test.skip(Boolean(process.env.E2E_REAL_API), 'runs only without a real gateway');

  for (const [path, label] of [
    ['/sucursal/buses', 'buses (5 tabs)'],
    ['/sucursal/choferes', 'drivers'],
    ['/sucursal/rutas', 'routes'],
  ] as const) {
    test(`${label} stay readable`, async ({ page, baseURL }) => {
      await mockAdminGateway(page, { branches: [sampleBranch({ id: FLEET_BRANCH_ID })] });
      await mockFleetGateway(page, fleetSeed());
      await signInAs(page, baseURL!, 'BRANCH_ADMIN', FLEET_BRANCH_ID);
      await page.goto(path);
      await expect(page.getByRole('tab').first()).toBeVisible();

      await expectReadableTabBars(page, 1);
    });
  }

  for (const path of ['/admin/categorias', '/admin/sucursales']) {
    test(`${path} has no false vertical scroll in its tabs`, async ({ page, baseURL }) => {
      await mockAdminGateway(page, { branches: [sampleBranch()] });
      await mockExpensesGateway(page, {});
      await signInAs(page, baseURL!, 'SYSTEM_ADMIN');
      await page.goto(path);
      const frame = page.locator('[data-tabs-frame]').first();
      await expect(frame.getByRole('tab').first()).toBeVisible();

      const { scrollHeight, clientHeight } = await frame.evaluate((el) => ({
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      }));
      expect(scrollHeight).toBeLessThanOrEqual(clientHeight);
    });
  }

  test('the buses indicator follows each tab and the active one is in view', async ({
    page,
    baseURL,
  }) => {
    await mockAdminGateway(page, { branches: [sampleBranch({ id: FLEET_BRANCH_ID })] });
    await mockFleetGateway(page, fleetSeed());
    await signInAs(page, baseURL!, 'BRANCH_ADMIN', FLEET_BRANCH_ID);
    await page.goto('/sucursal/buses?estado=inactivos');
    await expect(page.getByRole('tab', { name: /Inactivos/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expectActiveTabInView(page);
    await expectIndicatorFollowsEveryTab(page);
  });

  test('the users indicator follows each tab', async ({ page, baseURL }) => {
    await mockAdminGateway(page, {
      branches: [sampleBranch()],
      users: [sampleUser({ fullName: 'Rosa Pop', email: 'rosa@correo.com', role: 'CASHIER' })],
    });
    await signInAs(page, baseURL!, 'SYSTEM_ADMIN');
    await page.goto('/admin/usuarios');
    await expect(page.getByRole('tab').first()).toBeVisible();
    await expectIndicatorFollowsEveryTab(page);
  });

  test('the trips bars stay readable, the rentals one with its count', async ({
    page,
    baseURL,
  }) => {
    await mockAdminGateway(page, { branches: [sampleBranch({ id: FLEET_BRANCH_ID })] });
    const fleet = await mockFleetGateway(page, fleetSeed());
    await mockTripsGateway(page, fleet, {
      cycle: { actingAs: { role: 'BRANCH_ADMIN' }, rentals: [sampleRental()] },
    });
    await signInAs(page, baseURL!, 'BRANCH_ADMIN', FLEET_BRANCH_ID);
    await page.goto('/sucursal/viajes');
    await expect(page.getByRole('tab', { name: /Alquileres por asignar/ })).toContainText('1');

    await expectReadableTabBars(page, 2);
  });

  for (const [path, label] of [
    ['/admin/usuarios', 'users (4 tabs)'],
    ['/admin/sucursales', 'branches'],
  ] as const) {
    test(`${label} stay readable`, async ({ page, baseURL }) => {
      await mockAdminGateway(page, {
        branches: [sampleBranch()],
        users: [sampleUser({ fullName: 'Rosa Pop', email: 'rosa@correo.com', role: 'CASHIER' })],
      });
      await signInAs(page, baseURL!, 'SYSTEM_ADMIN');
      await page.goto(path);
      await expect(page.getByRole('tab').first()).toBeVisible();

      await expectReadableTabBars(page, 1);
    });
  }

  test('the categories bar stays readable', async ({ page, baseURL }) => {
    await mockAdminGateway(page, { branches: [sampleBranch()] });
    await mockExpensesGateway(page, {
      categories: [sampleCategory({ name: 'Motor' })],
      buses: [],
    });
    await signInAs(page, baseURL!, 'SYSTEM_ADMIN');
    await page.goto('/admin/categorias');
    await expect(page.getByRole('tab').first()).toBeVisible();

    await expectReadableTabBars(page, 1);
  });
});
