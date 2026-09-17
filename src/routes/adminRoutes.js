// backend/src/routes/adminRoutes.js
const express = require('express');
const { listCompanies, updateCompanyPlan, setCompanyActivo } = require('../controllers/adminController');
const { authorizeSuperAdmin } = require('../middlewares/authMiddleware');

const router = express.Router();

// authMiddleware ya se aplicó globalmente a todo /api en app.js; aquí solo
// añadimos la restricción extra de rol.
router.use(authorizeSuperAdmin);

router.get('/companies', listCompanies);
router.patch('/companies/:id/plan', updateCompanyPlan);
router.patch('/companies/:id/activo', setCompanyActivo);

module.exports = router;
