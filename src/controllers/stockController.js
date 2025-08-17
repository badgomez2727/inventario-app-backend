// venta_inventario_app/backend/src/controllers/stockController.js

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Función para registrar una entrada de stock
const addStockEntry = async (req, res) => {
  const { productId, cantidad, motivo } = req.body;
  const userId = req.userId; // Obtenido del token JWT
  const companyId = req.companyId; // Obtenido del token JWT

  if (!productId || !cantidad || cantidad <= 0 || !motivo) {
    return res.status(400).json({ error: 'Faltan campos obligatorios o la cantidad es inválida.' });
  }

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Crear el movimiento de stock
      const newMovement = await tx.stockMovement.create({
        data: {
          productId: parseInt(productId),
          cantidad: parseInt(cantidad),
          tipo: 'entrada',
          motivo,
          userId,
          companyId,
          fechaMovimiento: new Date(),
        },
      });

      // 2. Actualizar el stock actual del producto
      await tx.product.update({
        where: { id: parseInt(productId) },
        data: {
          stockActual: {
            increment: parseInt(cantidad),
          },
        },
      });
      res.status(201).json(newMovement);
    });
  } catch (error) {
    console.error('Error al registrar entrada de stock:', error);
    res.status(500).json({ error: 'Error interno del servidor al registrar la entrada de stock.' });
  }
};

// Función para registrar una salida de stock
const addStockExit = async (req, res) => {
  const { productId, cantidad, motivo } = req.body;
  const userId = req.userId; // Obtenido del token JWT
  const companyId = req.companyId; // Obtenido del token JWT

  if (!productId || !cantidad || cantidad <= 0 || !motivo) {
    return res.status(400).json({ error: 'Faltan campos obligatorios o la cantidad es inválida.' });
  }

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Verificar stock actual
      const product = await tx.product.findUnique({
        where: { id: parseInt(productId), companyId: companyId },
      });

      if (!product || product.stockActual < cantidad) {
        return res.status(400).json({ error: 'Stock insuficiente para esta salida.' });
      }

      // 2. Crear el movimiento de stock
      const newMovement = await tx.stockMovement.create({
        data: {
          productId: parseInt(productId),
          cantidad: parseInt(cantidad),
          tipo: 'salida',
          motivo,
          userId,
          companyId,
          fechaMovimiento: new Date(),
        },
      });

      // 3. Actualizar el stock actual del producto
      await tx.product.update({
        where: { id: parseInt(productId) },
        data: {
          stockActual: {
            decrement: parseInt(cantidad),
          },
        },
      });
      res.status(201).json(newMovement);
    });
  } catch (error) {
    console.error('Error al registrar salida de stock:', error);
    res.status(500).json({ error: 'Error interno del servidor al registrar la salida de stock.' });
  }
};

// Función para obtener el historial de movimientos de stock
const getStockMovementsHistory = async (req, res) => {
  const companyId = req.companyId; // Obtenido del token JWT

  try {
    const movements = await prisma.stockMovement.findMany({
      where: { companyId },
      include: {
        product: {
          select: { nombre: true, sku: true }, // Incluir nombre y SKU del producto
        },
        user: {
          select: { nombreUsuario: true }, // Incluir nombre de usuario
        },
      },
      orderBy: {
        fechaMovimiento: 'desc', // Ordenar por fecha, más recientes primero
      },
    });
    res.json(movements);
  } catch (error) {
    console.error('Error al obtener historial de stock:', error);
    res.status(500).json({ error: 'Error interno del servidor al obtener historial de stock.' });
  }
};

module.exports = {
  addStockEntry,
  addStockExit,
  getStockMovementsHistory, // <-- ¡Confirma que esta función esté listada aquí para ser exportada!
};
