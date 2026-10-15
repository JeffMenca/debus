export type RouteClashField = 'destination';

// A route is refused for its destination (already taken, inactive) or for the own branch. Only the
// first kind belongs next to the destination field; the rest goes on top of the form.
export function routeClashField(message: string): RouteClashField | null {
  return /\bhacia esa sucursal\b|\bcomo destino\b/i.test(message) ? 'destination' : null;
}
