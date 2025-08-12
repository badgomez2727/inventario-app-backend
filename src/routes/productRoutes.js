// venta_inventario_app/backend/src/routes/productRoutes.js

const express = require('express');
const {
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct, // <-- Asegurarse de que esté aquí y con el nombre correcto
  uploadProductsFromCsv 
} = require('../controllers/productController'); // <-- De aquí se importan las funciones
const { authMiddleware, authorizeAdmin } = require('../middlewares/authMiddleware');

const router = express.Router();

// Rutas existentes para productos (ej. CRUD)
router.get('/', authMiddleware, getProducts); 
router.post('/', authMiddleware, createProduct); 
router.put('/:id', authMiddleware, updateProduct); 
router.delete('/:id', authMiddleware, deleteProduct); // <-- Esta es la línea 19 que estaba dando el error

// NUEVA RUTA para la carga masiva de productos (requiere autenticación y rol de admin)
router.post('/upload-csv', authMiddleware, authorizeAdmin, uploadProductsFromCsv); 

module.exports = router;
