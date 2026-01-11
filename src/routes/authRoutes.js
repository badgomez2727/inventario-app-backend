// venta_inventario_app/backend/src/routes/authRoutes.js
const express = require('express');
// Asegúrate de que todas las funciones estén aquí arriba
const { 
  registerCompanyAndAdmin, 
  login, 
  solicitarRecuperacion, 
  restablecerClave 
} = require('../controllers/authController');

const router = express.Router();

router.post('/register-company', registerCompanyAndAdmin);
router.post('/login', login);

// --- RUTAS CORREGIDAS ---
router.post('/forgot-password', solicitarRecuperacion); // Sin el prefijo authController
router.post('/reset-password', restablecerClave);       // Sin el prefijo authController

module.exports = router;