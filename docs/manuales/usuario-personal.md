# Manual de usuario · Personal

Este manual es para quienes trabajan en **debus**: administración del sistema, administración de sucursal, ventanilla y choferes.

Entra desde tu navegador: <https://web-169401355798.us-central1.run.app/>. Tu cuenta y tu contraseña te las da un administrador; los datos de las cuentas de demostración están en [Datos de demostración](../datos-de-prueba.md).

## Qué puede hacer cada rol

| Rol               | Puede                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| Admin del sistema | Usuarios, sucursales, configuración, categorías de gasto, reportes de todo el país y estado del sistema |
| Admin de sucursal | Viajes, alquileres, ventanilla, buses, choferes, rutas, gastos de taller y reportes de su sucursal      |
| Cajero            | Vender boletos en ventanilla                                                                            |
| Chofer            | Ver sus viajes y registrar la salida y la llegada                                                       |

Todos tienen **Mi perfil** en el menú, para completar sus datos.

## Reglas que conviene recordar

- **Salida y llegada no se editan.** Una vez registradas quedan fijas. Por eso la pantalla pide confirmar antes de guardar.
- **Usuarios, buses y choferes se desactivan, no se borran.** Siguen apareciendo en la pestaña **Inactivos** y en los reportes pasados.
- **Los campos solo aceptan lo que les sirve.** En un teléfono no se pueden escribir letras, y si pegas un número con guiones se guardan los dígitos.
- **Las fechas traen el día de hoy** y puedes cambiarlas si registras algo de otro día.

## Admin del sistema

### Panel

Muestra las sucursales activas, el personal, las invitaciones pendientes y la depreciación vigente, con accesos rápidos.

![El panel del admin del sistema](img/personal/admin-panel.png)

### Usuarios

Sirve para ver a todo el personal y los clientes, y para invitar a alguien nuevo.

![La lista de usuarios](img/personal/admin-usuarios.png)

Para invitar:

1. Toca **Invitar usuario**.
2. Escribe el nombre completo y el correo.
3. Elige el rol y, si trabaja en una sucursal, cuál.
4. Toca **Enviar invitación**. La persona recibe un enlace para crear su contraseña; dura 48 horas.

![La ventana para invitar a un usuario](img/personal/admin-invitar.png)

Los choferes no se invitan aquí: los registra el admin de su sucursal. Siempre debe quedar al menos un admin del sistema activo y un admin en cada sucursal activa, y la pantalla lo avisa si intentas desactivar al último.

### Sucursales

![La lista de sucursales](img/personal/admin-sucursales.png)

Para crear una:

1. Toca **Nueva sucursal**.
2. Escribe el nombre, un código de 3 a 5 letras, el municipio, la dirección y un teléfono de 8 dígitos.
3. Toca el mapa donde está la sucursal.
4. Escribe el nombre y el correo de su primer administrador.
5. Toca **Crear sucursal**.

![El formulario de una sucursal nueva, con el mapa de departamentos](img/personal/admin-sucursal-nueva.png)

**Cómo leer el mapa.** Cada departamento lleva una abreviatura: `Quet` es Quetzaltenango, `Hue` es Huehuetenango, `A. Ver` es Alta Verapaz. Si pasas el cursor por encima, ves el nombre completo.

**Tocar el mapa llena el departamento** y las coordenadas. Puedes cambiar el departamento después en su lista. Si tocas el mar o un país vecino, verás "Ese punto está fuera de Guatemala." y no cambia nada.

### Configuración

Guarda la depreciación por kilómetro y la tarifa de alquiler por kilómetro. Un cambio se programa con la fecha **Vigente desde**, y los viajes ya registrados conservan el monto con el que se calcularon.

![La configuración vigente y el formulario para programar un cambio](img/personal/admin-configuracion.png)

### Categorías de gasto

Son las categorías que usan las sucursales al registrar un gasto de taller. Una categoría con gastos no se puede borrar: se desactiva.

![La lista de categorías de gasto](img/personal/admin-categorias.png)

### Estado del sistema

Muestra si cada parte de debus responde. Si algo aparece caído, avisa al equipo técnico.

![El estado de cada servicio de debus](img/personal/admin-estado.png)

## Los reportes

Son 12 y todos funcionan igual:

1. Elige los **filtros** de arriba, como el período o la sucursal.
2. Lee los totales y la tabla, que se puede recorrer por páginas.
3. Toca **Exportar PDF** para descargar todas las filas del filtro, no solo la página que ves.

| Reporte                        | Quién lo ve       | Qué responde                                                |
| ------------------------------ | ----------------- | ----------------------------------------------------------- |
| Listado de buses               | Admin de sucursal | Placa, estado, chofer, kilometraje y viajes de cada bus     |
| Listado de choferes            | Admin de sucursal | Licencia, tipo, vencimiento, estado y viajes de cada chofer |
| Ingresos por boletos           | Admin de sucursal | Lo vendido en boletos, por ruta y por viaje                 |
| Ingresos por alquiler          | Admin de sucursal | Cada alquiler pagado, con cliente, fechas, bus y precio     |
| Depreciación por bus           | Admin de sucursal | Kilómetros y depreciación acumulada de cada bus             |
| Gastos de taller por bus       | Admin de sucursal | Lo gastado en reparaciones de cada bus                      |
| Ingresos por sucursal          | Admin del sistema | Lo que ingresó cada sucursal                                |
| Gastos por sucursal            | Admin del sistema | Lo que gastó cada sucursal                                  |
| Ganancias                      | Admin del sistema | Ingresos menos gastos                                       |
| Rutas más demandadas           | Admin del sistema | Las rutas con más boletos                                   |
| Gastos de taller por categoría | Admin del sistema | Lo gastado en cada categoría                                |
| Mapa de rutas                  | Admin del sistema | Las rutas de cada sucursal, dibujadas sobre el país         |

