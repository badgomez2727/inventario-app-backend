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

        // CRÍTICO: el descuento de stock debe ser una operación atómica que
        // valide la cantidad disponible en el MISMO statement — leer
        // stockActual y decidir aparte (como se hacía antes) deja una
        // ventana donde dos ventas concurrentes del último ítem disponible
        // pueden pasar ambas la validación y dejar el stock en negativo.
        // updateMany con `stockActual: { gte: cantidad }` en el where hace
        // que Postgres solo aplique el UPDATE si la condición sigue siendo
        // cierta en ese instante (con el lock de fila propio del UPDATE).
        const stockUpdate = await tx.product.updateMany({
          where: { id: productId, companyId, stockActual: { gte: item.cantidad } },
          data: { stockActual: { decrement: item.cantidad } },
        });
        if (stockUpdate.count === 0) {
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

// Anula una venta: solo admin_compania o super_admin_sistema (mismo criterio
// que authorizeAdmin en el resto del sistema), con motivo obligatorio. No se
// puede anular una venta con pagos activos (primero hay que anular esos
// pagos) ni una venta ya anulada. En una sola transacción: la venta pasa a
// ANULADA (con fecha, usuario y motivo) y cada ítem devuelve su stock con un
// StockMovement de tipo 'devolucion'.
// El chequeo de rol vive acá (no en la ruta) porque authorizeAdmin es
// genérico para todo /api; esto documenta explícitamente qué roles pueden
// anular ventas.
const anularVenta = async (req, res) => {
  const companyId = req.companyId;
  const userId = req.userId;
  const saleId = parseInt(req.params.id, 10);
  const { motivo } = req.body;

  if (req.rol !== 'admin_compania' && req.rol !== 'super_admin_sistema') {
    return res.status(403).json({ error: 'Solo un administrador puede anular una venta.' });
  }

  if (!Number.isInteger(saleId)) {
    return res.status(400).json({ error: 'Venta inválida.' });
  }

  if (!motivo || !motivo.trim()) {
    return res.status(400).json({ error: 'El motivo de anulación es obligatorio.' });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findFirst({
        where: { id: saleId, companyId },
        include: { payments: true, saleItems: true },
      });

      if (!sale) {
        const err = new Error('Venta no encontrada o no pertenece a tu compañía.');
        err.status = 404;
        throw err;
      }

      if (sale.estado === 'ANULADA') {
        const err = new Error('Esta venta ya fue anulada.');
        err.status = 400;
        throw err;
      }

      const pagosActivos = sale.payments.filter((p) => !p.anulado);
      if (pagosActivos.length > 0) {
        const err = new Error('No puedes anular una venta con pagos activos. Anula primero los pagos registrados y vuelve a intentarlo.');
        err.status = 400;
        throw err;
      }

      for (const item of sale.saleItems) {
        await tx.product.updateMany({
          where: { id: item.productId, companyId },
          data: { stockActual: { increment: item.cantidad } },
        });

        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            cantidad: item.cantidad,
            tipo: 'devolucion',
            motivo: `Devolución por anulación de venta #${sale.id}`,
            userId,
            companyId,
            fechaMovimiento: new Date(),
          },
        });
      }

      const updatedSale = await tx.sale.update({
        where: { id: saleId },
        data: {
          estado: 'ANULADA',
          fechaAnulacion: new Date(),
          anuladoPorUserId: userId,
          motivoAnulacion: motivo.trim(),
        },
      });

      return updatedSale;
    });

    res.json({ message: 'Venta anulada con éxito.', sale: result });
  } catch (error) {
    console.error('Error al anular la venta:', error);
    res.status(error.status || 500).json({ error: error.message || 'Error interno al anular la venta.' });
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
          payments: {
            where: { anulado: false }, // Solo los pagos activos cuentan para el saldo pendiente
            select: { monto: true },
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
  anularVenta,
};


