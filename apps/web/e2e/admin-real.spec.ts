import { TEST_BRANCH_PREFIX, testEmail } from '@debus/config/test-data';
import { expect, test } from '@playwright/test';
import { isLocalStack } from './support/local-stack';
import { isReachable, latestLink, mailpitUrl } from './support/mailpit';
import { signInAsRealAdmin } from './support/real-admin';

test.describe('real system administration', () => {
  test.skip(
    !process.env.E2E_REAL_API || !process.env.E2E_ADMIN_EMAIL,
    'runs only against a running stack with an admin',
  );
  test.skip(
    ({ baseURL }) => !isLocalStack(baseURL),
    'creates branches: runs only on the local stack',
  );
  test.setTimeout(240_000);

  test('the system admin creates a branch whose first admin receives the invitation', async ({
    page,
    baseURL,
  }, testInfo) => {
    const inbox = mailpitUrl(baseURL);
    test.skip(!inbox || !(await isReachable(inbox)), 'needs a reachable Mailpit');
    const stamp = `${testInfo.project.name}-${Date.now()}`;
    await signInAsRealAdmin(page, inbox!, process.env.E2E_ADMIN_EMAIL!);

    const code = String.fromCharCode(
      ...Array.from({ length: 5 }, () => 65 + Math.floor(Math.random() * 26)),
    );
    const branchAdmin = testEmail(`e2e-branch-${testInfo.project.name}`);
    await page.goto('/admin/sucursales/nueva');
    await page.getByLabel('Nombre', { exact: true }).fill(`${TEST_BRANCH_PREFIX}E2E ${stamp}`);
    await page.getByLabel('Código').fill(code);
    await page.getByRole('combobox', { name: 'Departamento' }).click();
    await page.getByRole('option', { name: 'Quetzaltenango' }).click();
    await page.getByLabel('Municipio').fill('Quetzaltenango');
    await page.getByLabel('Dirección').fill('4a calle 12-30 zona 1');
    await page.getByLabel('Teléfono').fill('77612233');
    await page.getByLabel('Latitud').fill('14.8347');
    await page.getByLabel('Longitud').fill('-91.5181');
    await page.getByLabel('Nombre completo').fill('Admin de Prueba');
    await page.getByLabel('Correo').fill(branchAdmin);
    await page.getByRole('button', { name: 'Crear sucursal' }).click();

    await expect(page).toHaveURL(/\/admin\/sucursales$/);
    await expect(page.getByRole('row', { name: new RegExp(`E2E ${stamp}`) })).toBeVisible();
    expect(await latestLink(inbox!, branchAdmin, '/crear-contrasena')).toContain('token=');
    console.log(`E2E_BRANCH_CODE=${code}`);
  });
});
