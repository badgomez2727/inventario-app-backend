# Operación y release

Cómo se trabaja, se prueba, se despliega y se verifica Vendita. Para levantar el servicio de staging desde cero (Render, Neon), ver [`../README.md`](../README.md).

## Entornos

| Entorno | Rama | Frontend | Backend | Base de datos |
|---|---|---|---|---|
| **Producción** | `main` | Vercel Production, `vendita.tyndallcore.com` | Render (servicio de producción) | Neon, rama `production` |
| **Staging** | `develop` | Vercel Preview, `vendita-git-develop-badgomez2727s-projects.vercel.app` | Render `inventario-backend-staging` | Neon, rama `staging` (copia de producción) |

Cada push a `develop` o `main` **despliega solo**. Render ejecuta `prisma generate && prisma migrate deploy` en su `postinstall`: **un push a `main` aplica las migraciones pendientes directamente a la base de producción.**

El staging de Vercel está protegido con login de Vercel (un `curl` normal recibe un `302`).

## Variables de entorno

### Backend (Render)

| Variable | Para qué | Producción vs staging |
|---|---|---|
| `DATABASE_URL` | Conexión a PostgreSQL (Neon) | **Distinta**: cada entorno apunta a su rama de Neon. Nunca la de producción en staging. |
| `JWT_SECRET` | Firma de los tokens | Secreto de cada entorno |
| `FRONTEND_URL` | Enlaces de los correos (recuperación de contraseña) | Producción: `https://vendita.tyndallcore.com`. Staging: la URL del preview de `develop` |
| `RESEND_API_KEY` | Envío de correos | Misma cuenta |
| `EMAIL_FROM` | Remitente. Por defecto `Vendita <no-reply@mail.tyndallcore.com>` | Opcional |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Fotos de producto | Misma cuenta (sin ellas, subir/borrar fotos responde `503`) |
| `ANTHROPIC_API_KEY` | Pedido por WhatsApp con IA | |
| `AI_ORDER_MOCK` | `true` = respuestas simuladas sin gastar tokens | `true` en staging |
| `LAUNCH_PLAN_DAYS` | Días de **prueba gratis** que reciben los negocios que se registran. Vacía, `0` o inválida = **7**. Al vencer sin pagar, la cuenta queda en solo lectura. Se lee en cada registro: se cambia en Render sin desplegar código | Opcional (ej. `14` para dar más tiempo) |
| `PORT` | Puerto (lo pone Render) | |

### Frontend (Vercel)

| Variable | Para qué | Producción vs staging |
|---|---|---|
| `REACT_APP_API_URL` | URL del backend | Cada entorno apunta a su backend. También la lee la función `api/og-catalogo.js` |
| `REACT_APP_ENVIRONMENT` | `staging` activa el banner amarillo de staging | **Solo** en el entorno Preview; nunca en Production |
| `REACT_APP_META_PIXEL_ID` | ID del píxel de Meta para medir los anuncios de Facebook. **Sin ella la medición no hace nada** | Solo en **Production** (en staging no, para no contaminar la medición). Requiere volver a construir (redeploy) al cambiarla |

> Las variables `REACT_APP_*` **se incorporan al construir** (build). Por eso un build de Preview **no** debe promoverse a producción: llevaría la API y el banner de staging. Producción siempre se reconstruye con las variables de Production.

Nunca se escriben cadenas de conexión ni contraseñas en el código, los scripts, los CHANGELOG ni las conversaciones.

## Flujo de trabajo

1. **Se trabaja por bloques** pequeños, en `develop`.
2. Cada bloque pasa por **lint, tests y build**; se sube a `develop` (staging).
3. **Se prueba a mano en staging.** No se sigue con el siguiente bloque hasta que la persona responsable lo apruebe.
4. Se despliega a producción **solo con confirmación explícita, cada vez**. Un deploy anterior no autoriza el siguiente.
5. No se actualizan dependencias como parte de un cambio funcional.

### Tests

- **Backend:** Jest + Supertest contra una base local separada (`inventario_test`, puerto 5433). `npm test`. Ver [`../README.md`](../README.md) para levantar la base. Cada test crea sus propios datos con sufijos únicos (`tests/helpers/factory.js`).
  - **Trampa conocida:** `email`, `nombreUsuario` y `Company.slug` son únicos en todo el sistema. Un test con un valor literal pasa la primera vez y falla las siguientes contra la misma base. Siempre usar sufijos únicos.
- **Frontend:** `npm test` (Jest + Testing Library). Hoy cubre el campo de cantidad del catálogo y el buscador de productos.

### Migraciones de base de datos

- Deben ser **aditivas** (agregar, no borrar ni renombrar) para que un despliegue nunca pierda datos ni rompa la versión anterior mientras se despliega.
- Antes de cada release: `git diff main..develop -- prisma/schema.prisma` y `git diff --stat main..develop -- prisma/migrations/`.

## Checklist de release (vX.Y.Z)

**Antes de pedir confirmación**
- [ ] Todos los bloques probados en staging y aprobados.
- [ ] Backend: `npm test` en verde. Frontend: lint, tests y `npm run build` sin errores.
- [ ] Resumen de commits `main..develop` en cada repo (`git log --oneline origin/main..origin/develop`).
- [ ] Migraciones: ¿hay? ¿son aditivas? Variables de entorno nuevas: ¿hay que crearlas en Render/Vercel **antes** del despliegue?
- [ ] `main` es ancestro de `develop` (el merge será *fast-forward*).
- [ ] **Documentación actualizada** (`docs/`, README y CHANGELOG) con lo que cambió: endpoints, reglas, variables, roles.
- [ ] Confirmación explícita de la persona responsable.

