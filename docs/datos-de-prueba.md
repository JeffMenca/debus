# Datos de demostración

Las cuentas de abajo sirven en la aplicación de producción, <https://web-169401355798.us-central1.run.app/>, una vez corrido el workflow `seed`, y en local (`http://localhost:3000`) después de `pnpm seed`.

Los datos de demostración se cargan con `pnpm seed` (local) o con el workflow `seed` (producción). Todo entra por la API del gateway, como lo haría una persona, así que los eventos fluyen y las copias y los reportes se llenan solos. No son datos de prueba: `pnpm test:clean` no los borra. Esa limpieza sí quita las filas de `reportes` de una sucursal que ya no existe en `administracion` (restos de pruebas que evitan la "Sucursal sin datos" en los reportes); las sucursales del seed siempre existen allí y conservan sus filas.

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
| Cliente             | (sin sucursal)      | `<buzón>+cliente-<n>@<dominio>`         |

`<código>` es el de la sucursal en minúsculas (`gua`, `xel`, `ant`, `cob`, `hue`, `flo`) y `<n>` el número del chofer dentro de ella (de 1 a 5 en Guatemala, de 1 a 3 en Quetzaltenango, Antigua y Flores, y de 1 a 2 en Cobán y Huehuetenango). `<n>` de un cliente va de 1 a 12. El admin del sistema es la cuenta con la que se configuró la plataforma (`SEED_ADMIN_EMAIL`).

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

## Clientes, boletos y alquileres

Los cargan las áreas `clients`, `sales` y `rentals`, siempre por la API pública y sin tocar las bases, así que los eventos llenan las carteras, los boletos y los reportes.

| Dato                  | Cantidad | Detalle                                                                                                                                                     |
| --------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clientes              | 12       | Se registran como lo haría una persona (con DPI, teléfono, NIT y dirección) y activan su cuenta con el enlace que llega al buzón del equipo                 |
| Recargas de cartera   | 24 o más | De una a tres por cliente (de Q100 a Q800), fechadas en los 14 días anteriores a la carga; si una compra o un pago no alcanza, se recarga solo lo que falta |
| Boletos en línea      | unos 16  | Pagados con la cartera sobre los viajes de los días 4 a 7 posteriores a la carga; las rutas más pedidas (Guatemala con Antigua y Quetzaltenango) venden más |
| Boletos de ventanilla | unos 24  | Vendidos en efectivo por el cajero de la sucursal de origen; algunos con el NIT de un cliente, para que salgan en su historial, y alguno con correo         |
| Alquileres            | 10       | Siete pedidos por clientes y tres de ventanilla a nombre de un cliente, todos pagados con su cartera; salen de 9 a 20 días después de la carga              |

Los alquileres llegan cada uno a un punto distinto, para que se vean todos los estados:

| Estado final               | Cuántos | Cómo se ve                                                                                                 |
| -------------------------- | ------- | ---------------------------------------------------------------------------------------------------------- |
| Pedido, esperando precio   | 1       | En línea, "Esperando precio"                                                                               |
| Con precio, sin pagar      | 2       | Uno en línea y uno de ventanilla                                                                           |
| Pagado, esperando bus      | 1       | En "Alquileres" de la sucursal, listo para asignar                                                         |
| Pagado, con bus y chofer   | 4       | Dos en línea y dos de ventanilla; su viaje aparece en la sucursal                                          |
| Cancelado después de pagar | 1       | Se quita el viaje, se devuelve el dinero a la cartera ("Devolución" en Movimientos) y sale de los reportes |
| Cancelado sin haber pagado | 1       | Cancelado por el cliente                                                                                   |

El número exacto de boletos cambia con los viajes que haya el día de la carga. Las fechas de pago se reparten en los 14 días anteriores a la carga (así los filtros de fecha de los reportes muestran algo distinto por periodo); el pago de un boleto puede ser anterior a su compra, porque el campo es editable.

**Qué viajes se venden.** Solo los que salen 4 días o más después de la carga. La operación del día elimina los viajes del seed cuya hora ya pasó sin salir y sus boletos se reembolsan; con cargas cada tres días (lun 26 y jue 29 oct), un boleto vendido a 4 días o más sigue en pie. **Después del jue 29 oct no conviene volver a correr `operations`**: eliminaría los viajes ya pasados que llevan boletos, y los reportes de ingresos perderían esas ventas.

## Volver a cargar

Cargar de nuevo no duplica nada: cada paso busca lo que ya existe y solo crea lo que falta.

- **Local** (con `pnpm local` corriendo): `pnpm seed`. Para repetir solo lo de ventas: `pnpm seed --only clients,sales,rentals` (cada área trae lo que necesita, aunque corra sola). Para repetir solo la operación del día: `pnpm seed --only operations`. Para dejar menos días programados: `pnpm seed --days-ahead 3`.
- **Producción**: GitHub, **Actions > seed > Run workflow**. El campo `only` acepta las áreas separadas por coma (`structure`, `accounts`, `fleet`, `operations`, `clients`, `sales`, `rentals`); vacío carga todo. Antes de la primera carga se corre `republish` para que las copias estén completas.

Cosas que conviene saber de la operación del día (`operations`):

- **Viajes pasados**: antes de programar, quita los viajes del seed (viajes regulares a las 06:00 o las 14:00 en las rutas que abre el seed) que siguen "programados" con la hora ya pasada: los de cargas anteriores que nadie ejecutó y los de la mañana del día de la carga. Así no quedan viajes que parecen no haberse realizado. Nunca toca alquileres, viajes de otro horario ni los que salieron o llegaron; si el servicio se niega a eliminar uno, se deja y se avisa. Un viaje pasado con boletos vendidos se elimina igual y sus boletos se reembolsan, así que conviene avisar al equipo de ventas antes de la carga del 29 oct.
- **Viaje del día**: la API no deja programar en el pasado, así que el viaje se programa unos minutos hacia adelante y después se registra su salida unas horas antes y su llegada un minuto antes. Por eso su hora programada es posterior a su salida y su llegada reales; los reportes usan los registros reales.
- **Madrugada**: la salida se registra como pronto un minuto después de la medianoche de Guatemala, para que el viaje sea del día de la carga. Entre las 00:00 y las 00:02 no hay tiempo para un viaje y se deja sin hacer (se avisa).

La operación del día (`operations`) suma, cada vez que se corre en un día nuevo, un viaje completado por bus y los viajes de los días que faltan; en el mismo día no cambia nada. La primera carga de producción envía unos 60 correos por las cuentas del personal (cada una de las 30 cuentas recibe su invitación y el enlace que pide el seed) y unos 120 más por los clientes (invitaciones, recargas, boletos y alquileres); Gmail permite unos 500 al día. Las cargas siguientes envían pocos o ninguno.
