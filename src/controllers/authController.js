// venta_inventario_app/backend/src/controllers/authController.js
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config/jwt'); // Importa la clave secreta

const prisma = new PrismaClient();

// Función para registrar una nueva compañía y su primer usuario (admin)
const registerCompanyAndAdmin = async (req, res) => {
  const { companyName, companyEmail, companyAddress, companyPhone, username, email, password } = req.body;

  if (!companyName || !companyEmail || !username || !email || !password) {
    return res.status(400).json({ error: 'Todos los campos de compañía y usuario son obligatorios.' });
  }

  try {
    // 1. Crear la Compañía
    const newCompany = await prisma.company.create({
      data: {
        nombre: companyName,
        emailContacto: companyEmail,
        direccion: companyAddress,
        telefono: companyPhone,
        activo: true, // Por defecto activa
      },
    });

    // 2. Hashear la contraseña
    const hashedPassword = await bcrypt.hash(password, 10); // 10 es el costo del salt

    // 3. Crear el usuario administrador de la compañía
    const newUser = await prisma.user.create({
      data: {
        companyId: newCompany.id,
        nombreUsuario: username,
        email: email,
        password: hashedPassword,
        rol: 'admin_compania', // Rol de administrador para el primer usuario
        activo: true, // Por defecto activo
      },
    });

    res.status(201).json({
      message: 'Compañía y usuario administrador registrados con éxito.',
      company: {
        id: newCompany.id,
        nombre: newCompany.nombre,
      },
      user: {
        id: newUser.id,
        nombreUsuario: newUser.nombreUsuario,
        email: newUser.email,
        rol: newUser.rol,
      },
    });

  } catch (error) {
    console.error('Error al registrar compañía y admin:', error);
    if (error.code === 'P2002') { // Prisma unique constraint violation
      if (error.meta.target.includes('nombre')) {
        return res.status(409).json({ error: 'El nombre de la compañía ya está en uso.' });
      }
      if (error.meta.target.includes('emailContacto')) {
        return res.status(409).json({ error: 'El email de contacto de la compañía ya está en uso.' });
      }
      if (error.meta.target.includes('nombreUsuario')) {
        return res.status(409).json({ error: 'El nombre de usuario ya está en uso.' });
      }
      if (error.meta.target.includes('email')) {
        return res.status(409).json({ error: 'El email de usuario ya está en uso.' });
      }
    }
    res.status(500).json({ error: 'Error interno del servidor al registrar.' });
  }
};

// Función para el login de usuarios
const login = async (req, res) => {
  const { nombreUsuario, password } = req.body;

  if (!nombreUsuario || !password) {
    return res.status(400).json({ error: 'Nombre de usuario y contraseña son obligatorios.' });
  }

  try {
    // 1. Buscar el usuario
    const user = await prisma.user.findUnique({
      where: { nombreUsuario },
      include: {
        company: true, // Incluye la información de la compañía
      },
    });

    if (!user || !user.activo) {
      return res.status(401).json({ error: 'Credenciales inválidas o usuario inactivo.' });
    }

    // 2. Comparar la contraseña
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Credenciales inválidas o usuario inactivo.' });
    }

    // 3. Generar el Token JWT
    const token = jwt.sign(
      { userId: user.id, companyId: user.companyId, rol: user.rol },
      jwtSecret,
      { expiresIn: '1h' } // El token expira en 1 hora
    );

    res.status(200).json({
      message: 'Inicio de sesión exitoso.',
      token,
      user: {
        id: user.id,
        nombreUsuario: user.nombreUsuario,
        email: user.email,
        rol: user.rol,
        company: {
          id: user.company.id,
          nombre: user.company.nombre,
        },
      },
    });

  } catch (error) {
    console.error('Error en el login:', error);
    res.status(500).json({ error: 'Error interno del servidor durante el login.' });
  }
};

module.exports = {
  registerCompanyAndAdmin,
  login,
};