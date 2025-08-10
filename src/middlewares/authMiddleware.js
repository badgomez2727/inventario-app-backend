// venta_inventario_app/backend/src/middlewares/authMiddleware.js
const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config/jwt'); // Importa la clave secreta

const authMiddleware = (req, res, next) => {
  // Obtener el token del encabezado Authorization
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado: Token no proporcionado o formato incorrecto.' });
  }

  const token = authHeader.split(' ')[1]; // Extrae el token (quita "Bearer ")

  try {
    // Verificar y decodificar el token
    const decoded = jwt.verify(token, jwtSecret);

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


module.exports = {
  authMiddleware,
  authorizeAdmin, // Exportamos también el middleware de autorización si se requiere
};