import { expect, type Page, type Route } from '@playwright/test';

export const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
};

export const sessionFor = (
  role: string,
  branchId: string | null = null,
  fullName = 'Marta Ruiz',
) => ({
  accessToken: 'a',
  accessExpiresIn: 900,
  user: {
    id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    fullName,
    email: 'marta@correo.com',
    role,
    branchId,
  },
});

// The gateway lives on another origin, so the browser sends a preflight before each call.
export const fulfillJson = (route: Route, status: number, json?: unknown) =>
  route.request().method() === 'OPTIONS'
    ? route.fulfill({ status: 204, headers: CORS_HEADERS })
    : route.fulfill({ status, json, headers: CORS_HEADERS });

export async function signInAs(
  page: Page,
  baseURL: string,
  role: string,
  branchId: string | null = null,
) {
  await page.route('**/api/session/refresh', (route) =>
    route.fulfill({ json: sessionFor(role, branchId) }),
  );
  // A mocked sign-in cannot set the http only cookie, so the test places it for proxy.ts.
  await page
    .context()
    .addCookies([{ name: 'debus_refresh', value: 'x', url: baseURL, httpOnly: true }]);
}

export async function expectNoHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(
    false,
  );
}

// On a phone the menu lives in a sheet: open it before using anything inside the sidebar. It
// goes by the viewport, not by what is visible yet, because the shell appears once the session is back.
export async function openMenuOnPhone(page: Page) {
  const width = page.viewportSize()?.width ?? Infinity;
  if (width < 768) await page.getByRole('button', { name: 'Abrir menú' }).click();
}
