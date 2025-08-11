// venta_inventario_app/backend/src/routes/receiptRoutes.js

const express = require('express');
const { generateSaleReceiptPdf } = require('../controllers/receiptController');
const { authMiddleware } = require('../middlewares/authMiddleware'); // Necesitamos autenticación

const router = express.Router();

// Ruta para generar el recibo PDF de una venta específica
// Requiere autenticación
router.get('/:saleId/pdf', authMiddleware, generateSaleReceiptPdf);

module.exports = router;
