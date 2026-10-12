import type { Locator, Page } from '@playwright/test';

// What the services answer while a copy of a branch, bus or driver is still travelling by events.
const STILL_REGISTERING =
  /Estamos terminando de registrar|Elige otra sucursal activa como destino|Tu sucursal no está activa/;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Submission {
  page: Page;
  // Path of the request that stores the record, such as `/api/flota/routes`.
  path: string;
  submit: Locator;
  // What the screen shows once the record is stored.
  saved: Locator;
  wait?: { timeout: number; interval: number };
}

const DEFAULT_WAIT = { timeout: 60_000, interval: 3_000 };

// Presses `submit` and presses it again only when the service answers that a copy has not arrived
// yet, which means nothing was stored. Any other answer ends the wait with that answer, and a record
// that already shows on screen is never sent twice.
export async function submitWhileRegistering({
  page,
  path,
  submit,
  saved,
  wait = DEFAULT_WAIT,
}: Submission): Promise<void> {
  const deadline = Date.now() + wait.timeout;
  for (;;) {
    if (await saved.isVisible()) return;
    const answer = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && new URL(response.url()).pathname === path,
    );
    await submit.click();
    const response = await answer;
    if (response.ok()) return;
    const body = (await response.json().catch(() => ({}))) as { message?: unknown };
    const message = typeof body.message === 'string' ? body.message : `status ${response.status()}`;
    if (!STILL_REGISTERING.test(message) || Date.now() >= deadline) {
      throw new Error(`${path} answered ${response.status()}: ${message}`);
    }
    await sleep(wait.interval);
  }
}
