// venta_inventario_app/backend/src/config/jwt.js
require('dotenv').config();

const jwtSecret = process.env.JWT_SECRET;

// Sin esto, cualquiera podría forjar un token válido (incluso de admin) usando
// un secreto por defecto conocido públicamente en el código fuente.
// Mejor fallar rápido en el arranque que arrancar "silenciosamente" inseguro.
if (!jwtSecret) {
  throw new Error(
    'JWT_SECRET no está definido. Configura la variable de entorno JWT_SECRET (mínimo 32 caracteres aleatorios) antes de iniciar el servidor.'
  );
}

module.exports = {
  jwtSecret,
};