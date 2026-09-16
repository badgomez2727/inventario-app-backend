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
const adminRoutes = require('./routes/adminRoutes');
const aiOrderRoutes = require('./routes/aiOrderRoutes');

const prisma = new PrismaClient();
const app = express(); // La instancia 'app' debe ser declarada antes de usarse

// Render/Vercel exponen la app detrás de un proxy inverso. Sin esto, Express
// no confía en el header X-Forwarded-For y el rate limiting vería la IP del
// proxy para todos los usuarios (o directamente lanzaría error de validación).
// "1" = confiar en un solo salto de proxy, que es el caso típico en Render.
app.set('trust proxy', 1);

// --- Configuración de CORS ---
// Usaremos SOLO ESTA llamada a cors.
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'https://inventario-app-frontend-ashy.vercel.app', // dominio viejo, lo dejamos mientras Vercel migra
  'https://vendita.tyndallcore.com', // dominio propio bajo la marca Tyndall
];

// Los deploys de Preview de Vercel (ramas/PRs, incluida "develop" para
// staging) generan una URL distinta en cada push
// (vendita-<hash>-badgomez2727s-projects.vercel.app — "vendita" es el
// nombre del proyecto en Vercel, no el del repo), así que además de la
// whitelist fija aceptamos cualquier preview de ESE proyecto puntual.
const VERCEL_PREVIEW_ORIGIN = /^https:\/\/vendita-[a-z0-9-]+-badgomez2727s-projects\.vercel\.app$/;

app.use(cors({
  origin: (origin, callback) => {
    // Peticiones sin header Origin (ej. curl, servidor-a-servidor) no aplican CORS.
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin) || VERCEL_PREVIEW_ORIGIN.test(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`Origen no permitido por CORS: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Middlewares generales (siempre van después de la declaración de 'app' y cors)
// Límite subido de los 100kb por defecto de Express: la carga masiva de
// productos manda el CSV completo como JSON en el body, y con unos pocos
// cientos de filas (con descripción/proveedor incluidos) ya supera 100kb.
// 10mb sigue siendo un techo acotado (no abre la puerta a payloads
// arbitrarios), pero deja margen holgado para catálogos grandes.
app.use(express.json({ limit: '10mb' })); // Para parsear cuerpos de solicitud JSON
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // Para parsear cuerpos de solicitud URL-encoded

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
app.use('/api/admin', adminRoutes); // Solo accesible con rol super_admin_sistema
app.use('/api/pedidos-ia', aiOrderRoutes); // Borrador de pedidos por WhatsApp con IA (solo plan PRO)

// Iniciar el servidor — pero no cuando este archivo se importa desde los
// tests (Supertest hace su propio listen() en un puerto efímero; si
// arrancáramos aquí también, chocarían dos servidores en el mismo puerto).
const PORT = process.env.PORT || 3001; // Render usa PORT=10000, así que process.env.PORT es el importante
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Servidor escuchando en el puerto ${PORT}`);
  });
}

// Desconectar Prisma cuando la aplicación se cierra
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

module.exports = app;
