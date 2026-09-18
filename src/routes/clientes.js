// backend/src/routes/clientes.js

const express = require('express');
const {
  listClients,
  createClient,
  updateClient,
  setClientActivo,
  deleteClient,
  getCartera,
  exportCartera,
  getEstadoCuentaCliente,
  generateEstadoCuentaPdf,
} = require('../controllers/clienteController');
const { authMiddleware } = require('../middlewares/authMiddleware');
const router = express.Router();

// Antes de '/:id' para que Express no intente interpretar "cartera" como un id.
router.get('/cartera', authMiddleware, getCartera);
router.get('/cartera/export', authMiddleware, exportCartera);

router.get('/', authMiddleware, listClients);
router.post('/', authMiddleware, createClient);
router.get('/:id/estado-cuenta', authMiddleware, getEstadoCuentaCliente);
router.get('/:id/estado-cuenta/pdf', authMiddleware, generateEstadoCuentaPdf);
router.put('/:id', authMiddleware, updateClient);
router.patch('/:id/activo', authMiddleware, setClientActivo);
router.delete('/:id', authMiddleware, deleteClient);

module.exports = router;