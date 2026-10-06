/**
 * @jest-environment node
 */
import { GET } from './route';

describe('GET /api/health', () => {
  it('reports the web app as up', async () => {
    const response = GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'ok', service: 'web' });
  });
});
