// backend/src/routes/proveedores.js

const express = require('express');
const { listSuppliers, createSupplier, updateSupplier, deleteSupplier } = require('../controllers/proveedorController');
const { authMiddleware } = require('../middlewares/authMiddleware'); // Asegúrate de que este middleware esté definido
const router = express.Router();

router.get('/', authMiddleware, listSuppliers);
router.post('/', authMiddleware, createSupplier);
router.put('/:id', authMiddleware, updateSupplier);
router.delete('/:id', authMiddleware, deleteSupplier);

module.exports = router;