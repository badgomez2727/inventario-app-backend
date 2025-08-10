// venta_inventario_app/backend/src/controllers/stockController.js

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const addStockEntry = async (req, res) => {
  const { productId, cantidad, motivo } = req.body;
  const companyId = req.companyId; // Viene del token
  const userId = req.userId; // Viene del token

  if (!productId || !cantidad || cantidad <= 0) {
    return res.status(400).json({ error: 'ID de producto y cantidad válidos son obligatorios.' });
  }

  try {
    // Usamos una transacción para asegurar que ambos pasos se completen o fallen juntos
    await prisma.$transaction(async (prisma) => {
      // 1. Crear el registro del movimiento de entrada
      const newMovement = await prisma.stockMovement.create({
        data: {
          productId: parseInt(productId),
          companyId,
          userId,
          tipo: 'ENTRADA',
          cantidad: parseInt(cantidad),
          motivo,
        },
      });

      // 2. Actualizar el stock actual del producto
      const updatedProduct = await prisma.product.update({
        where: { id: parseInt(productId), companyId },
        data: {
          stockActual: {
            increment: parseInt(cantidad), // Incrementa el stock
          },
        },
      });

      res.status(201).json({
        message: 'Entrada de stock registrada con éxito.',
        movement: newMovement,
        product: updatedProduct,
      });
    });

  } catch (error) {
    console.error('Error al registrar entrada de stock:', error);
    res.status(500).json({ error: 'Error interno del servidor al procesar la entrada de stock.' });
  }
};

const addStockExit = async (req, res) => {
  const { productId, cantidad, motivo } = req.body;
  const companyId = req.companyId;
  const userId = req.userId;

  if (!productId || !cantidad || cantidad <= 0) {
    return res.status(400).json({ error: 'ID de producto y cantidad válidos son obligatorios.' });
  }

  try {
    // Usamos una transacción para asegurar la consistencia del stock
    await prisma.$transaction(async (prisma) => {
      // Obtener el producto para verificar si hay suficiente stock
      const product = await prisma.product.findUnique({
        where: { id: parseInt(productId), companyId },
      });

      if (!product || product.stockActual < cantidad) {
        return res.status(400).json({ error: 'Stock insuficiente para registrar la salida.' });
      }

      // 1. Crear el registro del movimiento de salida
      const newMovement = await prisma.stockMovement.create({
        data: {
          productId: parseInt(productId),
          companyId,
          userId,
          tipo: 'SALIDA',
          cantidad: parseInt(cantidad),
          motivo,
        },
      });

      // 2. Actualizar el stock actual del producto
      const updatedProduct = await prisma.product.update({
        where: { id: parseInt(productId), companyId },
        data: {
          stockActual: {
            decrement: parseInt(cantidad), // Decrementa el stock
          },
        },
      });

      res.status(201).json({
        message: 'Salida de stock registrada con éxito.',
        movement: newMovement,
        product: updatedProduct,
      });
    });

  } catch (error) {
    console.error('Error al registrar salida de stock:', error);
    res.status(500).json({ error: 'Error interno del servidor al procesar la salida de stock.' });
  }
};

const getStockMovements = async (req, res) => {
  const companyId = req.companyId;

  try {
    const movements = await prisma.stockMovement.findMany({
      where: { companyId },
      include: {
        product: {
          select: {
            nombre: true,
            sku: true,
          },
        },
        user: {
          select: {
            nombreUsuario: true,
          },
        },
      },
      orderBy: {
        fechaMovimiento: 'desc', // Muestra los movimientos más recientes primero
      },
    });

    res.json(movements);
  } catch (error) {
    console.error('Error al obtener movimientos de stock:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

module.exports = {
  addStockEntry,
  addStockExit,
  getStockMovements,
};