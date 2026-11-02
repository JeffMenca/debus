import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { mockAdminGateway } from './support/admin-gateway';
import {
  CORS_HEADERS as cors,
  expectNoHorizontalScroll,
  fulfillJson,
  openMenuOnPhone,
  sessionFor,
} from './support/session';

const realApi = Boolean(process.env.E2E_REAL_API);
const session = (role: string) => sessionFor(role);
// The branch admin lands on the panel, which greets by the hour of Guatemala.
const BRANCH_ADMIN_HOME = {
  level: 1,
  name: /^(Buenos días|Buenas tardes|Buenas noches), Marta$/,
} as const;

const mockGateway = (page: Page, path: string, reply: { status?: number; json?: unknown }) =>
  page.route(`**/api/administracion/auth/${path}`, (route) =>
    fulfillJson(route, reply.status ?? 200, reply.json),
  );

test.describe('access with a mocked gateway', () => {
  test.skip(realApi, 'runs only without a real gateway');

  // A gateway running on this machine must never answer these tests: whatever a page asks that the
  // test did not simulate gets a plain failure, never a 401 that would sign the session out.
  test.beforeEach(({ page }) =>
    page.route('**/api/administracion/**', (route) =>
      fulfillJson(route, 503, { statusCode: 503, message: 'Not simulated in this test.' }),
    ),
  );

  test('the DPI only takes the digits it can use', async ({ page }) => {
    await page.goto('/registro');
    const dpi = page.getByLabel('DPI');

    await dpi.pressSequentially('12345678901234567');
    await expect(dpi).toHaveValue('1234567890123');

    await dpi.fill('2345 67890 1234');
    await expect(dpi).toHaveValue('2345678901234');

    await dpi.fill('');
    await dpi.pressSequentially('abc');
    await expect(dpi).toHaveValue('');
  });

  test('signs in and reaches the dashboard of its role', async ({ page, baseURL }) => {
    await page.route('**/api/session/refresh', (route) => route.fulfill({ status: 401, json: {} }));
    await page.route('**/api/session/login', (route) =>
      route.fulfill({ json: session('BRANCH_ADMIN') }),
    );
    await page.goto('/login');
    // The mocked login cannot set the http only cookie, so the test places it for proxy.ts.
    await page
      .context()
      .addCookies([{ name: 'debus_refresh', value: 'x', url: baseURL!, httpOnly: true }]);

    await expect(page.getByRole('heading', { name: 'Hola de nuevo' })).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Tu próximo viaje empieza aquí.' }),
    ).toBeVisible();
    await page.getByLabel('Correo electrónico').fill('marta@correo.com');
    await page.getByLabel('Contraseña', { exact: true }).fill('clave-segura-1');
    await page.getByRole('button', { name: /Ingresar/ }).click();

    await expect(page).toHaveURL(/\/sucursal$/);
    await expect(page.getByRole('heading', BRANCH_ADMIN_HOME)).toBeVisible();

    await openMenuOnPhone(page);
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('returns to the page requested before signing in', async ({ page, baseURL }) => {
    await mockAdminGateway(page);
    await page.route('**/api/session/refresh', (route) => route.fulfill({ status: 401, json: {} }));
    await page.route('**/api/session/login', (route) =>
      route.fulfill({ json: session('SYSTEM_ADMIN') }),
    );
    await page
      .context()
      .addCookies([{ name: 'debus_refresh', value: 'x', url: baseURL!, httpOnly: true }]);
    await page.goto('/login?siguiente=%2Fadmin');

    await page.getByLabel('Correo electrónico').fill('marta@correo.com');
    await page.getByLabel('Contraseña', { exact: true }).fill('clave-segura-1');
    await page.getByRole('button', { name: /Ingresar/ }).click();

    await expect(page).toHaveURL(/\/admin$/);
  });

  test('shows the server error without losing what was typed', async ({ page }) => {
    await page.route('**/api/session/login', (route) =>
      route.fulfill({
        status: 401,
        json: {
          statusCode: 401,
          error: 'Unauthorized',
          message: 'El correo o la contraseña no coinciden.',
        },
      }),
    );
    await page.goto('/login');
    await page.getByLabel('Correo electrónico').fill('marta@correo.com');
    await page.getByLabel('Contraseña', { exact: true }).fill('mala-clave-1');
    await page.getByRole('button', { name: /Ingresar/ }).click();

    // Next adds its own alert outside <main> to announce route changes.
    await expect(page.getByRole('main').getByRole('alert')).toHaveText(
      'El correo o la contraseña no coinciden.',
    );
    await expect(page.getByLabel('Correo electrónico')).toHaveValue('marta@correo.com');
  });

  test('explains invalid fields before calling the server', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Correo electrónico').fill('no-es-correo');
    await page.getByRole('button', { name: /Ingresar/ }).click();

    await expect(page.getByText('Escribe un correo válido, como tu@correo.com.')).toBeVisible();
    await expect(page.getByText('Escribe tu contraseña.')).toBeVisible();
  });

  test('creates an account without a password and asks to check the email', async ({ page }) => {
    let body: unknown;
    await page.route('**/api/administracion/auth/signup', async (route) => {
      if (route.request().method() === 'OPTIONS') {
        return route.fulfill({ status: 204, headers: cors });
      }
      body = route.request().postDataJSON();
      return route.fulfill({ status: 202, json: { message: 'ok' }, headers: cors });
    });
    await page.goto('/registro');

    await expect(page.getByLabel(/Contraseña/)).toHaveCount(0);
    await page.getByLabel('Nombre completo').fill('Ana López');
    await page.getByLabel('DPI').fill('2345 67890 1234');
    await page.getByLabel('Teléfono').fill('5555 4444');
    await page.getByLabel('Correo').fill('ana@correo.com');
    await page.getByRole('button', { name: /Crear cuenta/ }).click();

    await expect(page.getByRole('heading', { name: 'Revisa tu correo' })).toBeVisible();
    await expect(page.getByText(/ana@correo.com/)).toBeVisible();
    expect(body).toEqual({
      fullName: 'Ana López',
      email: 'ana@correo.com',
      dpi: '2345678901234',
      phone: '55554444',
    });
    await expectNoHorizontalScroll(page);
  });

  test('asks for the email to recover the password', async ({ page }) => {
    await mockGateway(page, 'password/forgot', { status: 202, json: { message: 'ok' } });
    await page.goto('/recuperar');

    await page.getByLabel('Correo electrónico').fill('ana@correo.com');
    await page.getByRole('button', { name: 'Enviar enlace' }).click();

    await expect(page.getByRole('heading', { name: 'Revisa tu correo' })).toBeVisible();
    await expect(page.getByText(/Vence en 1 hora/)).toBeVisible();
  });

  test('sets the password from the link', async ({ page }) => {
    await mockGateway(page, 'links/status', { json: { state: 'valid', purpose: 'ACTIVATION' } });
    await mockGateway(page, 'password', { status: 204 });
    await page.goto('/crear-contrasena?token=abc');

    await page.getByLabel('Contraseña', { exact: true }).fill('clave-segura-1');
    await page.getByLabel('Repite tu contraseña').fill('clave-segura-1');
    await page.getByRole('button', { name: 'Guardar contraseña' }).click();

    await expect(page).toHaveURL(/\/login\?listo=1$/);
    await expect(page.getByRole('status')).toHaveText(
      'Tu contraseña quedó lista. Ya puedes ingresar.',
    );
  });

  test('offers a new link when it expired', async ({ page }) => {
    await mockGateway(page, 'links/status', {
      json: { state: 'expired', purpose: 'PASSWORD_RESET' },
    });
    await mockGateway(page, 'links/renew', { status: 202, json: { message: 'ok' } });
    await page.goto('/restablecer?token=abc');

    await page.getByRole('button', { name: 'Enviar un enlace nuevo' }).click();

    await expect(page.getByRole('heading', { name: 'Revisa tu correo' })).toBeVisible();
  });

  test('invites to sign in when the link was already used', async ({ page }) => {
    await mockGateway(page, 'links/status', { json: { state: 'used', purpose: 'ACTIVATION' } });
    await page.goto('/crear-contrasena?token=abc');

    await expect(page.getByRole('heading', { name: 'Este enlace ya se usó' })).toBeVisible();
    await page.getByRole('link', { name: 'Ir a iniciar sesión' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('explains an invalid or incomplete link', async ({ page }) => {
    await mockGateway(page, 'links/status', { json: { state: 'invalid' } });
    await page.goto('/crear-contrasena?token=x');
    await expect(page.getByRole('heading', { name: 'No pudimos abrir este enlace' })).toBeVisible();

    await page.goto('/restablecer');
    await expect(page.getByRole('heading', { name: 'No pudimos abrir este enlace' })).toBeVisible();
    await page.getByRole('link', { name: 'Pedir un enlace nuevo' }).click();
    await expect(page).toHaveURL(/\/recuperar$/);
  });

  test('protects the private areas', async ({ page }) => {
    await page.goto('/sucursal');

    await expect(page).toHaveURL(/\/login\?siguiente=%2Fsucursal$/);
  });

  test('rejects a sign-in coming from another site', async ({ request }) => {
    const response = await request.post('/api/session/login', {
      headers: { origin: 'https://evil.example' },
      data: { email: 'a@b.com', password: 'x' },
    });

    expect(response.status()).toBe(403);
  });

  for (const [name, encoded] of [
    ['a tab', '%2F%09%2Fevil.example'],
    ['a line break', '%2F%0A%2Fevil.example'],
    ['a carriage return', '%2F%0D%2Fevil.example'],
    ['two slashes', '%2F%2Fevil.example'],
    ['a backslash', '%2F%5Cevil.example'],
  ] as const) {
    test(`stays on the site when siguiente carries ${name}`, async ({ page, baseURL }) => {
      const visited: string[] = [];
      await page.route('**://evil.example/**', (route) => {
        visited.push(route.request().url());
        return route.abort();
      });
      await page.route('**/api/session/refresh', (route) => route.fulfill({ status: 204 }));
      await page.route('**/api/session/login', (route) =>
        route.fulfill({ json: session('CLIENT') }),
      );
      await page.goto(`/login?siguiente=${encoded}`);

      await page.getByLabel('Correo electrónico').fill('marta@correo.com');
      await page.getByLabel('Contraseña', { exact: true }).fill('clave-segura-1');
      await page.getByRole('button', { name: /Ingresar/ }).click();

      // A client goes to the home page; the hostile address is ignored.
      await expect(page).toHaveURL(`${baseURL}/`);
      expect(visited).toEqual([]);
    });
  }

  test('shows the locked account notice with the real server body', async ({ page }) => {
    await page.route('**/api/session/login', (route) =>
      route.fulfill({
        status: 423,
        // The real body has no "error" field.
        json: {
          statusCode: 423,
          message:
            'Por seguridad bloqueamos tu cuenta 15 minutos. Intenta más tarde o restablece tu contraseña.',
        },
      }),
    );
    await page.goto('/login');
    await page.getByLabel('Correo electrónico').fill('marta@correo.com');
    await page.getByLabel('Contraseña', { exact: true }).fill('mala-clave-1');
    await page.getByRole('button', { name: /Ingresar/ }).click();

    await expect(page.getByRole('main').getByRole('alert')).toHaveText(
      'Por seguridad bloqueamos tu cuenta 15 minutos. Intenta más tarde o restablece tu contraseña.',
    );
  });

  test('a visit without a session leaves no errors in the console or the network', async ({
    page,
  }) => {
    const problems: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(message.text());
    });
    page.on('pageerror', (error) => problems.push(error.message));
    const refresh = page.waitForResponse((response) =>
      response.url().endsWith('/api/session/refresh'),
    );

    await page.goto('/login');

    expect((await refresh).status()).toBe(204);
    expect(problems).toEqual([]);
  });

  test('when the service does not answer it keeps the session: warns and allows a retry', async ({
    page,
    baseURL,
  }) => {
    await page
      .context()
      .addCookies([{ name: 'debus_refresh', value: 'x', url: baseURL!, httpOnly: true }]);
    let available = false;
    await page.route('**/api/session/refresh', (route) =>
      available
        ? route.fulfill({ json: session('BRANCH_ADMIN') })
        : route.fulfill({ status: 503, json: { message: 'No pudimos conectarnos.' } }),
    );
    await page.goto('/sucursal');

    await expect(page.getByRole('main').getByRole('alert')).toHaveText(
      'No pudimos conectarnos. Revisa tu conexión e intenta de nuevo.',
    );
    expect(page.url()).toMatch(/\/sucursal$/);

    available = true;
    await page.getByRole('button', { name: 'Reintentar' }).click();

    await expect(page.getByRole('heading', BRANCH_ADMIN_HOME)).toBeVisible();
  });

  test('when the session ended it goes to sign-in and returns to where it was', async ({
    page,
    baseURL,
  }) => {
    await page
      .context()
      .addCookies([{ name: 'debus_refresh', value: 'x', url: baseURL!, httpOnly: true }]);
    await page.route('**/api/session/refresh', (route) =>
      route.fulfill({
        status: 401,
        json: {},
        headers: { 'set-cookie': 'debus_refresh=; Path=/; Max-Age=0' },
      }),
    );

    await page.goto('/sucursal');

    await expect(page).toHaveURL(/\/login\?siguiente=%2Fsucursal$/);
  });

  test('text links show the focus ring of the design', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Correo electrónico').focus();
    await page.keyboard.press('Tab');

    const link = page.getByRole('link', { name: '¿La olvidaste?' });
    await expect(link).toBeFocused();
    expect(await link.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
    expect(await link.evaluate((el) => getComputedStyle(el).outlineWidth)).toBe('2px');
  });

  test.describe('with two tabs of the same browser', () => {
    const CLEARED = 'debus_refresh=; Path=/; Max-Age=0';

    // A stand-in for the web session routes that behaves like the real refresh rotation:
    // every token works once, and a token used a second time ends the whole session.
    async function mockRotatingSession(context: BrowserContext, baseURL: string) {
      const state = { current: 'token-0', revoked: false, rejected: 0, counter: 0 };
      const used = new Set<string>();
      await context.addCookies([
        { name: 'debus_refresh', value: state.current, url: baseURL, httpOnly: true },
      ]);
      await context.route('**/api/session/refresh', async (route) => {
        // What the browser would send right now.
        const sent = (await context.cookies()).find((c) => c.name === 'debus_refresh')?.value;
        // The gateway takes a moment, so two refreshes that start together overlap.
        await new Promise((resolve) => setTimeout(resolve, 150));
        if (state.revoked || !sent || sent !== state.current || used.has(sent)) {
          state.revoked = true;
          state.rejected += 1;
          return route.fulfill({ status: 401, json: {}, headers: { 'set-cookie': CLEARED } });
        }
        used.add(sent);
        state.current = `token-${(state.counter += 1)}`;
        return route.fulfill({
          json: session('BRANCH_ADMIN'),
          headers: { 'set-cookie': `debus_refresh=${state.current}; Path=/; HttpOnly` },
        });
      });
      await context.route('**/api/session/logout', (route) =>
        route.fulfill({ status: 204, headers: { 'set-cookie': CLEARED } }),
      );
      return state;
    }

    test('keep the session when they reload at the same time', async ({ context, baseURL }) => {
      const state = await mockRotatingSession(context, baseURL!);
      const first = await context.newPage();
      const second = await context.newPage();
      for (const page of [first, second]) {
        await page.goto('/sucursal');
        await expect(page.getByRole('heading', BRANCH_ADMIN_HOME)).toBeVisible();
      }

      await Promise.all([first.reload(), second.reload()]);

      for (const page of [first, second]) {
        await expect(page.getByRole('heading', BRANCH_ADMIN_HOME)).toBeVisible();
        expect(page.url()).toMatch(/\/sucursal$/);
      }
      expect(state.rejected).toBe(0);
    });

    test('sign out together when one signs out', async ({ context, baseURL }) => {
      await mockRotatingSession(context, baseURL!);
      const first = await context.newPage();
      const second = await context.newPage();
      for (const page of [first, second]) {
        await page.goto('/sucursal');
        await expect(page.getByRole('heading', BRANCH_ADMIN_HOME)).toBeVisible();
      }

      await openMenuOnPhone(first);
      await first.getByRole('button', { name: 'Cerrar sesión' }).click();

      await expect(first).toHaveURL(/\/login/);
      await expect(second).toHaveURL(/\/login/);
    });
  });

  test('keyboard focus is visible on the fields', async ({ page }) => {
    await page.goto('/login');
    await page.keyboard.press('Tab');
    await page.getByLabel('Correo electrónico').focus();

    const ring = await page
      .getByLabel('Correo electrónico')
      .evaluate((el) => getComputedStyle(el).boxShadow);
    expect(ring).not.toBe('none');
  });

  test('animates the scene and respects reduced motion', async ({ page }) => {
    const animated = () =>
      page.evaluate(
        () =>
          [...document.querySelectorAll('*')].filter(
            (el) => getComputedStyle(el).animationName !== 'none',
          ).length,
      );

    await page.goto('/login');
    expect(await animated()).toBeGreaterThan(0);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    expect(await animated()).toBe(0);
  });

  for (const path of [
    '/login',
    '/registro',
    '/recuperar',
    '/crear-contrasena?token=x',
    '/restablecer?token=x',
  ]) {
    test(`has no horizontal scroll and a single primary button on ${path}`, async ({ page }) => {
      await mockGateway(page, 'links/status', { json: { state: 'valid', purpose: 'ACTIVATION' } });
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 2 })).toBeVisible();

      await expectNoHorizontalScroll(page);
      await expect(page.locator('main button[type="submit"]')).toHaveCount(1);
    });
  }
});
