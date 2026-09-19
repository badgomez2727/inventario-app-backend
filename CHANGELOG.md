# Changelog

## Sin publicar

### Cambiado — prueba gratis de 7 días y modo solo lectura (se acabó el plan gratis para negocios nuevos)

- Los negocios nuevos ya no reciben un plan gratis permanente: entran a una **prueba gratis** (plan `LANZAMIENTO`, hasta 500 productos, sin IA) de **7 días** por defecto. Antes eran 180 y, al vencer, caían al plan gratis de 50 productos.
- **Al vencer sin pagar, la cuenta queda en solo lectura** (estado calculado `VENCIDO`, "Prueba terminada"): `authMiddleware` rechaza cualquier `POST`/`PUT`/`PATCH`/`DELETE` con `403` y `code: 'CUENTA_SOLO_LECTURA'`, y los `GET` siguen funcionando. No se pierde nada de lo cargado, los usuarios pueden iniciar sesión, y al activarles un plan pago siguen donde quedaron. El super admin del sistema nunca queda bloqueado.
- El **catálogo público** de una cuenta en solo lectura responde `404` (no podría atender los pedidos).
- `LAUNCH_PLAN_DAYS` vacía, `0` o inválida ahora da 7 días (antes `0` apagaba el lanzamiento y dejaba a los nuevos en `FREE`): un error de configuración ya no puede regalar un plan gratis permanente. `VENCIDO` no es un plan asignable.
- **No cambian:** las compañías que ya estaban en `FREE`, ni la regla de que un plan de pago (`BASICO`/`PRO`) vencido cae a `FREE`. Decisión pendiente: si también deben pasar a solo lectura.
- `scripts/vencer-prueba.js <companyId>`: script manual para probar el modo solo lectura sin esperar 7 días (simula por defecto, solo actúa sobre compañías en `LANZAMIENTO`, no toca las internas).
- Tests: `tests/launch-plan.test.js` (20 pruebas: duración, valores inválidos, qué se bloquea y qué no, login, catálogo, exención del super admin, reactivación al pagar, cuentas FREE y BASICO vencido sin cambios).

### Cambiado — precios de los planes de pago y activación por días

- **Básico sube a $10.000 al mes** (antes equivalía a $5.000: $30.000 por 6 meses) y **Pro a $20.000 al mes** (antes $10.000, igual que el nuevo Básico); 6 meses a $60.000 y $120.000, y los pagos únicos de por vida no cambian ($250.000 y $500.000). Cada plan lleva ahora `priceMonthlyCOP`. Los precios son informativos: el cobro sigue siendo manual.
- `PATCH /api/admin/companies/:id/plan` valida `durationDays` (entero de 0 a 3650, `null` o ausente): antes aceptaba cualquier valor, incluso texto o negativos, y dejaba una fecha inválida o ya vencida. Permite activar un plan por un mes (30 días).
- Tests en `tests/launch-plan.test.js`. Docs: tabla de precios en `docs/REGLAS-DE-NEGOCIO.md`.

## 1.5.0

### En palabras simples (para contarle a los clientes)

- **Empieza gratis, sin tarjeta.** Los negocios nuevos entran al plan de lanzamiento: hasta 500 productos, con ventas, cartera, catálogo en línea y pedidos por WhatsApp. Cuando termina el periodo de lanzamiento no pierdes nada de lo que cargaste.
- **Una página de inicio renovada** que explica en lenguaje simple qué hace Vendita, cómo se empieza y qué incluye la oferta, con ayuda por WhatsApp para arrancar.
- **Te avisamos** en tu panel cuando el periodo de lanzamiento está por terminar, y también cuando un plan de pago vence (antes ese aviso no aparecía).

### Agregado — plan de lanzamiento (gratis) y preparación para la campaña

- Plan nuevo `LANZAMIENTO` (`config/plans.js`): **gratis**, con techo de **500 productos** (el de PRO) y **sin el asistente de IA** (que gasta tokens reales y sigue siendo exclusivo de PRO). Todo negocio que se registra entra a este plan con vencimiento; al vencer cae solo al plan FREE (50 productos) **conservando todo lo que cargó** — solo se bloquea agregar productos nuevos por encima del techo. Sin migración: `plan` ya era un texto.
- Duración configurable sin desplegar código con `LAUNCH_PLAN_DAYS` (vacío = 180 días; un número = esa cantidad de días; `0` = lanzamiento apagado y los negocios nuevos entran al plan FREE). Se lee en cada registro.
- Un super admin puede asignar `LANZAMIENTO` a mano (`PATCH /api/admin/companies/:id/plan`), con 180 días por defecto, para dárselo a negocios ya existentes.
- `GET /api/reports/plan-status` ahora incluye `storedPlan` (el plan que figura en la cuenta aunque haya vencido) para poder avisar "terminó tu periodo de lanzamiento" en vez de un genérico "volviste a Gratis".
- Límite de registros de compañías (`POST /auth/register-company`) subido de 5 a **15 por hora por IP**: en celulares muchos usuarios comparten la IP del operador, y con 5 una campaña de anuncios bloquearía a negocios legítimos.
- Tests de integración en `tests/launch-plan.test.js` (plan al registrarse, duración, apagado, límites, vencimiento sin pérdida de datos, sin IA, asignación por super admin).

