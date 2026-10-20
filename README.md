# debus

Plataforma de transporte extraurbano de Guatemala: boletos, viajes, flota, alquileres, cartera digital, gastos y reportes.

Monorepo con pnpm y Turborepo:

| Ruta                 | Contenido                                                                                                                                                               |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`           | Next.js (App Router), Tailwind, shadcn/ui, TanStack Query/Table, react-hook-form + zod, react-leaflet                                                                   |
| `services/gateway`   | Punto de entrada público: JWT, roles, enrutamiento y Swagger                                                                                                            |
| `services/*`         | `administracion`, `flota`, `viajes`, `ventas`, `clientes`, `reportes`, `notificaciones` (NestJS + Prisma, una base por servicio)                                        |
| `services/ventas`    | Boletos y asientos; la compra con cartera es una saga (reservar, cobrar, confirmar) que libera los asientos si el cobro se rechaza y se recupera si queda en duda       |
| `packages/contracts` | Nombres y payloads de los eventos                                                                                                                                       |
| `packages/messaging` | Outbox, inbox idempotente y Pub/Sub                                                                                                                                     |
| `packages/server`    | Cliente HTTP entre servicios con circuit breaker por servicio destino (se abre tras 5 fallas seguidas y se prueba a los 30 s), identidad, errores y Swagger compartidos |
| `packages/config`    | tsconfig, ESLint, Prettier y Jest compartidos                                                                                                                           |
| `packages/tools`     | Datos de demostración (`pnpm seed`) y colección Postman (`pnpm postman`)                                                                                                |
| `infra/`             | Dockerfiles e inicialización de PostgreSQL                                                                                                                              |
| `docs/`, `postman/`  | Manuales técnicos y colección de pruebas                                                                                                                                |

## Requisitos

Node 22 o superior, pnpm 10 y Docker.

## Uso

```bash
pnpm install
pnpm local                # todo en local: .env, docker, Pub/Sub, migraciones y apps en modo watch
```

`pnpm local` crea los `.env` que falten a partir de `.env.example`, levanta PostgreSQL, el emulador de Pub/Sub (8085) y Mailpit (8025), crea los tópicos y suscripciones, aplica las migraciones y arranca el web (:3000), el gateway (:4000) y los servicios (:4001-4007). `pnpm local:setup` hace lo mismo sin arrancar las apps y `pnpm local:down` apaga los contenedores.

Abre `http://localhost:3000/estado`: muestra si cada servicio responde y permite enviar un aviso de prueba que viaja por Pub/Sub hasta los 7 servicios.

| Comando                 | Qué hace                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test:unit`        | Pruebas unitarias de todo el repo y tabla de cobertura (mínimo 85%)                                                                   |
| `pnpm test:integration` | Pruebas de integración y tabla de cobertura (mínimo 65%); necesita `pnpm local:setup`                                                 |
| `pnpm test:e2e`         | Playwright del web a 1440 y 390 px con el gateway simulado                                                                            |
| `pnpm test:e2e:real`    | Playwright contra el stack local real (con `pnpm local` corriendo), un worker, como `admin@debus.local`                               |
| `pnpm test:all`         | Unitarias, integración y e2e en orden                                                                                                 |
| `pnpm check`            | Lint, typecheck y unitarias (lo que corre la CI)                                                                                      |
| `pnpm test:clean`       | Borra los datos de prueba de las bases locales                                                                                        |
| `pnpm seed`             | Carga los datos de demostración en el stack local (ver "Datos de demostración")                                                       |
| `pnpm run docs`         | Actualiza los diagramas generados de los manuales (con `--check` solo los compara); `pnpm docs` es un comando de pnpm, no este script |
| `pnpm postman`          | Genera la colección Postman desde el Swagger del gateway; `pnpm postman:test` la ejecuta (con `pnpm local` y `pnpm seed`)             |

Todas aceptan filtros de turbo, por ejemplo `pnpm test:unit --filter=@debus/flota`. El reporte HTML de cobertura queda en `<paquete>/coverage/lcov-report` (unitarias) y `<paquete>/coverage-integration/lcov-report` (integración).

```bash
pnpm new-service <nombre> --port <puerto> [--no-db]
```

Cada servicio expone `GET /health`, Swagger en `/docs`, `POST /events/pubsub` (entrega push de Pub/Sub) y `GET /events/processed/:eventId`. El gateway enruta `/api/<servicio>/*` al servicio correspondiente y oculta las rutas internas; sus rutas de diagnóstico públicas son `GET /api/system/status`, `POST /api/system/probes` y `GET /api/system/probes/:probeId`.

Imágenes: `docker build -f infra/docker/service.Dockerfile --build-arg SERVICE=<servicio> .` (con `--target migrator` para la imagen de migraciones) y `docker build -f infra/docker/web.Dockerfile .`. El web recibe la URL del gateway al arrancar (`API_URL`), así la misma imagen sirve en local y en producción.

## Entornos

| Entorno    | Cómo llega un cambio                               | Web                                     | API                                         |
| ---------- | -------------------------------------------------- | --------------------------------------- | ------------------------------------------- |
| Local      | `pnpm dev`                                         | `http://localhost:3000`                 | `http://localhost:4000`                     |
| Producción | Merge a `main` (workflow `deploy`), con aprobación | `https://web-<número>.<región>.run.app` | `https://gateway-<número>.<región>.run.app` |

La primera vez, después de correr `infra/gcp/bootstrap.sh` y cargar sus variables en GitHub, se ejecuta `deploy` a mano con `all=true`.

En cada despliegue, el job `pubsub` de `release` crea los tópicos y las suscripciones **antes** de desplegar los servicios (`deploy` depende de él). Pub/Sub descarta los mensajes publicados a un tópico sin una suscripción que los acepte, así que un servicio que publica al arrancar, como el primer admin, no puede adelantarse a ellas.

### Si el correo del primer admin no llega

1. En GitHub, **Actions > smtp-check > Run workflow**. Envía un correo real de prueba a `BOOTSTRAP_ADMIN_EMAIL` con la configuración de producción y termina con un resumen: "Enviado correctamente" o la causa (contraseña de aplicación incorrecta o verificación en 2 pasos inactiva, sin conexión con `smtp.gmail.com:465`, o el código y el mensaje del servidor). Nunca imprime contraseñas ni direcciones completas.
2. Con `smtp-check` en verde, abrir `/recuperar` en la web de producción e ingresar el correo del admin. Mientras la cuenta esté pendiente, reenvía el enlace de activación; si ya está activa, envía el de restablecimiento.
3. Si sigue sin llegar, revisar los logs de Cloud Run de `notificaciones` (¿recibió `AccountLinkSent`?) y de `administracion` (¿publicó el evento?), y las suscripciones `notificaciones-from-administracion` y su dead-letter en Pub/Sub. Requiere acceso a GCP. En un entorno nuevo, si `notificaciones` tarda más de unos 2,5 minutos en estar en línea después de que arranque `administracion`, Pub/Sub agota sus 5 reintentos y deja la invitación del primer admin en `notificaciones-dlq-sub`; en ese caso basta con el paso 2.

### Cuando un servicio empieza a guardar copias

Varios servicios guardan copias de lo que publican otros y solo las reemplazan por una versión más alta: sucursales y configuración (`administracion`), choferes, rutas y buses (`flota`). Lo que se creó antes del primer despliegue que incluye una copia no la tiene (o la tiene incompleta), así que se republica una vez: después de un despliegue que agrega consumidores y antes de cada carga de datos iniciales en producción.

1. En GitHub, **Actions > republish > Run workflow**. El campo `targets` acepta pares `servicio/recurso` separados por coma; vacío republica todo, en este orden: `administracion/branches`, `administracion/settings`, `flota/drivers`, `flota/routes`, `flota/buses` (las sucursales antes de lo que vive en ellas).
2. El workflow llama a la ruta interna `POST /internal/<recurso>/republish` de cada servicio con el token de identidad de la cuenta de despliegue, y el log de cada destino termina con el resumen, por ejemplo `{"republished":N}`. Un destino que no está en la lista falla antes de llamar a ninguno.
3. Sucursales, choferes, rutas y buses suben en uno su versión y se publican de nuevo (`BranchUpdated`, `DriverUpdated`, `RouteUpdated`, `BusUpdated`) por el outbox. La configuración no cambia nada: cada versión, que es inmutable, se publica otra vez como `SettingsUpdated` con su mismo `versionId`, y las copias la ignoran si ya la tienen. Repetirlo no hace daño. Viajes y gastos no se republican.
4. El gateway no publica esas rutas. El workflow republica todas las sucursales; las rutas de `administracion` (salvo la configuración, que es global) y de `flota` también aceptan `?branchId=` para una sola sucursal, si alguna vez hace falta llamarlas a mano con el mismo token.

## Datos de demostración

`pnpm seed` (con `pnpm local` corriendo) llena el stack local por la API del gateway: configuración, 6 sucursales con su admin y su cajero, 18 buses con sus choferes, 12 rutas, viajes programados, un viaje completado por bus en el día y gastos de taller. Las cuentas se activan por el mismo enlace de correo que recibiría una persona (Mailpit en local) y usan la contraseña de `SEED_PASSWORD`. Se puede repetir sin duplicar nada y acepta `--only <áreas>` y `--days-ahead <días>`. Las variables y sus valores locales están en `packages/tools/src/seed/run-seed.ts`.

Son datos de demostración, no de prueba: no usan `TEST_BRANCH_PREFIX` y `pnpm test:clean` no los borra. El detalle de las cuentas y de lo que se carga está en [docs/datos-de-prueba.md](docs/datos-de-prueba.md).

En producción se carga con el workflow `seed` (**Actions > seed > Run workflow**), después de `republish`. Nunca corre contra producción sin `--target production` y `SEED_CONFIRM=production`; lee el buzón del equipo por IMAP con `SMTP_USER` y `SMTP_PASSWORD`, y necesita los secretos `SEED_ADMIN_PASSWORD` y `SEED_PASSWORD` y la variable `SEED_ADMIN_EMAIL`.

## Entrega

Dónde está cada entregable que pide el enunciado:

| Entregable                          | Dónde                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Código fuente                       | Este repositorio                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Código compilado                    | Workflow `deliverables` (**Actions > deliverables > Run workflow**, con `version` y `publish`): empaqueta los siete servicios, el gateway y el web, y con `publish` los sube al GitHub Release `v<versión>` junto con `IMAGES.md`. `IMAGES.md` lista solo imágenes que existen en Artifact Registry y el workflow falla si falta alguna: `deploy` construye únicamente lo que cambió en cada commit, así que antes de publicar hay que correr `deploy` con `all=true` sobre el commit del release. Cada paquete se corre con `node dist/main.js` y su `.env` (el web, con `node apps/web/server.js`) |
| Manuales técnicos por microservicio | [docs/README.md](docs/README.md) y un manual por servicio con diagramas de componentes, tablas y despliegue, eventos, endpoints, variables y cómo probarlo. Los diagramas de tablas y de despliegue, los eventos y los endpoints se generan con `pnpm run docs`; `pnpm run docs --check` los compara en la CI                                                                                                                                                                                                                                                                                        |
| Colección Postman                   | [postman/debus.postman_collection.json](postman/debus.postman_collection.json), generada del Swagger con `pnpm postman`, con su recorrido y su entorno local; `pnpm postman:test` la corre contra el stack local                                                                                                                                                                                                                                                                                                                                                                                     |
| Swagger                             | `/docs` del gateway (`http://localhost:4000/docs` en local), con los siete servicios unidos                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Datos para la calificación          | `pnpm seed` y el workflow `seed` ([docs/datos-de-prueba.md](docs/datos-de-prueba.md))                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Producción                          | **Por completar antes del 1 nov (F3):** las direcciones reales del web y del gateway. Tienen la forma `https://web-<número>.<región>.run.app` y `https://gateway-<número>.<región>.run.app`, donde el número y la región son las variables `GCP_PROJECT_NUMBER` y `GCP_REGION` de GitHub, que no están en el código.                                                                                                                                                                                                                                                                                 |

## Convenciones

Commits convencionales (validados en `commit-msg`), PR pequeños y `main` protegida con una aprobación. Todo el código en inglés (identificadores, eventos como `TicketSold` o `TripScheduled`, rutas de la API, Swagger y logs); en español solo los textos de la interfaz, los correos, las URL del navegador y la documentación.

## Glosario

| Código              | Español          |
| ------------------- | ---------------- |
| trip                | viaje            |
| ticket              | boleto           |
| branch              | sucursal         |
| seat                | asiento          |
| driver              | chofer           |
| wallet              | cartera          |
| rental              | alquiler         |
| route               | ruta             |
| expense             | gasto            |
| departure / arrival | salida / llegada |
