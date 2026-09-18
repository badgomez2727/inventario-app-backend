// backend/src/routes/pedidoRoutes.js
//
// Gestión de pedidos del catálogo público (autenticada). No requiere admin:
// es trabajo operativo normal, igual que registrar un pago.

const express = require('express');
const { listPedidos, confirmarPedido, rechazarPedido } = require('../controllers/pedidoController');
const { authMiddleware } = require('../middlewares/authMiddleware');

const router = express.Router();

router.get('/', authMiddleware, listPedidos);
router.patch('/:id/confirmar', authMiddleware, confirmarPedido);
router.patch('/:id/rechazar', authMiddleware, rechazarPedido);

module.exports = router;
