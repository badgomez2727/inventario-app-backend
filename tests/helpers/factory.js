// tests/helpers/factory.js
//
// Helpers para armar datos de prueba aislados: cada llamada usa un sufijo
// único (para no chocar con los unique constraints de nombre/email/usuario,
// que en el schema real son necesarios para el flujo de login) y firma
// tokens directamente con jsonwebtoken — no pasa por /auth/login — porque lo
// que estos tests verifican es la autorización/lógica de negocio en las
// rutas protegidas, no el login en sí.

const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

let counter = 0;
const uniqueSuffix = () => `${Date.now()}_${process.pid}_${counter++}`;

async function createCompany(overrides = {}) {
  const suffix = uniqueSuffix();
  return prisma.company.create({
    data: {
      nombre: `Compañía Test ${suffix}`,
      emailContacto: `empresa_${suffix}@test.local`,
      activo: true,
      ...overrides,
    },
  });
}

async function createUser(companyId, rol = 'empleado_inventario', overrides = {}) {
  const suffix = uniqueSuffix();
  return prisma.user.create({
    data: {
      companyId,
      nombreUsuario: `usuario_${suffix}`,
      email: `usuario_${suffix}@test.local`,
      password: 'hash-no-usado-en-estos-tests', // el login no pasa por aquí
      rol,
      activo: true,
      ...overrides,
    },
  });
}

async function createProduct(companyId, overrides = {}) {
  const suffix = uniqueSuffix();
  return prisma.product.create({
    data: {
      companyId,
      nombre: `Producto Test ${suffix}`,
      sku: `SKU-${suffix}`,
      precioCompra: 1000,
      precioVenta: 2000,
      stockActual: 10,
      unidadMedida: 'unidad',
      categoria: 'general',
      activo: true,
      ...overrides,
    },
  });
}

async function createClient(companyId, overrides = {}) {
  const suffix = uniqueSuffix();
  return prisma.client.create({
    data: {
      companyId,
      nombre: `Cliente Test ${suffix}`,
      ...overrides,
    },
  });
}

async function createSupplier(companyId, overrides = {}) {
  const suffix = uniqueSuffix();
  return prisma.supplier.create({
    data: {
      companyId,
      nombre: `Proveedor Test ${suffix}`,
      ...overrides,
    },
  });
}

async function createSale(companyId, userId, overrides = {}) {
  return prisma.sale.create({
    data: {
      companyId,
      userId,
      fechaVenta: new Date(),
      total: 10000,
      estado: 'Completada',
      estadoPago: 'PENDIENTE',
      ...overrides,
    },
  });
}

function signToken(user) {
  return jwt.sign(
    { userId: user.id, companyId: user.companyId, rol: user.rol },
    process.env.JWT_SECRET,
    { expiresIn: '8h' } // igual al de authController.js — no crítico para los tests, pero evita que diverja
  );
}

module.exports = {
  prisma,
  createCompany,
  createUser,
  createProduct,
  createClient,
  createSupplier,
  createSale,
  signToken,
};
