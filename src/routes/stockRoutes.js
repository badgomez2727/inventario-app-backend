// venta_inventario_app/backend/src/routes/stockRoutes.js

const express = require('express');
const {
  addStockEntry,
  addStockExit,
  getStockMovementsHistory // <-- ¡CORREGIDO! Asegúrate de que esta función sea la importada
} = require('../controllers/stockController');
const { authMiddleware } = require('../middlewares/authMiddleware'); // authMiddleware ya se aplica globalmente en app.js

const router = express.Router();

// Estas rutas ya están protegidas por authMiddleware en app.use('/api', authMiddleware)
router.post('/add', addStockEntry); // Ruta para añadir stock
router.post('/remove', addStockExit); // Ruta para remover stock
router.get('/history', getStockMovementsHistory); // <-- ¡CORREGIDO! Esta es la ruta correcta para el historial de stock

module.exports = router;