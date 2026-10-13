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

  it('gives the branch admin the trips and the fleet screens', () => {
    const groups = navigationFor('BRANCH_ADMIN').map((group) => [
      group.label,
      group.items.map((item) => [item.label, item.href]),
    ]);

    expect(groups).toEqual([
      [
        'Operación',
        [
          ['Panel', '/sucursal'],
          ['Viajes', '/sucursal/viajes'],
        ],
      ],
      [
        'Flota',
        [
          ['Buses', '/sucursal/buses'],
          ['Choferes', '/sucursal/choferes'],
          ['Rutas', '/sucursal/rutas'],
        ],
      ],
    ]);
  });

  it('shows the rest of the branch staff only the screens that exist', () => {
    for (const role of ['CASHIER', 'DRIVER'] as const) {
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
