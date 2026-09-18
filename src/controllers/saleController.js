// venta_inventario_app/backend/src/controllers/saleController.js

const { PrismaClient } = require('@prisma/client');
const { findOrCreateCliente } = require('./clienteController');
const prisma = new PrismaClient();

// Estados de pago que dejan un saldo pendiente — para estos, el cliente ya
// no es opcional: sin saber quién debe, no hay a quién cobrarle ni cómo
// armar la cartera (ver clienteController.getCartera).
const ESTADOS_A_CREDITO = ['PENDIENTE', 'PARCIAL'];

// Función para crear una nueva venta
const createSale = async (req, res) => {
  // clienteNuevo permite crear (o reutilizar, por celular) un cliente en la
  // misma operación que la venta, para no obligar al vendedor a salirse del
  // POS a crear el cliente aparte primero.
  const { items, clientId, clienteNuevo, total, estadoPago } = req.body;
  const userId = req.userId;
  const companyId = req.companyId;

  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'La venta debe contener al menos un producto.' });
  }

  const esACredito = ESTADOS_A_CREDITO.includes(estadoPago);
  if (esACredito && !clientId && !clienteNuevo) {
    return res.status(400).json({ error: 'Para una venta pendiente o parcial, el cliente es obligatorio.' });
  }

  try {
    const { sale: newSale, cliente, clienteReutilizado } = await prisma.$transaction(async (tx) => {
      let resolvedClientId = null;
      let cliente = null;
      let clienteReutilizado = false;

      // 1.5 Resolver el cliente: uno existente (validando que sea de esta
      //     compañía y esté activo) o uno nuevo/reutilizado a partir de
      //     clienteNuevo. Este chequeo es necesario aunque el frontend ya
      //     filtre los clientes inactivos de su selector — esa lista puede
      //     quedar desactualizada (otra pestaña desactivó o borró al
      //     cliente mientras el POS seguía abierto).
      if (clientId) {
        const client = await tx.client.findFirst({
          where: { id: parseInt(clientId), companyId },
        });
        if (!client) {
          const err = new Error('El cliente indicado no existe o no pertenece a tu compañía.');
          err.status = 400;
          throw err;
        }
        if (!client.activo) {
          const err = new Error('Este cliente está desactivado. Reactívalo o elige/crea otro cliente.');
          err.status = 400;
          throw err;
        }
        resolvedClientId = client.id;
        cliente = client;
      } else if (clienteNuevo) {
        const resultado = await findOrCreateCliente(tx, companyId, clienteNuevo);
        resolvedClientId = resultado.cliente.id;
        cliente = resultado.cliente;
        clienteReutilizado = resultado.reutilizado;
      }

      // 2. Crear la venta principal incluyendo el estado de pago
      const sale = await tx.sale.create({
        data: {
          fechaVenta: new Date(),
          total: parseFloat(total),
          userId: userId,
          companyId: companyId,
          clientId: resolvedClientId,
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
          const err = new Error(`Producto no encontrado o no pertenece a tu compañía (ID: ${item.productId}).`);
          err.status = 400;
          throw err;
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
          const err = new Error(`Stock insuficiente para el producto: ${product.nombre}.`);
          err.status = 400;
          throw err;
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
      return { sale, cliente, clienteReutilizado };
    });

    res.status(201).json({
      message: 'Venta registrada con éxito',
      sale: newSale,
      cliente: cliente || undefined,
      clienteReutilizado,
    });
  } catch (error) {
    console.error('Error al registrar la venta:', error);
    res.status(error.status || 500).json({ error: error.message || 'Error interno al registrar la venta.' });
  }
};

// Asigna (o cambia) el cliente de una venta ya existente — pensado para
// ventas PENDIENTE/PARCIAL que quedaron sin cliente de antes de esta
// validación, pero funciona sobre cualquier venta no anulada. Acepta un
// clientId existente o clienteNuevo (mismo find-or-create por celular que
// createSale). No requiere admin: es una corrección operativa normal.
const asignarClienteAVenta = async (req, res) => {
  const companyId = req.companyId;
  const saleId = parseInt(req.params.id, 10);
  const { clientId, clienteNuevo } = req.body;

  if (!Number.isInteger(saleId)) {
    return res.status(400).json({ error: 'Venta inválida.' });
  }

  if (!clientId && !clienteNuevo) {
    return res.status(400).json({ error: 'Debes indicar un cliente existente (clientId) o uno nuevo (clienteNuevo).' });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findFirst({ where: { id: saleId, companyId } });
      if (!sale) {
        const err = new Error('Venta no encontrada o no pertenece a tu compañía.');
        err.status = 404;
        throw err;
      }
      if (sale.estado === 'ANULADA') {
        const err = new Error('No puedes asignar un cliente a una venta anulada.');
        err.status = 400;
        throw err;
      }

      let resolvedClientId;
      let cliente;
      let clienteReutilizado = false;

      if (clientId) {
        const client = await tx.client.findFirst({ where: { id: parseInt(clientId), companyId } });
        if (!client) {
          const err = new Error('El cliente indicado no existe o no pertenece a tu compañía.');
          err.status = 400;
          throw err;
        }
        if (!client.activo) {
          const err = new Error('Este cliente está desactivado. Reactívalo o elige/crea otro cliente.');
          err.status = 400;
          throw err;
        }
        resolvedClientId = client.id;
        cliente = client;
      } else {
        const resultado = await findOrCreateCliente(tx, companyId, clienteNuevo);
        resolvedClientId = resultado.cliente.id;
        cliente = resultado.cliente;
        clienteReutilizado = resultado.reutilizado;
      }

      const updatedSale = await tx.sale.update({
        where: { id: saleId },
        data: { clientId: resolvedClientId },
      });

      return { sale: updatedSale, cliente, clienteReutilizado };
    });

    res.json({ message: 'Cliente asignado a la venta con éxito.', ...result });
  } catch (error) {
    console.error('Error al asignar cliente a la venta:', error);
    res.status(error.status || 500).json({ error: error.message || 'Error interno al asignar el cliente.' });
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
            select: { id: true, nombre: true, telefono: true },
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
  asignarClienteAVenta,
};


