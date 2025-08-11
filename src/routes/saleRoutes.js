// venta_inventario_app/backend/src/routes/saleRoutes.js

const express = require('express');
const { createSale, getSalesHistory } = require('../controllers/saleController'); // Asegúrate de que getSalesHistory esté importada
const { authMiddleware } = require('../middlewares/authMiddleware');

const router = express.Router();

// Ruta para crear una nueva venta (protegida)
router.post('/', authMiddleware, createSale);

// Ruta para obtener el historial de ventas (protegida)
// Esta es la ruta que tu frontend está intentando acceder: /api/sales/history
router.get('/history', authMiddleware, getSalesHistory); 

module.exports = router;
