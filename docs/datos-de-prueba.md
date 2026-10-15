# Datos de demostración

Los datos de demostración se cargan con `pnpm seed` (local) o con el workflow `seed` (producción). Todo entra por la API del gateway, como lo haría una persona, así que los eventos fluyen y las copias y los reportes se llenan solos. No son datos de prueba: `pnpm test:clean` no los borra.

## Cuentas

Todas las cuentas usan la misma contraseña, que se entrega aparte (no está en este documento). El correo de cada cuenta lleva una etiqueta después del `+`; la parte inicial es el buzón del equipo (`<buzón>@gmail.com` en producción, `seed@debus.local` en local), donde llegan los enlaces de activación.

| Rol                 | Sucursal            | Correo                                  |
| ------------------- | ------------------- | --------------------------------------- |
| Admin de sucursal   | Ciudad de Guatemala | `<buzón>+admin-gua@<dominio>`           |
| Admin de sucursal   | Quetzaltenango      | `<buzón>+admin-xel@<dominio>`           |
| Admin de sucursal   | Antigua Guatemala   | `<buzón>+admin-ant@<dominio>`           |
| Admin de sucursal   | Cobán               | `<buzón>+admin-cob@<dominio>`           |
| Admin de sucursal   | Huehuetenango       | `<buzón>+admin-hue@<dominio>`           |
| Admin de sucursal   | Flores              | `<buzón>+admin-flo@<dominio>`           |
| Cajero (ventanilla) | cada sucursal       | `<buzón>+cajero-<código>@<dominio>`     |
| Chofer              | cada sucursal       | `<buzón>+chofer-<código>-<n>@<dominio>` |

`<código>` es el de la sucursal en minúsculas (`gua`, `xel`, `ant`, `cob`, `hue`, `flo`) y `<n>` el número del chofer dentro de ella (de 1 a 5 en Guatemala, de 1 a 3 en Quetzaltenango, Antigua y Flores, y de 1 a 2 en Cobán y Huehuetenango). El admin del sistema es la cuenta con la que se configuró la plataforma (`SEED_ADMIN_EMAIL`).

## Qué datos existen

| Dato                  | Cantidad | Detalle                                                                                                        |
| --------------------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| Configuración vigente | 1        | Depreciación de Q1.25 por km y tarifa de alquiler de Q12 por km, vigente desde el día de la primera carga      |
| Sucursales            | 6        | Ciudad de Guatemala, Quetzaltenango, Antigua Guatemala, Cobán, Huehuetenango y Flores, con coordenadas reales  |
| Rutas                 | 12       | Con regreso: Guatemala con Quetzaltenango, Antigua, Cobán y Flores; Quetzaltenango con Huehuetenango y Antigua |
| Buses y choferes      | 18 y 18  | Cada bus tiene su chofer de planta; dos licencias vencen en menos de 30 días para que se vean las alertas      |
| Viajes programados    | 168      | Dos por ruta cada día (06:00 y 14:00) durante los 7 días siguientes a cada carga                               |
| Viajes del día        | 18       | Uno completado por bus el día de la carga, con salida, llegada, kilometraje y combustible                      |
| Gastos de taller      | 25       | De una a dos reparaciones por bus, con fechas de 10 a 60 días atrás y dos categorías cada una                  |

Los boletos, los alquileres y los clientes se cargan en sus propias áreas (`clients`, `sales` y `rentals`) cuando el equipo de ventas las completa.

## Volver a cargar

Cargar de nuevo no duplica nada: cada paso busca lo que ya existe y solo crea lo que falta.

- **Local** (con `pnpm local` corriendo): `pnpm seed`. Para repetir solo la operación del día: `pnpm seed --only operations`. Para dejar menos días programados: `pnpm seed --days-ahead 3`.
- **Producción**: GitHub, **Actions > seed > Run workflow**. El campo `only` acepta las áreas separadas por coma (`structure`, `accounts`, `fleet`, `operations`, `clients`, `sales`, `rentals`); vacío carga todo. Antes de la primera carga se corre `republish` para que las copias estén completas.

Cosas que conviene saber de la operación del día (`operations`):

- **Viajes pasados**: antes de programar, quita los viajes que siguen "programados" con la hora ya pasada (los de cargas anteriores que nadie ejecutó, y los de la mañana del día de la carga). Así no quedan viajes que parecen no haberse realizado. Los que salieron o llegaron nunca se tocan; si el servicio se niega a eliminar uno, se deja y se avisa.
- **Viaje del día**: la API no deja programar en el pasado, así que el viaje se programa unos minutos hacia adelante y después se registra su salida unas horas antes y su llegada un minuto antes. Por eso su hora programada es posterior a su salida y su llegada reales; los reportes usan los registros reales.
- **Madrugada**: la salida se registra como pronto un minuto después de la medianoche de Guatemala, para que el viaje sea del día de la carga. Entre las 00:00 y las 00:02 no hay tiempo para un viaje y se deja sin hacer (se avisa).

La operación del día (`operations`) suma, cada vez que se corre en un día nuevo, un viaje completado por bus y los viajes de los días que faltan; en el mismo día no cambia nada. La primera carga de producción envía unos 60 correos (cada una de las 30 cuentas recibe su invitación y el enlace que pide el seed); Gmail permite unos 500 al día. Las cargas siguientes no envían ninguno.
