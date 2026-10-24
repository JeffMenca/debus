# Manual técnico · Clientes

Perfil, cartera digital y alquileres de buses. Este manual, por ahora, solo cuenta los **alquileres**: sus estados, cómo se pagan y la **saga de cancelación** de un alquiler pagado. El resto (perfil, recargas y devoluciones de boletos) lo completa quien termina el servicio.

## Alquileres

Un alquiler vive en la tabla `rentals` de `clientes`. Puede ser **en línea** (`ONLINE`), pedido por un cliente con cuenta, o **de ventanilla** (`COUNTER`), registrado por el admin de sucursal para alguien sin cuenta. El de ventanilla guarda el NIT (`CF` si no lo dan), el nombre y, si lo dan, el correo.

| Estado      | Qué significa                                          | Lo ve el cliente como     | Lo ve la sucursal como |
| ----------- | ------------------------------------------------------ | ------------------------- | ---------------------- |
| `REQUESTED` | El cliente lo pidió; tiene precio estimado             | Esperando precio          | Por confirmar          |
| `CONFIRMED` | La sucursal fijó el precio                             | Precio listo, falta pagar | Esperando pago         |
| `PAID`      | Se pagó (cartera o efectivo) y se publicó `RentalPaid` | Pagado                    | Pagado                 |
| `CANCELLED` | Se canceló antes o después de pagar                    | Cancelado                 | Cancelado              |

- **Precio estimado**: km que escribe el cliente × tarifa por km vigente ese día (copia local de `SettingsUpdated`). La tarifa queda guardada en el alquiler (`rate_per_km`), así un cambio de configuración no mueve el estimado.
- **Sucursal**: `clientes` guarda una copia de las sucursales (tabla `branches`, alimentada por `BranchCreated` y `BranchUpdated`). Un alquiler en línea solo se pide a una sucursal que existe y está activa; si no, responde 422.
- **Confirmación**: solo desde `REQUESTED` y antes de la salida (después responde 422, porque ese precio ya no se podría pagar). El admin puede corregir los km (importan para la depreciación del bus en `viajes`) y deja el estimado o escribe otro precio. Si es en línea, publica `RentalConfirmed` y `notificaciones` manda "Tu cotización está lista".
- **Ventanilla**: se registra ya `CONFIRMED`, con el precio acordado ahí. Después se cobra en efectivo con el mismo `POST /rentals/{id}/pay`, sin tocar ninguna cartera.
- **Historial por NIT**: un cliente ve sus alquileres en línea y los de ventanilla hechos con el NIT de su perfil (nunca con `CF`), aunque sean de antes de crear la cuenta. Se consulta en el momento, sin copiar filas, así sigue al NIT si el cliente lo cambia.

### Pago con la cartera: una transacción, no una saga

El débito, el paso a `PAID` y el evento `RentalPaid` (por outbox) se escriben **en una sola transacción** de la base de `clientes`: o pasa todo o no pasa nada. Por eso no hace falta saga ni compensación.

- `Idempotency-Key` = id del alquiler. Un reintento encuentra el alquiler ya `PAID` y responde lo mismo; con otra fecha de pago responde 409.
- El alquiler se bloquea (`SELECT … FOR UPDATE`) antes de cobrar, así pagos simultáneos, una confirmación o una cancelación del mismo alquiler se aplican uno tras otro. Una prueba lanza 20 pagos a la vez y exige un solo movimiento y un solo `RentalPaid`.
- No se paga un alquiler cuya salida ya pasó.

## Saga de cancelación de un alquiler pagado (coreografiada)

Un alquiler sin pagar se cancela aquí mismo y nadie más se entera. Uno **pagado** ya está en `viajes` (esperando bus o con su viaje) y en los reportes, así que cancelarlo toca tres servicios. Lo hace una saga **coreografiada**, solo con eventos:

| Paso | Servicio                                       | Tipo             | Qué hace                                                                                                                                                                                                                                                                         |
| ---- | ---------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `viajes` (`POST /rental-requests/{id}/cancel`) | **Pivote**       | En una transacción: si el alquiler tiene viaje y ese viaje ya salió, rechaza con 409 y no cambia nada. Si no, borra el viaje (publica `TripDeleted`, `flota` libera el bus), deja la solicitud `CANCELLED` y publica `RentalCancelled`                                           |
| 2    | `clientes` (`RentalCancelled`)                 | **Reintentable** | Marca el alquiler `CANCELLED`. Si se pagó con la cartera, devuelve lo que tomó el débito (`refunds` con la referencia del alquiler, movimiento `REFUND` y `WalletCredited`, que manda el correo de devolución). Si fue en efectivo, solo marca: la ventanilla devuelve el dinero |
| 3    | `reportes` (`RentalCancelled`)                 | **Reintentable** | Guarda una tumba en `branch_report_rental_cancellations`; "Ingresos por alquiler" ya no cuenta ese alquiler                                                                                                                                                                      |

- **Compensación**: antes del pivote no hay nada que deshacer (el rechazo es inmediato). Después del pivote no se vuelve atrás: los pasos 2 y 3 solo pueden terminar bien, y se repiten hasta lograrlo.
- **Idempotencia**: inbox por `eventId` en cada consumidor, la clave primaria de `refunds` (una devolución por alquiler) y la de la tumba. Un evento repetido no devuelve dos veces.
- **Estado persistido**: `rental_requests.status` y su outbox en `viajes`, `rentals.status` y `refunds` aquí, la tumba en `reportes`.
- **Recuperación**: el outbox de `viajes` reenvía lo pendiente cada minuto, Pub/Sub reintenta con espera y, tras varios fallos, el mensaje queda en la cola de errores de cada servicio, de donde se puede reenviar.
- **Orden de llegada**: si `RentalCancelled` llega a `reportes` antes que `RentalPaid`, la tumba igual excluye el ingreso.

No hay llamadas síncronas nuevas: todo lo que cruza servicios va por eventos, así que no aplica el circuit breaker.
