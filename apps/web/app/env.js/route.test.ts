/** @jest-environment node */
import { GET } from './route';

describe('GET /env.js', () => {
  it('serves the runtime config as an uncached script', async () => {
    process.env.API_URL = 'https://gateway-staging-1.r.run.app';
    process.env.APP_ENV = 'staging';

    const response = GET();

    expect(response.headers.get('content-type')).toContain('javascript');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toBe(
      'window.__DEBUS_ENV__={"apiUrl":"https://gateway-staging-1.r.run.app","appEnv":"staging"};',
    );
  });
});