## 1.4.0

### En palabras simples (para contarle a los clientes)

- **Retira productos sin perder nada.** Un producto que ya tiene ventas o movimientos no se puede borrar (así el historial siempre cuadra). Ahora puedes **desactivarlo**: deja de aparecer en el inventario, en las ventas y en tu catálogo, conserva su historial, y lo puedes reactivar cuando quieras.
- **Te explica por qué no se puede borrar un producto**, en vez de un aviso genérico, y te sugiere desactivarlo.
- **Tu catálogo en línea, más completo:** al tocar la foto de un producto tus clientes ven su detalle, con todas las fotos, el precio, si está disponible y la descripción.
- **Cantidad escrita a mano** en el catálogo: tus clientes pueden teclear "24" en vez de tocar "+" veinte veces.
- **Documentación técnica del sistema** para quien lo mantenga.

### Agregado — desactivar / reactivar productos

- `PATCH /api/productos/:id/activo` (`{ activo: true|false }`): retira un producto del inventario, las ventas y el catálogo sin perder su historial, y lo reactiva cuando se quiera. Un producto con historial (ventas —incluidas las anuladas—, pedidos o movimientos de stock) no se puede eliminar, así que esta es su forma de "darse de baja", igual que ya existía para clientes, usuarios y compañías. Cada cambio queda en el historial del producto (`campo: 'activo'`); pedir el estado que ya tiene responde 200 sin duplicar el registro. Sin migración: la columna `activo` ya existía.
- `GET /api/productos` ya no devuelve los inactivos por defecto (así desaparecen solos de ventas, alertas de stock y demás pantallas que cargan esa lista); `?incluirInactivos=true` los incluye, y el conteo/paginación siguen ese mismo filtro.
- `POST /api/sales` rechaza un producto inactivo (`400`), aunque la pantalla de ventas siga abierta con datos viejos. Confirmar un pedido del catálogo con un producto desactivado también se rechaza, con un mensaje que dice qué hacer. Anular una venta con un producto ya desactivado sigue devolviendo el stock.
- Los inactivos **no cuentan** para el límite de productos del plan (crear un producto y carga masiva), ni para el conteo de productos de las estadísticas y del estado del plan, ni para el valor del inventario: un producto retirado ya no se ve en ninguna parte, y como no se puede borrar si tiene historial, contarlo haría que retirar productos nunca liberara cupo.
- El SKU de un producto inactivo sigue ocupado; al intentar reutilizarlo, el error `409` ahora lo dice ("ya existe un producto inactivo con ese SKU") en vez de un mensaje que parecía no tener sentido.
- Tests de integración en `tests/product-activo.test.js`.

### Documentado — documentación técnica del sistema

- Nueva carpeta `docs/` con la documentación técnica de todo el sistema (backend y frontend): arquitectura y modelo de datos, reglas de negocio, referencia de la API con su nivel de acceso, y operación y checklist de release (variables de entorno, verificación de despliegues, problemas conocidos). Incluye una sección de "brechas conocidas" con las decisiones pendientes.
- "Actualizar la documentación" pasa a ser un paso fijo del checklist de release.

## 1.3.0

### En palabras simples (para contarle a los clientes)

- **Encuentra a cualquier cliente en segundos.** Busca por nombre o por celular en Clientes y en Cartera, sin importar mayúsculas, tildes ni cómo esté escrito el número (con o sin +57, con espacios o guiones).
- **La ficha completa de cada cliente**, con un clic: cuánto debe, cuánto ha comprado en total, sus ventas pendientes con abonos y antigüedad, y su historial de ventas pagadas. Desde ahí mismo abres una venta y registras un abono, sin ir al historial.
- **Estado de cuenta en PDF**, listo para entregar o enviar: datos de tu negocio, del cliente, fecha, ventas pendientes con sus abonos y el saldo total.
- **Recordatorio de cobro por WhatsApp**, con un mensaje corto y amable ya escrito (saldo y detalle de lo pendiente). Se abre en WhatsApp para que lo revises y lo ajustes antes de enviarlo.
- **Exporta tu cartera completa** a un archivo que abre Excel, con cliente, celular, saldo, ventas pendientes y antigüedad de la deuda más vieja; respeta lo que hayas escrito en el buscador.
- **Tu catálogo público ahora tiene buscador y categorías.** Tus clientes encuentran un producto escribiendo su nombre (aunque lo escriban en plural o sin tilde) o filtrando por categoría; los productos sin categoría aparecen en "Otros".

