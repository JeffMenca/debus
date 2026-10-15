# Manual técnico · Viajes

**Viajes** programa los viajes de cada sucursal, registra su salida y su llegada y asigna bus y chofer a los alquileres que paga el cliente.

## 1. Para qué sirve y qué reglas cumple

- **Programar.** Un viaje une una ruta de la sucursal, un bus y un chofer; antes de guardarlo consulta a `flota` si pueden hacerlo (llamada HTTP síncrona, con 502/503 si no responde). Dos exclusiones de PostgreSQL impiden que un bus o un chofer tengan dos viajes en el mismo horario; el viaje con su llegada registrada libera ambos.
- **Salida y llegada.** Se registran una sola vez y son **inmutables** (trigger de PostgreSQL, sin `PUT`, `PATCH` ni `DELETE`): la salida admite como mucho 12 horas de anticipación y no puede ser futura (con 5 minutos de tolerancia); la llegada va después de la salida con kilometraje final y combustible. Al completarse, la depreciación (km recorridos por la depreciación vigente ese día) y el pago del chofer quedan fijados en el viaje. Un viaje que no ha salido se puede eliminar (`TripDeleted`).
- **Alquileres.** Cuando `clientes` publica `RentalPaid`, la solicitud queda pendiente; el admin de la sucursal la asigna a un bus con asientos suficientes y a un chofer, y se programa el viaje de alquiler con el pago al chofer 15 % mayor.
- **Venta.** `GET /internal/trips/:id/sale-status` (solo entre servicios) dirá a `ventas` si el viaje está abierto a la venta; la ruta ya existe y `ventas` aún no la usa.
- **Copias por eventos.** Guarda la copia de sucursales, buses, choferes, rutas y la configuración vigente con sus fechas, siempre por versión.

## 2. Diagrama de componentes

```mermaid
flowchart LR
  gw[Gateway] --> ctrl[Controladores<br/>trips, rental-requests]
  ventas[ventas] -->|HTTP interno| sale[SaleStatusController]
  ctrl --> svc[Servicios y reglas<br/>TripsService, TripCycleService, RentalRequestsService]
  sale --> svcs[SaleStatusService]
  svc --> fleet[FleetClient<br/>disponibilidad en flota]
  svc --> prisma[(Prisma / PostgreSQL<br/>exclusiones y triggers)]
  svc --> events[TripCycleService y TripWrites<br/>escriben el outbox]
  svcs --> prisma
  events --> prisma
  events --> pubsub[(Pub/Sub)]
  pubsub --> handlers[Handlers de eventos<br/>branches, fleet-copies, settings, rental-requests]
  handlers --> prisma
  handlers --> processed[processed_events<br/>inbox idempotente]
```

## 3. Diagrama de tablas

Viajes guarda los viajes con sus registros de salida y llegada, las solicitudes de alquiler y las copias de sucursales, buses, choferes, rutas y configuración, más las tablas del outbox y del inbox.

<!-- prettier-ignore-start -->
<!-- generado:tablas -->
```mermaid
erDiagram
  processed_events {
    text event_id PK
    text type
    timestamptz processed_at
  }
  outbox {
    text event_id PK
    text type
    jsonb envelope
    timestamptz created_at
    timestamptz published_at
    int attempts
    text last_error
    timestamptz claimed_until
  }
  branches {
    uuid id PK
    text code
    text name
    boolean active
    int version
    timestamptz updated_at
  }
  settings_versions {
    uuid id PK
    decimal depreciation_per_km
    decimal rental_rate_per_km
    date effective_from
    timestamptz created_at
  }
  bus_copies {
    uuid id PK
    uuid branch_id
    text plate
    int capacity
    text operational_status
    boolean active
    uuid assigned_driver_id
    int mileage_km
    int version
    timestamptz updated_at
  }
  driver_copies {
    uuid id PK
    uuid branch_id
    text full_name
    date license_expires_on
    decimal base_salary
    boolean active
    int version
    timestamptz updated_at
  }
  route_copies {
    uuid id PK
    uuid origin_branch_id
    uuid destination_branch_id
    decimal distance_km
    decimal ticket_price
    boolean active
    boolean deleted
    int version
    timestamptz updated_at
  }
  trips {
    uuid id PK
    TripType type
    TripStatus status
    uuid branch_id
    uuid route_id
    uuid bus_id
    text bus_plate
    int capacity
    uuid driver_id
    text driver_name
    text origin_label
    text destination_label
    timestamptz departure_at
    timestamptz estimated_arrival_at
    decimal ticket_price
    uuid rental_id
    uuid created_by_id
    text search_text
    timestamptz created_at
    timestamptz updated_at
  }
  trip_departures {
    uuid trip_id PK, FK
    timestamptz departed_at
    int start_mileage_km
    uuid recorded_by_id
    RecordedByRole recorded_by_role
    timestamptz created_at
  }
  trip_arrivals {
    uuid trip_id PK, FK
    timestamptz arrived_at
    int end_mileage_km
    decimal fuel_cost
    int distance_km
    decimal depreciation_per_km
    decimal depreciation_amount
    decimal driver_pay
    uuid settings_version_id
    uuid recorded_by_id
    RecordedByRole recorded_by_role
    timestamptz created_at
  }
  rental_requests {
    uuid id PK
    uuid branch_id
    text client_name
    text nit
    text origin_label
    text destination_label
    timestamptz departure_at
    timestamptz return_at
    int passengers
    decimal distance_km
    decimal price
    RentalRequestStatus status
    uuid trip_id UK
    text search_text
    timestamptz created_at
    timestamptz updated_at
  }
  trips ||--o| trip_departures : "trip_id"
  trips ||--o| trip_arrivals : "trip_id"
```
<!-- /generado:tablas -->
<!-- prettier-ignore-end -->

