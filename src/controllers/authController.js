// venta_inventario_app/backend/src/controllers/authController.js
const crypto = require('crypto');
const { enviarCorreoRecuperacion } = require('../services/emailService');
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

const solicitarRecuperacion = async (req, res) => {
  let { email } = req.body; // Cambia const por let para poder limpiarlo

  // 1. Verificación de seguridad
  if (!email) {
    return res.status(400).json({ error: 'El correo electrónico es obligatorio.' });
  }

  // 2. CORRECCIÓN: Asegurarnos de que email sea un String
  // Si por alguna razón llega como objeto {email: '...'}, extraemos el string
  const emailString = (typeof email === 'object' ? email.email : email).toLowerCase().trim();

  try {
    const user = await prisma.user.findFirst({ 
      where: { email: emailString } 
    });
    
    if (!user) {
      return res.status(404).json({ error: 'No se encontró un usuario con ese correo.' });
    }

    // ... (el resto del código sigue igual usando emailString)
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 3600000);

    await prisma.passwordResetToken.create({
      data: { token, userId: user.id, expiresAt }
    });

    
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const enlace = `${frontendUrl}/reset-password?token=${token}`;
    await enviarCorreoRecuperacion(user.email, user.nombreUsuario, enlace);



    res.status(200).json({ message: 'Correo de recuperación enviado con éxito.' });

  } catch (error) {
    console.error('Error detallado:', error);
    res.status(500).json({ error: 'Error interno', message: error.message });
  }
};

const restablecerClave = async (req, res) => {
  const { token, newPassword } = req.body;
  try {
    const storedToken = await prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: true }
    });
    if (!storedToken || storedToken.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Token inválido o expirado.' });
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.$transaction([
      prisma.user.update({ where: { id: storedToken.userId }, data: { password: hashedPassword } }),
      prisma.passwordResetToken.delete({ where: { id: storedToken.id } })
    ]);
    res.status(200).json({ message: 'Clave actualizada.' });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar.' });
  }
};

// Prueba de diagnóstico rápido
const pruebaResend = async (req, res) => {
  try {
    const { Resend } = require('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    
    console.log("Usando clave:", process.env.RESEND_API_KEY ? "Detectada" : "No detectada");
    
    const data = await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: 'TU_CORREO_DE_REGISTRO_EN_RESEND@gmail.com', // CAMBIA ESTO POR TU CORREO REAL
      subject: 'Prueba de Conexión',
      html: '<p>Si ves esto, la API Key funciona</p>'
    });
    
    console.log("Respuesta técnica de Resend:", data);
    res.json(data);
  } catch (err) {
    console.error("Error técnico:", err);
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  registerCompanyAndAdmin,
  login,
  solicitarRecuperacion,
  restablecerClave
};

