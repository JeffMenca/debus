import { type Page, expect, test } from '@playwright/test';
import { submitWhileRegistering } from './support/registering';

const PATH = '/api/flota/routes';
const FAST = { timeout: 1_500, interval: 50 };
const PENDING = 'Elige otra sucursal activa como destino.';
const OTHER = 'Ya existe una ruta hacia esa sucursal. Edítala en lugar de crear otra.';

// A page with one button that posts to PATH and shows "Guardado" when the answer is a success.
async function openForm(page: Page, answers: { status: number; message?: string }[]) {
  let calls = 0;
  await page.route(`http://localhost:4010${PATH}`, async (route) => {
    const answer = answers[Math.min(calls, answers.length - 1)]!;
    calls += 1;
    await route.fulfill({
      status: answer.status,
      headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
      body: JSON.stringify(answer.message ? { message: answer.message } : {}),
    });
  });
  await page.setContent(`
    <button id="go">Crear ruta</button>
    <p id="done" hidden>Guardado</p>
    <script>
      document.getElementById('go').onclick = async () => {
        const response = await fetch('http://localhost:4010${PATH}', { method: 'POST', body: '{}' });
        if (response.ok) document.getElementById('done').hidden = false;
      };
    </script>`);
  return {
    submit: page.getByRole('button', { name: 'Crear ruta' }),
    saved: page.getByText('Guardado'),
    calls: () => calls,
  };
}

test.describe('submitWhileRegistering', () => {
  test('sends again only while the answer says the copy has not arrived', async ({ page }) => {
    const form = await openForm(page, [
      { status: 409, message: PENDING },
      { status: 409, message: 'Estamos terminando de registrar ese bus. Intenta de nuevo.' },
      { status: 201 },
    ]);

    await submitWhileRegistering({ page, path: PATH, ...form, wait: FAST });

    await expect(form.saved).toBeVisible();
    expect(form.calls()).toBe(3);
  });

  test('does not send again after an answer that waiting cannot fix', async ({ page }) => {
    const form = await openForm(page, [{ status: 409, message: OTHER }, { status: 201 }]);

    await expect(submitWhileRegistering({ page, path: PATH, ...form, wait: FAST })).rejects.toThrow(
      OTHER,
    );

    expect(form.calls()).toBe(1);
  });

  test('does not send what the screen already shows as saved', async ({ page }) => {
    const form = await openForm(page, [{ status: 201 }]);
    await page.evaluate(() => {
      document.getElementById('done')!.hidden = false;
    });

    await submitWhileRegistering({ page, path: PATH, ...form, wait: FAST });

    expect(form.calls()).toBe(0);
  });

  test('gives up with the last answer when the copy never arrives', async ({ page }) => {
    const form = await openForm(page, [{ status: 409, message: PENDING }]);

    await expect(
      submitWhileRegistering({
        page,
        path: PATH,
        ...form,
        wait: { timeout: 300, interval: 50 },
      }),
    ).rejects.toThrow(PENDING);

    expect(form.calls()).toBeGreaterThan(1);
  });
});
