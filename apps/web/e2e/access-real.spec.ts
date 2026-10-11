import { testEmail } from '@debus/config/test-data';
import { expect, test } from '@playwright/test';
import { isLocalStack } from './support/local-stack';
import { isReachable, latestLink, mailpitUrl } from './support/mailpit';

test.describe('real access', () => {
  test.skip(!process.env.E2E_REAL_API, 'runs only against a running gateway');
  test.skip(
    ({ baseURL }) => !isLocalStack(baseURL),
    'creates accounts: runs only on the local stack',
  );
  test.setTimeout(180_000);

  test('sign-up, email, password, sign-in and recovery', async ({ page, baseURL }, testInfo) => {
    const mailpit = mailpitUrl(baseURL);
    test.skip(!mailpit || !(await isReachable(mailpit)), 'needs a reachable Mailpit');
    const inbox = mailpit as string;
    // One address per run: projects and repeats run at the same time and must not share an inbox.
    const email = testEmail(`e2e-${testInfo.project.name}-${testInfo.repeatEachIndex}`);

    await page.goto('/registro');
    await page.getByLabel('Nombre completo').fill('Prueba de Punta a Punta');
    await page.getByLabel('DPI').fill('2345678901234');
    await page.getByLabel('Teléfono').fill('55554444');
    await page.getByLabel('Correo').fill(email);
    await page.getByRole('button', { name: /Crear cuenta/ }).click();
    await expect(page.getByRole('heading', { name: 'Revisa tu correo' })).toBeVisible();

    await page.goto(await latestLink(inbox, email, '/crear-contrasena'));
    await page.getByLabel('Contraseña', { exact: true }).fill('clave-segura-1');
    await page.getByLabel('Repite tu contraseña').fill('clave-segura-1');
    await page.getByRole('button', { name: 'Guardar contraseña' }).click();
    await expect(page).toHaveURL(/\/login\?listo=1$/);

    await page.getByLabel('Correo electrónico').fill(email);
    await page.getByLabel('Contraseña', { exact: true }).fill('clave-segura-1');
    await page.getByRole('button', { name: /Ingresar/ }).click();
    await expect(page).toHaveURL(/\/$/);

    const cookies = await page.context().cookies();
    expect(cookies.find((c) => c.name === 'debus_refresh')?.httpOnly).toBe(true);
    expect(await page.evaluate(() => document.cookie)).not.toContain('debus_refresh');
    expect(
      await page.evaluate(() => window.localStorage.length + window.sessionStorage.length),
    ).toBe(0);

    // Reloading loses the in-memory token; the page must get the session back from the cookie.
    // Let the sign-in requests finish first, so the reload is the only thing using the cookie.
    const refreshCookie = async () =>
      (await page.context().cookies()).find((c) => c.name === 'debus_refresh')?.value;
    await page.waitForLoadState('networkidle');
    const before = await refreshCookie();
    const [restored] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().endsWith('/api/session/refresh') && response.request().method() === 'POST',
      ),
      page.reload(),
    ]);
    expect(restored.status()).toBe(200);
    // The refresh token rotates on every use, so a new cookie shows the session settled.
    await expect.poll(refreshCookie).not.toBe(before);

    await page.goto('/recuperar');
    await page.getByLabel('Correo electrónico').fill(email);
    await page.getByRole('button', { name: 'Enviar enlace' }).click();
    await expect(page.getByRole('heading', { name: 'Revisa tu correo' })).toBeVisible();
    await page.goto(await latestLink(inbox, email, '/restablecer'));
    await page.getByLabel('Contraseña', { exact: true }).fill('clave-segura-2');
    await page.getByLabel('Repite tu contraseña').fill('clave-segura-2');
    await page.getByRole('button', { name: 'Guardar contraseña' }).click();
    await expect(page).toHaveURL(/\/login\?listo=1$/);

    // The new password works and the old one no longer does.
    await page.getByLabel('Correo electrónico').fill(email);
    await page.getByLabel('Contraseña', { exact: true }).fill('clave-segura-1');
    await page.getByRole('button', { name: /Ingresar/ }).click();
    await expect(page.getByRole('main').getByRole('alert')).toHaveText(
      'El correo o la contraseña no coinciden.',
    );
    await page.getByLabel('Contraseña', { exact: true }).fill('clave-segura-2');
    await page.getByRole('button', { name: /Ingresar/ }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});
