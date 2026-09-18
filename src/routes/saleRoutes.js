// venta_inventario_app/backend/src/routes/saleRoutes.js

const express = require('express');
const { createSale, getSalesHistory, getSaleById, anularVenta, asignarClienteAVenta } = require('../controllers/saleController'); // Asegúrate de que getSalesHistory esté importada
const { registrarPago, listarPagos, anularPago } = require('../controllers/paymentController');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { enforceSaleLimit } = require('../middlewares/planLimits');

const router = express.Router();

// Ruta para crear una nueva venta (protegida)
router.post('/', authMiddleware, enforceSaleLimit, createSale);

// Ruta para obtener el historial de ventas (protegida)
// Esta es la ruta que tu frontend está intentando acceder: /api/sales/history
router.get('/history', authMiddleware, getSalesHistory);

// Detalle de una venta puntual — registrada DESPUÉS de '/history' para que
// Express no intente interpretar "history" como un :id.
router.get('/:id', authMiddleware, getSaleById);

// Pagos/abonos de una venta (protegidas)
router.post('/:id/payments', authMiddleware, registrarPago);
router.get('/:id/payments', authMiddleware, listarPagos);
router.patch('/:id/payments/:paymentId/anular', authMiddleware, anularPago);

// Anulación de la venta completa (no de un pago individual): solo admin_compania.
router.patch('/:id/anular', authMiddleware, anularVenta);

// Asignar/cambiar el cliente de una venta existente (ej. una venta pendiente
// que quedó sin cliente antes de que esto fuera obligatorio).
router.patch('/:id/cliente', authMiddleware, asignarClienteAVenta);

module.exports = router;
