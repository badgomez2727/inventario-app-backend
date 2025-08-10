// venta_inventario_app/backend/src/routes/saleRoutes.js

const express = require('express');
const { createSale, getSales } = require('../controllers/saleController');
const { authMiddleware } = require('../middlewares/authMiddleware');

const router = express.Router();

router.post('/', authMiddleware, createSale);
router.get('/', authMiddleware, getSales);

module.exports = router;