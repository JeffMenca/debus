import { expect, type Page, test } from '@playwright/test';

const realApi = Boolean(process.env.E2E_REAL_API);
const session = (role: string, fullName = 'Ana López') => ({
  accessToken: 'a',
  accessExpiresIn: 900,
  user: {
    id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    fullName,
    email: 'ana@correo.com',
    role,
    branchId: null,
  },
});

const restoreSession = (page: Page, role: string, fullName?: string) =>
  page.route('**/api/session/refresh', (route) => route.fulfill({ json: session(role, fullName) }));
const noSession = (page: Page) =>
  page.route('**/api/session/refresh', (route) => route.fulfill({ status: 204 }));

// The access links of the header; the footer repeats some of them for visitors.
const header = (page: Page) => page.getByRole('navigation', { name: /^(Acceso|Tu cuenta)$/ });

async function expectNoHorizontalScroll(page: Page) {
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflows).toBe(false);
}

test.describe('home page', () => {
  test.skip(realApi, 'runs only without a real gateway');

  test('presents the brand and the benefits without horizontal scroll', async ({ page }) => {
    await noSession(page);
    await page.goto('/');

    await expect(
      page.getByRole('heading', { level: 1, name: 'Tu próximo viaje empieza aquí.' }),
    ).toBeVisible();
    for (const title of [
      'Compra tus boletos',
      'Elige tu asiento',
      'Alquila un bus para tu grupo',
      'Conectamos todo el país',
      'Preguntas frecuentes',
      '¿Viajas en grupo?',
    ]) {
      await expect(page.getByRole('heading', { level: 2, name: title })).toBeVisible();
    }
    await expectNoHorizontalScroll(page);
  });

  test('takes a visitor to the login', async ({ page }) => {
    await noSession(page);
    await page.goto('/');

    await header(page).getByRole('link', { name: 'Iniciar sesión' }).click();

    await expect(page).toHaveURL(/\/login$/);
  });

  test('takes a visitor to the sign-up', async ({ page }) => {
    await noSession(page);
    await page.goto('/');

    await header(page).getByRole('link', { name: 'Crear cuenta' }).click();

    await expect(page).toHaveURL(/\/registro$/);
  });

  test('offers staff a way to their panel', async ({ page }) => {
    await restoreSession(page, 'BRANCH_ADMIN');
    await page.goto('/');

    await expect(header(page).getByRole('link', { name: 'Ir a mi panel' })).toHaveAttribute(
      'href',
      '/sucursal',
    );
    await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Iniciar sesión' })).toHaveCount(0);
    await expectNoHorizontalScroll(page);
  });

  test('greets a client and lets them sign out without leaving the page', async ({ page }) => {
    await restoreSession(page, 'CLIENT');
    await page.route('**/api/session/logout', (route) => route.fulfill({ status: 204 }));
    await page.goto('/');

    await expect(page.getByText('Hola, Ana')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ir a mi panel' })).toHaveCount(0);
    await expectNoHorizontalScroll(page);

    await page.getByRole('button', { name: 'Cerrar sesión' }).click();

    await expect(header(page).getByRole('link', { name: 'Iniciar sesión' })).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test('keeps the keyboard focus on the page after signing out', async ({ page }) => {
    await restoreSession(page, 'CLIENT');
    await page.route('**/api/session/logout', (route) => route.fulfill({ status: 204 }));
    await page.goto('/');
    const signOut = page.getByRole('button', { name: 'Cerrar sesión' });
    await signOut.focus();

    await page.keyboard.press('Enter');

    await expect(header(page).getByRole('link', { name: 'Iniciar sesión' })).toBeFocused();
  });

  test('stops every animation when the visitor prefers reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await noSession(page);
    await page.goto('/');
    await expect(header(page).getByRole('link', { name: 'Crear cuenta' })).toBeVisible();

    const running = await page.evaluate(() =>
      document
        .getAnimations()
        .filter((animation): animation is CSSAnimation => animation instanceof CSSAnimation)
        .map((animation) => animation.animationName),
    );
    expect(running).toEqual([]);
  });
});

// The actions must never overlap the logo or overflow the scene, and the hero must not move when
// the session check ends.
const STATES = [
  { name: 'visitor', role: null, fullName: undefined },
  { name: 'staff', role: 'BRANCH_ADMIN', fullName: 'Alejandrina Fernández de la Cruz' },
  { name: 'client', role: 'CLIENT', fullName: 'Alejandrina Fernández de la Cruz' },
  { name: 'client with a short name', role: 'CLIENT', fullName: 'Ana López' },
] as const;

// Narrow widths around the point where the actions stop fitting next to the logo.
const WIDTHS = [320, 340, 359, 360, 374, 375, 379, 380, 390, 414, 768, 1440];
const DESKTOP_FROM = 768;

test.describe('header without layout jumps', () => {
  test.skip(realApi, 'runs only without a real gateway');

  for (const width of WIDTHS) {
    for (const state of STATES) {
      test(`${state.name} at ${width}px`, async ({ page }, testInfo) => {
        test.skip(
          width >= DESKTOP_FROM !== (testInfo.project.name === 'desktop'),
          'each width runs in its own project',
        );
        await page.setViewportSize({ width, height: 844 });
        let release!: () => void;
        const checked = new Promise<void>((resolve) => (release = resolve));
        await page.route('**/api/session/refresh', async (route) => {
          await checked;
          if (!state.role) return route.fulfill({ status: 204 });
          return route.fulfill({ json: session(state.role, state.fullName) });
        });
        await page.goto('/');
        const heading = page.getByRole('heading', { level: 1 });
        await expect(heading).toBeVisible();
        await page.waitForTimeout(900);
        const whileChecking = await heading.boundingBox();

        release();
        // The page has more navigation and another logo further down: the header is the hero's.
        const scene = page.locator('section').first();
        const actions = scene.locator('nav');
        await expect(actions).toBeVisible();
        await page.waitForTimeout(100);

        expect((await heading.boundingBox())?.y).toBe(whileChecking?.y);

        const logo = (await scene.getByText('debus', { exact: true }).locator('..').boundingBox())!;
        const sceneBox = (await scene.boundingBox())!;
        const controls = await actions.locator('> *').evaluateAll((nodes) =>
          nodes.map((node) => {
            const { left, right, top } = node.getBoundingClientRect();
            return { left, right, top };
          }),
        );
        const left = Math.min(...controls.map((c) => c.left));
        const right = Math.max(...controls.map((c) => c.right));
        const top = Math.min(...controls.map((c) => c.top));
        // Beside the logo they start after it; otherwise they sit fully below it.
        const sameRow = top < logo.y + logo.height;
        if (sameRow) expect(left).toBeGreaterThanOrEqual(logo.x + logo.width);
        else expect(top).toBeGreaterThanOrEqual(logo.y + logo.height);
        expect(right).toBeLessThanOrEqual(sceneBox.x + sceneBox.width);
        // The one-row layout must hold from 380px up.
        if (width >= 380) expect(sameRow).toBe(true);
        await expectNoHorizontalScroll(page);
      });
    }
  }
});

// Plain animations of the page that are not CSS animations of the document (SVG motion path).
const busPosition = (page: Page) =>
  page.getByTestId('map-bus').evaluate((bus) => {
    const { x, y } = bus.getBoundingClientRect();
    return `${Math.round(x)},${Math.round(y)}`;
  });

const FOOTER = 'Enlaces del pie';

test.describe('rest of the home page', () => {
  test.skip(realApi, 'runs only without a real gateway');

  test('draws the map of Guatemala with its six cities and a bus that moves', async ({ page }) => {
    await noSession(page);
    await page.goto('/');

    const map = page.getByRole('img', { name: /^Mapa de Guatemala/ });
    await map.scrollIntoViewIfNeeded();
    await expect(map).toBeVisible();
    await expect(map.locator('[data-city]')).toHaveCount(6);
    await expect(map.getByText('Quetzaltenango')).toBeVisible();
    await expect(
      page.getByText('Los buses de debus unen las sucursales de Guatemala', { exact: false }),
    ).toBeVisible();

    await page.waitForTimeout(1000);
    const before = await busPosition(page);
    await page.waitForTimeout(1500);
    expect(await busPosition(page)).not.toBe(before);
  });

  test('keeps the bus of the map still when the visitor prefers reduced motion', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await noSession(page);
    await page.goto('/');
    await page.getByRole('img', { name: /^Mapa de Guatemala/ }).scrollIntoViewIfNeeded();

    const before = await busPosition(page);
    await page.waitForTimeout(1200);

    expect(await busPosition(page)).toBe(before);
    const animations = await page.evaluate(() => document.getAnimations().length);
    expect(animations).toBe(0);
  });

  test('keeps the map labels readable and apart from each other, the pins and the routes, at every width', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'sets its own widths');
    await noSession(page);
    for (const width of [320, 340, 360, 390, 414, 430, 480, 536, 600, 768, 1024, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      const map = page.getByRole('img', { name: /^Mapa de Guatemala/ });
      await map.scrollIntoViewIfNeeded();
      await expect(map).toBeVisible();

      const measured = await map.evaluate((svg: SVGSVGElement) => {
        const scale = svg.getScreenCTM()!.a;
        const frame = svg.getBoundingClientRect();
        const labels = Array.from(svg.querySelectorAll('text')).map((text) => {
          const { left, right, top, bottom } = text.getBoundingClientRect();
          const city = text.closest('[data-city]');
          // The glyph box is taller than the letters, so it is trimmed to avoid false overlaps.
          const trim = (bottom - top) * 0.2;
          return {
            name: text.textContent!,
            isCity: Boolean(city),
            size: parseFloat(getComputedStyle(text).fontSize) * scale,
            rect: { left, right, top: top + trim, bottom: bottom - trim },
            inside: left >= frame.left && right <= frame.right,
          };
        });
        const pins = Array.from(svg.querySelectorAll('[data-city] circle')).map((circle) => {
          const { left, right, top, bottom } = circle.getBoundingClientRect();
          return { left, right, top, bottom };
        });
        const routes = Array.from(svg.querySelectorAll<SVGPathElement>('path[data-route]')).map(
          (path) => {
            const matrix = path.getScreenCTM()!;
            const length = path.getTotalLength();
            return Array.from({ length: 81 }, (_, i) => {
              const point = path.getPointAtLength((length * i) / 80);
              return { x: matrix.a * point.x + matrix.e, y: matrix.d * point.y + matrix.f };
            });
          },
        );
        return { labels, pins, routes };
      });

      const where = `at ${width}px`;
      for (const label of measured.labels) {
        expect(label.size, `${label.name} ${where}`).toBeGreaterThanOrEqual(label.isCity ? 12 : 11);
      }
      for (const label of measured.labels) {
        expect(label.inside, `${label.name} is cut off ${where}`).toBe(true);
      }
      const overlaps = (
        a: { left: number; right: number; top: number; bottom: number },
        b: typeof a,
      ) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      measured.labels.forEach((a, i) => {
        for (const b of measured.labels.slice(i + 1)) {
          expect(overlaps(a.rect, b.rect), `${a.name} and ${b.name} ${where}`).toBe(false);
        }
        for (const pin of measured.pins) {
          expect(overlaps(a.rect, pin), `${a.name} and a pin ${where}`).toBe(false);
        }
        if (!a.isCity) return;
        for (const route of measured.routes) {
          const crosses = route.some(
            ({ x, y }) =>
              x > a.rect.left && x < a.rect.right && y > a.rect.top && y < a.rect.bottom,
          );
          expect(crosses, `${a.name} and a route ${where}`).toBe(false);
        }
      });
    }
  });

  test('fills the column beside the map with three rows, centered against it from md', async ({
    page,
  }, testInfo) => {
    await noSession(page);
    await page.goto('/');

    const map = page.getByRole('img', { name: /^Mapa de Guatemala/ });
    await map.scrollIntoViewIfNeeded();
    const rows = page.getByRole('heading', { level: 3 });
    for (const title of [
      'Sucursales en todo el país',
      'Compra sin filas',
      'Tu boleto en tu correo',
    ]) {
      await expect(rows.filter({ hasText: title })).toBeVisible();
    }
    const heading = (await page
      .getByRole('heading', { name: 'Conectamos todo el país' })
      .boundingBox())!;
    const last = (await rows.filter({ hasText: 'Tu boleto en tu correo' }).boundingBox())!;
    const mapBox = (await map.boundingBox())!;
    if (testInfo.project.name === 'desktop') {
      const textCenter = (heading.y + last.y + last.height) / 2;
      expect(Math.abs(textCenter - (mapBox.y + mapBox.height / 2))).toBeLessThan(60);
    } else {
      expect(last.y + last.height).toBeLessThan(mapBox.y);
    }
  });

  test('has a scroll-down button on the hero edge that takes the visitor to the benefits', async ({
    page,
  }) => {
    await noSession(page);
    await page.goto('/');
    const button = page.getByRole('link', { name: 'Ver más contenido' });
    await expect(button).toBeVisible();

    const scene = (await page.locator('section').first().boundingBox())!;
    const box = (await button.boundingBox())!;
    expect(Math.abs(box.y + box.height / 2 - (scene.y + scene.height))).toBeLessThan(6);
    expect(Math.abs(box.x + box.width / 2 - (scene.x + scene.width / 2))).toBeLessThan(1);
    // The hero's illustration is hidden from assistive technology, so it is found by its label.
    const bus = (await page
      .locator('section')
      .first()
      .locator('svg[aria-label="Bus"]')
      .boundingBox())!;
    expect(box.y).toBeGreaterThan(bus.y + bus.height - 1);

    // It bounces on purpose, so it is never "stable" for the click check.
    await button.click({ force: true });

    await expect(page).toHaveURL(/#beneficios$/);
    const benefits = page.getByRole('heading', { level: 2, name: 'Compra tus boletos' });
    await expect
      .poll(async () => (await benefits.boundingBox())!.y, { timeout: 5000 })
      .toBeLessThan(200);
    expect(
      await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior),
    ).toBe('smooth');
  });

  test('bounces the scroll-down button, and keeps it still with reduced motion', async ({
    page,
  }) => {
    const sample = async () => {
      const ys: number[] = [];
      for (let i = 0; i < 12; i++) {
        ys.push((await page.getByRole('link', { name: 'Ver más contenido' }).boundingBox())!.y);
        await page.waitForTimeout(150);
      }
      return Math.max(...ys) - Math.min(...ys);
    };
    await noSession(page);
    await page.goto('/');
    await page.getByRole('link', { name: 'Ver más contenido' }).waitFor();
    const travel = await sample();
    expect(travel).toBeGreaterThan(2);
    expect(travel).toBeLessThanOrEqual(7);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await page.getByRole('link', { name: 'Ver más contenido' }).waitFor();
    expect(await sample()).toBe(0);
    expect(
      await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior),
    ).toBe('auto');
  });

  test('opens and closes the questions with the keyboard', async ({ page }) => {
    await noSession(page);
    await page.goto('/');
    const summary = page.getByText('¿Cómo pago mis boletos?');
    const answer = page.getByText('Con el saldo de tu cartera digital.', { exact: false });
    await summary.scrollIntoViewIfNeeded();
    await expect(answer).toBeHidden();

    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(answer).toBeVisible();
    await page.keyboard.press('Space');
    await expect(answer).toBeHidden();
    await page.keyboard.press('Space');
    await expect(answer).toBeVisible();
  });

  test('shows the four questions before the rental band', async ({ page }) => {
    await noSession(page);
    await page.goto('/');

    await expect(
      page.getByRole('heading', { level: 2, name: 'Preguntas frecuentes' }),
    ).toBeVisible();
    await expect(page.locator('details')).toHaveCount(4);
    const faq = (await page.getByRole('heading', { name: 'Preguntas frecuentes' }).boundingBox())!;
    const rental = (await page.getByRole('heading', { name: '¿Viajas en grupo?' }).boundingBox())!;
    expect(faq.y).toBeLessThan(rental.y);
  });

  test('offers a visitor the quote through the sign-up', async ({ page }) => {
    await noSession(page);
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 2, name: '¿Viajas en grupo?' })).toBeVisible();
    await page.getByRole('link', { name: 'Crea tu cuenta para pedir tu cotización' }).click();

    await expect(page).toHaveURL(/\/registro$/);
  });

  test('offers a signed-in client no quote link and no account links in the footer', async ({
    page,
  }) => {
    await restoreSession(page, 'CLIENT');
    await page.goto('/');
    await expect(page.getByText('Hola, Ana')).toBeVisible();

    await expect(page.getByRole('heading', { name: '¿Viajas en grupo?' })).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Crea tu cuenta para pedir tu cotización' }),
    ).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: FOOTER })).toHaveCount(0);
    await expect(page.getByRole('contentinfo')).toContainText('Hecho en Guatemala.');
  });

  test('sends staff from the footer to their panel', async ({ page }) => {
    await restoreSession(page, 'BRANCH_ADMIN');
    await page.goto('/');

    const nav = page.getByRole('navigation', { name: FOOTER });
    await expect(nav.getByRole('link')).toHaveText(['Ir a mi panel']);
    await expect(nav.getByRole('link')).toHaveAttribute('href', '/sucursal');
  });

  for (const [name, path] of [
    ['Iniciar sesión', /\/login$/],
    ['Crear cuenta', /\/registro$/],
    ['¿Olvidaste tu contraseña?', /\/recuperar$/],
  ] as const) {
    test(`footer link "${name}" takes a visitor there`, async ({ page }) => {
      await noSession(page);
      await page.goto('/');

      await page.getByRole('navigation', { name: FOOTER }).getByRole('link', { name }).click();

      await expect(page).toHaveURL(path);
    });
  }

  test('ends with the footer of the page and the current year', async ({ page }) => {
    await noSession(page);
    await page.goto('/');

    const footer = page.getByRole('contentinfo');
    await expect(footer).toContainText(`© ${new Date().getFullYear()} debus. Hecho en Guatemala.`);
    await expect(footer).toContainText('Boletos, viajes y alquiler de buses en Guatemala.');
    const footerBox = (await footer.boundingBox())!;
    const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(Math.round(footerBox.y + footerBox.height)).toBe(pageHeight);
  });

  test('keeps the visitor, staff and client page free of horizontal scroll from 320 to 1440 px', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'sets its own widths');
    for (const [role, fullName] of [
      [null, undefined],
      ['BRANCH_ADMIN', 'Alejandrina Fernández de la Cruz'],
      ['CLIENT', 'Alejandrina Fernández de la Cruz'],
    ] as const) {
      await page.unroute('**/api/session/refresh');
      if (role) await restoreSession(page, role, fullName);
      else await noSession(page);
      for (const width of [320, 340, 360, 390, 414, 600, 768, 1024, 1280, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        await page.goto('/');
        await expect(page.getByRole('contentinfo')).toBeVisible();
        await page.waitForTimeout(150);
        await expectNoHorizontalScroll(page);
      }
    }
  });
});

test('health endpoint responds', async ({ request }) => {
  const response = await request.get('/api/health');

  expect(response.ok()).toBe(true);
  expect(await response.json()).toEqual({ status: 'ok', service: 'web' });
});
