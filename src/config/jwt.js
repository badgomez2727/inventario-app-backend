// venta_inventario_app/backend/src/config/jwt.js
require('dotenv').config();

const jwtSecret = process.env.JWT_SECRET || 'supersecretkey_dev'; // Usa una variable de entorno

module.exports = {
  jwtSecret,
};