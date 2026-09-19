# Reglas de negocio

Qué hace Vendita y **por qué**, área por área. Cuando una regla parece rara, casi siempre nació de un problema real (ver [`../AUDITORIA-v1.md`](../AUDITORIA-v1.md) y los CHANGELOG).

## Principio general: el historial no se borra

Ventas, movimientos de stock y abonos son el registro contable del negocio. Por eso:

- **Se anulan, no se borran** (ventas y abonos).
- Lo que tiene historial **se desactiva, no se elimina** (productos, clientes, usuarios, compañías).
- Las ventas anuladas se **excluyen** de totales, reportes, cartera y estado de cuenta, pero siguen existiendo.

## Ventas

- Una venta lleva renglones (producto y cantidad), un total y un **estado de pago**: `PAGADA` (por defecto), `PENDIENTE` (a crédito, sin abonos) o `PARCIAL` (con abonos y saldo).
- **Descuento de stock atómico:** al vender se descuenta el stock en la misma operación que valida que alcance (`stock >= cantidad`). Así dos ventas simultáneas del último artículo no dejan el stock en negativo. Si no alcanza, se rechaza con un `400`.
- Cada renglón genera un movimiento de stock de tipo `salida`.
- **Un producto inactivo no se puede vender**, aunque la pantalla de ventas siga abierta con datos viejos.
- El producto debe pertenecer a la compañía de quien vende.
- **Venta a crédito exige cliente:** si el estado es `PENDIENTE` o `PARCIAL`, hay que indicar `clientId` (cliente existente) o `clienteNuevo` (`{nombre, telefono}`). Sin cliente no hay a quién cobrarle. El cliente debe ser de la misma compañía y estar **activo**.
- **Cliente nuevo desde la venta:** se busca por celular normalizado; si ya existe, se reutiliza en vez de duplicarlo.
- A una venta existente se le puede asignar o cambiar el cliente (`PATCH /api/sales/:id/cliente`).

## Abonos (pagos)

- Se registran sobre una venta con método `EFECTIVO`, `TRANSFERENCIA`, `NEQUI`, `DAVIPLATA` u `OTRO`.
- El monto debe ser mayor a cero y **no puede exceder el saldo pendiente**. Una venta anulada no recibe pagos.
- Tras cada abono se **recalcula el estado de pago** de la venta a partir de los abonos activos.
- Un abono se puede **anular** con motivo obligatorio (queda registrado, no se borra) y el estado de pago se recalcula.

## Anulación de una venta

- Solo `admin_compania` o `super_admin_sistema`; **motivo obligatorio**.
- No se puede anular una venta ya anulada, ni una con **abonos activos** (primero se anulan esos abonos).
- En una sola transacción: la venta pasa a `ANULADA` (con fecha, usuario y motivo) y **cada renglón devuelve su stock** con un movimiento de tipo `devolucion`.
- Anular sigue funcionando aunque el producto se haya desactivado después.

## Cartera y estado de cuenta

- **Cartera:** por cada cliente con al menos una venta `PENDIENTE` o `PARCIAL` no anulada: saldo adeudado, cantidad de ventas pendientes y antigüedad (en días) de la deuda más vieja. Sirve para decidir a quién cobrar primero.
- **Saldo de una venta** = total − abonos activos. **Antigüedad** = días desde la fecha de la venta.
- **Estado de cuenta de un cliente:** sus datos, saldo total, cada venta pendiente o parcial (fecha, total, abonos, saldo, antigüedad), su historial de ventas pagadas y el total histórico comprado. Excluye ventas anuladas.
- **PDF de estado de cuenta:** datos del negocio y del cliente, fecha de emisión, solo las ventas pendientes/parciales y el saldo total. Mismo estilo que el recibo de venta.
- **Recordatorio por WhatsApp:** el frontend abre `wa.me` al celular del cliente con un mensaje corto y respetuoso ya escrito; no se envía solo, el vendedor lo revisa en WhatsApp. Sin celular registrado, el botón se deshabilita.
- **Exportar cartera:** CSV (cliente, celular, saldo, ventas pendientes, antigüedad más vieja), con el mismo filtro del buscador. Lleva marca BOM para que Excel muestre bien tildes y ñ.

## Clientes

- **Celular:** se guarda normalizado a `+57XXXXXXXXXX`. Solo se aceptan celulares colombianos de 10 dígitos (`3XXXXXXXXX`); con o sin `+57`, espacios o guiones al escribirlo.
- **Búsqueda** por nombre o celular, tolerante a mayúsculas, tildes y al formato del número.
- El nombre es único por compañía.
- **Desactivar** un cliente lo saca de las opciones para nuevas ventas pero conserva su historial.
- **Eliminar** está bloqueado si tiene ventas (incluso anuladas) o pedidos: se sugiere desactivar.

