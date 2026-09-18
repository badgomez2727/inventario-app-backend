// venta_inventario_app/backend/src/routes/userRoutes.js

const express = require('express');
const { listUsers, createUser, updateUser, setUserActivo } = require('../controllers/userController');
const { authMiddleware, authorizeAdmin } = require('../middlewares/authMiddleware');

const router = express.Router();

// Rutas protegidas para la gestión de usuarios
router.get('/', authMiddleware, listUsers);    // Listar usuarios de la compañía
// CRÍTICO: crear usuarios (y elegir su rol) es acción de administrador — sin
// authorizeAdmin, cualquier empleado podía crear un usuario con el rol que
// quisiera, incluido super_admin_sistema.
router.post('/', authMiddleware, authorizeAdmin, createUser);  // Crear un nuevo usuario
router.put('/:id', authMiddleware, authorizeAdmin, updateUser); // Editar nombre/email/rol
router.patch('/:id/activo', authMiddleware, authorizeAdmin, setUserActivo); // Activar/desactivar

module.exports = router;