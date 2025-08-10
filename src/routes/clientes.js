// backend/src/routes/clientes.js

const express = require('express');
const { listClients, createClient, updateClient, deleteClient } = require('../controllers/clienteController');
const { authMiddleware } = require('../middlewares/authMiddleware');
const router = express.Router();

router.get('/', authMiddleware, listClients);
router.post('/', authMiddleware, createClient);
router.put('/:id', authMiddleware, updateClient);
router.delete('/:id', authMiddleware, deleteClient);

module.exports = router;