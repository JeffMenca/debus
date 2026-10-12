export const FLEET_MESSAGES = {
  busNotFound: 'No encontramos ese bus.',
  plateTaken: 'Ya existe un bus con esa placa.',
  busHasTrips:
    'Este bus tiene viajes programados o en camino. Podrás desactivarlo cuando terminen o se eliminen.',
  driverNotFound: 'No encontramos ese chofer.',
  driverUnavailable: 'Elige un chofer activo de tu sucursal.',
  driverAlreadyAssigned: 'Ese chofer ya está asignado a otro bus.',
  licenseTaken: 'Ya existe un chofer con ese número de licencia.',
  driverEmailTaken: 'Ya existe un chofer con ese correo.',
  driverHasTrips:
    'Este chofer tiene viajes programados o en camino. Podrás desactivarlo cuando terminen o se eliminen.',
  routeNotFound: 'No encontramos esa ruta.',
  routeTaken: 'Ya existe una ruta hacia esa sucursal. Edítala en lugar de crear otra.',
  routeDestination: 'Elige otra sucursal activa como destino.',
  routeHasTrips: 'Esta ruta ya tiene viajes. Puedes retirarla para que no se programen más.',
  branchUnavailable: 'Tu sucursal no está activa.',
  photoInvalid: 'Sube una foto JPG, PNG o WebP de hasta 5 MB.',
  photoMissing: 'Aún no tiene foto.',
} as const;
