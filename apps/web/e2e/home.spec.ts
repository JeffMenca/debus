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
    ]) {
      await expect(page.getByRole('heading', { level: 2, name: title })).toBeVisible();
    }
    await expectNoHorizontalScroll(page);
  });

  test('takes a visitor to the login', async ({ page }) => {
    await noSession(page);
    await page.goto('/');

    await page.getByRole('link', { name: 'Iniciar sesión' }).click();

    await expect(page).toHaveURL(/\/login$/);
  });

  test('takes a visitor to the sign-up', async ({ page }) => {
    await noSession(page);
    await page.goto('/');

    await page.getByRole('link', { name: 'Crear cuenta' }).click();

    await expect(page).toHaveURL(/\/registro$/);
  });

  test('offers staff a way to their panel', async ({ page }) => {
    await restoreSession(page, 'BRANCH_ADMIN');
    await page.goto('/');

    await expect(page.getByRole('link', { name: 'Ir a mi panel' })).toHaveAttribute(
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

    await expect(page.getByRole('link', { name: 'Iniciar sesión' })).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test('keeps the keyboard focus on the page after signing out', async ({ page }) => {
    await restoreSession(page, 'CLIENT');
    await page.route('**/api/session/logout', (route) => route.fulfill({ status: 204 }));
    await page.goto('/');
    const signOut = page.getByRole('button', { name: 'Cerrar sesión' });
    await signOut.focus();

    await page.keyboard.press('Enter');

    await expect(page.getByRole('link', { name: 'Iniciar sesión' })).toBeFocused();
  });

  test('stops every animation when the visitor prefers reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await noSession(page);
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Crear cuenta' })).toBeVisible();

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
        const actions = page.locator('nav');
        await expect(actions).toBeVisible();
        await page.waitForTimeout(100);

        expect((await heading.boundingBox())?.y).toBe(whileChecking?.y);

        const logo = (await page.getByText('debus', { exact: true }).locator('..').boundingBox())!;
        const scene = (await page.locator('section').first().boundingBox())!;
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
        expect(right).toBeLessThanOrEqual(scene.x + scene.width);
        // The one-row layout must hold from 380px up.
        if (width >= 380) expect(sameRow).toBe(true);
        await expectNoHorizontalScroll(page);
      });
    }
  }
});

test('health endpoint responds', async ({ request }) => {
  const response = await request.get('/api/health');

  expect(response.ok()).toBe(true);
  expect(await response.json()).toEqual({ status: 'ok', service: 'web' });
});
