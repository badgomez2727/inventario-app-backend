# Vendita — backend

> **Documentación técnica completa** (arquitectura, reglas de negocio, API, operación y checklist de release): carpeta [`docs/`](docs/README.md). Este README cubre la puesta en marcha operativa del backend.

## Entornos

| Entorno | Rama git | Base de datos (Neon) | Servicio (Render) |
|---|---|---|---|
| Producción | `main` | rama `production` del proyecto `Vendita-db` | servicio existente (creado a mano) |
| Staging | `develop` | rama `staging` del proyecto `Vendita-db` (copia de producción) | `inventario-backend-staging` |

**Staging es para desarrollar y probar la v1.0 sin tocar producción.** Producción tiene clientes reales — nunca apuntar el `DATABASE_URL` de staging a la base de producción.

## Configurar el servicio de staging en Render (una sola vez)

**Opción A — manual (recomendada, más directa):**

1. Render Dashboard → **New** → **Web Service** → conecta el repo `inventario-app-backend`.
2. Rama: `develop`.
3. Build command: `npm install` — Start command: `npm start`.
4. En **Environment**, agrega las mismas variables que tiene el servicio de producción (`JWT_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `ANTHROPIC_API_KEY`, `FRONTEND_URL`), **excepto**:
   - `DATABASE_URL`: la cadena de conexión de la rama **`staging`** de Neon (NO la de producción). Obtenla con:
     ```bash
     neonctl connection-string staging --project-id wispy-water-36773194
     ```
   - `AI_ORDER_MOCK`: pon `true` para no gastar tokens reales de IA en pruebas.
   - `FRONTEND_URL`: la URL estable del preview de Vercel para la rama `develop` (Vercel la genera como `https://vendita-git-develop-badgomez2727s-projects.vercel.app` — confírmala en el dashboard de Vercel del proyecto frontend, pestaña Deployments, el deploy de la rama `develop`).
   - `EMAIL_FROM` sí puede quedar igual que en producción (no es sensible ni depende del entorno): `Vendita <no-reply@mail.tyndallcore.com>`. Ese dominio (`mail.tyndallcore.com`) está verificado en Resend (SPF, DKIM, DMARC). Si no se define esta variable, el código usa ese mismo valor por defecto.
   - `CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET`: copia los mismos valores de producción — es la misma cuenta de Cloudinary para ambos entornos (las fotos de staging quedan en una carpeta separada por compañía/producto, no chocan con las de producción). Ver la sección "Fotos de producto" más abajo.
5. Nombra el servicio `inventario-backend-staging` (o el que prefieras, no afecta nada del código).

**Opción B — Blueprint (`render.yaml`):** este repo incluye un `render.yaml` de referencia. Render Dashboard → New → Blueprint → selecciona este repo → rama `develop`. Te va a pedir los valores de las variables marcadas `sync: false`.

El `postinstall` (`prisma generate && prisma migrate deploy`) corre igual que en producción — cada push a `develop` sincroniza el esquema de la base de staging automáticamente, sin pasos manuales.

## Reiniciar los datos de staging desde producción

Antes de cada ronda de pruebas, para tener datos frescos de producción en staging:

```bash
neonctl branches restore staging ^parent --project-id wispy-water-36773194
```

Esto resetea la rama `staging` al estado actual de `production` (todo lo que se haya probado en staging se pierde — es el comportamiento esperado). Tarda unos segundos; no requiere reiniciar el servicio de Render.

## Seguridad

- Ningún script ni migración de este repo contiene una cadena de conexión escrita a mano — todo usa la variable de entorno `DATABASE_URL`, así que apunta siempre a la base que tenga configurada el servicio que lo ejecuta.
- No hay seed automático (`prisma db seed`) configurado — nada corre solo contra ninguna base al hacer deploy, más allá de `migrate deploy` (que solo aplica el esquema, no inserta datos).
- `scripts/set-super-admin.js` es de invocación manual únicamente (`node scripts/set-super-admin.js <usuario>`), nunca se ejecuta automáticamente.
- CORS acepta la whitelist fija de producción más cualquier URL de preview de Vercel de este proyecto (`vendita-*-badgomez2727s-projects.vercel.app`), para que los previews de `develop` y de pull requests funcionen sin tocar código en cada deploy.

## Correos (Resend)

Los correos transaccionales (hoy, solo el de recuperación de contraseña) se envían con [Resend](https://resend.com), vía `src/services/emailService.js`.

- `RESEND_API_KEY`: API key de la cuenta de Resend. Ya configurada en producción y staging.
- `EMAIL_FROM`: remitente de los correos, en formato `"Nombre <correo@dominio>"` — por ejemplo `Vendita <no-reply@mail.tyndallcore.com>`. El dominio debe estar verificado en Resend (SPF, DKIM y DMARC); `mail.tyndallcore.com` ya lo está. Si la variable no está definida, el código usa ese mismo valor por defecto, así que en la práctica solo hace falta configurarla si algún día se quiere usar otro remitente.

## Fotos de producto (Cloudinary)

Las fotos de producto (para el catálogo público, v1.2) se suben directo del navegador a [Cloudinary](https://cloudinary.com) — el backend solo firma la subida (`src/utils/cloudinarySign.js`), nunca recibe el binario de la imagen. Borrar una foto sí pasa por el backend, porque requiere el API secret.

**Configuración (una sola vez):**
1. Crea una cuenta gratis en Cloudinary (el plan free alcanza de sobra para empezar: ~25GB/mes entre almacenamiento y banda ancha).
2. En el Dashboard, copia **Cloud name**, **API Key** y **API Secret** (Settings → Access Keys).
3. Ponlos en `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` en Render (producción y staging, mismo valor en ambas).

No hace falta crear ningún "upload preset" en el dashboard de Cloudinary — al usar subida firmada (no "unsigned"), toda la configuración vive en el backend. Sin estas variables configuradas, subir o borrar una foto responde `503` con un mensaje claro en vez de fallar de forma confusa.

## Catálogo público

`GET /public/catalogo/:slug` (sin autenticación) devuelve **todos** los productos publicados de una compañía en una sola respuesta, sin paginar. El buscador y el filtro por categoría del catálogo (`frontend/src/pages/PublicCatalogPage.jsx`) se resuelven enteramente del lado del cliente sobre esa lista ya cargada — funciona bien para el catálogo de un negocio chico, pero **es una limitación conocida**: con catálogos de varios cientos de productos, esa primera carga se vuelve pesada y lenta antes incluso de llegar a buscar algo. Si eso llega a pasar, la solución es paginar `GET /public/catalogo/:slug` y mover la búsqueda/filtro al backend (mismo patrón que ya usa `GET /api/clientes?search=`), no seguir escalando el filtrado en el navegador.

## Tests

Los tests de integración (Jest + Supertest) corren contra una base de datos **local, separada de todo lo demás** — nunca contra staging ni contra producción. Viven en `tests/`.

**Levantar la base de pruebas (una sola vez, o cuando el contenedor se haya caído):**

```bash
docker start inventario-db   # el mismo contenedor Postgres que usa el desarrollo local
# si el contenedor no existe todavía, créalo apuntando al Postgres local de siempre
# y luego, dentro de él, crea la base de pruebas (solo la primera vez):
docker exec -e PGPASSWORD=postgres inventario-db psql -U postgres -h localhost -c "CREATE DATABASE inventario_test;"

# aplicar el esquema a la base de pruebas (solo hace falta cuando cambian las migraciones):
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/inventario_test?schema=public" npx prisma migrate deploy
```

**Correr los tests:**

```bash
npm test
```

`tests/jest.setupEnv.js` ya apunta `DATABASE_URL` a `inventario_test` (puerto 5433, base separada de `inventario`, la de desarrollo normal) — no hace falta exportar nada a mano. Cada test crea sus propias compañías/usuarios/productos con nombres únicos (ver `tests/helpers/factory.js`), así que no chocan entre sí ni con datos que ya existan.

Si `npm test` falla con `Can't reach database server at localhost:5433`, el contenedor se cayó — corre `docker start inventario-db` y vuelve a intentar.
