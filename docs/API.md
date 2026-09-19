# Referencia de la API

Todas las rutas responden JSON (salvo PDF y CSV). Los errores llevan `{ "error": "mensaje" }` en español, listo para mostrarse al usuario.

## Niveles de acceso

| Etiqueta | Significa |
|---|---|
| **Público** | Sin token. Solo `/auth/*` y `/public/*`. |
| **Usuario** | Cualquier usuario autenticado (`Authorization: Bearer <JWT>`) de una compañía activa. |
| **Admin** | `admin_compania` o `super_admin_sistema`. |
| **Super** | Solo `super_admin_sistema`. |
| **PRO** | Usuario autenticado cuya compañía tiene plan `PRO`. |

Recordatorio: todo `/api/*` responde `401` sin token, exista o no la ruta (ver [ARQUITECTURA.md](ARQUITECTURA.md)). Los recursos de otra compañía responden `404`.

Convenciones: las listas paginadas usan `?page=` y `?limit=` y devuelven `totalPages`, `currentPage` y `totalCount`.

---

## Autenticación (`/auth`) — Público

| Método y ruta | Descripción | Notas |
|---|---|---|
| `POST /auth/register-company` | Crea una compañía y su primer administrador. Entra al plan `LANZAMIENTO` (o `FREE` si el lanzamiento está apagado) | 15 por hora por IP |
| `POST /auth/login` | Inicia sesión y devuelve el JWT (8 h) | 10 intentos / 15 min por IP |
| `POST /auth/forgot-password` | Envía el correo de recuperación | Siempre responde 200; 5 / 15 min |
| `POST /auth/reset-password` | Cambia la contraseña con el token del correo | El token vence a la hora |

## Catálogo público (`/public`) — Público

| Método y ruta | Descripción | Notas |
|---|---|---|
| `GET /public/catalogo/:slug` | Compañía y productos publicados (activos y visibles) | Nunca expone costos ni stock exacto (`disponible`). `404` genérico si no existe o está desactivado. 60 / min por IP |
| `POST /public/catalogo/:slug/pedido` | Crea un pedido y devuelve el enlace `wa.me` | Recalcula precios del producto real. 20 / hora por IP |

## Productos (`/api/productos`)

| Método y ruta | Acceso | Descripción |
|---|---|---|
| `GET /` | Usuario | Lista paginada. **Solo activos por defecto**; `?incluirInactivos=true` incluye los inactivos |
| `POST /` | Usuario | Crea un producto. Respeta el límite de productos activos del plan (`403 PLAN_LIMIT_REACHED`) |
| `PUT /:id` | Usuario | Edita; registra los cambios en el historial. Acepta `visibleEnCatalogo` |
| `PATCH /:id/activo` | Usuario | `{ activo: boolean }`. Desactiva o reactiva; queda en el historial |
| `DELETE /:id` | Usuario | Elimina solo si nunca se usó; si no, `409` con el motivo |
| `GET /:id/history` | Usuario | Historial de cambios del producto |
| `POST /upload-csv` | Admin | Carga masiva (respeta el límite del plan; respuesta por fila) |
| `POST /:id/imagenes/firma` | Usuario | Firma para subir una foto directo a Cloudinary (`503` si no está configurado) |
| `POST /:id/imagenes` | Usuario | Registra la foto ya subida (`{ url, publicId }`) |
| `PATCH /:id/imagenes/orden` | Usuario | Reordena las fotos (`{ ids }`) |
| `DELETE /:id/imagenes/:imageId` | Usuario | Borra una foto (también en Cloudinary) |

## Stock (`/api/stock`) — Usuario

| Método y ruta | Descripción |
|---|---|
| `POST /add` | Entrada de stock (`productId`, `cantidad` > 0, `motivo`) |
| `POST /remove` | Salida de stock; se rechaza si no alcanza |
| `GET /history` | Historial de movimientos (entradas, salidas y devoluciones) |

## Ventas (`/api/sales`)

| Método y ruta | Acceso | Descripción |
|---|---|---|
| `POST /` | Usuario | Crea la venta: `items`, `total`, `estadoPago`, y `clientId` o `clienteNuevo` (obligatorio si es a crédito). Rechaza productos inactivos y stock insuficiente |
| `GET /history` | Usuario | Historial paginado |
| `GET /:id` | Usuario | Detalle de una venta |
| `PATCH /:id/cliente` | Usuario | Asigna o cambia el cliente (`clientId` o `clienteNuevo`) |
| `POST /:id/payments` | Usuario | Registra un abono (`monto`, `metodo`). No puede exceder el saldo |
| `GET /:id/payments` | Usuario | Lista los abonos |
| `PATCH /:id/payments/:paymentId/anular` | Usuario | Anula un abono (`motivo` obligatorio) |
| `PATCH /:id/anular` | **Admin** (validado en el controlador) | Anula la venta (`motivo` obligatorio) y devuelve el stock. No admite abonos activos |

