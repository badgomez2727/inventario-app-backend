// venta_inventario_app/backend/src/routes/userRoutes.js

const express = require('express');
const { listUsers, createUser } = require('../controllers/userController');
const { authMiddleware } = require('../middlewares/authMiddleware');

const router = express.Router();

// Rutas protegidas para la gestión de usuarios
router.get('/', authMiddleware, listUsers);    // Listar usuarios de la compañía
router.post('/', authMiddleware, createUser);  // Crear un nuevo usuario

module.exports = router;