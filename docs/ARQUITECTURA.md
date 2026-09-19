# Arquitectura de Vendita

## Vista general

```
                    ┌──────────────────────────────────────────────┐
   Tendero /        │  Frontend  (React, Vercel)                   │
   empleado  ─────► │  vendita.tyndallcore.com                     │
   (panel)          │  · Panel de administración (login)           │
                    │  · Catálogo público /catalogo/:slug (sin login)│
   Cliente final ─► │  · api/og-catalogo (función serverless, OG)  │
   (catálogo)       └───────────────┬──────────────────────────────┘
                                    │ HTTPS + JWT (panel) / sin token (catálogo)
                    ┌───────────────▼──────────────────────────────┐
                    │  Backend  (Node + Express, Render)           │
                    │  /auth  /public  /api/*                      │
                    └───┬─────────────┬─────────────┬──────────────┘
                        │             │             │
                 ┌──────▼─────┐ ┌─────▼──────┐ ┌────▼─────────────┐
                 │ PostgreSQL │ │ Resend     │ │ Cloudinary       │
                 │ (Neon)     │ │ (correos)  │ │ (fotos, firma)   │
                 └────────────┘ └────────────┘ └──────────────────┘
                                                Anthropic API (pedidos por WhatsApp con IA, plan PRO)
```

Es una aplicación **multi-compañía (multi-tenant)**: varias tiendas usan la misma instalación y la misma base de datos, y cada una solo ve sus propios datos.

## Piezas

| Pieza | Tecnología | Dónde corre |
|---|---|---|
| Frontend | React 19 (Create React App), Tailwind, React Router | Vercel |
| Backend | Node.js, Express, Prisma ORM | Render |
| Base de datos | PostgreSQL | Neon (proyecto `Vendita-db`, ramas `production` y `staging`) |
| Fotos de producto | Cloudinary (subida firmada) | Servicio externo |
| Correos | Resend (dominio verificado `mail.tyndallcore.com`) | Servicio externo |
| IA (pedido por WhatsApp) | API de Anthropic | Servicio externo |

Las bases y servicios "free" se duermen tras un rato sin uso: la primera petición puede tardar 20–40 s. El frontend lo detecta (`ColdStartOverlay`) y muestra un aviso en vez de parecer roto.

## Estructura del backend (`src/`)

| Carpeta | Contenido |
|---|---|
| `app.js` | Configuración de Express: CORS, orden de los middlewares y montaje de las rutas. |
| `routes/` | Una por área; solo declaran método, ruta y middlewares. |
| `controllers/` | La lógica de cada endpoint (ventas, clientes, productos, pedidos, reportes…). |
| `middlewares/` | `authMiddleware` (JWT, compañía activa, roles), `planLimits` (límite de productos), `rateLimiter`. |
| `config/` | `plans.js` (límites y precios por plan), `roles.js` (roles asignables), `jwt.js`. |
| `utils/` | Utilidades puras: `phone.js` (celulares +57), `slug.js`, `text.js` (normalizar texto), `cloudinarySign.js`. |
| `services/` | `emailService.js` (Resend). |

Además: `prisma/` (esquema y migraciones), `scripts/` (tareas manuales, nunca automáticas), `tests/` (Jest + Supertest).

## Orden de las rutas y autenticación

En `app.js`, el orden importa:

1. `/auth/*` y `/public/*` se montan **antes** del middleware de autenticación: no piden token.
2. `app.use('/api', authMiddleware)`: desde aquí, **todo `/api/*` exige un JWT válido**.
3. Después se montan los routers de `/api/productos`, `/api/sales`, `/api/clientes`, etc.

Consecuencia importante: **cualquier ruta bajo `/api` responde `401` sin token, exista o no**. Por eso "responde 401 en vez de 404" *no* sirve para comprobar que un endpoint de `/api` ya está desplegado (sí sirve para rutas de `/public` y `/auth`).

`authMiddleware` valida el JWT (vigencia de 8 horas), carga `req.userId`, `req.companyId` y `req.rol`, y **consulta en cada petición que la compañía siga activa**: desactivar una compañía corta el acceso de sus usuarios de inmediato, aunque tengan un token vigente.

## Aislamiento entre compañías

Casi toda consulta incluye `companyId` (el del token). Un usuario nunca recibe datos de otra compañía: pedir un recurso ajeno responde `404`, no `403`, para no revelar que existe. Esta regla tiene tests de "no cruza compañías" en cada área.

Excepción deliberada: `email`, `nombreUsuario` y `Company.slug` son **únicos en todo el sistema**, no por compañía (el login y la URL pública del catálogo lo requieren).

## Roles

| Rol | Quién es | Se asigna |
|---|---|---|
| `empleado_inventario` | Personal del negocio: vende, maneja inventario y clientes | Desde Configuración (por un admin) |
| `admin_compania` | Dueño/administrador del negocio: además, reportes, cartera, usuarios, catálogo, carga masiva, anular ventas | Desde Configuración (por un admin) |
| `super_admin_sistema` | Operador de Vendita: ve y administra todas las compañías | **Solo a mano**, con `scripts/set-super-admin.js`. Nunca por la API. |

