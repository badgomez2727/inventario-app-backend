// venta_inventario_app/backend/src/controllers/saleController.js

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Función para crear una nueva venta
const createSale = async (req, res) => {
  // 1. Recibimos también estadoPago del body
  const { items, clientId, total, estadoPago } = req.body; 
  const userId = req.userId; 
  const companyId = req.companyId; 

  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'La venta debe contener al menos un producto.' });
  }

  try {
    const newSale = await prisma.$transaction(async (tx) => {
      // 2. Crear la venta principal incluyendo el estado de pago
      const sale = await tx.sale.create({
        data: {
          fechaVenta: new Date(),
          total: parseFloat(total), 
          userId: userId,
          companyId: companyId,
          clientId: clientId ? parseInt(clientId) : null, 
          estado: 'Completada', 
          estadoPago: estadoPago || 'PAGADA', // <-- Campo nuevo guardado
        },
      });

      // 3. Crear los ítems de venta y actualizar el stock
      for (const item of items) {
        const product = await tx.product.findUnique({
          where: { id: parseInt(item.productId) },
        });

        if (!product || product.stockActual < item.cantidad) {
          throw new Error(`Stock insuficiente para el producto: ${product ? product.nombre : 'desconocido'}.`);
        }

        await tx.saleItem.create({
          data: {
            saleId: sale.id,
            productId: parseInt(item.productId),
            cantidad: item.cantidad,
            precioUnitario: product.precioVenta,
            subtotal: item.cantidad * product.precioVenta, 
          },
        });

        await tx.product.update({
          where: { id: parseInt(item.productId) },
          data: {
            stockActual: product.stockActual - item.cantidad,
          },
        });

        // 4. Registrar el movimiento de stock (Fundamental para auditoría)
        await tx.stockMovement.create({
          data: {
            productId: parseInt(item.productId),
            cantidad: item.cantidad,
            tipo: 'salida',
            motivo: `Venta #${sale.id}`,
            userId: userId,
            companyId: companyId,
            fechaMovimiento: new Date(),
          },
        });
      }
      return sale; 
    });

    res.status(201).json({ message: 'Venta registrada con éxito', sale: newSale });
  } catch (error) {
    console.error('Error al registrar la venta:', error);
    res.status(500).json({ error: error.message || 'Error interno al registrar la venta.' });
  }
};

// Función para obtener el historial de ventas
const getSalesHistory = async (req, res) => {
  const companyId = req.companyId; // Obtenido del token JWT

  try {
    const sales = await prisma.sale.findMany({
      where: {
        companyId: companyId,
      },
      include: {
        user: { // Incluye la información del usuario que realizó la venta
          select: { nombreUsuario: true }, // Solo necesitamos el nombre de usuario
        },
        client: { // <-- ¡AHORA SÍ DESCOMENTADO! Incluye la información del cliente
          select: { nombre: true }, 
        },
        saleItems: {
          include: {
            product: {
              select: { nombre: true }, // Solo necesitamos el nombre del producto
            },
          },
        },
      },
      orderBy: {
        fechaVenta: 'desc', // Ordenar por fecha de venta, las más recientes primero
      },
    });
    res.json(sales);
  } catch (error) {
    console.error('Error al obtener el historial de ventas:', error);
    res.status(500).json({ error: 'Error interno del servidor al obtener historial de ventas.' });
  }
};


module.exports = {
  createSale,
  getSalesHistory,
};


