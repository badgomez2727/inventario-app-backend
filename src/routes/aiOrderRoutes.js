// backend/src/routes/aiOrderRoutes.js

const express = require('express');
const { parseWhatsappOrder } = require('../controllers/aiOrderController');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { requirePlan } = require('../middlewares/planLimits');
const { aiOrderLimiter } = require('../middlewares/rateLimiter');

const router = express.Router();

// Función exclusiva del plan PRO. requirePlan responde 403 con
// code: 'PLAN_LIMIT_REACHED' si la compañía no está en PRO, antes de gastar
// nada en la API de Claude.
router.post('/parse', authMiddleware, requirePlan(['PRO']), aiOrderLimiter, parseWhatsappOrder);

module.exports = router;
