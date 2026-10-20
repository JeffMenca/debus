import { expect, test } from '@playwright/test';
import { MOCKED_API_URL } from './support/mocked-api';

test.describe('mocked runs', () => {
  test.skip(Boolean(process.env.E2E_REAL_API), 'runs only without a real gateway');

  test('point the web at a gateway that never answers', async ({ request }) => {
    const response = await request.get('/env.js');

    expect(await response.text()).toContain(`"apiUrl":"${MOCKED_API_URL}"`);
  });
});
