import { TEST_BRANCH_PREFIX, TEST_RUN, testEmail } from '@debus/config/test-data';
import { LOCAL_PORTS } from '@debus/contracts';
import { expect, test } from '@playwright/test';
import { cleanUpTestRun } from './support/clean-up';
import { deleteLocal, queryLocal } from './support/local-sql';
import { isLocalStack } from './support/local-stack';
import { isReachable, mailpitUrl } from './support/mailpit';
import { signInAsRealAdmin } from './support/real-admin';
import { createBranch, signInAsBranchAdmin } from './support/real-fleet';

test.describe('real staff profile', () => {
  test.skip(
    !process.env.E2E_REAL_API || !process.env.E2E_ADMIN_EMAIL,
    'runs only against a running stack with an admin',
  );
  test.skip(
    ({ baseURL }) => !isLocalStack(baseURL),
    'creates branches and accounts: runs only on the local stack',
  );
  test.setTimeout(240_000);
  test.afterAll(() => cleanUpTestRun());

  test('a branch admin whose profile was lost gets it back when the accounts are republished', async ({
    page,
    baseURL,
    browser,
  }, testInfo) => {
    const inbox = mailpitUrl(baseURL);
    test.skip(!inbox || !(await isReachable(inbox)), 'needs a reachable Mailpit');
    const stamp = `${testInfo.project.name}-${Date.now()}`;
    const branchAdmin = testEmail(`profile-${testInfo.project.name}`);

    await signInAsRealAdmin(page, inbox!, process.env.E2E_ADMIN_EMAIL!);
    await createBranch(page, `${TEST_BRANCH_PREFIX}${TEST_RUN} perfil ${stamp}`, branchAdmin);
    const { page: staff, context } = await signInAsBranchAdmin(
      browser,
      baseURL!,
      inbox!,
      branchAdmin,
    );

    try {
      await staff.goto('/perfil');
      await expect(staff.getByRole('heading', { name: 'Mi perfil', level: 1 })).toBeVisible();
      await expect(staff.getByText(branchAdmin)).toBeVisible();

      // Simulates a profile that never reached clientes.
      const [userId] = queryLocal(
        'administracion',
        `SELECT id FROM users WHERE email = '${branchAdmin}'`,
      );
      const [branchId] = queryLocal(
        'administracion',
        `SELECT branch_id FROM users WHERE email = '${branchAdmin}'`,
      );
      deleteLocal('clientes', `DELETE FROM client_profiles WHERE user_id = '${userId}'`);
      await staff.reload();
      await expect(staff.getByText(/Estamos preparando tu cuenta/)).toBeVisible();

      // Limited to the test branch, so no real account changes its version.
      const response = await fetch(
        `http://localhost:${LOCAL_PORTS.administracion}/internal/users/republish?branchId=${branchId}`,
        { method: 'POST' },
      );
      expect(response.ok).toBe(true);

      await expect(async () => {
        await staff.reload();
        await expect(staff.getByText(branchAdmin)).toBeVisible({ timeout: 3_000 });
      }).toPass({ timeout: 30_000 });
      await expect(staff.getByText('Sin registrar')).toHaveCount(4);
    } finally {
      await context.close();
    }
  });
});
