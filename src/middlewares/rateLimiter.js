// backend/src/middlewares/rateLimiter.js
const rateLimit = require('express-rate-limit');

// Límite para /auth/login: protege contra fuerza bruta de contraseñas.
// 10 intentos cada 15 minutos por IP. Los intentos correctos no cuentan,
// para no penalizar a un usuario legítimo que ya inició sesión.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Demasiados intentos de inicio de sesión. Intenta de nuevo en unos minutos.' },
});

// Límite para /auth/register-company: protege contra registro masivo de
// compañías/usuarios falsos (spam, bots, abuso de la campaña de difusión).
// 15 registros por hora por IP: con 5, una campaña de anuncios bloquearía a
// negocios legítimos, porque en celulares muchos usuarios comparten la misma
// IP del operador (CGNAT).
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados registros desde esta conexión. Intenta de nuevo más tarde.' },
});

// Límite para /auth/forgot-password: evita spam de correos de recuperación
// y ataques de enumeración de usuarios a fuerza de intentos.
// 5 solicitudes cada 15 minutos por IP.
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes de recuperación. Intenta de nuevo en unos minutos.' },
});

// Límite para /api/pedidos-ia/parse: cada llamada cuesta dinero real en la
// API de Claude. Esto es un techo de seguridad ante un bug o abuso (loop
// infinito, alguien pegando el mismo texto una y otra vez), no una
// restricción normal de uso: 30 pedidos/hora por IP alcanza sobrado para el
// uso real de una tienda.
const aiOrderLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Alcanzaste el límite de pedidos generados con IA por esta hora. Intenta de nuevo más tarde.' },
});

// Límite para el catálogo público (GET /public/catalogo/:slug): sin login
// no hay una identidad natural por la que limitar, así que es por IP. Es
// una vitrina real para clientes reales navegando (varias vistas por
// visita), no una acción puntual — el techo es generoso, pensado para
// frenar scraping/abuso, no el uso normal.
const publicCatalogLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Intenta de nuevo en un momento.' },
});

// Límite para POST /public/catalogo/:slug/pedido: a diferencia de leer el
// catálogo, esto escribe en la base (crea un Pedido) — más caro y más
// atractivo para abuso/spam que un GET. 20 pedidos/hora por IP alcanza para
// un cliente real (incluso pidiendo varias veces) sin abrir la puerta a un
// bot llenando la bandeja de pedidos pendientes.
const publicPedidoLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados pedidos desde esta conexión. Intenta de nuevo más tarde.' },
});

module.exports = {
  loginLimiter,
  registerLimiter,
  forgotPasswordLimiter,
  aiOrderLimiter,
  publicCatalogLimiter,
  publicPedidoLimiter,
};