### Agregado — v1.3, Parte 1: buscador y detalle del cliente

- `GET /api/clientes?search=` acepta un texto que filtra por nombre (tolerante a mayúsculas y tildes) o por celular (tolerante al formato: con o sin `+57`, espacios o guiones). Nuevo `src/utils/text.js` con `normalizeText`/`onlyDigits` (extraído de una copia que ya existía en `aiOrderController.js`, sin cambio de comportamiento).
- `GET /api/clientes/:id/estado-cuenta`: datos del cliente, saldo total adeudado, cada venta pendiente o parcial (fecha, total, abonos, saldo, antigüedad en días), historial de ventas pagadas y el total histórico comprado. Excluye ventas anuladas del cálculo, igual que la cartera.
- `GET /api/sales/:id`: detalle de una venta puntual, para poder abrirla desde el nuevo panel del cliente sin pasar por el historial general.
- Tests de integración en `tests/clients.test.js` y `tests/sales.test.js`.

### Agregado — v1.3, Parte 2: exportar y compartir el estado de cuenta

- `GET /api/clientes/:id/estado-cuenta/pdf`: PDF con los datos del negocio, del cliente, la fecha de emisión, la tabla de ventas pendientes/parciales (fecha, total, abonado, saldo, antigüedad) y el saldo total — mismo estilo y librería (`pdfkit`) que el recibo de venta existente. Excluye pagadas y anuladas.
- `GET /api/clientes/cartera/export`: exporta la cartera a CSV (cliente, celular, saldo, cantidad de ventas pendientes, antigüedad de la deuda más vieja), respetando el mismo `?search=` del buscador de clientes. Sin librería nueva — se arma el CSV a mano, con BOM UTF-8 para que Excel muestre bien tildes/ñ.
- `computeCartera` extraído de `getCartera` para que el cálculo de la cartera sea exactamente el mismo en la pantalla y en el export.
- Tests de integración: cálculo del PDF (incluye/excluye lo correcto), y export de CSV respetando el filtro de búsqueda y el aislamiento por compañía.

### Documentado — v1.3, Bloque 2: catálogo público

- README: nota sobre el límite conocido del endpoint público del catálogo (no pagina; el buscador/filtro del catálogo son del lado del cliente). Sin cambios de código en el backend.

## 1.2.0

### En palabras simples (para contarle a los clientes)

- **Catálogo público, sin que tu cliente necesite instalar nada ni crear cuenta.** Cada negocio tiene su propia vitrina en línea (`vendita.tyndallcore.com/catalogo/tu-tienda`) con fotos, precios y disponibilidad — la activas y la configuras tú mismo desde "Catálogo Público" en el menú.
- **Fotos reales de tus productos**, subidas desde el celular (con cámara o galería), varias por producto, reordenables.
- **Tus clientes arman su pedido solos**: eligen productos, dejan su nombre y celular, dicen si recogen o piden domicilio, y al final se abre WhatsApp con el pedido ya escrito, listo para mandarte.
- **Tú decides qué se publica**: cada producto tiene un interruptor de "mostrar en catálogo" — nada se hace público solo porque esté en tu inventario.
- **Los pedidos no son ventas hasta que tú los confirmes.** Te llegan a una bandeja nueva ("Pedidos Catálogo") donde los revisas y decides: confirmar (se convierte en una venta pendiente de pago, con su cliente, lista para cobrar) o rechazar.
- Al compartir el link de tu catálogo por WhatsApp, se ve una vista previa con el nombre, la descripción y la foto de tu negocio.

### Agregado — Bloque 1 parte 1: fotos de producto

