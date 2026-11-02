# Despliegue desde una máquina local

Plan de emergencia para cuando GitHub Actions no está disponible (por ejemplo, si se agotan sus minutos). Hace lo mismo que `deploy.yml` y `release.yml`, una unidad a la vez, desde una Mac con Docker (OrbStack).

## Qué hace

1. **Compilar**: construye la imagen `linux/amd64` de cada unidad (y la de migración de cada servicio) a partir del commit exacto (`git archive`) y la sube a Artifact Registry con el SHA como etiqueta. No toca lo que está corriendo.
2. **Aprovisionar**: crea o actualiza los tópicos, las suscripciones con filtro y las colas de errores de Pub/Sub. Va antes de arrancar los servicios.
3. **Desplegar**, unidad por unidad: corre la migración como Cloud Run Job, publica la revisión en Cloud Run, comprueba `/health` y crea o actualiza los trabajos de Cloud Scheduler.

Los valores que no están en Secret Manager (claves JWT, correo y administrador inicial) se leen de los servicios que ya corren y viajan a Cloud Run en un archivo temporal con permisos 600 que se borra al terminar. Nunca se imprimen ni quedan en el repositorio ni en el historial del shell.

## Requisitos (una sola vez)

```bash
gcloud auth login
gcloud auth application-default login                    # la usa el paso de Pub/Sub
gcloud auth configure-docker us-central1-docker.pkg.dev  # para subir las imágenes
orbctl start                                             # Docker
```

Se necesita el rol de propietario del proyecto, o los roles que usa la cuenta de despliegue. Con 8 GB de RAM, mantén en 4 GB la memoria de OrbStack (`orbctl config set memory_mib 4096`) y cierra otras aplicaciones.

## Uso

Estar en `main` con `git pull` hecho: el comando exige que `HEAD` sea `origin/main` (o `--allow-unmerged`) y que no haya cambios sin confirmar en `packages/contracts`, `packages/messaging` ni `scripts`.

```bash
pnpm deploy:local plan                                  # solo lee: qué corre hoy y qué se publicaría
pnpm deploy:local release --units ventas,web            # simulacro: imprime los pasos
pnpm deploy:local release --units ventas,web --apply --confirm production
```

- `--units a,b` limita las unidades; sin él se publican las que los cambios desde su última publicación afectan. Como `contracts` lo usan todas, conviene indicar las unidades.
- `--phase build,provision,deploy` ejecuta solo algunas fases; sirve para reanudar tras un fallo.
- Sin `--apply --confirm production` nunca se cambia nada.

## Revertir una unidad

Las imágenes anteriores siguen en Artifact Registry. Para volver a la versión previa de una unidad:

```bash
gcloud run deploy <unidad> --region us-central1 --image us-central1-docker.pkg.dev/<proyecto>/debus/<unidad>:<sha-anterior>
```

Las migraciones no se revierten: son aditivas.

## Vaciar y sembrar producción

Orden: **desplegar, vaciar, sembrar**.

1. Pausar los trabajos de Cloud Scheduler (`gcloud scheduler jobs pause <trabajo> --location us-central1`).
2. `TRUNCATE` de todas las tablas de las siete bases salvo `_prisma_migrations`.
3. `seek` de todas las suscripciones y colas de errores a la hora actual, para no reentregar eventos viejos sobre bases vacías.
4. Crear una revisión nueva de `administracion` sin cambiar su configuración (`gcloud run services update administracion --region us-central1 --update-labels restarted=<hora>`); al arrancar crea al administrador de `BOOTSTRAP_ADMIN_EMAIL` y le envía la invitación.
5. Reanudar los trabajos de Cloud Scheduler (`email-flush` envía la invitación).
6. `pnpm seed --target production` (ver [datos-de-prueba.md](datos-de-prueba.md)). Los datos nuevos viajan por la API, así que no hace falta republicar copias.

## Cómo comprobar

- `/health` de cada unidad (lo hace el comando).
- `gcloud scheduler jobs list --location us-central1`: los 10 trabajos en `ENABLED`.
- `gcloud run jobs executions list --region us-central1`: las migraciones terminaron bien.
- Registros de `administracion` con `System admin created` tras reiniciarla, y la invitación en el buzón del equipo.
