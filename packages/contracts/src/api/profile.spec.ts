import { clientProfileSchema, updateProfileRequestSchema } from './profile';

const update = { dpi: '2734 51920 0901', phone: '5512-3489', nit: '4521837-6', address: 'Zona 3' };

describe('profile contracts', () => {
  it('normalizes the DPI, phone and NIT the way the signup does', () => {
    expect(updateProfileRequestSchema.parse(update)).toEqual({
      dpi: '2734519200901',
      phone: '55123489',
      nit: '45218376',
      address: 'Zona 3',
    });
  });

  it('keeps the DPI and phone required and lets a blank NIT or address clear them', () => {
    expect(updateProfileRequestSchema.parse({ ...update, nit: '', address: ' ' })).toEqual({
      dpi: '2734519200901',
      phone: '55123489',
    });
    expect(updateProfileRequestSchema.safeParse({ ...update, phone: '5512348' }).success).toBe(
      false,
    );
    expect(updateProfileRequestSchema.safeParse({ phone: '55123489' }).success).toBe(false);
  });

  it('describes a profile whose staff fields may still be empty', () => {
    const profile = {
      userId: '7d6c5b4a-3f2e-4d1c-8b0a-9f8e7d6c5b4a',
      email: 'ana@correo.com',
      fullName: 'Ana Méndez',
      dpi: null,
      phone: null,
      nit: null,
      address: null,
      updatedAt: '2026-10-14T15:00:00.000Z',
    };

    expect(clientProfileSchema.parse(profile)).toEqual(profile);
  });
});
