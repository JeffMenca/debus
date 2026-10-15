// What each route does, in the words of the manual. The Swagger has no summaries, so the text is
// kept here, by controller and method; a route without an entry shows the name of its handler, and
// a test fails until someone writes it.
export const ACTIONS: Readonly<Record<string, string>> = {
  HealthController_check: 'Responde si el servicio está en línea',
  SystemController_check: 'Mide si el gateway y los siete servicios responden',
  SystemController_emit: 'Envía un aviso de prueba por Pub/Sub a los siete servicios',
  SystemController_probe: 'Dice qué servicios recibieron un aviso de prueba',

  AccountsController_signUp: 'Registra a un cliente y le envía el enlace para crear su contraseña',
  AccountsController_forgot: 'Envía el enlace para crear o restablecer la contraseña',
  AccountsController_status: 'Dice si un enlace sirve, venció o ya se usó',
  AccountsController_renew: 'Envía un enlace nuevo cuando el anterior venció',
  AccountsController_setPassword: 'Guarda la contraseña con el enlace recibido',
  SessionsController_login: 'Inicia sesión',
  SessionsController_refresh: 'Renueva la sesión',
  SessionsController_logout: 'Cierra la sesión',
  SessionsController_me: 'Devuelve la cuenta de la sesión',

  BranchesController_list: 'Lista las sucursales',
  BranchesController_locations:
    'Lista dónde están las sucursales activas, para el mapa de la página de inicio',
  BranchesController_get: 'Consulta una sucursal',
  BranchesController_create: 'Crea una sucursal con su primer administrador',
  BranchesController_update: 'Cambia los datos de una sucursal',
  BranchesController_deactivate: 'Desactiva una sucursal',
  BranchesController_reactivate: 'Reactiva una sucursal',
  UsersController_list: 'Lista las cuentas',
  UsersController_get: 'Consulta una cuenta',
  UsersController_create: 'Invita a una cuenta nueva',
  UsersController_update: 'Cambia el nombre o la sucursal de una cuenta',
  UsersController_resendInvitation: 'Reenvía la invitación de una cuenta pendiente',
  UsersController_deactivate: 'Desactiva una cuenta',
  UsersController_reactivate: 'Reactiva una cuenta',
  SettingsController_list: 'Lista las versiones de la configuración y cuál está vigente',
  SettingsController_create: 'Crea una versión nueva de la configuración',
  CategoriesController_list: 'Lista las categorías de gasto',
  CategoriesController_create: 'Crea una categoría de gasto',
  CategoriesController_update: 'Cambia el nombre de una categoría o la desactiva',
  CategoriesController_remove: 'Elimina una categoría que no tiene gastos',
  RepairExpensesController_list: 'Lista los gastos de taller',
  RepairExpensesController_get: 'Consulta un gasto de taller',
  RepairExpensesController_create: 'Registra un gasto de taller con sus líneas',

  BusesController_list: 'Lista los buses',
  BusesController_get: 'Consulta un bus',
  BusesController_create: 'Registra un bus',
  BusesController_update: 'Cambia los datos de un bus',
  BusesController_deactivate: 'Desactiva un bus',
  BusesController_reactivate: 'Reactiva un bus',
  BusesController_savePhoto: 'Sube la foto de un bus',
  BusesController_photo: 'Descarga la foto de un bus',
  DriversController_list: 'Lista los choferes',
  DriversController_get: 'Consulta un chofer',
  DriversController_create: 'Registra un chofer y crea su cuenta',
  DriversController_update: 'Cambia los datos de un chofer',
  DriversController_deactivate: 'Desactiva un chofer',
  DriversController_reactivate: 'Reactiva un chofer',
  DriversController_savePhoto: 'Sube la foto de un chofer',
  DriversController_photo: 'Descarga la foto de un chofer',
  RoutesController_list: 'Lista las rutas',
  RoutesController_create: 'Abre una ruta hacia otra sucursal',
  RoutesController_update: 'Cambia la distancia, el precio o el estado de una ruta',
  RoutesController_remove: 'Retira una ruta',

  TripsController_list: 'Lista los viajes',
  TripsController_get: 'Consulta un viaje con su salida y su llegada',
  TripsController_schedule: 'Programa un viaje',
  TripsController_remove: 'Elimina un viaje que no ha salido',
  TripsController_recordDeparture: 'Registra la salida de un viaje',
  TripsController_recordArrival: 'Registra la llegada de un viaje',
  RentalRequestsController_list: 'Lista las solicitudes de alquiler',
  RentalRequestsController_assign: 'Asigna bus y chofer a un alquiler y programa su viaje',

  DeadLettersController_list: 'Lista los mensajes que fallaron y quedaron en la cola de errores',
  DeadLettersController_replay: 'Vuelve a entregar un mensaje de la cola de errores',
  DeadLettersController_discard: 'Descarta un mensaje de la cola de errores',
};

// The merged Swagger prefixes each operation id with its service: `flota_BusesController_list`.
export function actionFor(operationId: string | undefined): string | undefined {
  if (!operationId) return undefined;
  return ACTIONS[operationId] ?? ACTIONS[operationId.replace(/^[a-z]+_/, '')];
}