`GET /api/receipts/:saleId/pdf` (Usuario) descarga el recibo de la venta en PDF.

## Clientes (`/api/clientes`) — Usuario

| Método y ruta | Descripción |
|---|---|
| `GET /` | Lista paginada. `?search=` por nombre o celular (tolerante a tildes, mayúsculas y formato) |
| `POST /` | Crea un cliente (celular normalizado a `+57…`) |
| `PUT /:id` | Edita |
| `PATCH /:id/activo` | `{ activo: boolean }` |
| `DELETE /:id` | Elimina solo si no tiene ventas ni pedidos; si no, `409` |
| `GET /cartera` | Clientes con saldo pendiente: total adeudado, ventas pendientes y antigüedad |
| `GET /cartera/export` | La cartera en CSV. Acepta `?search=` |
| `GET /:id/estado-cuenta` | Datos, saldo total, ventas pendientes, historial de pagadas y total histórico |
| `GET /:id/estado-cuenta/pdf` | Estado de cuenta en PDF |

> Ver "Brechas conocidas" en [REGLAS-DE-NEGOCIO.md](REGLAS-DE-NEGOCIO.md): `cartera` y `cartera/export` hoy no exigen rol de administrador en el backend.

## Proveedores (`/api/proveedores`) — Usuario

`GET /`, `POST /`, `PUT /:id`, `DELETE /:id` (con `409` si tiene productos asociados).

## Pedidos del catálogo (`/api/pedidos`) — Usuario

| Método y ruta | Descripción |
|---|---|
| `GET /` | Lista paginada. `?estado=PENDIENTE_REVISION\|CONFIRMADO\|RECHAZADO` |
| `PATCH /:id/confirmar` | Crea la venta real (`PENDIENTE`, con cliente) y descuenta el stock. Falla si no hay stock o hay un producto inactivo |
| `PATCH /:id/rechazar` | Rechaza el pedido (`motivo` obligatorio) |

## Configuración de la compañía (`/api/mi-compania`) — Admin

| Método y ruta | Descripción |
|---|---|
| `GET /` | Configuración del catálogo público de la propia compañía |
| `PATCH /` | Actualiza `slug`, `catalogoPublicoActivo`, descripción, portada, `whatsappVentas`, `ofreceDomicilio`, `valorDomicilioDefault` (con validaciones) |
| `POST /portada/firma` | Firma para subir la foto de portada a Cloudinary |

## Usuarios (`/api/users`)

| Método y ruta | Acceso | Descripción |
|---|---|---|
| `GET /` | Usuario | Usuarios de la compañía |
| `POST /` | Admin | Crea un usuario (roles asignables: `admin_compania`, `empleado_inventario`) |
| `PUT /:id` | Admin | Edita nombre, correo y rol |
| `PATCH /:id/activo` | Admin | Activa o desactiva |

## Reportes (`/api/reports`)

| Método y ruta | Acceso | Descripción |
|---|---|---|
| `GET /general-stats` | Admin | Conteo de productos activos, clientes y proveedores |
| `GET /inventory-value` | Admin | Valor del inventario a costo y a precio de venta (solo productos activos) |
| `GET /monthly-sales` | Admin | Ventas por mes (`?startDate=&endDate=`); excluye anuladas |
| `GET /top-selling-products` | Admin | Productos más vendidos (`?startDate=&endDate=`); excluye anuladas |
| `GET /plan-status` | Usuario | Plan efectivo (`plan`), plan guardado en la cuenta (`storedPlan`, aunque haya vencido), vencimiento y uso frente a los límites |

## Pedido por WhatsApp con IA (`/api/pedidos-ia`) — PRO

`POST /parse`: convierte el texto de un mensaje de WhatsApp en un borrador de venta con los productos activos de la compañía. Con `AI_ORDER_MOCK=true` responde sin gastar tokens (útil en staging).

## Administración del sistema (`/api/admin`) — Super

| Método y ruta | Descripción |
|---|---|
| `GET /companies` | Lista todas las compañías |
| `PATCH /companies/:id/plan` | Cambia el plan: `FREE`, `LANZAMIENTO`, `BASICO` o `PRO` (con duración, o vitalicio) |
| `PATCH /companies/:id/activo` | Activa o desactiva una compañía (corta el acceso de sus usuarios de inmediato) |

## Raíz

`GET /` responde `¡Backend de inventario funcionando correctamente!` (sin autenticación). Sirve para saber si el servicio está despierto, **no** para saber qué versión corre.