## 4. Diagrama de despliegue

Cada servicio corre en su propio Cloud Run; los eventos viajan por Pub/Sub y las pocas llamadas síncronas por HTTP con el token de identidad de la cuenta de servicio.

<!-- prettier-ignore-start -->
<!-- generado:despliegue -->
```mermaid
flowchart LR
  n_viajes["Cloud Run viajes"] --> n_db_viajes["Cloud SQL viajes"]
  n_job_viajes["Cloud Scheduler viajes-outbox-flush"] -->|POST /outbox/flush| n_viajes
  n_viajes -->|outbox| n_topic_viajes["viajes-events"]
  n_topic_viajes --> n_ventas_from_viajes["ventas-from-viajes"]
  n_ventas_from_viajes -.->|push| n_ventas["Cloud Run ventas"]
  n_topic_viajes --> n_reportes_from_viajes["reportes-from-viajes"]
  n_reportes_from_viajes -.->|push| n_reportes["Cloud Run reportes"]
  n_topic_viajes --> n_flota_from_viajes["flota-from-viajes"]
  n_flota_from_viajes -.->|push| n_flota["Cloud Run flota"]
  n_topic_viajes --> n_notificaciones_from_viajes["notificaciones-from-viajes"]
  n_notificaciones_from_viajes -.->|push| n_notificaciones["Cloud Run notificaciones"]
  n_topic_viajes --> n_administracion_from_viajes["administracion-from-viajes"]
  n_administracion_from_viajes -.->|push| n_administracion["Cloud Run administracion"]
  n_administracion -.-> n_viajes_from_administracion["viajes-from-administracion"]
  n_viajes_from_administracion -->|push /events/pubsub| n_viajes
  n_flota -.-> n_viajes_from_flota["viajes-from-flota"]
  n_viajes_from_flota -->|push /events/pubsub| n_viajes
  n_clientes["Cloud Run clientes"] -.-> n_viajes_from_clientes["viajes-from-clientes"]
  n_viajes_from_clientes -->|push /events/pubsub| n_viajes
  n_gateway["Cloud Run gateway"] -.-> n_viajes_from_gateway["viajes-from-gateway"]
  n_viajes_from_gateway -->|push /events/pubsub| n_viajes
  n_viajes -.->|tras 5 entregas fallidas| n_dlq_viajes["viajes-dlq"]
  n_ventas -.->|"HTTP prevista: Ver si el viaje está abierto a la venta"| n_viajes
  n_viajes -->|"HTTP: Ver si el bus y el chofer están disponibles"| n_flota
```
<!-- /generado:despliegue -->
<!-- prettier-ignore-end -->

## 5. Eventos y manejo de fallos

El outbox se escribe en la misma transacción que el viaje y lo publican el job `viajes-outbox-flush` (cada minuto) y el propio servicio; el inbox (`processed_events`) evita procesar dos veces una entrega; Pub/Sub reintenta y, tras 5 fallos, deja el mensaje en `viajes-dlq`. Si la copia de un bus o de un chofer aún no llegó, programar contesta "Estamos terminando de registrar ese bus" y se reintenta en unos segundos; si `flota` no responde, 502 o 503 sin guardar nada.

<!-- prettier-ignore-start -->
<!-- generado:eventos -->
**Publica**

| Evento | Lo consumen |
| --- | --- |
| `TripScheduled` | ventas, reportes, flota |
| `TripDeleted` | ventas, notificaciones, flota, reportes |
| `TripDeparted` | flota, reportes |
| `TripCompleted` | administracion, flota, reportes |

**Consume**

