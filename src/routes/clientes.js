// backend/src/routes/clientes.js

const express = require('express');
const { listClients, createClient, updateClient, setClientActivo, deleteClient, getCartera } = require('../controllers/clienteController');
const { authMiddleware } = require('../middlewares/authMiddleware');
const router = express.Router();

// Antes de '/:id' para que Express no intente interpretar "cartera" como un id.
router.get('/cartera', authMiddleware, getCartera);

router.get('/', authMiddleware, listClients);
router.post('/', authMiddleware, createClient);
router.put('/:id', authMiddleware, updateClient);
router.patch('/:id/activo', authMiddleware, setClientActivo);
router.delete('/:id', authMiddleware, deleteClient);

module.exports = router;