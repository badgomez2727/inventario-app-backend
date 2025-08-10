// venta_inventario_app/backend/src/routes/authRoutes.js
const express = require('express');
const { registerCompanyAndAdmin, login } = require('../controllers/authController');

const router = express.Router();

router.post('/register-company', registerCompanyAndAdmin); // Ruta para registrar una nueva compañía y su admin
router.post('/login', login); // Ruta para el login de usuarios

module.exports = router;