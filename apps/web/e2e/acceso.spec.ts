import { type BrowserContext, expect, type Page, test } from '@playwright/test';

const realApi = Boolean(process.env.E2E_REAL_API);
const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
};
const session = (role: string) => ({
  accessToken: 'a',
  accessExpiresIn: 900,
  user: {
    id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    fullName: 'Marta Ruiz',
    email: 'marta@correo.com',
    role,
    branchId: null,
  },
});

// The gateway lives on another origin, so the browser sends a preflight before each call.
const mockGateway = (page: Page, path: string, reply: { status?: number; json?: unknown }) =>
  page.route(`**/api/administracion/auth/${path}`, (route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: cors })
      : route.fulfill({ status: reply.status ?? 200, json: reply.json, headers: cors }),
  );

async function expectNoHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(
    false,
  );
}

test.describe('acceso con gateway simulado', () => {
  test.skip(realApi, 'runs only without a real gateway');

  test('inicia sesión y llega al panel de su rol', async ({ page, baseURL }) => {
    await page.route('**/api/sesion/refresh', (route) => route.fulfill({ status: 401, json: {} }));
    await page.route('**/api/sesion/login', (route) =>
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
    await expect(page.getByRole('heading', { name: 'Hola, Marta Ruiz' })).toBeVisible();

    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('vuelve a la página que se pidió antes de ingresar', async ({ page, baseURL }) => {
    await page.route('**/api/sesion/refresh', (route) => route.fulfill({ status: 401, json: {} }));
    await page.route('**/api/sesion/login', (route) =>
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

  test('muestra el error del servidor sin perder lo escrito', async ({ page }) => {
    await page.route('**/api/sesion/login', (route) =>
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

  test('explica los campos mal escritos antes de llamar al servidor', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Correo electrónico').fill('no-es-correo');
    await page.getByRole('button', { name: /Ingresar/ }).click();

    await expect(page.getByText('Escribe un correo válido, como tu@correo.com.')).toBeVisible();
    await expect(page.getByText('Escribe tu contraseña.')).toBeVisible();
  });

  test('crea una cuenta sin contraseña y pide revisar el correo', async ({ page }) => {
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

  test('pide el correo para recuperar la contraseña', async ({ page }) => {
    await mockGateway(page, 'password/forgot', { status: 202, json: { message: 'ok' } });
    await page.goto('/recuperar');

    await page.getByLabel('Correo electrónico').fill('ana@correo.com');
    await page.getByRole('button', { name: 'Enviar enlace' }).click();

    await expect(page.getByRole('heading', { name: 'Revisa tu correo' })).toBeVisible();
    await expect(page.getByText(/Vence en 1 hora/)).toBeVisible();
  });

  test('crea la contraseña desde el enlace', async ({ page }) => {
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

  test('ofrece un enlace nuevo cuando venció', async ({ page }) => {
    await mockGateway(page, 'links/status', {
      json: { state: 'expired', purpose: 'PASSWORD_RESET' },
    });
    await mockGateway(page, 'links/renew', { status: 202, json: { message: 'ok' } });
    await page.goto('/restablecer?token=abc');

    await page.getByRole('button', { name: 'Enviar un enlace nuevo' }).click();

    await expect(page.getByRole('heading', { name: 'Revisa tu correo' })).toBeVisible();
  });

  test('invita a ingresar cuando el enlace ya se usó', async ({ page }) => {
    await mockGateway(page, 'links/status', { json: { state: 'used', purpose: 'ACTIVATION' } });
    await page.goto('/crear-contrasena?token=abc');

    await expect(page.getByRole('heading', { name: 'Este enlace ya se usó' })).toBeVisible();
    await page.getByRole('link', { name: 'Ir a iniciar sesión' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('explica un enlace inválido o incompleto', async ({ page }) => {
    await mockGateway(page, 'links/status', { json: { state: 'invalid' } });
    await page.goto('/crear-contrasena?token=x');
    await expect(page.getByRole('heading', { name: 'No pudimos abrir este enlace' })).toBeVisible();

    await page.goto('/restablecer');
    await expect(page.getByRole('heading', { name: 'No pudimos abrir este enlace' })).toBeVisible();
    await page.getByRole('link', { name: 'Pedir un enlace nuevo' }).click();
    await expect(page).toHaveURL(/\/recuperar$/);
  });

  test('protege las áreas privadas', async ({ page }) => {
    await page.goto('/sucursal');

    await expect(page).toHaveURL(/\/login\?siguiente=%2Fsucursal$/);
  });

  test('rechaza un inicio de sesión que viene de otro sitio', async ({ request }) => {
    const response = await request.post('/api/sesion/login', {
      headers: { origin: 'https://evil.example' },
      data: { email: 'a@b.com', password: 'x' },
    });

    expect(response.status()).toBe(403);
  });

  for (const [name, encoded] of [
    ['un tabulador', '%2F%09%2Fevil.example'],
    ['un salto de línea', '%2F%0A%2Fevil.example'],
    ['un retorno de carro', '%2F%0D%2Fevil.example'],
    ['dos barras', '%2F%2Fevil.example'],
    ['una barra invertida', '%2F%5Cevil.example'],
  ] as const) {
    test(`no sale del sitio si siguiente trae ${name}`, async ({ page, baseURL }) => {
      const visited: string[] = [];
      await page.route('**://evil.example/**', (route) => {
        visited.push(route.request().url());
        return route.abort();
      });
      await page.route('**/api/sesion/refresh', (route) => route.fulfill({ status: 204 }));
      await page.route('**/api/sesion/login', (route) =>
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

  test('muestra el aviso de cuenta bloqueada con el cuerpo real del servidor', async ({ page }) => {
    await page.route('**/api/sesion/login', (route) =>
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

  test('una visita sin sesión no deja errores en la consola ni en la red', async ({ page }) => {
    const problems: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(message.text());
    });
    page.on('pageerror', (error) => problems.push(error.message));
    const refresh = page.waitForResponse((response) =>
      response.url().endsWith('/api/sesion/refresh'),
    );

    await page.goto('/login');

    expect((await refresh).status()).toBe(204);
    expect(problems).toEqual([]);
  });

  test('si el servicio no responde no cierra la sesión: avisa y deja reintentar', async ({
    page,
    baseURL,
  }) => {
    await page
      .context()
      .addCookies([{ name: 'debus_refresh', value: 'x', url: baseURL!, httpOnly: true }]);
    let available = false;
    await page.route('**/api/sesion/refresh', (route) =>
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

    await expect(page.getByRole('heading', { name: 'Hola, Marta Ruiz' })).toBeVisible();
  });

  test('si la sesión terminó va al ingreso y vuelve después a donde estaba', async ({
    page,
    baseURL,
  }) => {
    await page
      .context()
      .addCookies([{ name: 'debus_refresh', value: 'x', url: baseURL!, httpOnly: true }]);
    await page.route('**/api/sesion/refresh', (route) =>
      route.fulfill({
        status: 401,
        json: {},
        headers: { 'set-cookie': 'debus_refresh=; Path=/; Max-Age=0' },
      }),
    );

    await page.goto('/sucursal');

    await expect(page).toHaveURL(/\/login\?siguiente=%2Fsucursal$/);
  });

  test('los enlaces de texto muestran el anillo de foco del diseño', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Correo electrónico').focus();
    await page.keyboard.press('Tab');

    const link = page.getByRole('link', { name: '¿La olvidaste?' });
    await expect(link).toBeFocused();
    expect(await link.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
    expect(await link.evaluate((el) => getComputedStyle(el).outlineWidth)).toBe('2px');
  });

  test.describe('con dos pestañas del mismo navegador', () => {
    const CLEARED = 'debus_refresh=; Path=/; Max-Age=0';

    // A stand-in for the web session routes that behaves like the real refresh rotation:
    // every token works once, and a token used a second time ends the whole session.
    async function mockRotatingSession(context: BrowserContext, baseURL: string) {
      const state = { current: 'token-0', revoked: false, rejected: 0, counter: 0 };
      const used = new Set<string>();
      await context.addCookies([
        { name: 'debus_refresh', value: state.current, url: baseURL, httpOnly: true },
      ]);
      await context.route('**/api/sesion/refresh', async (route) => {
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
      await context.route('**/api/sesion/logout', (route) =>
        route.fulfill({ status: 204, headers: { 'set-cookie': CLEARED } }),
      );
      return state;
    }

    test('siguen con la sesión cuando recargan a la vez', async ({ context, baseURL }) => {
      const state = await mockRotatingSession(context, baseURL!);
      const first = await context.newPage();
      const second = await context.newPage();
      for (const page of [first, second]) {
        await page.goto('/sucursal');
        await expect(page.getByRole('heading', { name: 'Hola, Marta Ruiz' })).toBeVisible();
      }

      await Promise.all([first.reload(), second.reload()]);

      for (const page of [first, second]) {
        await expect(page.getByRole('heading', { name: 'Hola, Marta Ruiz' })).toBeVisible();
        expect(page.url()).toMatch(/\/sucursal$/);
      }
      expect(state.rejected).toBe(0);
    });

    test('salen juntas cuando una cierra la sesión', async ({ context, baseURL }) => {
      await mockRotatingSession(context, baseURL!);
      const first = await context.newPage();
      const second = await context.newPage();
      for (const page of [first, second]) {
        await page.goto('/sucursal');
        await expect(page.getByRole('heading', { name: 'Hola, Marta Ruiz' })).toBeVisible();
      }

      await first.getByRole('button', { name: 'Cerrar sesión' }).click();

      await expect(first).toHaveURL(/\/login/);
      await expect(second).toHaveURL(/\/login/);
    });
  });

  test('el foco del teclado se ve en los campos', async ({ page }) => {
    await page.goto('/login');
    await page.keyboard.press('Tab');
    await page.getByLabel('Correo electrónico').focus();

    const ring = await page
      .getByLabel('Correo electrónico')
      .evaluate((el) => getComputedStyle(el).boxShadow);
    expect(ring).not.toBe('none');
  });

  test('anima la escena y respeta reduced motion', async ({ page }) => {
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
    test(`sin scroll horizontal ni más de un botón principal en ${path}`, async ({ page }) => {
      await mockGateway(page, 'links/status', { json: { state: 'valid', purpose: 'ACTIVATION' } });
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 2 })).toBeVisible();

      await expectNoHorizontalScroll(page);
      await expect(page.locator('main button[type="submit"]')).toHaveCount(1);
    });
  }
});
