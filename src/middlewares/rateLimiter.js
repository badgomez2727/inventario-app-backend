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
// 5 registros por hora por IP.
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
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

module.exports = {
  loginLimiter,
  registerLimiter,
  forgotPasswordLimiter,
};
