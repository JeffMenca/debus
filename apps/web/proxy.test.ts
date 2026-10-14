/** @jest-environment node */
import { NextRequest } from 'next/server';
import { config, proxy } from './proxy';

describe('proxy', () => {
  it('sends visitors without a session to the login', () => {
    const response = proxy(new NextRequest('http://localhost:3000/sucursal/buses?x=1'));

    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/login?siguiente=%2Fsucursal%2Fbuses%3Fx%3D1',
    );
  });

  it('lets people with a session cookie through', () => {
    const request = new NextRequest('http://localhost:3000/admin', {
      headers: { cookie: 'debus_refresh=abc' },
    });

    expect(proxy(request).headers.get('location')).toBeNull();
  });

  it('only watches private areas', () => {
    expect(config.matcher).toEqual([
      '/admin/:path*',
      '/sucursal/:path*',
      '/chofer/:path*',
      '/cuenta/:path*',
    ]);
  });
});