## Productos e inventario

- **SKU único por compañía.**
- **Stock:** número entero. Entradas y salidas manuales exigen cantidad positiva y un motivo, y quedan en el historial de movimientos.
- **Historial de cambios de un producto:** nombre, SKU, precios, stock, categoría, unidad, proveedor y estado activo (quién, qué valor y cuándo).
- **Unidad de medida:** es solo una etiqueta de texto. **No hay conversión entre presentaciones** (caja → paquete → unidad): cada presentación que se venda debe registrarse como un producto distinto, con stock independiente. Regla práctica: registrar el producto en la **menor unidad que se vende** y calcular el precio de compra por esa unidad (costo de la caja ÷ unidades por caja).
- **Un producto se puede eliminar solo si nunca se ha usado** (sin ventas —aunque estén anuladas—, sin pedidos y sin movimientos de stock). Si tiene historial, el sistema lo impide y explica el motivo.
- **Desactivar / reactivar** es la forma de retirar un producto con historial. Un producto inactivo:
  - no aparece en el inventario (salvo con "Mostrar inactivos"), en ventas, en pedidos por WhatsApp, en alertas de stock ni en el catálogo público;
  - no se puede vender ni confirmar en un pedido;
  - **no cuenta** para el límite de productos del plan, ni para el conteo de productos, ni para el valor del inventario;
  - **mantiene su SKU ocupado**: para reutilizarlo hay que reactivarlo o usar otro SKU (el error lo explica);
  - conserva su historial y se puede reactivar.
- **Carga masiva por CSV:** solo admin; respeta el límite de productos del plan y reporta fila por fila lo que no se pudo cargar.

## Pedidos del catálogo público

- Un **pedido no es una venta**: no toca stock, no genera abonos y puede quedar sin confirmar. Se guarda en `Pedido`/`PedidoItem`. Mezclarlo con `Sale` habría obligado a excluirlo en cada reporte y cartera (el mismo tipo de problema que causó `ANULADA`).
- Nunca se confía en lo que manda el visitante: nombre, precio y disponibilidad se recalculan del producto real, y solo si sigue **activo y visible en el catálogo**.
- La revisión de stock al crear el pedido es **informativa, no una reserva**: el stock se descuenta recién al confirmar.
- Estados: `PENDIENTE_REVISION` → `CONFIRMADO` o `RECHAZADO`.
- **Confirmar** crea una venta real con estado de pago `PENDIENTE` y su cliente (buscado o creado por celular), que aparece en la cartera, y descuenta el stock de forma atómica. Falla con un mensaje claro si ya no hay stock o si un producto fue desactivado.
- **Rechazar** exige un motivo.
- El pedido admite `tipoEntrega` (`RECOGE` o `DOMICILIO`), dirección y valor de domicilio (configurable por compañía).
- El catálogo no está limitado por plan: lo tienen todas las compañías, salvo las que están en solo lectura (prueba terminada sin pagar). Cada página lleva el pie "Hecho con Vendita".

## Configuración del catálogo (por compañía)

- `slug` (URL pública): minúsculas, sin tildes, solo letras, números y guiones; **único en todo el sistema**.
- Para activar el catálogo hace falta un `slug` y al menos un número de WhatsApp de ventas (si no, un pedido no tendría a dónde llegar).
- Cada número de WhatsApp se valida como celular colombiano y se normaliza.
- Un catálogo desactivado, un slug inexistente, una compañía inactiva y una compañía en solo lectura responden el mismo `404`, para no distinguir esos casos desde fuera.

## Usuarios

- Roles asignables: `admin_compania` y `empleado_inventario`. **`super_admin_sistema` nunca se asigna por la API.**
- Un admin no puede quitarse su propio rol de admin, ni desactivarse a sí mismo, ni dejar la compañía **sin ningún admin activo**.
- Los usuarios se desactivan, no se eliminan.

## Compañías

- Se registran solas (`POST /auth/register-company`) con la prueba gratis (`LANZAMIENTO`). Ver "Prueba gratis y modo solo lectura".
- Un `super_admin_sistema` puede cambiar el plan (con duración o vitalicio) y **desactivar** una compañía; al hacerlo, sus usuarios pierden acceso de inmediato.

## Planes y límites

