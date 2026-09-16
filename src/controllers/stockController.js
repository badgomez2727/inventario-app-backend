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
    const newMovement = await prisma.$transaction(async (tx) => {
      // CRÍTICO: sin este chequeo, se podía incrementar el stock de un
      // producto de OTRA compañía pasando su id — el movimiento quedaba
      // registrado con el companyId del atacante, pero afectaba stock ajeno.
      const product = await tx.product.findFirst({
        where: { id: parseInt(productId), companyId },
      });
      if (!product) {
        throw new Error('PRODUCTO_NO_ENCONTRADO');
      }

      const movement = await tx.stockMovement.create({
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

      await tx.product.update({
        where: { id: parseInt(productId) },
        data: { stockActual: { increment: parseInt(cantidad) } },
      });

      return movement;
    });

    // La respuesta se envía DESPUÉS de que la transacción resuelve, nunca
    // desde dentro del callback (si Prisma alguna vez reintenta la
    // transacción, res.json() dentro del callback podría llamarse dos veces).
    res.status(201).json(newMovement);
  } catch (error) {
    if (error.message === 'PRODUCTO_NO_ENCONTRADO') {
      return res.status(404).json({ error: 'Producto no encontrado o no pertenece a tu compañía.' });
    }
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
    const newMovement = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: { id: parseInt(productId), companyId },
      });
      if (!product) {
        throw new Error('PRODUCTO_NO_ENCONTRADO');
      }

      // CRÍTICO: descuento atómico condicionado (stockActual >= cantidad) en
      // la propia sentencia UPDATE, en vez de "leer y luego decidir" — así
      // dos salidas/ventas simultáneas del último ítem no pueden dejar el
      // stock en negativo (la condición se evalúa en el mismo statement que
      // hace el UPDATE, con el lock de fila que Postgres ya toma para eso).
      const updateResult = await tx.product.updateMany({
        where: { id: parseInt(productId), companyId, stockActual: { gte: parseInt(cantidad) } },
        data: { stockActual: { decrement: parseInt(cantidad) } },
      });
      if (updateResult.count === 0) {
        throw new Error('STOCK_INSUFICIENTE');
      }

      return tx.stockMovement.create({
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
    });

    res.status(201).json(newMovement);
  } catch (error) {
    if (error.message === 'PRODUCTO_NO_ENCONTRADO') {
      return res.status(404).json({ error: 'Producto no encontrado o no pertenece a tu compañía.' });
    }
    if (error.message === 'STOCK_INSUFICIENTE') {
      return res.status(400).json({ error: 'Stock insuficiente para esta salida.' });
    }
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
