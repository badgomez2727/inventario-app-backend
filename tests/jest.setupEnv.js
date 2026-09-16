// Variables de entorno para la corrida de tests — se ejecuta ANTES de que
// Jest requiera cualquier archivo de test o del código de la app, así que
// config/jwt.js (que revienta si falta JWT_SECRET) y Prisma Client (que lee
// DATABASE_URL) ya las encuentran seteadas.
//
// DATABASE_URL apunta a "inventario_test", una base LOCAL separada (mismo
// contenedor Docker de desarrollo, base distinta) — nunca a staging ni a
// producción. Ver README para cómo levantarla.
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5433/inventario_test?schema=public';
process.env.JWT_SECRET = 'clave-de-pruebas-de-integracion-no-usar-en-produccion-nunca';
process.env.AI_ORDER_MOCK = 'true';
process.env.RESEND_API_KEY = 'test-resend-key';
process.env.FRONTEND_URL = 'http://localhost:3000';
