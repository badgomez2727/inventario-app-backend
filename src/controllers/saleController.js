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
      // 1.5 Si viene un cliente, verificar que pertenezca a esta compañía
      //     (evita asociar la venta a un cliente de otra compañía).
      if (clientId) {
        const client = await tx.client.findFirst({
          where: { id: parseInt(clientId), companyId },
        });
        if (!client) {
          throw new Error('El cliente indicado no existe o no pertenece a tu compañía.');
        }
      }

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
        const productId = parseInt(item.productId);

        // CRÍTICO: el producto debe pertenecer a la compañía del usuario que vende.
        // Antes esto buscaba solo por id, permitiendo que un usuario de una
        // compañía vendiera/descontara stock de productos de OTRA compañía.
        const product = await tx.product.findFirst({
          where: { id: productId, companyId },
        });

        if (!product) {
          throw new Error(`Producto no encontrado o no pertenece a tu compañía (ID: ${item.productId}).`);
        }
        if (product.stockActual < item.cantidad) {
          throw new Error(`Stock insuficiente para el producto: ${product.nombre}.`);
        }

        await tx.saleItem.create({
          data: {
            saleId: sale.id,
            productId: productId,
            cantidad: item.cantidad,
            precioUnitario: product.precioVenta,
            subtotal: item.cantidad * product.precioVenta,
          },
        });

        // Decremento atómico (evita condición de carrera entre ventas concurrentes
        // del mismo producto, en vez de restar sobre un valor leído antes).
        await tx.product.update({
          where: { id: productId },
          data: {
            stockActual: { decrement: item.cantidad },
          },
        });

        // 4. Registrar el movimiento de stock (Fundamental para auditoría)
        await tx.stockMovement.create({
          data: {
            productId: productId,
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

  // Paginación: sin esto, el historial completo de ventas se trae de una sola
  // vez y la respuesta se vuelve cada vez más lenta a medida que crece.
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  try {
    const [sales, totalCount] = await Promise.all([
      prisma.sale.findMany({
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
        skip: skip,
        take: limit,
      }),
      prisma.sale.count({ where: { companyId } }),
    ]);

    res.json({
      sales,
      totalPages: Math.ceil(totalCount / limit),
      currentPage: page,
      totalCount,
    });
  } catch (error) {
    console.error('Error al obtener el historial de ventas:', error);
    res.status(500).json({ error: 'Error interno del servidor al obtener historial de ventas.' });
  }
};


module.exports = {
  createSale,
  getSalesHistory,
};


