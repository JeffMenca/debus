export const TRIP_MESSAGES = {
  routeNotFound: 'Elige una ruta activa que salga de tu sucursal.',
  routeRetired: 'Esa ruta está retirada. Reactívala o elige otra.',
  busPending: 'Estamos terminando de registrar ese bus. Intenta de nuevo en unos segundos.',
  driverPending: 'Estamos terminando de registrar ese chofer. Intenta de nuevo en unos segundos.',
  departureInPast: 'La salida debe ser en el futuro.',
  busNotFound: 'No encontramos ese bus en tu sucursal.',
  busInactive: 'Ese bus está desactivado.',
  busInWorkshop: 'Ese bus está en taller.',
  busBusy: 'Ese bus ya tiene un viaje en ese horario.',
  driverNotFound: 'No encontramos ese chofer en tu sucursal.',
  driverInactive: 'Ese chofer está desactivado.',
  driverLicenseExpired: 'La licencia de ese chofer estará vencida el día del viaje.',
  driverBusy: 'Ese chofer ya tiene un viaje en ese horario.',
  tripContended: 'Otro viaje se está programando justo ahora. Intenta de nuevo en unos segundos.',
  tripNotFound: 'No encontramos ese viaje.',
} as const;

export type TripProblem = keyof typeof TRIP_MESSAGES;