| Evento | Lo publica |
| --- | --- |
| `BranchCreated` | administracion |
| `BranchUpdated` | administracion |
| `SettingsUpdated` | administracion |
| `BusAdded` | flota |
| `BusUpdated` | flota |
| `BusDeactivated` | flota |
| `DriverAdded` | flota |
| `DriverUpdated` | flota |
| `RouteCreated` | flota |
| `RouteUpdated` | flota |
| `RouteDeleted` | flota |
| `RentalPaid` | clientes |
| `ProbeSent` | gateway |
<!-- /generado:eventos -->
<!-- prettier-ignore-end -->

## 6. Endpoints

Todas las rutas pasan por el gateway con el prefijo `/api/viajes` (aquí aparecen sin él). El detalle de cada cuerpo y respuesta está en el Swagger del gateway (`/docs`; en local, `http://localhost:4000/docs`) y en la colección [`postman/debus.postman_collection.json`](../../postman/debus.postman_collection.json).

<!-- prettier-ignore-start -->
<!-- generado:endpoints -->
| Método | Ruta | Qué hace | Roles |
| --- | --- | --- | --- |
| `GET` | `/dead-letters` | Lista los mensajes que fallaron y quedaron en la cola de errores | SYSTEM_ADMIN |
| `DELETE` | `/dead-letters/{messageId}` | Descarta un mensaje de la cola de errores | SYSTEM_ADMIN |
| `POST` | `/dead-letters/{messageId}/replay` | Vuelve a entregar un mensaje de la cola de errores | SYSTEM_ADMIN |
| `GET` | `/health` | Responde si el servicio está en línea | Cualquier sesión |
| `GET` | `/rental-requests` | Lista las solicitudes de alquiler | BRANCH_ADMIN |
| `POST` | `/rental-requests/{id}/assignment` | Asigna bus y chofer a un alquiler y programa su viaje | BRANCH_ADMIN |
| `GET` | `/trips` | Lista los viajes | BRANCH_ADMIN, DRIVER |
| `POST` | `/trips` | Programa un viaje | BRANCH_ADMIN |
| `GET` | `/trips/{id}` | Consulta un viaje con su salida y su llegada | BRANCH_ADMIN, DRIVER |
| `DELETE` | `/trips/{id}` | Elimina un viaje que no ha salido | BRANCH_ADMIN |
| `POST` | `/trips/{id}/arrival` | Registra la llegada de un viaje | BRANCH_ADMIN, DRIVER |
| `POST` | `/trips/{id}/departure` | Registra la salida de un viaje | BRANCH_ADMIN, DRIVER |
<!-- /generado:endpoints -->
<!-- prettier-ignore-end -->

## 7. Variables de entorno

Las que recibe en Cloud Run salen de `cloudRunEnv` (`packages/contracts/src/cloud-run-env.ts`); en local las trae `services/viajes/.env.example`.

| Variable               | Para qué sirve                                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| `PORT`                 | Puerto en el que escucha (el de su `.env.example` en local; Cloud Run lo asigna en producción).       |
| `SERVICE_NAME`         | Nombre del servicio; lo fija el despliegue y el código no lo lee.                                     |
| `DEBUS_ENV`            | `local` o `production`.                                                                               |
| `PUBSUB_PROJECT_ID`    | Proyecto de Pub/Sub (en local, el del emulador `debus-local`).                                        |
| `PUBSUB_AUDIENCE`      | Dirección del servicio: el token OIDC que Pub/Sub manda en cada entrega debe estar emitido para ella. |
| `PUBSUB_PUSH_SA`       | Cuenta de servicio que Pub/Sub usa para entregar; solo ella puede llamar a `POST /events/pubsub`.     |
| `PUBSUB_EMULATOR_HOST` | Solo en local: con él no se valida el token de Pub/Sub.                                               |
| `DATABASE_URL`         | Conexión a la base del servicio (en producción la arma el despliegue).                                |
| `DB_POOL_MAX`          | Conexiones máximas al pool (2 en Cloud Run, para no agotar Cloud SQL).                                |
| `SERVICE_AUTH`         | `google` en producción: la llamada a `flota` lleva token de identidad.                                |
| `SERVICE_URL_FLOTA`    | Dirección de `flota`, para consultar la disponibilidad.                                               |

## 8. Cómo correrlo y probarlo

```bash
pnpm install
pnpm local                                   # todo el stack: PostgreSQL, Pub/Sub, Mailpit, apps y migraciones
pnpm --filter @debus/viajes test              # pruebas unitarias con cobertura (mínimo 85 %)
pnpm --filter @debus/viajes test:integration  # contra PostgreSQL y el emulador de Pub/Sub (mínimo 65 %)
```

Para programar viajes hace falta que `flota` también corra (`pnpm local` levanta todo).

Las pruebas que escriben datos usan correos `@debus.test` y el prefijo `Prueba ` y los borran al terminar; `pnpm test:clean` quita lo que haya quedado.