- `Product.visibleEnCatalogo` (default `false`): controla qué productos se publican en el catálogo público — nada se muestra solo porque exista en el inventario.
- Modelo `ProductImage`: varias fotos por producto, con orden explícito (la primera es la portada). Migración puramente aditiva.
- Fotos subidas directo del navegador a Cloudinary — el backend solo firma la subida (`src/utils/cloudinarySign.js`, sin instalar el SDK oficial, con el algoritmo público de firma sobre `crypto`) y nunca recibe el binario de la imagen. Borrar sí pasa por el backend (requiere el API secret).
- `POST /api/productos/:id/imagenes/firma`, `POST /api/productos/:id/imagenes`, `DELETE /api/productos/:id/imagenes/:imageId`, `PATCH /api/productos/:id/imagenes/orden` — mismo permiso que editar el producto (cualquier usuario de la compañía, no solo admin). Sin credenciales de Cloudinary configuradas, responde `503` con mensaje claro en vez de fallar feo.
- `POST`/`PUT /api/productos` ahora aceptan `visibleEnCatalogo`.
- Variables nuevas: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (documentadas en `.env.example`, `render.yaml` y el README — sección "Fotos de producto").
- Tests de integración en `tests/product-images.test.js`.

### Agregado — Bloque 1 parte 2: configuración de empresa para el catálogo

- `Company.slug` (único, editable desde `/api/mi-compania`), `catalogoPublicoActivo`, `descripcionCatalogo`, `fotoPortadaCatalogo`, `whatsappVentas` (array de celulares normalizados a `+57`), `ofreceDomicilio` y `valorDomicilioDefault`. Migración puramente aditiva; ninguna compañía existente queda con el catálogo activo (todo `false`/vacío por defecto).
- `GET`/`PATCH /api/mi-compania` (solo `admin_compania`/`super_admin_sistema`): configura la vitrina de la propia compañía. `PATCH` valida y normaliza: el `slug` se limpia con `src/utils/slug.js` (minúsculas, sin tildes, solo letras/números/guiones) y debe ser único; cada número de `whatsappVentas` pasa por `normalizePhoneCO` (reutilizado del Bloque B) y se rechaza si no es un celular colombiano válido; `valorDomicilioDefault` debe ser ≥ 0.
- No se puede activar `catalogoPublicoActivo` sin tener ya (o mandar en la misma petición) un `slug` y al menos un número en `whatsappVentas` — sin eso, un pedido no tendría a dónde llegar.
- `POST /api/mi-compania/portada/firma`: firma de subida para la foto de portada del catálogo, mismo mecanismo que las fotos de producto (Parte 1).
- Tests de integración en `tests/company-settings.test.js`.

### Agregado — Bloque 1 parte 3: catálogo público (lectura)

- `GET /public/catalogo/:slug` (sin autenticación, montada antes de `authMiddleware` igual que `/auth`): devuelve la compañía (nombre, descripción, portada, WhatsApp, domicilio) y sus productos con `visibleEnCatalogo=true` y `activo=true`. Nunca expone `precioCompra` ni `stockActual` — solo `disponible: stockActual > 0`. Un slug inexistente y una compañía con el catálogo desactivado (o la compañía misma inactiva) responden el mismo `404` genérico, para no distinguir esos casos.
- `publicCatalogLimiter`: 60 peticiones/minuto por IP (sin login no hay una identidad más fina por la que limitar).
- Tests de integración en `tests/public-catalog.test.js`.

### Agregado — Bloque 1 parte 4: carrito y pedido

- Modelos `Pedido`/`PedidoItem` (migración puramente aditiva). Un pedido del catálogo público **no es una venta**: no toca stock, no genera `Payment`, y puede quedar sin confirmarse — mezclarlo en `Sale` habría obligado a excluirlo en cada reporte/cartera que ya suma o cuenta ventas, igual que `ANULADA` hoy. Se convierte en una `Sale` real recién cuando un admin lo confirma (próxima parte del bloque).
- `POST /public/catalogo/:slug/pedido` (sin autenticación): recibe `items`, `cliente { nombre, telefono }`, `tipoEntrega` (`RECOGE`/`DOMICILIO`) y `direccionEntrega` si aplica. Nunca confía en nada que mande el visitante: cada producto se revalida contra el catálogo real (debe seguir `activo` y `visibleEnCatalogo`, con stock suficiente — chequeo informativo, no una reserva) y el precio se recalcula del `Product` real, nunca del body. El cliente se resuelve con `findOrCreateCliente` (Bloque B) — mismo celular, mismo cliente, sin duplicar.
- Domicilio se rechaza si la compañía no lo ofrece o si falta la dirección; el `valorDomicilio` del pedido es un snapshot del `valorDomicilioDefault` de la compañía al momento del pedido.
- La respuesta incluye `whatsappUrl` (`https://wa.me/...`) con el pedido ya armado como mensaje, listo para que el frontend redirija — se genera en el servidor para que el formato sea siempre consistente.
- `publicPedidoLimiter`: 20 pedidos/hora por IP (más estricto que el de lectura, porque esto sí escribe en la base).
- `deleteClient` y el mensaje de `P2003` en `deleteProduct` ahora también consideran los pedidos al bloquear un borrado con historial.
- Tests de integración en `tests/public-catalog.test.js`.

