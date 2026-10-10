export type FieldName =
  'fullName' | 'email' | 'dpi' | 'phone' | 'nit' | 'address' | 'password' | 'confirm';

export const FIELD_MESSAGES: Record<FieldName, string> = {
  fullName: 'Escribe tu nombre completo.',
  email: 'Escribe un correo válido, como tu@correo.com.',
  dpi: 'El DPI tiene 13 dígitos.',
  phone: 'El teléfono tiene 8 dígitos.',
  nit: 'Revisa el NIT: solo números y, al final, un número o K.',
  address: 'La dirección es muy larga.',
  password: 'Usa al menos 8 caracteres.',
  confirm: 'Las contraseñas no coinciden.',
};
