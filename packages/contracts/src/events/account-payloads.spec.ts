import { accountLinkIssuedPayloadSchema, userRegisteredPayloadSchema } from './account-payloads';

const userId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const base = { userId, email: 'ana@correo.com', fullName: 'Ana López' };

describe('account link payload', () => {
  it('requires a link and an expiry for every reason that carries one', () => {
    for (const reason of ['INVITATION', 'SIGNUP', 'PASSWORD_RESET'] as const) {
      expect(accountLinkIssuedPayloadSchema.safeParse({ ...base, reason }).success).toBe(false);
      expect(
        accountLinkIssuedPayloadSchema.safeParse({
          ...base,
          reason,
          link: 'https://web.example/crear-contrasena?token=abc',
          expiresAt: '2026-10-11T12:00:00.000Z',
        }).success,
      ).toBe(true);
    }
  });

  it('accepts an already registered notice without a link', () => {
    expect(
      accountLinkIssuedPayloadSchema.safeParse({ ...base, reason: 'ALREADY_REGISTERED' }).success,
    ).toBe(true);
  });

  it.each([
    'javascript:alert(document.domain)',
    'data:text/html,<script>alert(1)</script>',
    'ftp://web.example/x',
  ])('only accepts http and https links, not %s', (link) => {
    const payload = {
      ...base,
      reason: 'SIGNUP',
      link,
      expiresAt: '2026-10-11T12:00:00.000Z',
    };

    expect(accountLinkIssuedPayloadSchema.safeParse(payload).success).toBe(false);
    expect(
      accountLinkIssuedPayloadSchema.safeParse({ ...payload, link: 'http://localhost:3000/x?t=1' })
        .success,
    ).toBe(true);
  });

  it('rejects unknown reasons', () => {
    expect(accountLinkIssuedPayloadSchema.safeParse({ ...base, reason: 'OTHER' }).success).toBe(
      false,
    );
  });
});

describe('user registered payload', () => {
  it('carries the client profile', () => {
    const parsed = userRegisteredPayloadSchema.parse({
      ...base,
      role: 'CLIENT',
      branchId: null,
      profile: { dpi: '1234567890123', phone: '55554444', nit: null, address: null },
    });

    expect(parsed.profile?.dpi).toBe('1234567890123');
  });

  it('allows staff accounts without a profile', () => {
    expect(
      userRegisteredPayloadSchema.safeParse({
        ...base,
        role: 'CASHIER',
        branchId: userId,
        profile: null,
      }).success,
    ).toBe(true);
  });
});
