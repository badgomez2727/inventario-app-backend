// venta_inventario_app/backend/src/app.js
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const cors = require('cors');
require('dotenv').config();

// Importa los nuevos módulos
const authRoutes = require('./routes/authRoutes');
const stockRoutes = require('./routes/stockRoutes');
const userRoutes = require('./routes/userRoutes');
const saleRoutes = require('./routes/saleRoutes');
const productRoutes = require('./routes/productRoutes');
const reportRoutes = require('./routes/reportRoutes');
const clientesRouter = require('./routes/clientes');
const proveedoresRouter = require('./routes/proveedores'); // Asegúrate de que este archivo exista
const { authMiddleware } = require('./middlewares/authMiddleware'); // Solo necesitamos authMiddleware por ahora

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors());
app.use(express.json());

// --- Rutas de Autenticación ---
app.use('/auth', authRoutes); // Todas las rutas de autenticación bajo /auth

// --- Rutas de Prueba (Accesibles sin autenticación, si las necesitas) ---
app.get('/', (req, res) => {
  res.send('¡Backend de inventario funcionando con autenticación!');
});

// --- Rutas Protegidas por Autenticación ---
// TODAS las rutas que vengan DESPUÉS de aquí requerirán un token JWT válido.
app.use(authMiddleware); // Aplica el middleware a todas las rutas subsiguientes


app.use('/api/productos', productRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/users', userRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/clientes', clientesRouter);
app.use('/api/proveedores', proveedoresRouter);

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});

// Desconectar Prisma cuando la aplicación se cierra
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

module.exports = app;