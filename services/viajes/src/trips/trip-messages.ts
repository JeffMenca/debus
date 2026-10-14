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
  alreadyDeparted: 'La salida de este viaje ya fue registrada.',
  departureBusInactive:
    'El bus de este viaje fue desactivado. Elimina el viaje y prográmalo con otro bus.',
  departureDriverInactive:
    'El chofer de este viaje fue desactivado. Elimina el viaje y prográmalo con otro chofer.',
  busOnAnotherTrip: 'Ese bus sigue en otro viaje. Registra primero la llegada de ese viaje.',
  driverOnAnotherTrip: 'Ese chofer sigue en otro viaje. Registra primero la llegada de ese viaje.',
  startMileageBelowBus:
    'El kilometraje inicial no puede ser menor que el último registrado del bus.',
  departureTooEarly:
    'Ese viaje está programado para más tarde. No puedes registrar su salida con más de 12 horas de anticipación.',
  departureInFuture: 'La hora real de salida no puede ser en el futuro.',
  notOnTheRoad: 'Primero registra la salida de este viaje.',
  alreadyArrived: 'La llegada de este viaje ya fue registrada.',
  arrivalBeforeDeparture: 'La llegada debe ser después de la salida.',
  arrivalInFuture: 'La hora real de llegada no puede ser en el futuro.',
  endMileageBelowStart: 'El kilometraje final no puede ser menor que el inicial.',
  distanceTooLong:
    'El kilometraje final es demasiado alto para un solo viaje. Revisa que esté bien escrito.',
  depreciationTooHigh:
    'La depreciación de este viaje sale demasiado alta. Revisa el kilometraje final.',
  driverCopyMissing: 'Aún no tenemos el salario de ese chofer. Intenta de nuevo en unos segundos.',
  noDepreciationRate:
    'Aún no hay monto de depreciación vigente para ese día. Pide al admin del sistema que lo configure.',
  tripStarted: 'Este viaje ya salió. Solo se eliminan viajes que no han salido.',
  branchInactive: 'Tu sucursal no está activa.',
  destinationInactive: 'La sucursal destino no está activa. Elige otra ruta.',
  rentalNotFound: 'No encontramos ese alquiler.',
  rentalAssigned: 'Ese alquiler ya tiene bus y chofer.',
  rentalBusTooSmall: 'Ese bus tiene menos asientos que pasajeros del alquiler.',
  rentalArrivalInPast:
    'La llegada estimada ya pasó. Elige una llegada que todavía no haya ocurrido.',
  rentalArrivalBeforeReturn: 'La llegada estimada no puede ser antes del regreso del cliente.',
  rentalArrivalBeforeDeparture: 'La llegada estimada debe ser después de la salida del alquiler.',
} as const;

export type TripProblem = keyof typeof TRIP_MESSAGES;
