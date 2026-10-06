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
cp services/<servicio>/.env.example services/<servicio>/.env   # opcional, hay valores por defecto
pnpm infra:up             # PostgreSQL, emulador de Pub/Sub (8085) y Mailpit (8025)
pnpm check                # lint, typecheck y pruebas unitarias (umbral 85%)
pnpm test:integration     # pruebas de integración (umbral 60%)
pnpm test:e2e             # Playwright del web a 1440 y 390 px
pnpm turbo run dev --filter=@debus/flota
pnpm new-service <nombre> [--no-db]
```

Cada servicio expone `GET /health` y Swagger en `/docs`.

Imágenes: `docker build -f infra/docker/service.Dockerfile --build-arg SERVICE=<servicio> .` (con `--target migrator` para la imagen de migraciones) y `docker build -f infra/docker/web.Dockerfile .`.

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
