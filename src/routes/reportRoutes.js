// venta_inventario_app/backend/src/routes/reportRoutes.js

const express = require('express');
const { getGeneralStats, getInventoryValue, getMonthlySales, getTopSellingProducts, getPlanStatus } = require('../controllers/reportController'); // <-- Importar la nueva función
const { authMiddleware, authorizeAdmin } = require('../middlewares/authMiddleware'); // authMiddleware ya importado

const router = express.Router();

router.get('/general-stats', authMiddleware, authorizeAdmin, getGeneralStats);
router.get('/inventory-value', authMiddleware, authorizeAdmin, getInventoryValue);
router.get('/monthly-sales', authMiddleware, authorizeAdmin, getMonthlySales);
router.get('/top-selling-products', authMiddleware, authorizeAdmin, getTopSellingProducts); // <-- Nueva ruta
// Sin authorizeAdmin a propósito: cualquier usuario de la compañía puede ver
// el uso de su plan, no solo el admin.
router.get('/plan-status', authMiddleware, getPlanStatus);

module.exports = router;
