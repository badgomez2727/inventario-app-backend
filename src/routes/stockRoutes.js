// venta_inventario_app/backend/src/routes/stockRoutes.js

const express = require('express');
const { addStockEntry, addStockExit,getStockMovements  } = require('../controllers/stockController');
const { authMiddleware } = require('../middlewares/authMiddleware');
const router = express.Router();

router.post('/in', addStockEntry);
router.post('/out', addStockExit);
router.get('/', authMiddleware, getStockMovements);

module.exports = router;