![El reporte de ingresos por sucursal, con sus filtros y Exportar PDF](img/personal/admin-reporte-ingresos.png)

![El reporte de rutas más demandadas](img/personal/admin-reporte-rutas.png)

En el **Mapa de rutas**, elige la sucursal de origen para ver sus rutas. El mapa lleva las mismas abreviaturas de los departamentos.

![El mapa de rutas de una sucursal](img/personal/admin-reporte-mapa.png)

## Admin de sucursal

### Panel

Muestra los viajes programados del día, las licencias por vencer, los buses en ruta y las próximas salidas. Desde aquí puedes registrar una salida.

![El panel de la sucursal](img/personal/sucursal-panel.png)

### Viajes

1. Toca **Programar viaje**.
2. Elige la ruta, el bus, el chofer, el día y la hora.
3. Confirma.

El bus y el chofer deben estar activos, ser de tu sucursal y estar libres a esa hora; un bus en taller o un chofer con la licencia vencida no se pueden elegir. Un viaje que aún no ha salido se puede eliminar: a quienes compraron se les devuelve el dinero a su cartera.

![La lista de viajes de la sucursal](img/personal/sucursal-viajes.png)

### Alquileres

Aquí llegan los pedidos de los clientes. Revisa cada uno y confirma su precio; puedes corregir los kilómetros. Con **Registrar alquiler de ventanilla** anotas uno pedido en persona, con el precio acordado.

Cuando esté pagado, asígnale bus y chofer desde **Viajes**, en **Alquileres por asignar**.

![La lista de alquileres de la sucursal](img/personal/sucursal-alquileres.png)

### Buses

Registra cada bus con su placa, marca, modelo, año, capacidad y kilometraje. Un bus se manda al taller cambiando su estado, y se desactiva desde sus acciones; si tiene viajes pendientes, la pantalla explica por qué no se puede.

![La lista de buses](img/personal/sucursal-buses.png)

### Choferes

Registra a cada chofer con su correo, teléfono, licencia y salario. Con ese correo recibirá el enlace para entrar a debus. La lista avisa de las licencias por vencer.

![La lista de choferes](img/personal/sucursal-choferes.png)

### Rutas

Cada ruta va de tu sucursal a otra, con su distancia y su precio. Una ruta con viajes no se borra: se retira.

![La lista de rutas](img/personal/sucursal-rutas.png)

### Gastos de taller

Toca **Registrar gasto**, elige el bus y agrega las líneas de mano de obra y repuestos, cada una con su categoría y su monto.

![La lista de gastos de taller](img/personal/sucursal-gastos.png)

### Reportes de la sucursal

Se usan como se explica en [Los reportes](#los-reportes).

![El reporte de ingresos por boletos](img/personal/sucursal-reporte-boletos.png)

![El reporte de depreciación por bus](img/personal/sucursal-reporte-depreciacion.png)

## Cajero

Vendes boletos en **Ventanilla**, y se pagan en efectivo.

1. **Elige el viaje.** Elige la fecha, busca por destino o placa y toca **Vender**.

   ![Los viajes del día en ventanilla](img/personal/cajero-viajes.png)

2. **Elige los asientos** que pide la persona, tocándolos en el mapa.

   ![El mapa de asientos en ventanilla](img/personal/cajero-asientos.png)

3. **Escribe los datos del comprador.** Si el NIT queda vacío, la venta es a consumidor final (también puedes escribir `CF`). El nombre y el correo son opcionales.
4. Revisa la **Fecha de pago** y toca **Cobrar**.

   ![Los datos del comprador antes de cobrar](img/personal/cajero-comprador.png)

**Si algo sale mal**

| Mensaje o situación                                   | Qué hacer                               |
| ----------------------------------------------------- | --------------------------------------- |
| "Revisa el NIT o déjalo vacío para consumidor final." | Corrige el NIT.                         |
| Te avisa que un asiento ya se vendió                  | Elige otro: el asiento aparece ocupado. |

Si el comprador tiene cuenta con ese NIT, el boleto aparecerá en su historial.

## Chofer

### Ver tus viajes

En **Mis viajes** ves los viajes en ruta, los próximos y los completados.

![La lista de viajes de un chofer](img/personal/chofer-viajes.png)

### Registrar la salida

1. Toca el viaje.
2. Revisa la **Fecha** y la **Hora**, que traen el momento actual.
3. Revisa el **Kilometraje inicial**, que trae el del bus, y corrígelo si hace falta.
4. Toca **Registrar salida** y confirma.

![La tarjeta de salida lista para registrar](img/personal/chofer-viaje.png)

La salida no puede ser una hora futura. Revisa bien los datos: después de confirmar no se pueden cambiar.

### Registrar la llegada

Se habilita al registrar la salida.

1. Revisa la **Fecha** y la **Hora**.
2. Escribe el kilometraje final y el combustible.
3. Toca **Registrar llegada** y confirma con **Sí, registrar llegada**.

El kilometraje final no puede ser menor que el inicial, y la pantalla lo avisa junto al campo. Al terminar, el viaje queda así:

![Un viaje completado, con salida y llegada registradas](img/personal/chofer-viaje-completado.png)
