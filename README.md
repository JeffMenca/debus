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

Cada servicio expone `GET /health`, Swagger en `/docs`, `POST /events/pubsub` (entrega push de Pub/Sub) y `GET /events/processed/:eventId`. El gateway enruta `/api/<servicio>/*` al servicio correspondiente y oculta las rutas internas.

Imágenes: `docker build -f infra/docker/service.Dockerfile --build-arg SERVICE=<servicio> .` (con `--target migrator` para la imagen de migraciones) y `docker build -f infra/docker/web.Dockerfile .`. El web recibe la URL del gateway al arrancar (`API_URL`), así la misma imagen sirve en local y en producción.

## Entornos

| Entorno    | Cómo llega un cambio                               | Web                                     | API                                         |
| ---------- | -------------------------------------------------- | --------------------------------------- | ------------------------------------------- |
| Local      | `pnpm dev`                                         | `http://localhost:3000`                 | `http://localhost:4000`                     |
| Producción | Merge a `main` (workflow `deploy`), con aprobación | `https://web-<número>.<región>.run.app` | `https://gateway-<número>.<región>.run.app` |

La primera vez, después de correr `infra/gcp/bootstrap.sh` y cargar sus variables en GitHub, se ejecuta `deploy` a mano con `all=true`.

## Convenciones

Commits convencionales (validados en `commit-msg`), PR pequeños y `main` protegida con una aprobación. Identificadores en inglés; textos de la interfaz y documentación en español.

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
