import { isActivePath, navigationFor } from './navigation';

describe('navigation', () => {
  it('gives the system admin its administration links', () => {
    const items = navigationFor('SYSTEM_ADMIN').flatMap((group) =>
      group.items.map((item) => [item.label, item.href]),
    );

    expect(items).toEqual([
      ['Panel', '/admin'],
      ['Usuarios', '/admin/usuarios'],
      ['Sucursales', '/admin/sucursales'],
      ['Configuración', '/admin/configuracion'],
      ['Estado del sistema', '/admin/estado'],
    ]);
  });

  it('shows branch staff only the screens that exist', () => {
    for (const role of ['BRANCH_ADMIN', 'CASHIER', 'DRIVER'] as const) {
      expect(navigationFor(role).flatMap((group) => group.items.map((item) => item.href))).toEqual([
        '/sucursal',
      ]);
    }
    expect(navigationFor('CLIENT')).toEqual([]);
  });

  it('marks the panel only on its own page and sections on their sub-pages', () => {
    expect(isActivePath('/admin', '/admin')).toBe(true);
    expect(isActivePath('/admin/usuarios', '/admin')).toBe(false);
    expect(isActivePath('/admin/sucursales/nueva', '/admin/sucursales')).toBe(true);
    expect(isActivePath('/admin/sucursales', '/admin/sucursales')).toBe(true);
    expect(isActivePath('/admin/sucursales-x', '/admin/sucursales')).toBe(false);
  });
});
