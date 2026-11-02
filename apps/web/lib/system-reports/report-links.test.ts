import { SYSTEM_REPORT_LINKS } from './report-links';

it('lists the six reports of the system administrator and the architecture view, with a page each', () => {
  expect(SYSTEM_REPORT_LINKS.map((link) => link.href)).toEqual([
    '/admin/reportes/ingresos',
    '/admin/reportes/gastos',
    '/admin/reportes/ganancias',
    '/admin/reportes/rutas-demandadas',
    '/admin/reportes/taller',
    '/admin/reportes/mapa-rutas',
    '/admin/reportes/arquitectura',
  ]);
  for (const link of SYSTEM_REPORT_LINKS) {
    expect(link.title).not.toBe('');
    expect(link.icon).toBeDefined();
  }
});