- Solo se limita el **número de productos activos**: `FREE` 50, `LANZAMIENTO` (prueba gratis) 500, `BASICO` 150, `PRO` 500.
- El **pedido por WhatsApp con IA** (`/api/pedidos-ia/parse`) es solo `PRO`, con límite de uso por hora. **`LANZAMIENTO` no lo incluye**: cada uso gasta tokens reales.
- **Prueba terminada = solo lectura** (ver más abajo). Un plan de pago (`BASICO`/`PRO`) que ya venció sigue cayendo a `FREE`: todo lo cargado se conserva y solo se impide agregar productos por encima de 50.
- Detalle y precios en `src/config/plans.js`.

### Precios (COP)

| Plan | Productos | Mensual | 6 meses | De por vida |
|---|---|---|---|---|
| `FREE` | 50 | gratis | | |
| `BASICO` | 150 | $10.000 | $60.000 | $250.000 |
| `PRO` (incluye IA) | 500 | $20.000 | $120.000 | $500.000 |

El cobro es **manual**: el cliente paga por Nequi/Daviplata/Bre-B (página `/apoyar`), avisa por WhatsApp con el comprobante, y un super admin activa el plan **por los días que pagó** (30 = un mes, 180 = seis meses, 0 = sin vencimiento) desde el panel de compañías. Los precios están duplicados en `src/config/plans.js` (backend) y `SupportPage.jsx` (frontend, porque esa pantalla es pública): si cambias uno, cambia el otro.

### Prueba gratis y modo solo lectura

Los negocios nuevos **no tienen un plan gratis permanente**: prueban Vendita gratis y luego pagan. Al registrarse (`POST /auth/register-company`) entran al plan `LANZAMIENTO`: hasta 500 productos y **sin el asistente de IA**, con vencimiento.

- **Duración:** la variable `LAUNCH_PLAN_DAYS` del backend, leída en cada registro (sin desplegar código). Vacía, `0` o inválida = **7 días** (un error de configuración nunca debe dejar a los negocios nuevos en un plan gratis permanente).
- **Al vencer sin pagar → solo lectura** (estado calculado `VENCIDO`, "Prueba terminada"). `authMiddleware` rechaza cualquier método que no sea de lectura (`POST`, `PUT`, `PATCH`, `DELETE`) con `403` y `code: 'CUENTA_SOLO_LECTURA'`; los `GET` siguen funcionando, así que el negocio **ve toda su información y no pierde nada**. Los usuarios pueden iniciar sesión. El catálogo público de ese negocio responde `404` (no podría atender los pedidos). El super admin del sistema nunca queda bloqueado.
- **Aviso:** el frontend muestra en todas las pantallas "Tu prueba gratis terminó: tu cuenta está en modo solo lectura" con un botón para activar el plan, y el Dashboard avisa cuando la prueba está por terminar. `GET /api/reports/plan-status` devuelve `plan` (el efectivo: `VENCIDO`) y `storedPlan` (`LANZAMIENTO`).
- **Volver a operar:** el cliente paga (ver "Precios"), avisa por WhatsApp, y un super admin le activa `BASICO` o `PRO` por los días pagados (`PATCH /api/admin/companies/:id/plan`). Sigue donde quedó.
- **Baja:** es manual. Una cuenta que no paga queda en solo lectura indefinidamente hasta que un super admin la desactive (`PATCH /api/admin/companies/:id/activo`); no hay baja automática ni borrado de datos. Un cron que dé de baja tras un plazo está pendiente.
- **Quién queda fuera de esta regla:** las compañías que ya estaban en el plan `FREE` (clientes anteriores a la campaña) **no cambian**, y un plan de pago vencido sigue cayendo a `FREE`. Decisión pendiente: si esas cuentas también deben pasar a solo lectura.
- **Negocios existentes:** no reciben la prueba solos; se puede asignar `LANZAMIENTO` a mano desde el panel de super admin.
- **Pendiente:** no hay una vista de uso por negocio (productos, ventas de los últimos 30 días, catálogo activo, pedidos) para decidir precios con datos.

## Recuperación de contraseña

- Siempre responde 200, exista o no el correo (no permite averiguar qué correos están registrados).
- El enlace enviado por correo vence a la hora.

## Brechas conocidas (decisiones pendientes)

- **La cartera solo está restringida a administradores en el frontend.** La pantalla `/cartera` exige `admin_compania`, pero los endpoints `GET /api/clientes/cartera` y `/cartera/export` aceptan a cualquier usuario autenticado de la compañía. Decidir si debe exigirse el rol también en el backend.
- **No hay presentaciones de producto** (caja/paquete/unidad con conversión automática). Ver "Productos e inventario".
- **El catálogo público no pagina**: ver README del backend, sección "Catálogo público".