### Agregado — Bloque 1 parte 5: panel de pedidos (confirmar/rechazar)

- `GET /api/pedidos` (filtrable por `?estado=`), `PATCH /api/pedidos/:id/confirmar`, `PATCH /api/pedidos/:id/rechazar` — no requieren admin, es trabajo operativo normal (igual que registrar un pago).
- Confirmar un pedido crea la `Sale` real dentro de una transacción: misma mecánica atómica de stock que `createSale` (`stockActual >= cantidad` en el mismo `UPDATE`), usando los ítems y precios ya guardados en el pedido (no algo nuevo del body). La venta queda **`estadoPago: PENDIENTE`** a propósito — el cliente paga al recibir/recoger, no antes — así aparece en la cartera (Bloque B) hasta que se registre el pago real. `sale.total` incluye el domicilio si lo hay (los `SaleItem` solo representan los productos).
- Si el stock bajó desde que se hizo el pedido, confirmar se rechaza con un mensaje claro y el pedido sigue `PENDIENTE_REVISION` (no queda a medias).
- Rechazar exige motivo, no toca stock ni crea venta. Ninguno de los dos se puede aplicar dos veces sobre el mismo pedido.
- Tests de integración en `tests/pedidos.test.js`, incluida una verificación de punta a punta con la cartera del Bloque B.

### Corregido

- `POST /api/sales` y `PATCH /api/sales/:id/cliente` ya validaban que un `clientId` existiera y perteneciera a la compañía, pero no que el cliente estuviera activo — un cliente desactivado (o borrado, si nunca tuvo ventas) en otra pestaña seguía siendo aceptado si el selector del POS quedó desactualizado. Ahora ambos rechazan (400, "Este cliente está desactivado...") un `clientId` inactivo.
- Tests en `tests/sale-credit.test.js`: `clientId` inexistente y `clientId` desactivado rechazados, en ambos endpoints.

## 1.1.0

### En palabras simples (para contarle a los clientes)

- **Fiar ya no es a ciegas.** Toda venta que quede pendiente o parcial ahora te pide un cliente — si no lo tienes registrado, lo creas ahí mismo con solo el nombre y el celular, sin salir de la venta. Si ese celular ya estaba registrado, usamos el cliente que ya tenías en vez de crear uno repetido.
- **Cartera de clientes.** Una vista nueva te muestra, cliente por cliente, cuánto te debe, cuántas ventas tiene pendientes y hace cuántos días — para saber a quién cobrarle primero.
- **Clientes con estado**, igual que tu equipo: puedes desactivar un cliente sin borrar su historial, y ya no se puede eliminar por accidente a un cliente que tiene ventas registradas.

### Agregado

- Cliente obligatorio en ventas a crédito: `POST /api/sales` rechaza (400) una venta `PENDIENTE` o `PARCIAL` sin `clientId` ni `clienteNuevo`. Las ventas `PAGADA` siguen con cliente opcional.
- `clienteNuevo: { nombre, telefono }` en `POST /api/sales` crea (o reutiliza, si ya existe un cliente con ese celular en la compañía) un cliente dentro de la misma transacción de la venta — no hace falta salir del formulario de venta para crear el cliente primero.
- El celular se normaliza a formato internacional colombiano (`+57XXXXXXXXXX`, ver `src/utils/phone.js`) en creación/edición de clientes y en `clienteNuevo`; es el identificador para reutilizar un cliente en vez de duplicarlo. No hay constraint de base de datos sobre el celular (a propósito, ver nota en `schema.prisma`) — la reutilización es a nivel de aplicación.
- `PATCH /api/sales/:id/cliente`: asigna o cambia el cliente de una venta existente (acepta `clientId` o `clienteNuevo`), pensado para ventas pendientes que quedaron sin cliente antes de esta validación. No requiere admin.
- CRUD de clientes completo: `PATCH /api/clientes/:id/activo` activa/desactiva un cliente (no borra su historial).
- `GET /api/clientes/cartera`: para cada cliente con al menos una venta `PENDIENTE`/`PARCIAL` activa, su saldo adeudado total, la lista de esas ventas (con saldo y antigüedad en días de cada una) y el total general.
- `scripts/check-pending-sales-without-client.js`: diagnóstico de solo lectura que cuenta cuántas ventas pendientes/parciales ya existentes quedaron sin cliente, por compañía.
- Migración `add_client_activo_and_phone_index`: agrega `activo` (default `true`) a `clients` y un índice `(companyId, telefono)`. Puramente aditiva.
- `DELETE /api/clientes/:id` ahora rechaza (409, "Este cliente tiene ventas registradas; desactívalo en vez de eliminarlo") si el cliente tiene al menos una venta asociada (de cualquier estado, incluidas las anuladas). Antes esto no fallaba nunca (`sales.client_id` es `ON DELETE SET NULL` a nivel de esquema, sin tocar) y el borrado dejaba la venta huérfana de cliente en silencio — con la cartera ya siendo una función real, ese hueco importaba. La validación es a nivel de aplicación, no se tocó el esquema.
- Tests de integración (`tests/sale-credit.test.js`, `tests/clients.test.js`): venta pendiente/parcial sin cliente rechazada, venta pagada con cliente opcional, creación y reutilización de cliente por celular desde la venta, celular inválido rechazado, asignar cliente a una venta existente (incluye rechazo entre compañías y sobre ventas anuladas), activar/desactivar cliente, borrado bloqueado con ventas, y cálculo de cartera (saldo, antigüedad, exclusión de ventas pagadas/anuladas).

