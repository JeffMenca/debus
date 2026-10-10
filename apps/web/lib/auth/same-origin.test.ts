/** @jest-environment node */
import { isSameOrigin } from './same-origin';

const request = (headers: Record<string, string>) =>
  new Request('http://localhost:3000/api/session/login', { method: 'POST', headers });

describe('isSameOrigin', () => {
  it('accepts requests from the web itself', () => {
    expect(isSameOrigin(request({ host: 'localhost:3000', origin: 'http://localhost:3000' }))).toBe(
      true,
    );
    expect(isSameOrigin(request({ host: 'localhost:3000', 'sec-fetch-site': 'same-origin' }))).toBe(
      true,
    );
    expect(isSameOrigin(request({ host: 'localhost:3000' }))).toBe(true);
  });

  it('rejects other origins', () => {
    expect(isSameOrigin(request({ host: 'localhost:3000', origin: 'https://evil.example' }))).toBe(
      false,
    );
    expect(isSameOrigin(request({ host: 'localhost:3000', 'sec-fetch-site': 'cross-site' }))).toBe(
      false,
    );
    expect(isSameOrigin(request({ host: 'localhost:3000', origin: 'not a url' }))).toBe(false);
  });

  it('trusts the forwarded host when a proxy sits in front', () => {
    expect(
      isSameOrigin(
        request({
          host: 'internal:8080',
          'x-forwarded-host': 'debus.example',
          'x-forwarded-proto': 'https',
          origin: 'https://debus.example',
        }),
      ),
    ).toBe(true);
  });

  it('rejects the same host on another scheme', () => {
    expect(
      isSameOrigin(request({ host: 'localhost:3000', origin: 'https://localhost:3000' })),
    ).toBe(false);
  });

  it('compares the scheme the visitor used when a proxy terminates TLS', () => {
    const behindProxy = (origin: string) =>
      new Request('http://internal:8080/api/session/login', {
        method: 'POST',
        headers: {
          host: 'internal:8080',
          'x-forwarded-host': 'debus.example',
          'x-forwarded-proto': 'https',
          origin,
        },
      });

    expect(isSameOrigin(behindProxy('https://debus.example'))).toBe(true);
    expect(isSameOrigin(behindProxy('http://debus.example'))).toBe(false);
  });
});
