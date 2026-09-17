// venta_inventario_app/backend/src/middlewares/authMiddleware.js
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { jwtSecret } = require('../config/jwt'); // Importa la clave secreta

const prisma = new PrismaClient();

const authMiddleware = async (req, res, next) => {
  // Obtener el token del encabezado Authorization
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado: Token no proporcionado o formato incorrecto.' });
  }

  const token = authHeader.split(' ')[1]; // Extrae el token (quita "Bearer ")

  try {
    // Verificar y decodificar el token
    const decoded = jwt.verify(token, jwtSecret);

    // Un token es válido hasta por 8h (ver config/jwt.js) — si un
    // super_admin_sistema desactiva la compañía a mitad de esa ventana, la
    // sesión ya abierta debe cortarse en la siguiente petición, no seguir
    // operando hasta que el token expire solo.
    const company = await prisma.company.findUnique({
      where: { id: decoded.companyId },
      select: { activo: true },
    });
    if (!company || !company.activo) {
      return res.status(403).json({ error: 'Tu compañía está desactivada. Contacta al administrador del sistema.' });
    }

    // Adjuntar userId, companyId y rol al objeto de solicitud (req)
    req.userId = decoded.userId;
    req.companyId = decoded.companyId;
    req.rol = decoded.rol;

    next(); // Continúa con la siguiente función de middleware o controlador
  } catch (error) {
    console.error('Error de verificación de token:', error);
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado. Por favor, inicie sesión nuevamente.' });
    }
    return res.status(401).json({ error: 'No autorizado: Token inválido.' });
  }
};

// Middleware para verificar si el usuario es admin_compania o super_admin_sistema
const authorizeAdmin = (req, res, next) => {
  if (req.rol === 'admin_compania' || req.rol === 'super_admin_sistema') {
    next(); // Si es admin, continúa
  } else {
    res.status(403).json({ error: 'Acceso denegado: Se requiere rol de administrador.' });
  }
};


// Middleware exclusivo para el super admin del sistema (tú, el dueño de Vendita).
// A diferencia de authorizeAdmin, NO acepta admin_compania: este rol da acceso
// a datos de TODAS las compañías, así que un admin de una sola empresa no
// puede entrar aquí aunque sea "admin" dentro de su propia compañía.
const authorizeSuperAdmin = (req, res, next) => {
  if (req.rol === 'super_admin_sistema') {
    next();
  } else {
    res.status(403).json({ error: 'Acceso denegado: se requiere rol de super administrador del sistema.' });
  }
};

module.exports = {
  authMiddleware,
  authorizeAdmin, // Exportamos también el middleware de autorización si se requiere
  authorizeSuperAdmin,
};