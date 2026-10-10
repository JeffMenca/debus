import {
  createUserRequestSchema,
  dpiSchema,
  emailSchema,
  normalizeNit,
  nitSchema,
  phoneSchema,
  signupRequestSchema,
} from './auth';

const branchId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

describe('identity fields', () => {
  it('normalizes a NIT', () => {
    expect(normalizeNit(' 123456-7 ')).toBe('1234567');
    expect(normalizeNit('12345-k')).toBe('12345K');
    expect(nitSchema.parse('12345-k')).toBe('12345K');
    expect(nitSchema.safeParse('ABC').success).toBe(false);
  });

  it('accepts a DPI of 13 digits written with spaces', () => {
    expect(dpiSchema.parse('2345 67890 1234')).toBe('2345678901234');
    expect(dpiSchema.safeParse('123').success).toBe(false);
  });

  it('accepts an 8 digit phone', () => {
    expect(phoneSchema.parse('5555-4444')).toBe('55554444');
    expect(phoneSchema.safeParse('5555').success).toBe(false);
  });

  it('lowercases emails', () => {
    expect(emailSchema.parse('  Ana@Correo.COM ')).toBe('ana@correo.com');
  });
});

describe('sign up', () => {
  const valid = {
    fullName: 'Ana López',
    email: 'ana@correo.com',
    dpi: '2345678901234',
    phone: '55554444',
  };

  it('makes NIT and address optional', () => {
    expect(signupRequestSchema.parse(valid)).toEqual(valid);
    expect(
      signupRequestSchema.parse({ ...valid, nit: '1234567', address: 'Zona 1' }),
    ).toMatchObject({ nit: '1234567', address: 'Zona 1' });
  });

  it('treats empty optional fields as missing', () => {
    expect(signupRequestSchema.parse({ ...valid, nit: '', address: '' })).toEqual(valid);
  });

  it('never accepts a password', () => {
    expect(signupRequestSchema.parse({ ...valid, password: 'x' })).not.toHaveProperty('password');
  });
});

describe('admin creates a user', () => {
  it('requires a branch for branch roles', () => {
    const base = { fullName: 'Luis', email: 'luis@correo.com' };
    expect(createUserRequestSchema.safeParse({ ...base, role: 'CASHIER' }).success).toBe(false);
    expect(createUserRequestSchema.safeParse({ ...base, role: 'CASHIER', branchId }).success).toBe(
      true,
    );
  });

  it('rejects a branch on system admins and clients', () => {
    const base = { fullName: 'Luis', email: 'luis@correo.com', branchId };
    expect(createUserRequestSchema.safeParse({ ...base, role: 'SYSTEM_ADMIN' }).success).toBe(
      false,
    );
  });

  it('requires DPI and phone for clients', () => {
    const base = { fullName: 'Luis', email: 'luis@correo.com', role: 'CLIENT' };
    expect(createUserRequestSchema.safeParse(base).success).toBe(false);
    expect(
      createUserRequestSchema.safeParse({ ...base, dpi: '2345678901234', phone: '55554444' })
        .success,
    ).toBe(true);
  });
});