**Despliegue**
- [ ] `git checkout main && git merge --ff-only develop && git push origin main`, en cada repo, **uno por uno** (ver "Problemas conocidos").
- [ ] Verificar que terminaron los despliegues (ver siguiente sección).
- [ ] Pruebas manuales en producción (lista en el resumen del release).

**Cierre**
- [ ] En el CHANGELOG de ambos repos, mover "Sin publicar" a `## X.Y.Z`, con su sección "En palabras simples".
- [ ] Ese cambio de documentación se commitea en `develop` y se lleva a `main` con otro fast-forward.
- [ ] Etiqueta anotada en ambos repos: `git tag -a vX.Y.Z -m "..." && git push origin vX.Y.Z`.

No hay Pull Requests ni *merge commits* entre `develop` y `main`: los releases son siempre *fast-forward*.

## Cómo verificar un despliegue

**Frontend en producción**
- Con el CLI de Vercel: `vercel api "/v6/deployments?limit=6&app=vendita"` muestra, por deploy, el commit (`meta.githubCommitSha`), el `target` y el estado (`READY`).
- Comprobar el código nuevo: descargar `https://vendita.tyndallcore.com/`, sacar el nombre del bundle (`static/js/main.<hash>.js`), descargarlo y buscar un texto nuevo con `grep`.
- Comprobar que el banner de staging **no** está activo (la condición de `REACT_APP_ENVIRONMENT` debe quedar apagada).

**Frontend en staging**
- Está protegido: usar `vercel curl <ruta> --deployment https://vendita-git-develop-badgomez2727s-projects.vercel.app`.

**Backend**
- Render no reporta sus despliegues a GitHub y no se usa su CLI: se confirma en el panel de Render (el commit debe estar en "Live").
- **El truco de "401 en vez de 404" no sirve para rutas de `/api`** (todas responden 401 sin token). Solo sirve para rutas de `/public` y `/auth`.
- Para confirmar cambios de `/api`: una prueba funcional con un usuario real (por ejemplo, usar la función nueva en la aplicación).
- `GET /` solo dice si el servicio está despierto, no qué versión corre.

## Scripts manuales (`scripts/`)

Nunca se ejecutan solos; se invocan a mano con la `DATABASE_URL` del entorno que corresponda.

| Script | Para qué |
|---|---|
| `set-super-admin.js <usuario>` | Convierte a un usuario en `super_admin_sistema` (única vía para ese rol) |
| `backfill-payments.js` | Migración de datos: crea el primer pago histórico (por el total, método `OTRO`) para las ventas `PAGADA` anteriores al módulo de pagos |
| `check-pending-sales-without-client.js` | Diagnóstico de solo lectura: ventas a crédito sin cliente |
| `check-latest-pedidos.js` | Diagnóstico de solo lectura: últimos pedidos del catálogo |
| `crear-compania-interna.js` | Crea (o reutiliza) la compañía interna de Tyndall, marcada `esInterna`, con el super admin real y una cuenta demo |
| `limpieza-companias.js` | **Destructivo.** Borra todas las compañías salvo las indicadas en `--keep` y las marcadas `esInterna`. Por defecto corre en `--dry-run` (solo cuenta); borrar de verdad exige `--ejecutar`. Revisar siempre el `DATABASE_URL` antes de correrlo y no usarlo contra producción sin una razón explícita |

## Problemas conocidos y qué hacer

| Síntoma | Causa | Qué hacer |
|---|---|---|
| `npm test` falla con `Can't reach database server at localhost:5433` | Docker Desktop se cayó o no tiene integración con WSL | Reiniciar Docker Desktop y `docker start inventario-db` |
| Un push a `develop`/`main` no genera deploy en Vercel | La integración GitHub → Vercel a veces se retrasa (llegó a tardar unos 12 minutos) | Esperar; revisar `vercel api …`; si no aparece, un commit vacío lo dispara |
| Un deploy hecho con `vercel deploy` (CLI) no actualiza el alias de staging | Los deploys por CLI no reciben el alias de la rama | No usar el CLI para staging. Si se hizo: `vercel alias set` y, para volver al modo automático, `vercel alias rm <alias>` y hacer un push a `develop` |
| Dos `git push` lanzados a la vez en repos distintos: uno dice "Everything up-to-date" | Se pisan el directorio de trabajo | Ejecutarlos **de a uno** |
| La primera petición del día tarda 20–40 s | Render y Neon (planes gratis) se duermen | Es esperado; el frontend muestra un aviso |
| Los enlaces de recuperación de contraseña apuntan a la URL equivocada | `FRONTEND_URL` mal configurada en ese entorno | Corregirla en Render |

## Contactos y cuentas

Las credenciales viven en los paneles de Render, Vercel, Neon, Cloudinary, Resend y Anthropic, y nunca en el repositorio. Quien mantenga el sistema necesita acceso a esos paneles y a los dos repositorios de GitHub (`inventario-app-backend`, `inventario-app-frontend`).
