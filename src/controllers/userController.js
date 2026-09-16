// venta_inventario_app/backend/src/controllers/userController.js

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { ASSIGNABLE_ROLES } = require('../config/roles');
const prisma = new PrismaClient();

// Función para listar todos los usuarios de la compañía actual
const listUsers = async (req, res) => {
  const companyId = req.companyId;

  try {
    const users = await prisma.user.findMany({
      where: { companyId },
      select: {
        id: true,
        nombreUsuario: true,
        email: true,
        rol: true,
      },
    });
    res.json(users);
  } catch (error) {
    console.error('Error al obtener la lista de usuarios:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

// Función para crear un nuevo usuario dentro de la compañía
const createUser = async (req, res) => {
  const { nombreUsuario, email, password, rol } = req.body;
  const companyId = req.companyId; // Viene del token JWT

  if (!nombreUsuario || !email || !password || !rol) {
    return res.status(400).json({ error: 'Faltan campos obligatorios: nombreUsuario, email, password, rol.' });
  }

  // CRÍTICO: el rol viene del cliente — sin esta validación, cualquiera podía
  // pedir 'super_admin_sistema' y obtener acceso a TODAS las compañías.
  if (!ASSIGNABLE_ROLES.includes(rol)) {
    return res.status(400).json({
      error: `Rol inválido. Debe ser uno de: ${ASSIGNABLE_ROLES.join(', ')}.`,
    });
  }

  try {
    // Hashear la contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await prisma.user.create({
      data: {
        nombreUsuario,
        email,
        password: hashedPassword,
        rol,
        companyId, // Asigna el ID de la compañía del usuario logueado
      },
      select: {
        id: true,
        nombreUsuario: true,
        email: true,
        rol: true,
      },
    });

    res.status(201).json({
      message: 'Usuario creado con éxito.',
      user: newUser
    });
  } catch (error) {
    console.error('Error al crear el nuevo usuario:', error);
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Ya existe un usuario con ese nombre o email en tu compañía.' });
    }
    res.status(500).json({ error: 'Error interno del servidor al crear el usuario.' });
  }
};

module.exports = {
  listUsers,
  createUser,
};