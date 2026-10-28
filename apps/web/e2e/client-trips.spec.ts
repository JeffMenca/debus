import { type AvailableTrip, GUATEMALA_TIME_ZONE } from '@debus/contracts';
import { expect, test, type Page } from '@playwright/test';
import { mockAccountGateway } from './support/account-gateway';
import {
  SALE_MESSAGES,
  mockClientTripsGateway,
  sampleClientTrip,
} from './support/client-trips-gateway';
import { expectDecorationClearOfText, expectNoHorizontalScroll, signInAs } from './support/session';

const xela = sampleClientTrip();
const flores = sampleClientTrip({
  destinationLabel: 'Flores',
  busPlate: 'C731PLR',
  ticketPrice: 150,
  freeSeats: 40,
});
const back = sampleClientTrip({
  originLabel: 'Ciudad de Guatemala',
  destinationLabel: 'Quetzaltenango',
  busPlate: 'C562HWD',
});

// The day of the trips in Guatemala, so the search finds them whatever time the test runs.
const dayOf = (trip: AvailableTrip) =>
  new Date(trip.departureAt).toLocaleDateString('en-CA', { timeZone: GUATEMALA_TIME_ZONE });

async function open(page: Page, baseURL: string | undefined, path: string, balance = 340) {
  await mockAccountGateway(page, { balance });
  const gateway = await mockClientTripsGateway(page, [xela, flores, back]);
  await signInAs(page, baseURL!, 'CLIENT');
  await page.goto(path);
  return gateway;
}

const seat = (page: Page, number: number) =>
  page.getByRole('button', { name: `Asiento ${number}`, exact: true });

async function chooseSeatsOfXela(page: Page, seats: number[]) {
  await page
    .getByRole('link', { name: /Elegir asientos de Quetzaltenango a Ciudad de Guatemala/ })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Elige tus asientos' })).toBeVisible();
  for (const number of seats) await seat(page, number).click();
}

