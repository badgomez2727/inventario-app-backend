// venta_inventario_app/backend/src/routes/saleRoutes.js

const express = require('express');
const { createSale, getSalesHistory } = require('../controllers/saleController'); // Asegúrate de que getSalesHistory esté importada
const { registrarPago, listarPagos, anularPago } = require('../controllers/paymentController');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { enforceSaleLimit } = require('../middlewares/planLimits');

const router = express.Router();

// Ruta para crear una nueva venta (protegida)
router.post('/', authMiddleware, enforceSaleLimit, createSale);

// Ruta para obtener el historial de ventas (protegida)
// Esta es la ruta que tu frontend está intentando acceder: /api/sales/history
router.get('/history', authMiddleware, getSalesHistory);

// Pagos/abonos de una venta (protegidas)
router.post('/:id/payments', authMiddleware, registrarPago);
router.get('/:id/payments', authMiddleware, listarPagos);
router.patch('/:id/payments/:paymentId/anular', authMiddleware, anularPago);

module.exports = router;
