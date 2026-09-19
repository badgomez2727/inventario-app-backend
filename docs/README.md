# Documentación técnica de Vendita

Vendita es el producto de inventario y punto de venta (POS) de **Tyndall Commerce**, una división de Tyndall Technologies. Esta carpeta es la documentación técnica de **todo el sistema** (backend y frontend). Vive en el repo del backend porque es donde están las reglas de negocio, el esquema de datos y las variables de entorno.

## Índice

| Documento | Para qué sirve |
|---|---|
| [ARQUITECTURA.md](ARQUITECTURA.md) | Cómo está armado el sistema: piezas, servicios externos, modelo de datos, autenticación, roles y límites de uso. Empieza aquí. |
| [REGLAS-DE-NEGOCIO.md](REGLAS-DE-NEGOCIO.md) | Qué hace el sistema y por qué: ventas, abonos, anulaciones, cartera, clientes, productos, pedidos del catálogo y planes. |
| [API.md](API.md) | Todos los endpoints, con su nivel de acceso y notas. |
| [OPERACION-Y-RELEASE.md](OPERACION-Y-RELEASE.md) | Cómo se trabaja, se prueba, se despliega y se verifica un release. Variables de entorno. Problemas conocidos. |

## Otros documentos

- [`../README.md`](../README.md): puesta en marcha operativa del backend (Render, Neon, correos con Resend, fotos con Cloudinary, base de pruebas).
- [`../CHANGELOG.md`](../CHANGELOG.md) y `frontend/CHANGELOG.md`: historial de cambios por versión, con un resumen "en palabras simples" de cada una.
- [`../AUDITORIA-v1.md`](../AUDITORIA-v1.md): auditoría de seguridad y operación de la v1.0 (hallazgos ya resueltos en v1.0.0; útil como referencia de por qué existen ciertas validaciones).
- `frontend/README.md`: estructura del frontend, rutas, variables y pruebas.

## Los dos repositorios

| Repo | Contenido | Tecnología | Despliegue |
|---|---|---|---|
| `inventario-app-backend` | API, reglas de negocio, base de datos, tests de integración | Node.js, Express, Prisma, PostgreSQL | Render |
| `inventario-app-frontend` | Aplicación web (panel + catálogo público) | React (Create React App), Tailwind | Vercel |

Ambos siguen el mismo flujo de ramas (`develop` = staging, `main` = producción) y se etiquetan juntos (`vX.Y.Z`).

## Mantener esta documentación al día

La documentación solo sirve si refleja el sistema. Por eso **actualizarla es un paso fijo de cada release** (ver el checklist en [OPERACION-Y-RELEASE.md](OPERACION-Y-RELEASE.md)): si un cambio toca un endpoint, una regla de negocio, una variable de entorno o un rol, se actualiza el documento correspondiente en el mismo bloque de trabajo.
