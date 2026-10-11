import { expect, type Page } from '@playwright/test';
import { latestLink } from './mailpit';

export const ADMIN_PASSWORD = 'clave-segura-1';

async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /Ingresar/ }).click();
}

// Signs in as the bootstrap admin of the local stack. The first time the account has no password, so
// it follows the same path a person would: ask for a link, read it in Mailpit and set one.
// Real specs must run with --workers=1: a new link ends the previous one.
export async function signInAsRealAdmin(page: Page, mailpit: string, email: string) {
  await signIn(page, email);
  try {
    await expect(page).toHaveURL(/\/admin$/, { timeout: 8_000 });
    return;
  } catch {
    // No password yet, or a different one: set it again below.
  }
  await page.goto('/recuperar');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByRole('button', { name: 'Enviar enlace' }).click();
  await expect(page.getByRole('heading', { name: 'Revisa tu correo' })).toBeVisible();
  await page.goto(await latestLink(mailpit, email, '/(?:restablecer|crear-contrasena)'));
  await page.getByLabel('Contraseña', { exact: true }).fill(ADMIN_PASSWORD);
  await page.getByLabel('Repite tu contraseña').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Guardar contraseña' }).click();
  await expect(page).toHaveURL(/\/login\?listo=1$/);
  await signIn(page, email);
  await expect(page).toHaveURL(/\/admin$/);
}
