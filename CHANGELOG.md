# Changelog

## Sin publicar

### Agregado

- Módulo de pagos/abonos por venta (tabla `Payment`): `POST /api/sales/:id/payments` registra un pago (monto > 0 y no mayor al saldo pendiente, valida que la venta pertenezca a la compañía del usuario), `GET /api/sales/:id/payments` lista los pagos de una venta, `PATCH /api/sales/:id/payments/:paymentId/anular` anula un pago (motivo obligatorio, nunca se borra el registro).
- `estadoPago` de la venta (`PENDIENTE`/`PARCIAL`/`PAGADA`) ahora se recalcula automáticamente, en la misma transacción, cada vez que se registra o anula un pago — a partir de la suma de los pagos activos (no anulados).
- Script de migración de datos `scripts/backfill-payments.js`: crea el pago histórico (por el total, con la fecha de la venta, método OTRO y nota "Registro previo a módulo de pagos") para las ventas que ya estaban en `PAGADA` antes de este módulo; verifica al final que el estado derivado coincide con el guardado para el 100% de las ventas y muestra el conteo. Corre en `--dry-run` por defecto.
- `GET /api/sales/history` ahora incluye también los pagos activos de cada venta (solo `monto`), para poder calcular el saldo pendiente en el listado sin una llamada adicional.
- Tests de integración para el módulo de pagos (`tests/payments.test.js`): abono parcial, pago completo, sobrepago rechazado, anulación de pago, y pago sobre venta de otra compañía (rechazado).

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
