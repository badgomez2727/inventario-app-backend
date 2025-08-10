// venta_inventario_app/backend/src/controllers/saleController.js

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const createSale = async (req, res) => {
  const { items } = req.body;
  const companyId = req.companyId;
  const userId = req.userId;

  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'La venta debe contener al menos un artículo.' });
  }

  // Usamos una transacción para garantizar la atomicidad de la venta
  try {
    const result = await prisma.$transaction(async (prisma) => {
      let totalVenta = 0;

      // 1. Verificar el stock de todos los productos y calcular el total de la venta
      const productIds = items.map(item => item.productId);
      const productsInDb = await prisma.product.findMany({
        where: {
          id: { in: productIds },
          companyId,
        },
      });

      const productMap = new Map(productsInDb.map(p => [p.id, p]));

      for (const item of items) {
        const product = productMap.get(item.productId);

        if (!product) {
          throw new Error(`El producto con ID ${item.productId} no existe.`);
        }
        if (product.stockActual < item.cantidad) {
          throw new Error(`Stock insuficiente para el producto '${product.nombre}'. Stock actual: ${product.stockActual}, cantidad solicitada: ${item.cantidad}.`);
        }
        totalVenta += product.precioVenta * item.cantidad;
      }

      // 2. Crear la Venta
      const newSale = await prisma.sale.create({
        data: {
          companyId,
          userId,
          total: totalVenta,
          estado: 'COMPLETADA',
        },
      });

      // 3. Crear los SaleItems y los StockMovements
      for (const item of items) {
        const product = productMap.get(item.productId);
        const subtotal = product.precioVenta * item.cantidad;

        // 3a. Crear el registro del artículo vendido
        await prisma.saleItem.create({
          data: {
            saleId: newSale.id,
            productId: item.productId,
            cantidad: item.cantidad,
            precioUnitario: product.precioVenta,
            subtotal: subtotal,
          },
        });

        // 3b. Crear el registro de movimiento de stock (SALIDA)
        await prisma.stockMovement.create({
          data: {
            productId: item.productId,
            companyId,
            userId,
            tipo: 'SALIDA',
            cantidad: item.cantidad,
            motivo: `Venta #${newSale.id}`,
          },
        });

        // 3c. Actualizar el stock actual del producto
        await prisma.product.update({
          where: { id: item.productId, companyId },
          data: {
            stockActual: {
              decrement: item.cantidad,
            },
          },
        });
      }

      return newSale;
    });

    res.status(201).json({
      message: 'Venta registrada con éxito.',
      sale: result,
    });
  } catch (error) {
    console.error('Error al crear la venta:', error);
    res.status(500).json({ error: error.message || 'Error interno del servidor al procesar la venta.' });
  }
};

const getSales = async (req, res) => {
  const companyId = req.companyId;

  try {
    const sales = await prisma.sale.findMany({
      where: { companyId },
      include: {
        user: {
          select: {
            nombreUsuario: true,
          },
        },
        saleItems: {
          include: {
            product: {
              select: {
                nombre: true,
                sku: true,
              },
            },
          },
        },
      },
      orderBy: {
        fechaVenta: 'desc',
      },
    });

    res.json(sales);
  } catch (error) {
    console.error('Error al obtener la lista de ventas:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

module.exports = {
  createSale,
  getSales
};