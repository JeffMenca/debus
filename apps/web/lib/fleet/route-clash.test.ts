import { routeClashField } from './route-clash';

describe('routeClashField', () => {
  it.each([
    'Ya existe una ruta hacia esa sucursal. Edítala en lugar de crear otra.',
    'Elige otra sucursal activa como destino.',
  ])('puts "%s" on the destination', (message) => {
    expect(routeClashField(message)).toBe('destination');
  });

  it.each([
    'Tu sucursal no está activa.',
    'No pudimos conectarnos.',
    'Esta ruta ya tiene viajes. Puedes retirarla para que no se programen más.',
  ])('leaves "%s" on top of the form', (message) => {
    expect(routeClashField(message)).toBeNull();
  });
});
