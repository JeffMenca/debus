import { type APIRequestContext, type Browser, expect } from '@playwright/test';
import { latestLink } from './mailpit';
import { ACTION_TIMEOUT } from './real-fleet';

export const CLIENT_PASSWORD = 'clave-segura-1';

// Signs a client up through the API and sets the password with the emailed link, like a person.
export async function signUpClient(
  api: APIRequestContext,
  mailpit: string,
  email: string,
  fullName: string,
) {
  const signup = await api.post('/api/administracion/auth/signup', {
    data: { fullName, email, dpi: '2345678901234', phone: '55550000' },
  });
  expect(signup.status()).toBe(202);
  const link = await latestLink(mailpit, email, '/crear-contrasena');
  const token = new URL(link, 'http://localhost').searchParams.get('token');
  const created = await api.post('/api/administracion/auth/password', {
    data: { token, password: CLIENT_PASSWORD },
  });
  expect(created.ok()).toBe(true);
  const login = await api.post('/api/administracion/auth/login', {
    data: { email, password: CLIENT_PASSWORD },
  });
  expect(login.status()).toBe(200);
  const { accessToken, user } = (await login.json()) as {
    accessToken: string;
    user: { id: string };
  };
  return { accessToken, clientId: user.id, headers: { authorization: `Bearer ${accessToken}` } };
}

// The same client in a browser of its own, signed in through the login screen.
export async function signInClientPage(browser: Browser, baseURL: string, email: string) {
  const context = await browser.newContext({ baseURL });
  context.setDefaultTimeout(ACTION_TIMEOUT);
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(CLIENT_PASSWORD);
  await page.getByRole('button', { name: /Ingresar/ }).click();
  // A client lands on the home page.
  await expect(page).toHaveURL(new RegExp(`^${baseURL}/?$`));
  return { page, context };
}
