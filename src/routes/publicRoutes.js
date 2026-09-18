// backend/src/routes/publicRoutes.js
//
// Rutas SIN autenticación — montadas en app.js antes de
// app.use('/api', authMiddleware), igual que /auth. Nunca agregar acá una
// ruta que devuelva o modifique algo sensible sin repensarlo dos veces.

const express = require('express');
const { getCatalogoPublico } = require('../controllers/publicCatalogController');
const { publicCatalogLimiter } = require('../middlewares/rateLimiter');

const router = express.Router();

router.get('/catalogo/:slug', publicCatalogLimiter, getCatalogoPublico);

module.exports = router;
