// backend/src/routes/companySettingsRoutes.js
//
// Configuración de la propia compañía para el catálogo público. Solo
// admin_compania — distinto de /api/admin (super_admin_sistema sobre todas
// las compañías).

const express = require('express');
const { getMiCompania, updateMiCompania, getPortadaSignature } = require('../controllers/companySettingsController');
const { authMiddleware, authorizeAdmin } = require('../middlewares/authMiddleware');

const router = express.Router();

router.get('/', authMiddleware, authorizeAdmin, getMiCompania);
router.patch('/', authMiddleware, authorizeAdmin, updateMiCompania);
router.post('/portada/firma', authMiddleware, authorizeAdmin, getPortadaSignature);

module.exports = router;
