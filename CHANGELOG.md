# Changelog

## Sin publicar

### Agregado

- CRUD de usuarios completo: `PUT /api/users/:id` edita nombre/email/rol, `PATCH /api/users/:id/activo` activa/desactiva. Siempre dentro de la compañía del admin que llama (404 si el usuario es de otra compañía) y con la misma lista blanca de roles que `POST /api/users`.
- Reglas de protección: un admin no puede quitarse a sí mismo el rol de administrador ni desactivarse a sí mismo; ninguna acción puede dejar a la compañía sin ningún `admin_compania` activo (ni degradando de rol ni desactivando al último). `super_admin_sistema` nunca se puede editar/desactivar desde estas rutas, aunque perteneciera a la misma compañía.
- `listUsers` ahora también devuelve `activo`, necesario para mostrar el estado en el frontend.
- Frontend: el formulario de "Nuevo Integrante" en `UserManagementPage` ahora también sirve para editar (nombre, email, rol); nueva columna de estado y botón de activar/desactivar por usuario, con confirmación. El botón de desactivar no aparece sobre el propio usuario logueado.
- Tests de integración (`tests/users.test.js`): editar/desactivar usuario de otra compañía (rechazado), rol no permitido (rechazado), auto-desactivación y auto-degradación de rol (rechazadas), dejar la compañía sin ningún admin activo (rechazado, tanto por rol como por desactivación), email duplicado (mensaje claro), y que un empleado no pueda usar estas rutas.

### Cambiado

- Correo de recuperación de contraseña: el remitente ya no está fijo en `onboarding@resend.dev` (el dominio de pruebas de Resend, que solo entrega al correo de la propia cuenta) — ahora usa la variable `EMAIL_FROM`, con `Vendita <no-reply@mail.tyndallcore.com>` como valor por defecto. Ese dominio ya está verificado en Resend (SPF, DKIM, DMARC).
- Contenido del correo de recuperación mejorado: asunto más claro, aclara que "alguien" solicitó el cambio (no asume que fue el destinatario), y separa en su propia línea que ignorar el correo no tiene ningún efecto (la contraseña actual sigue siendo válida).

### Agregado

- `.env.example` con todas las variables de entorno reales que usa el backend, documentadas.
- Sección "Correos (Resend)" en el README explicando `RESEND_API_KEY` y `EMAIL_FROM`.
- `EMAIL_FROM` agregada a `render.yaml` (mismo valor en staging y producción, no es sensible).

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