### Cambiado

- `createSale` ahora responde con el código de error correcto según la causa (400 para "stock insuficiente" o "producto no encontrado", antes siempre 500) en vez de un 500 genérico para cualquier error de validación dentro de la transacción.

## 1.0.1

### En palabras simples (para contarle a los clientes)

- **Los correos ya llegan de verdad.** Antes, el de recuperar contraseña casi nunca le llegaba a un usuario real (usaba el dominio de pruebas de nuestro proveedor de correo); ahora sale desde nuestro propio dominio, verificado.
- **Gestión de tu equipo completa.** Ya puedes editar el nombre, correo o rol de cualquier integrante, y desactivar/reactivar el acceso de alguien sin tener que borrarlo (por ejemplo, si alguien sale del equipo temporalmente). Siempre queda al menos un administrador activo, para que nadie se quede sin poder entrar a su propia cuenta por accidente.

### Agregado

- CRUD de usuarios completo: `PUT /api/users/:id` edita nombre/email/rol, `PATCH /api/users/:id/activo` activa/desactiva. Siempre dentro de la compañía del admin que llama (404 si el usuario es de otra compañía) y con la misma lista blanca de roles que `POST /api/users`.
- Reglas de protección: un admin no puede quitarse a sí mismo el rol de administrador ni desactivarse a sí mismo; ninguna acción puede dejar a la compañía sin ningún `admin_compania` activo (ni degradando de rol ni desactivando al último). `super_admin_sistema` nunca se puede editar/desactivar desde estas rutas, aunque perteneciera a la misma compañía.
- `listUsers` ahora también devuelve `activo`, necesario para mostrar el estado en el frontend.
- Frontend: el formulario de "Nuevo Integrante" en `UserManagementPage` ahora también sirve para editar (nombre, email, rol); nueva columna de estado y botón de activar/desactivar por usuario, con confirmación. El botón de desactivar no aparece sobre el propio usuario logueado.
- Tests de integración (`tests/users.test.js`): editar/desactivar usuario de otra compañía (rechazado), rol no permitido (rechazado), auto-desactivación y auto-degradación de rol (rechazadas), dejar la compañía sin ningún admin activo (rechazado, tanto por rol como por desactivación), email duplicado (mensaje claro), y que un empleado no pueda usar estas rutas.
- `.env.example` con todas las variables de entorno reales que usa el backend, documentadas.
- Sección "Correos (Resend)" en el README explicando `RESEND_API_KEY` y `EMAIL_FROM`.
- `EMAIL_FROM` agregada a `render.yaml` (mismo valor en staging y producción, no es sensible).

### Cambiado

- Correo de recuperación de contraseña: el remitente ya no está fijo en `onboarding@resend.dev` (el dominio de pruebas de Resend, que solo entrega al correo de la propia cuenta) — ahora usa la variable `EMAIL_FROM`, con `Vendita <no-reply@mail.tyndallcore.com>` como valor por defecto. Ese dominio ya está verificado en Resend (SPF, DKIM, DMARC).
- Contenido del correo de recuperación mejorado: asunto más claro, aclara que "alguien" solicitó el cambio (no asume que fue el destinatario), y separa en su propia línea que ignorar el correo no tiene ningún efecto (la contraseña actual sigue siendo válida).

## 1.0.0

### En palabras simples (para contarle a los clientes)

