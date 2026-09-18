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
        activo: true,
      },
      orderBy: { fechaCreacion: 'asc' },
    });
    res.json(users);
  } catch (error) {
    console.error('Error al obtener la lista de usuarios:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

// ¿Queda al menos un admin_compania activo en la compañía si excluimos a
// `excludeUserId` (el usuario que se está por editar/desactivar)? Se usa
// tanto al cambiar el rol de un admin como al desactivarlo — una compañía
// nunca puede quedar sin nadie que pueda administrarla.
const tieneOtroAdminActivo = async (companyId, excludeUserId) => {
  const count = await prisma.user.count({
    where: { companyId, rol: 'admin_compania', activo: true, id: { not: excludeUserId } },
  });
  return count > 0;
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

// Edita nombre de usuario, email y/o rol de un usuario de la MISMA compañía
// del admin que hace la petición. Nunca toca contraseña ni companyId.
const updateUser = async (req, res) => {
  const companyId = req.companyId;
  const requesterId = req.userId;
  const targetId = parseInt(req.params.id, 10);
  const { nombreUsuario, email, rol } = req.body;

  if (!Number.isInteger(targetId)) {
    return res.status(400).json({ error: 'Usuario inválido.' });
  }

  if (rol !== undefined && !ASSIGNABLE_ROLES.includes(rol)) {
    return res.status(400).json({
      error: `Rol inválido. Debe ser uno de: ${ASSIGNABLE_ROLES.join(', ')}.`,
    });
  }

  try {
    const target = await prisma.user.findFirst({ where: { id: targetId, companyId } });
    if (!target) {
      return res.status(404).json({ error: 'Usuario no encontrado o no pertenece a tu compañía.' });
    }

    // super_admin_sistema nunca se administra desde la API de compañía,
    // aunque por algún motivo perteneciera a la misma compañía del admin.
    if (target.rol === 'super_admin_sistema') {
      return res.status(403).json({ error: 'No puedes modificar una cuenta de super administrador del sistema.' });
    }

    // Un admin no puede quitarse a sí mismo el rol de administrador —
    // aunque haya otros admins, evita que alguien se deje sin acceso por error.
    if (rol !== undefined && rol !== 'admin_compania' && targetId === requesterId && target.rol === 'admin_compania') {
      return res.status(400).json({ error: 'No puedes quitarte a ti mismo el rol de administrador.' });
    }

    // Si el cambio de rol saca a un admin de serlo, la compañía debe
    // quedar con al menos otro admin activo.
    if (rol !== undefined && rol !== 'admin_compania' && target.rol === 'admin_compania' && target.activo) {
      const quedaOtroAdmin = await tieneOtroAdminActivo(companyId, targetId);
      if (!quedaOtroAdmin) {
        return res.status(400).json({ error: 'No puedes quitar el último administrador activo de la compañía.' });
      }
    }

    const data = {};
    if (nombreUsuario !== undefined) data.nombreUsuario = nombreUsuario;
    if (email !== undefined) data.email = email;
    if (rol !== undefined) data.rol = rol;

    const updated = await prisma.user.update({
      where: { id: targetId },
      data,
      select: { id: true, nombreUsuario: true, email: true, rol: true, activo: true },
    });

    res.json({ message: 'Usuario actualizado con éxito.', user: updated });
  } catch (error) {
    console.error('Error al actualizar el usuario:', error);
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Ya existe un usuario con ese nombre o email en tu compañía.' });
    }
    res.status(500).json({ error: 'Error interno del servidor al actualizar el usuario.' });
  }
};

// Activa o desactiva un usuario de la misma compañía. Un usuario inactivo no
// puede iniciar sesión (ver authController.login) ni seguir operando con una
// sesión ya abierta — el token sigue siendo válido, pero conviene tratarlo
// igual que la desactivación de compañías si en el futuro se agrega ese
// mismo chequeo por usuario en authMiddleware.
const setUserActivo = async (req, res) => {
  const companyId = req.companyId;
  const requesterId = req.userId;
  const targetId = parseInt(req.params.id, 10);
  const { activo } = req.body;

  if (!Number.isInteger(targetId)) {
    return res.status(400).json({ error: 'Usuario inválido.' });
  }

  if (typeof activo !== 'boolean') {
    return res.status(400).json({ error: 'El campo "activo" debe ser true o false.' });
  }

  try {
    const target = await prisma.user.findFirst({ where: { id: targetId, companyId } });
    if (!target) {
      return res.status(404).json({ error: 'Usuario no encontrado o no pertenece a tu compañía.' });
    }

    if (target.rol === 'super_admin_sistema') {
      return res.status(403).json({ error: 'No puedes modificar una cuenta de super administrador del sistema.' });
    }

    if (!activo) {
      if (targetId === requesterId) {
        return res.status(400).json({ error: 'No puedes desactivarte a ti mismo.' });
      }
      if (target.rol === 'admin_compania' && target.activo) {
        const quedaOtroAdmin = await tieneOtroAdminActivo(companyId, targetId);
        if (!quedaOtroAdmin) {
          return res.status(400).json({ error: 'No puedes desactivar al último administrador activo de la compañía.' });
        }
      }
    }

    const updated = await prisma.user.update({
      where: { id: targetId },
      data: { activo },
      select: { id: true, nombreUsuario: true, email: true, rol: true, activo: true },
    });

    res.json({ message: `Usuario ${activo ? 'reactivado' : 'desactivado'} con éxito.`, user: updated });
  } catch (error) {
    console.error('Error al cambiar el estado del usuario:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

module.exports = {
  listUsers,
  createUser,
  updateUser,
  setUserActivo,
};