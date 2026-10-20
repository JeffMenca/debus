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
      ['Categorías de gasto', '/admin/categorias'],
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
          ['Ventanilla', '/sucursal/ventanilla'],
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
      ['Finanzas', [['Gastos de taller', '/sucursal/gastos']]],
      [
        'Reportes',
        [
          ['Listado de buses', '/sucursal/reportes/buses'],
          ['Listado de choferes', '/sucursal/reportes/choferes'],
          ['Ingresos por boletos', '/sucursal/reportes/ingresos-boletos'],
          ['Ingresos por alquiler', '/sucursal/reportes/ingresos-alquileres'],
          ['Depreciación por bus', '/sucursal/reportes/depreciacion'],
          ['Gastos de taller por bus', '/sucursal/reportes/taller'],
        ],
      ],
    ]);
  });

  it('keeps the reports from the cashier, the driver and the system admin', () => {
    for (const role of ['CASHIER', 'DRIVER', 'SYSTEM_ADMIN'] as const) {
      const labels = navigationFor(role).map((group) => group.label);
      expect(labels).not.toContain('Reportes');
    }
  });

  it('shows the cashier only the screens that exist', () => {
    expect(
      navigationFor('CASHIER').flatMap((group) => group.items.map((item) => item.href)),
    ).toEqual(['/sucursal', '/sucursal/ventanilla']);
    expect(navigationFor('CLIENT')).toEqual([]);
  });

  it('gives the driver their own trips', () => {
    expect(
      navigationFor('DRIVER').map((group) => [
        group.label,
        group.items.map((item) => [item.label, item.href]),
      ]),
    ).toEqual([['Mi trabajo', [['Mis viajes', '/chofer']]]]);
  });

  it('keeps Mis viajes active on the trip of the driver', () => {
    expect(isActivePath('/chofer', '/chofer')).toBe(true);
    expect(isActivePath('/chofer/viajes/abc', '/chofer')).toBe(true);
  });

  it('marks the panel only on its own page and sections on their sub-pages', () => {
    expect(isActivePath('/admin', '/admin')).toBe(true);
    expect(isActivePath('/admin/usuarios', '/admin')).toBe(false);
    expect(isActivePath('/admin/sucursales/nueva', '/admin/sucursales')).toBe(true);
    expect(isActivePath('/admin/sucursales', '/admin/sucursales')).toBe(true);
    expect(isActivePath('/admin/sucursales-x', '/admin/sucursales')).toBe(false);
  });
});
