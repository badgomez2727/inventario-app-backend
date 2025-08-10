// venta_inventario_app/backend/src/routes/productRoutes.js
const express = require('express');
const { createProduct, getProducts, updateProduct } = require('../controllers/productController');
const { authMiddleware } = require('../middlewares/authMiddleware');

const router = express.Router();

router.post('/', authMiddleware, createProduct);
router.get('/', authMiddleware, getProducts);
router.put('/:id', authMiddleware, updateProduct);

module.exports = router;