import { REFRESH_COOKIE, clearedCookieOptions, refreshCookieOptions } from './session-cookie';

describe('refresh cookie', () => {
  it('is http only and lax', () => {
    const expires = new Date('2026-10-16T12:00:00.000Z');

    expect(REFRESH_COOKIE).toBe('debus_refresh');
    expect(refreshCookieOptions('production', expires)).toEqual({
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
      expires,
    });
    expect(refreshCookieOptions('local', expires).secure).toBe(false);
  });

  it('clears with the same scope', () => {
    expect(clearedCookieOptions('production')).toMatchObject({ path: '/', maxAge: 0 });
  });
});
