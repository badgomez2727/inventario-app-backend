// backend/src/controllers/pedidoController.js
//
// Gestión de pedidos del catálogo público, del lado del negocio (con
// autenticación): listar, confirmar (crea la venta real) y rechazar. No
// requiere admin — es trabajo operativo normal, igual que registrar un pago
// o asignar un cliente a una venta.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const PEDIDO_INCLUDE = {
  client: { select: { id: true, nombre: true, telefono: true } },
  items: { include: { product: { select: { id: true, nombre: true } } } },
};

// GET /api/pedidos?estado=PENDIENTE_REVISION&page=1&limit=10
const listPedidos = async (req, res) => {
  const companyId = req.companyId;
  const { estado } = req.query;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const where = { companyId };
  if (estado) where.estado = estado;

  try {
    const [pedidos, totalCount] = await Promise.all([
      prisma.pedido.findMany({
        where,
        include: PEDIDO_INCLUDE,
        orderBy: { fechaPedido: 'desc' },
        skip,
        take: limit,
      }),
      prisma.pedido.count({ where }),
    ]);

    res.json({ pedidos, totalPages: Math.ceil(totalCount / limit), currentPage: page, totalCount });
  } catch (error) {
    console.error('Error al listar pedidos:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

// PATCH /api/pedidos/:id/confirmar
// Crea la venta real a partir del pedido: misma mecánica atómica de stock
// que createSale (ver saleController.js), pero reutilizando los ítems y
// precios ya guardados en el pedido en vez de recibirlos del body — lo que
// se confirma es exactamente lo que el cliente pidió, no algo nuevo.
const confirmarPedido = async (req, res) => {
  const companyId = req.companyId;
  const userId = req.userId;
  const pedidoId = parseInt(req.params.id, 10);

  if (!Number.isInteger(pedidoId)) {
    return res.status(400).json({ error: 'Pedido inválido.' });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const pedido = await tx.pedido.findFirst({
        where: { id: pedidoId, companyId },
        include: { items: true },
      });
      if (!pedido) {
        const err = new Error('Pedido no encontrado o no pertenece a tu compañía.');
        err.status = 404;
        throw err;
      }
      if (pedido.estado !== 'PENDIENTE_REVISION') {
        const err = new Error(`Este pedido ya fue ${pedido.estado === 'CONFIRMADO' ? 'confirmado' : 'rechazado'}.`);
        err.status = 400;
        throw err;
      }

      // La venta queda PENDIENTE de pago (el cliente paga al recibir/recoger,
      // no antes) — así aparece en la cartera (Bloque B) hasta que se
      // registre el pago real. sale.total incluye el domicilio si lo hay,
      // aunque los SaleItem solo representan los productos: es lo que el
      // cliente realmente debe, y es lo único que cartera/pagos consultan.
      const sale = await tx.sale.create({
        data: {
          companyId,
          userId,
          clientId: pedido.clientId,
          total: pedido.total,
          estado: 'Completada',
          estadoPago: 'PENDIENTE',
        },
      });

      for (const item of pedido.items) {
        const stockUpdate = await tx.product.updateMany({
          where: { id: item.productId, companyId, stockActual: { gte: item.cantidad } },
          data: { stockActual: { decrement: item.cantidad } },
        });
        if (stockUpdate.count === 0) {
          const product = await tx.product.findUnique({ where: { id: item.productId } });
          const err = new Error(`Ya no hay stock suficiente de "${product?.nombre || 'un producto'}" para confirmar este pedido.`);
          err.status = 400;
          throw err;
        }

        await tx.saleItem.create({
          data: {
            saleId: sale.id,
            productId: item.productId,
            cantidad: item.cantidad,
            precioUnitario: item.precioUnitario,
            subtotal: item.subtotal,
          },
        });

        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            cantidad: item.cantidad,
            tipo: 'salida',
            motivo: `Venta #${sale.id} (pedido #${pedido.id})`,
            userId,
            companyId,
            fechaMovimiento: new Date(),
          },
        });
      }

      const pedidoActualizado = await tx.pedido.update({
        where: { id: pedidoId },
        data: {
          estado: 'CONFIRMADO',
          saleId: sale.id,
          fechaRevision: new Date(),
          revisadoPorUserId: userId,
        },
      });

      return { sale, pedido: pedidoActualizado };
    });

    res.json({ message: 'Pedido confirmado, venta creada.', ...result });
  } catch (error) {
    console.error('Error al confirmar el pedido:', error);
    res.status(error.status || 500).json({ error: error.message || 'Error interno al confirmar el pedido.' });
  }
};

// PATCH /api/pedidos/:id/rechazar
const rechazarPedido = async (req, res) => {
  const companyId = req.companyId;
  const userId = req.userId;
  const pedidoId = parseInt(req.params.id, 10);
  const { motivo } = req.body;

  if (!Number.isInteger(pedidoId)) {
    return res.status(400).json({ error: 'Pedido inválido.' });
  }
  if (!motivo || !motivo.trim()) {
    return res.status(400).json({ error: 'El motivo de rechazo es obligatorio.' });
  }

  try {
    const pedido = await prisma.pedido.findFirst({ where: { id: pedidoId, companyId } });
    if (!pedido) {
      return res.status(404).json({ error: 'Pedido no encontrado o no pertenece a tu compañía.' });
    }
    if (pedido.estado !== 'PENDIENTE_REVISION') {
      return res.status(400).json({ error: `Este pedido ya fue ${pedido.estado === 'CONFIRMADO' ? 'confirmado' : 'rechazado'}.` });
    }

    const actualizado = await prisma.pedido.update({
      where: { id: pedidoId },
      data: {
        estado: 'RECHAZADO',
        motivoRechazo: motivo.trim(),
        fechaRevision: new Date(),
        revisadoPorUserId: userId,
      },
    });

    res.json({ message: 'Pedido rechazado.', pedido: actualizado });
  } catch (error) {
    console.error('Error al rechazar el pedido:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

module.exports = { listPedidos, confirmarPedido, rechazarPedido };
