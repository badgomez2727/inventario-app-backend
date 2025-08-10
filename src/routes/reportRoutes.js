// backend/src/routes/reportRoutes.js

const express = require('express');
const { getGeneralStats, getInventoryValue, getMonthlySales } = require('../controllers/reportController');
const { authMiddleware, authorizeAdmin } = require('../middlewares/authMiddleware'); 

const router = express.Router();


router.get('/general-stats', authMiddleware, authorizeAdmin, getGeneralStats); // Protegida para admin
router.get('/inventory-value', authMiddleware, authorizeAdmin, getInventoryValue); // Protegida para admin
router.get('/monthly-sales', authMiddleware, authorizeAdmin, getMonthlySales); // Protegida para admin

module.exports = router;
