# Vendita — backend

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
4. En **Environment**, agrega las mismas variables que tiene el servicio de producción (`JWT_SECRET`, `RESEND_API_KEY`, `ANTHROPIC_API_KEY`, `FRONTEND_URL`), **excepto**:
   - `DATABASE_URL`: la cadena de conexión de la rama **`staging`** de Neon (NO la de producción). Obtenla con:
     ```bash
     neonctl connection-string staging --project-id wispy-water-36773194
     ```
   - `AI_ORDER_MOCK`: pon `true` para no gastar tokens reales de IA en pruebas.
   - `FRONTEND_URL`: la URL estable del preview de Vercel para la rama `develop` (Vercel la genera como `https://vendita-git-develop-badgomez2727s-projects.vercel.app` — confírmala en el dashboard de Vercel del proyecto frontend, pestaña Deployments, el deploy de la rama `develop`).
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
