// venta_inventario_app/backend/src/app.js
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const cors = require('cors');

require('dotenv').config();

// Importa los módulos de rutas
const authRoutes = require('./routes/authRoutes');
const stockRoutes = require('./routes/stockRoutes');
const userRoutes = require('./routes/userRoutes');
const saleRoutes = require('./routes/saleRoutes');
const productRoutes = require('./routes/productRoutes');
const reportRoutes = require('./routes/reportRoutes');
const clientesRouter = require('./routes/clientes');
const proveedoresRouter = require('./routes/proveedores');
const receiptRoutes = require('./routes/receiptRoutes');

const prisma = new PrismaClient();
const app = express(); // La instancia 'app' debe ser declarada antes de usarse

// --- Configuración de CORS ---
// Usaremos SOLO ESTA llamada a cors.
// Asegúrate de que la URL de tu frontend de Vercel sea EXACTA aquí.
app.use(cors({
  origin: ['http://localhost:3000', 'https://inventario-app-frontend-ashy.vercel.app'], // ¡Ajusta esta URL a la URL REAL de tu frontend en Vercel!
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Middlewares generales (siempre van después de la declaración de 'app' y cors)
app.use(express.json()); // Para parsear cuerpos de solicitud JSON
app.use(express.urlencoded({ extended: true })); // Para parsear cuerpos de solicitud URL-encoded

// Importa el middleware de autenticación (si es necesario para rutas específicas)
const { authMiddleware } = require('./middlewares/authMiddleware'); 

// --- Rutas de Autenticación (generalmente no protegidas por authMiddleware si manejan login/registro) ---
app.use('/auth', authRoutes); 

// --- Ruta de Prueba (accesible públicamente) ---
app.get('/', (req, res) => {
  res.send('¡Backend de inventario funcionando correctamente!');
});

// --- Rutas Protegidas por Autenticación ---
// Aplica el middleware authMiddleware a todas las rutas que vengan DESPUÉS de aquí.
app.use('/api', authMiddleware); // Aplica authMiddleware a todas las rutas que empiecen con /api

// Ahora, todas estas rutas están protegidas por authMiddleware
app.use('/api/productos', productRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/users', userRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/clientes', clientesRouter);
app.use('/api/proveedores', proveedoresRouter);
app.use('/api/receipts', receiptRoutes);

// Iniciar el servidor
const PORT = process.env.PORT || 3001; // Render usa PORT=10000, así que process.env.PORT es el importante
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});

// Desconectar Prisma cuando la aplicación se cierra
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

module.exports = app;
