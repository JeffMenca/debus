import { expect, test, type Page } from '@playwright/test';
import { mockAdminGateway, sampleBranch } from './support/admin-gateway';
import { COUNTER_MESSAGES, mockCounterGateway, sampleTripOnSale } from './support/counter-gateway';
import { FLEET_BRANCH_ID } from './support/fleet-gateway';
import {
  expectDecorationClearOfText,
  expectNoHorizontalScroll,
  openMenuOnPhone,
  signInAs,
} from './support/session';

const xela = sampleTripOnSale();
const flores = sampleTripOnSale({
  destinationLabel: 'Flores',
  busPlate: 'C731PLR',
  ticketPrice: 150,
});

async function open(page: Page, baseURL: string | undefined, role = 'CASHIER') {
  await mockAdminGateway(page, { branches: [sampleBranch({ id: FLEET_BRANCH_ID })] });
  const gateway = await mockCounterGateway(page, [xela, flores]);
  await signInAs(page, baseURL!, role, FLEET_BRANCH_ID);
  await page.goto('/sucursal/ventanilla');
  return gateway;
}

const sellRow = (page: Page, destination: string) =>
  page.getByRole('button', { name: new RegExp(`Vender Quetzaltenango a ${destination}`) });

test.describe('counter', () => {
  test.skip(Boolean(process.env.E2E_REAL_API), 'runs only without a real gateway');

  test('a cashier sells two seats in cash to the generic client and sees the receipt', async ({
    page,
    baseURL,
  }) => {
    const gateway = await open(page, baseURL);

    await expect(page.getByRole('heading', { level: 1, name: 'Ventanilla' })).toBeVisible();
    await openMenuOnPhone(page);
    await expect(page.getByRole('link', { name: 'Ventanilla' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await page.keyboard.press('Escape');
    await sellRow(page, 'Guatemala').click();
    await expect(page).toHaveURL(/viaje=/);
    await page.getByRole('button', { name: 'Asiento 9', exact: true }).click();
    await page.getByRole('button', { name: 'Asiento 10', exact: true }).click();
    await expectNoHorizontalScroll(page);
    await page.getByRole('button', { name: /Cobrar Q\s?170\.00/ }).click();

    await expect(page.getByRole('heading', { name: 'Boleto vendido' })).toBeVisible();
    await expect(page.getByText('09, 10')).toBeVisible();
    await expect(page.getByText('Consumidor final')).toBeVisible();
    expect(gateway.sales()).toHaveLength(1);
    await page.getByRole('button', { name: 'Vender otro boleto' }).click();
    await expect(page).not.toHaveURL(/viaje=/);
    await expect(page.getByRole('row', { name: /Guatemala/ }).getByText('38')).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('the ticket card keeps its round decoration clear of the hours and the places', async ({
    page,
    baseURL,
  }) => {
    await open(page, baseURL);

    await sellRow(page, 'Guatemala').click();

    await expect(page.getByText(/^Viaje · /)).toBeVisible();
    await expectDecorationClearOfText(page);
    await expectNoHorizontalScroll(page);
  });

  test('the branch admin sells with the NIT and name of the buyer', async ({ page, baseURL }) => {
    const gateway = await open(page, baseURL, 'BRANCH_ADMIN');

    await sellRow(page, 'Flores').click();
    await page.getByRole('button', { name: 'Asiento 1', exact: true }).click();
    await page.getByLabel('NIT').fill('4521837-6');
    await page.getByLabel(/Nombre/).fill('Ana Méndez');
    await page.getByRole('button', { name: /Cobrar Q\s?150\.00/ }).click();

    await expect(page.getByRole('heading', { name: 'Boleto vendido' })).toBeVisible();
    expect(gateway.sales()[0]).toMatchObject({ nit: '45218376', buyerName: 'Ana Méndez' });
  });

  test('a seat sold meanwhile is pointed at and shown taken', async ({ page, baseURL }) => {
    const gateway = await open(page, baseURL);

    await sellRow(page, 'Guatemala').click();
    await page.getByRole('button', { name: 'Asiento 5', exact: true }).click();
    gateway.takeSeat(xela.tripId, 5);
    await page.getByRole('button', { name: /Cobrar/ }).click();

    await expect(page.getByText(COUNTER_MESSAGES.seatTaken)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Asiento 5, ocupado' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Cobrar' })).toBeDisabled();
  });

  test('a sale whose answer was lost is retried with the same seats and sold once', async ({
    page,
    baseURL,
  }) => {
    const gateway = await open(page, baseURL);
    gateway.loseNextAnswer();

    await sellRow(page, 'Guatemala').click();
    await page.getByRole('button', { name: 'Asiento 8', exact: true }).click();
    await page.getByRole('button', { name: /Cobrar Q\s?85\.00/ }).click();
    // Next adds its own role="alert" (the route announcer) outside main.
    await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
    await page.getByRole('button', { name: /Cobrar Q\s?85\.00/ }).click();

    await expect(page.getByRole('heading', { name: 'Boleto vendido' })).toBeVisible();
    expect(gateway.sales()).toHaveLength(1);
  });
});
