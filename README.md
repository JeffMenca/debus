# debus

Plataforma de transporte extraurbano de Guatemala: boletos, viajes, flota, alquileres, cartera digital, gastos y reportes.

Monorepo con pnpm y Turborepo:

| Ruta                 | Contenido                                                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`           | Next.js (App Router), Tailwind, shadcn/ui, TanStack Query/Table, react-hook-form + zod, react-leaflet                            |
| `services/gateway`   | Punto de entrada público: JWT, roles, enrutamiento y Swagger                                                                     |
| `services/*`         | `administracion`, `flota`, `viajes`, `ventas`, `clientes`, `reportes`, `notificaciones` (NestJS + Prisma, una base por servicio) |
| `packages/contracts` | Nombres y payloads de los eventos                                                                                                |
| `packages/messaging` | Outbox, inbox idempotente y Pub/Sub                                                                                              |
| `packages/config`    | tsconfig, ESLint, Prettier y Jest compartidos                                                                                    |
| `infra/`             | Dockerfiles e inicialización de PostgreSQL                                                                                       |
| `docs/`, `postman/`  | Manuales técnicos y colección de pruebas                                                                                         |

## Requisitos

Node 22 o superior, pnpm 10 y Docker.

## Uso

```bash
pnpm install
for d in services/* apps/web; do cp -n "$d/.env.example" "$d/.env"; done
pnpm infra:up             # PostgreSQL, emulador de Pub/Sub (8085) y Mailpit (8025)
pnpm pubsub:provision     # tópicos y suscripciones push hacia los servicios locales
for s in administracion flota viajes ventas clientes reportes notificaciones; do pnpm --filter @debus/$s prisma:deploy; done
pnpm dev                  # web :3000, gateway :4000, servicios :4001-4007
```

Abre `http://localhost:3000/estado`: muestra si cada servicio responde y permite enviar un aviso de prueba que viaja por Pub/Sub hasta los 7 servicios.

```bash
pnpm check                # lint, typecheck y pruebas unitarias (umbral 85%)
pnpm test:integration     # pruebas de integración (umbral 60%), necesitan pnpm infra:up
pnpm test:e2e             # Playwright del web a 1440 y 390 px
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
