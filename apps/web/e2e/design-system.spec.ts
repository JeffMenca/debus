import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll } from './support/session';

test('the design system page shows every base piece', async ({ page }) => {
  await page.goto('/design-system');

  await expect(page.getByRole('heading', { level: 1, name: 'Sistema de diseño' })).toBeVisible();
  await expect(page.getByLabel('Fecha de pago')).toHaveAttribute('type', 'date');
  await expect(page.getByRole('table', { name: 'Buses de ejemplo' })).toBeVisible();
  await page.getByRole('button', { name: 'Abrir diálogo de ejemplo' }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByRole('alertdialog')).toBeHidden();
  await expectNoHorizontalScroll(page);
});

test('the design system page is not indexed and animations respect reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/design-system');

  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  const animated = await page.evaluate(
    () =>
      [...document.querySelectorAll('main *')].filter(
        (el) => getComputedStyle(el).animationName !== 'none',
      ).length,
  );
  expect(animated).toBe(0);
});