test.describe('trips and purchases of a client', () => {
  test.skip(Boolean(process.env.E2E_REAL_API), 'runs only without a real gateway');

  test('searches by origin, destination, day and passengers, all kept in the address', async ({
    page,
    baseURL,
  }) => {
    await open(page, baseURL, `/viajes?fecha=${dayOf(xela)}`);

    await expect(
      page.getByRole('heading', { level: 1, name: '¿A dónde viajamos hoy?' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Viajes' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(
      page.getByRole('list', { name: 'Viajes a la venta' }).getByRole('listitem'),
    ).toHaveCount(3);

    await page.getByRole('combobox', { name: 'Origen' }).click();
    await page.getByRole('option', { name: 'Quetzaltenango' }).click();
    await page.getByRole('combobox', { name: 'Destino' }).click();
    await page.getByRole('option', { name: 'Flores' }).click();
    await page.getByLabel('Pasajeros').fill('2');
    await page.getByRole('button', { name: 'Buscar viajes' }).click();

    await expect(page).toHaveURL(/origen=Quetzaltenango&destino=Flores/);
    await expect(page).toHaveURL(/pasajeros=2/);
    const results = page.getByRole('list', { name: 'Viajes a la venta' }).getByRole('listitem');
    await expect(results).toHaveCount(1);
    await expect(results.first()).toContainText('Flores');
    await page.reload();
    await expect(results).toHaveCount(1);
    // The subtitle of the results, not the title of the card, which reads the same.
    await expect(page.locator('p', { hasText: /^Quetzaltenango a Flores$/ })).toBeVisible();

    await page.getByRole('button', { name: 'Invertir origen y destino' }).click();
    await page.getByRole('button', { name: 'Buscar viajes' }).click();
    await expect(page).toHaveURL(/origen=Flores&destino=Quetzaltenango/);
    await expect(page.getByText(/No hay viajes para ese día/)).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('the ticket card keeps its round decoration clear of the hours and the places', async ({
    page,
    baseURL,
  }) => {
    await open(page, baseURL, `/viajes?fecha=${dayOf(xela)}`);

    await chooseSeatsOfXela(page, []);

    await expect(page.getByText(/^Viaje · /)).toBeVisible();
    await expectDecorationClearOfText(page);
    await expectNoHorizontalScroll(page);
  });

  test('pays two seats with the wallet and finds the ticket in the account', async ({
    page,
    baseURL,
  }) => {
    await open(page, baseURL, `/viajes?fecha=${dayOf(xela)}`);

    await chooseSeatsOfXela(page, [9, 10]);
    await expect(page.getByText(/^2 asientos × Q\s?85\.00$/)).toBeVisible();
    await expect(page.getByText(/Q\s?340\.00/)).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.getByRole('button', { name: /^Pagar Q\s?170\.00$/ }).click();

    await expect(
      page.getByRole('heading', { name: '¡Listo! Tu boleto está pagado' }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Ver mis boletos' }).click();
    await expect(page).toHaveURL(/\/cuenta$/);
    await expect(page.getByRole('region', { name: /Próximo viaje/ })).toContainText('09, 10');
    await expect(page.getByRole('list', { name: 'Tus boletos' })).toContainText('Compra en línea');
    await expectNoHorizontalScroll(page);
  });

  test('waits for a payment being confirmed, then shows the ticket', async ({ page, baseURL }) => {
    const gateway = await open(page, baseURL, `/viajes?fecha=${dayOf(xela)}`);
    gateway.endNextPurchase('pending');

    await chooseSeatsOfXela(page, [5]);
    await page.getByRole('button', { name: /^Pagar/ }).click();

    await expect(page.getByText(SALE_MESSAGES.paymentPending)).toBeVisible();
    await expect(page.getByRole('heading', { name: '¡Listo! Tu boleto está pagado' })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('a short balance frees the seats and says so in the words of the server', async ({
    page,
    baseURL,
  }) => {
    const gateway = await open(page, baseURL, `/viajes?fecha=${dayOf(xela)}`, 50);
    gateway.endNextPurchase('insufficient');

    await chooseSeatsOfXela(page, [12]);
    await expect(page.getByText('Tu saldo no alcanza. Recarga en Mi cuenta.')).toBeVisible();
    await page.getByRole('button', { name: /^Pagar/ }).click();

    await expect(
      page.getByRole('alert').filter({ hasText: SALE_MESSAGES.insufficientBalance }),
    ).toBeVisible();
    await expect(seat(page, 12)).toBeEnabled();
    expect(gateway.purchases()).toHaveLength(0);
  });

  test('a seat sold in the meantime is reloaded as taken and leaves the choice', async ({
    page,
    baseURL,
  }) => {
    const gateway = await open(page, baseURL, `/viajes?fecha=${dayOf(xela)}`);

    await chooseSeatsOfXela(page, [20, 21]);
    gateway.takeSeat(xela.tripId, 21);
    await page.getByRole('button', { name: /^Pagar/ }).click();

    await expect(
      page.getByRole('alert').filter({ hasText: SALE_MESSAGES.seatTaken }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Asiento 21, ocupado' })).toBeDisabled();
    await expect(page.getByText('1 asiento', { exact: true })).toBeVisible();
  });

  test('a wallet that does not answer charges nothing', async ({ page, baseURL }) => {
    const gateway = await open(page, baseURL, `/viajes?fecha=${dayOf(xela)}`);
    gateway.endNextPurchase('unavailable');

    await chooseSeatsOfXela(page, [30]);
    await page.getByRole('button', { name: /^Pagar/ }).click();

    await expect(
      page.getByRole('alert').filter({ hasText: SALE_MESSAGES.walletUnavailable }),
    ).toBeVisible();
    expect(gateway.purchases()).toHaveLength(0);
    await page.getByRole('button', { name: /^Pagar/ }).click();
    await expect(
      page.getByRole('heading', { name: '¡Listo! Tu boleto está pagado' }),
    ).toBeVisible();
  });

  async function expectTripCancelled(page: Page) {
    await expect(page.getByRole('heading', { name: 'Viaje cancelado' })).toBeVisible();
    await expect(page.getByText(SALE_MESSAGES.tripCancelled)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Pagar/ })).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    await page.getByRole('link', { name: 'Ver mis movimientos' }).click();
    await expect(page).toHaveURL(/\/cuenta\?pestana=movimientos$/);
    await expect(page.getByRole('tab', { name: 'Movimientos', selected: true })).toBeVisible();
  }

  test('a trip deleted during the payment ends in a clear cancellation', async ({
    page,
    baseURL,
  }) => {
    const gateway = await open(page, baseURL, `/viajes?fecha=${dayOf(xela)}`);
    gateway.endNextPurchase('cancelled');

    await chooseSeatsOfXela(page, [14]);
    await page.getByRole('button', { name: /^Pagar/ }).click();

    await expectTripCancelled(page);
  });

  test('a trip deleted while the payment is confirmed ends in the same cancellation', async ({
    page,
    baseURL,
  }) => {
    const gateway = await open(page, baseURL, `/viajes?fecha=${dayOf(xela)}`);
    gateway.endNextPurchase('cancelledWhilePending');

    await chooseSeatsOfXela(page, [15]);
    await page.getByRole('button', { name: /^Pagar/ }).click();

    await expect(page.getByText(SALE_MESSAGES.paymentPending)).toBeVisible();
    await expectTripCancelled(page);
  });

  test('a trip that left the sale before the payment says so, and viajes down charges nothing', async ({
    page,
    baseURL,
  }) => {
    const gateway = await open(page, baseURL, `/viajes?fecha=${dayOf(xela)}`);
    gateway.endNextPurchase('tripUnchecked');
    gateway.endNextPurchase('gone');

    await chooseSeatsOfXela(page, [16]);
    await page.getByRole('button', { name: /^Pagar/ }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: SALE_MESSAGES.tripCheckUnavailable }),
    ).toBeVisible();
    await page.getByRole('button', { name: /^Pagar/ }).click();

    await expect(page.getByRole('heading', { name: 'No encontramos ese viaje' })).toBeVisible();
    await expect(page.getByText(SALE_MESSAGES.tripNotFound)).toBeVisible();
    expect(gateway.purchases()).toHaveLength(0);
  });

  test('the history explains where a cancelled trip goes', async ({ page, baseURL }) => {
    await open(page, baseURL, `/viajes?fecha=${dayOf(xela)}`);
    await chooseSeatsOfXela(page, [17]);
    await page.getByRole('button', { name: /^Pagar/ }).click();
    await page.getByRole('link', { name: 'Ver mis boletos' }).click();

    await expect(
      page.getByText(/Si se cancela un viaje, su boleto sale de esta lista/),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Movimientos', exact: true }).click();
    await expect(page).toHaveURL(/pestana=movimientos/);
  });

  test('a chosen seat does not bounce when motion is reduced', async ({ page, baseURL }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, baseURL, `/viajes?fecha=${dayOf(xela)}`);

    await chooseSeatsOfXela(page, [3]);

    const animation = await seat(page, 3).evaluate(
      (element) => getComputedStyle(element).animationName,
    );
    expect(animation).toBe('none');
  });
});
