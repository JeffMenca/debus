import { expect, test } from '@playwright/test';

// Before the page is interactive (or when scripts never load) a native submit would be a GET that
// writes the address and the password in the URL, the history and the server logs.
test.describe('the login without scripts', () => {
  test.use({ javaScriptEnabled: false });

  test('never sends the password in the address', async ({ page }) => {
    await page.goto('/login');
    const email = 'ana@correo.com';
    const password = 'clave-segura-1';
    await page.getByLabel('Correo electrónico').fill(email);
    await page.locator('#login-password').fill(password);

    await expect(
      page.locator('form[method="post"]').filter({ has: page.locator('#login-password') }),
    ).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Ingresar' })).toBeDisabled();
    // press waits for any navigation the key triggers to start, so no fixed delay is needed
    await page.locator('#login-password').press('Enter');

    await expect(page).toHaveURL(/\/login$/);

    const url = decodeURIComponent(page.url());
    expect(url).not.toContain('password');
    expect(url).not.toContain(password);
    expect(url).not.toContain(email);
    expect(new URL(page.url()).pathname).toBe('/login');
  });
});