La matriz detallada de permisos por endpoint está en [API.md](API.md).

## Modelo de datos

| Modelo | Qué guarda | Notas clave |
|---|---|---|
| `Company` | Una tienda (el "tenant") | Plan (`FREE`/`BASICO`/`PRO`), vencimiento, `activo`, y toda la configuración del catálogo público (`slug`, WhatsApp, domicilio, portada). |
| `User` | Usuario de una compañía | `rol`, `activo`. |
| `Product` | Producto del inventario | SKU único **por compañía**; `activo`; `visibleEnCatalogo`; precio de compra y de venta. |
| `ProductImage` | Fotos de un producto | Con orden; la primera es la portada. |
| `ProductChangeLog` | Historial de cambios de un producto | Nombre, SKU, precios, stock, categoría, unidad, proveedor y estado activo. |
| `StockMovement` | Cada entrada, salida o devolución de stock | `tipo`: `entrada`, `salida`, `devolucion`. |
| `Sale` / `SaleItem` | Venta y sus renglones | `estado` (`Completada`/`ANULADA`) y `estadoPago` (`PAGADA`/`PENDIENTE`/`PARCIAL`). |
| `Payment` | Abonos de una venta | Se pueden anular (con motivo); el estado de pago se recalcula desde los abonos activos. |
| `Client` | Cliente del negocio | Nombre único por compañía; celular normalizado a `+57…`; `activo`. |
| `Supplier` | Proveedor | |
| `Pedido` / `PedidoItem` | Pedido llegado del catálogo público | **Entidad separada de `Sale` a propósito**: un pedido aún no es una venta (ver [REGLAS-DE-NEGOCIO.md](REGLAS-DE-NEGOCIO.md)). |
| `PasswordResetToken` | Recuperación de contraseña | Vence a la hora. |

Las migraciones (`prisma/migrations/`) son **solo aditivas** en producción: agregan tablas/columnas, nunca borran datos. Se aplican solas en cada despliegue (`prisma migrate deploy` en el `postinstall`).

## Catálogo público

- El backend expone `GET /public/catalogo/:slug` y `POST /public/catalogo/:slug/pedido` sin autenticación, con límites por IP (ver abajo). Nunca devuelve costos ni el stock exacto: solo `disponible: true/false`.
- El navegador arma el carrito, y al enviar el pedido el backend lo guarda y devuelve un enlace `wa.me` con el mensaje ya escrito para que el cliente lo mande por WhatsApp al negocio.
- **Vista previa al compartir el enlace (Open Graph):** Create React App no puede generar metadatos por ruta y los bots de WhatsApp/Facebook no ejecutan JavaScript. Por eso `frontend/api/og-catalogo.js` (función serverless de Vercel) sirve un HTML mínimo con `og:title`, `og:description` y `og:image`, y un `rewrite` en `frontend/vercel.json` lo activa **solo** cuando el User-Agent es un bot conocido. Las personas siguen viendo la app normal.
- El buscador y el filtro por categoría del catálogo se resuelven en el navegador sobre la lista completa (el endpoint no pagina). Límite conocido: ver README del backend, sección "Catálogo público".

## Fotos (Cloudinary)

El navegador sube la foto **directo a Cloudinary**; el backend solo **firma** la subida (`utils/cloudinarySign.js`, con el algoritmo SHA-1 público y sin instalar el SDK) y nunca recibe la imagen. Borrar sí pasa por el backend porque requiere el API secret.

## Límites de uso (rate limiting)

| Endpoint | Límite |
|---|---|
| `POST /auth/login` | 10 intentos / 15 min por IP |
| `POST /auth/register-company` | 5 / hora por IP |
| `POST /auth/forgot-password` | 5 / 15 min por IP |
| `POST /api/pedidos-ia/parse` | 30 / hora |
| `GET /public/catalogo/:slug` | 60 / minuto por IP |
| `POST /public/catalogo/:slug/pedido` | 20 / hora por IP |

## Planes

Se limita **solo el número de productos activos** (las ventas no se limitan, para no bloquear una venta real frente a un cliente): `FREE` 50, `BASICO` 150, `PRO` 500. El pedido por WhatsApp con IA es exclusivo de `PRO`. Un plan de pago vencido se trata como `FREE`. Todo está en `config/plans.js`.

## Seguridad: resumen

- Contraseñas con bcrypt; JWT de 8 h; recuperación de contraseña sin revelar si un correo existe (siempre responde 200).
- CORS con lista fija de orígenes de producción más los previews de Vercel de este proyecto.
- Ningún script ni migración contiene cadenas de conexión: todo usa `DATABASE_URL`.
- Sin `prisma db seed`: nada inserta datos solo al desplegar.
- Detalle y hallazgos históricos: [`../AUDITORIA-v1.md`](../AUDITORIA-v1.md).