Desde la 0.9.1 hasta esta 1.0.0, así fue evolucionando Vendita:

- **Más seguro por dentro.** Reforzamos varios controles de seguridad internos (quién puede hacer qué, y que cada compañía solo vea sus propios datos). No vas a notar nada distinto en el día a día, pero tu información está mejor protegida.
- **Ver u ocultar tu contraseña** con un clic al escribirla, en vez de escribir a ciegas.
- **Detalle de cada venta** con un clic, sin tener que descargar el PDF cada vez que quieres revisar qué se vendió.
- **Abonos y pagos parciales**: ahora puedes dejar una venta como pendiente o parcial e ir registrando los pagos que el cliente te va haciendo, hasta completarla.
- **Sesión de 8 horas** en vez de 1 — ya no te saca de la aplicación a mitad de tu jornada.
- **Anular una venta** cuando te equivocas o el cliente se arrepiente: el stock de esos productos vuelve automáticamente al inventario, y queda registrado quién la anuló, cuándo y por qué. Las ventas anuladas ya no se cuentan en tus totales ni reportes, pero siguen visibles en el historial con su motivo.
- **Recuperar tu contraseña es más seguro**: el proceso es igual de simple, pero ya no revela si un correo está o no registrado en el sistema.
- **Mensajes más claros**: si intentas borrar un producto, proveedor o cliente que ya tiene historial (ventas, movimientos de stock), ahora te lo explica en vez de mostrar un error genérico.
- **Corregimos un bug molesto**: si recargabas la página estando en cualquier sección, te mandaba de vuelta al inicio — ya no pasa.

### Agregado

- Desactivar compañías: `PATCH /api/admin/companies/:id/activo` (solo `super_admin_sistema`, nunca aplica a la compañía interna). Una compañía inactiva no puede iniciar sesión (mensaje claro en el login) y `authMiddleware` corta cualquier sesión ya abierta de sus usuarios en la siguiente petición (no espera a que expire el token de 8h). Se puede reactivar.
- Recuperar contraseña: `POST /auth/forgot-password` ahora responde siempre `200` con un mensaje genérico, exista o no el correo (y también si el usuario existe pero está inactivo) — antes devolvía `404` cuando el correo no existía, lo que permitía enumerar qué correos están registrados.
- Borrados con historial: `DELETE /api/productos/:id`, `/api/proveedores/:id` y `/api/clientes/:id` ahora capturan `P2003` (violación de llave foránea) y devuelven un mensaje entendible en vez de un 500 genérico. En productos es el caso real (no se puede borrar uno con ventas o movimientos de stock); proveedores y clientes lo capturan por consistencia aunque hoy su relación es `ON DELETE SET NULL` (no falla, deja el registro huérfano — ver nota en `tests/bloque4.test.js`).
- `getMonthlySales` ya no interpola las fechas directamente en el SQL: `startDate`/`endDate` viajan como parámetros ligados (`$2::timestamp`, `$3::timestamp`), igual que `company_id`.
- Frontend: botón activar/desactivar en el panel de compañías (`AdminCompaniesPage`), con confirmación.
- Tests de integración (`tests/bloque4.test.js`): desactivar compañía bloquea login y sesiones abiertas, reactivar restaura el acceso, `admin_compania` no puede desactivar, no se puede desactivar la compañía interna, recuperación de contraseña siempre 200, y borrado de producto con historial rechazado con mensaje claro.
- Anulación de ventas: `PATCH /api/sales/:id/anular` (solo `admin_compania` o `super_admin_sistema`, motivo obligatorio). En una transacción, la venta pasa a `estado: 'ANULADA'` (con fecha, usuario y motivo guardados), y cada ítem devuelve su stock con un `StockMovement` de tipo `'devolucion'`. Se rechaza si la venta tiene pagos activos (primero hay que anularlos), si ya está anulada, o si no pertenece a la compañía del usuario. Una venta anulada tampoco puede recibir pagos nuevos.
- `getMonthlySales` y `getTopSellingProducts` excluyen las ventas `ANULADA` de sus totales. El historial de ventas y el PDF del recibo siguen mostrando la venta anulada (con badge/aviso), pero el total de la página en el historial ya no la suma.
- Frontend: botón "Anular venta" en el detalle de venta (solo visible para `admin_compania`), con confirmación y campo de motivo obligatorio; banner de "Venta anulada" con el motivo, y bloqueo del formulario de registrar pago sobre una venta anulada.
- Tests de integración (`tests/sale-void.test.js`): anulación con devolución de stock, rechazo con pagos activos, rechazo a empleado, rechazo sobre venta de otra compañía, doble anulación rechazada, motivo obligatorio, bloqueo de pagos sobre venta anulada, y exclusión de reportes.

