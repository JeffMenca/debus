import { FIELD_MESSAGES } from './form-messages';

it('explains every field in plain Spanish', () => {
  expect(FIELD_MESSAGES).toEqual({
    fullName: 'Escribe tu nombre completo.',
    email: 'Escribe un correo válido, como tu@correo.com.',
    dpi: 'El DPI tiene 13 dígitos.',
    phone: 'El teléfono tiene 8 dígitos.',
    nit: 'Revisa el NIT: solo números y, al final, un número o K.',
    address: 'La dirección es muy larga.',
    password: 'Usa al menos 8 caracteres.',
    confirm: 'Las contraseñas no coinciden.',
  });
});