### Cambiado

- `authMiddleware` ahora consulta si la compañía del token sigue activa en cada petición (antes solo leía el JWT). Agrega una consulta a la base de datos por request — necesario para que desactivar una compañía tenga efecto inmediato en vez de esperar hasta 8h a que expire el token.

### Eliminado

- Función muerta `pruebaResend` en `authController.js` (no estaba exportada ni tenía ninguna ruta; era un script de diagnóstico manual que quedó pegado al archivo).

## v0.9.2 — Pagos con abonos, detalle de venta y sesión de 8h

### Agregado

- Módulo de pagos/abonos por venta (tabla `Payment`): `POST /api/sales/:id/payments` registra un pago (monto > 0 y no mayor al saldo pendiente, valida que la venta pertenezca a la compañía del usuario), `GET /api/sales/:id/payments` lista los pagos de una venta, `PATCH /api/sales/:id/payments/:paymentId/anular` anula un pago (motivo obligatorio, nunca se borra el registro).
- `estadoPago` de la venta (`PENDIENTE`/`PARCIAL`/`PAGADA`) ahora se recalcula automáticamente, en la misma transacción, cada vez que se registra o anula un pago — a partir de la suma de los pagos activos (no anulados).
- Script de migración de datos `scripts/backfill-payments.js`: crea el pago histórico (por el total, con la fecha de la venta, método OTRO y nota "Registro previo a módulo de pagos") para las ventas que ya estaban en `PAGADA` antes de este módulo; verifica al final que el estado derivado coincide con el guardado para el 100% de las ventas y muestra el conteo. Corre en `--dry-run` por defecto.
- `GET /api/sales/history` ahora incluye también los pagos activos de cada venta (solo `monto`), para poder calcular el saldo pendiente en el listado sin una llamada adicional.
- Tests de integración para el módulo de pagos (`tests/payments.test.js`): abono parcial, pago completo, sobrepago rechazado, anulación de pago, y pago sobre venta de otra compañía (rechazado).

### Cambiado

- El token JWT ahora expira en 8 horas (antes 1 hora). Con 1h, una sesión de trabajo normal (o una ronda de pruebas) terminaba forzando el login a mitad de una acción.

### Sin cambios

- Migración (`add_payments`) puramente aditiva: crea la tabla `payments`, no toca ninguna tabla existente.
- No se actualizó Prisma ni ninguna otra dependencia.

## v0.9.1 — Correcciones de seguridad (Fase A de AUDITORIA-v1.md)

Sin cambios de funcionalidad visibles para el usuario — todo lo de aquí es corrección de huecos de seguridad encontrados en la auditoría de la v1.0, probados contra staging.

### Corregido

- **CRÍTICO** — Escalación de privilegios: `POST /api/users` ahora exige rol de administrador (`authorizeAdmin`), valida el `rol` recibido contra una lista blanca (`admin_compania`, `empleado_inventario` — `super_admin_sistema` nunca es asignable por API), e ignora cualquier `companyId` enviado en el body (el usuario nuevo siempre queda en la compañía del admin que lo crea).
- **CRÍTICO** — Fuga entre compañías: `POST /api/stock/add` (entrada de stock) ahora verifica que el producto pertenezca a la compañía del usuario antes de modificarlo. Antes, cualquier usuario podía incrementar el stock de un producto de otra compañía pasando su id.
- **CRÍTICO** — Condición de carrera en el stock: `POST /api/sales` y `POST /api/stock/remove` ahora descuentan el stock con una actualización atómica condicionada (`stockActual >= cantidad` en el mismo `UPDATE`), en vez de leer el stock y decidir aparte. Dos ventas/salidas simultáneas del último ítem disponible ya no pueden dejar el stock en negativo.
- Las respuestas HTTP de `addStockEntry`/`addStockExit` ya no se envían desde dentro del callback de `$transaction` (evita un posible doble envío de respuesta si Prisma reintentara la transacción).

### Agregado

- Suite de tests de integración (Jest + Supertest) contra una base de datos local dedicada (`inventario_test`), cubriendo los tres críticos de arriba más los flujos normales de venta y movimiento de stock. Ver `tests/` y la sección "Tests" del README.

### Sin cambios

- No se actualizó Prisma ni ninguna otra dependencia existente (solo se agregaron `jest` y `supertest` como devDependencies nuevas).
- No se tocó `AUDITORIA-v1.md` en este commit (queda pendiente de revisión aparte).
