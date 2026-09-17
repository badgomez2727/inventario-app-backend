// backend/src/controllers/paymentController.js
//
// Pagos/abonos de una venta. estadoPago de la venta se recalcula en la
// misma transacción cada vez que se registra o anula un pago, a partir de
// la suma de los pagos NO anulados. Un pago nunca se borra — anularlo solo
// marca `anulado = true` con un motivo obligatorio, para conservar el
// rastro de auditoría.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const METODOS_VALIDOS = ['EFECTIVO', 'TRANSFERENCIA', 'NEQUI', 'DAVIPLATA', 'OTRO'];

// Los montos son pesos con hasta 2 decimales en el schema; se comparan en
// centavos (enteros) para no arrastrar errores de punto flotante en
// sumas/restas de dinero.
const toCents = (value) => Math.round(Number(value) * 100);

const calcularEstadoPago = (totalCents, pagadoCents) => {
  if (pagadoCents <= 0) return 'PENDIENTE';
  if (pagadoCents >= totalCents) return 'PAGADA';
  return 'PARCIAL';
};

const sumaPagosActivos = (payments) => payments.reduce((sum, p) => sum + toCents(p.monto), 0);

// POST /api/sales/:id/payments
const registrarPago = async (req, res) => {
  const companyId = req.companyId;
  const userId = req.userId;
  const saleId = parseInt(req.params.id, 10);
  const { monto, metodo, nota } = req.body;

  if (!Number.isInteger(saleId)) {
    return res.status(400).json({ error: 'Venta inválida.' });
  }

  const montoNum = Number(monto);
  if (!Number.isFinite(montoNum) || montoNum <= 0) {
    return res.status(400).json({ error: 'El monto debe ser mayor a cero.' });
  }

  if (!METODOS_VALIDOS.includes(metodo)) {
    return res.status(400).json({ error: `Método de pago inválido. Usa uno de: ${METODOS_VALIDOS.join(', ')}.` });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findFirst({
        where: { id: saleId, companyId },
        include: { payments: { where: { anulado: false } } },
      });

      if (!sale) {
        const err = new Error('Venta no encontrada o no pertenece a tu compañía.');
        err.status = 404;
        throw err;
      }

      if (sale.estado === 'ANULADA') {
        const err = new Error('Esta venta está anulada y no puede recibir pagos.');
        err.status = 400;
        throw err;
      }

      const totalCents = toCents(sale.total);
      const pagadoCents = sumaPagosActivos(sale.payments);
      const saldoCents = totalCents - pagadoCents;
      const montoCents = toCents(montoNum);

      if (montoCents > saldoCents) {
        const err = new Error(`El monto excede el saldo pendiente (${(saldoCents / 100).toFixed(2)}).`);
        err.status = 400;
        throw err;
      }

      const payment = await tx.payment.create({
        data: {
          saleId,
          companyId,
          monto: montoNum,
          metodo,
          userId,
          nota: nota || null,
        },
      });

      const nuevoEstado = calcularEstadoPago(totalCents, pagadoCents + montoCents);

      const updatedSale = await tx.sale.update({
        where: { id: saleId },
        data: { estadoPago: nuevoEstado },
      });

      return { payment, sale: updatedSale };
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Error al registrar el pago:', error);
    res.status(error.status || 500).json({ error: error.message || 'Error interno al registrar el pago.' });
  }
};

// GET /api/sales/:id/payments
const listarPagos = async (req, res) => {
  const companyId = req.companyId;
  const saleId = parseInt(req.params.id, 10);

  if (!Number.isInteger(saleId)) {
    return res.status(400).json({ error: 'Venta inválida.' });
  }

  try {
    const sale = await prisma.sale.findFirst({ where: { id: saleId, companyId } });
    if (!sale) {
      return res.status(404).json({ error: 'Venta no encontrada o no pertenece a tu compañía.' });
    }

    const payments = await prisma.payment.findMany({
      where: { saleId },
      include: { user: { select: { nombreUsuario: true } } },
      orderBy: { fecha: 'asc' },
    });

    res.json(payments);
  } catch (error) {
    console.error('Error al listar los pagos:', error);
    res.status(500).json({ error: 'Error interno al listar los pagos.' });
  }
};

// PATCH /api/sales/:id/payments/:paymentId/anular
const anularPago = async (req, res) => {
  const companyId = req.companyId;
  const saleId = parseInt(req.params.id, 10);
  const paymentId = parseInt(req.params.paymentId, 10);
  const { motivo } = req.body;

  if (!Number.isInteger(saleId) || !Number.isInteger(paymentId)) {
    return res.status(400).json({ error: 'Venta o pago inválido.' });
  }

  if (!motivo || !motivo.trim()) {
    return res.status(400).json({ error: 'El motivo de anulación es obligatorio.' });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findFirst({
        where: { id: saleId, companyId },
        include: { payments: true },
      });

      if (!sale) {
        const err = new Error('Venta no encontrada o no pertenece a tu compañía.');
        err.status = 404;
        throw err;
      }

      const payment = sale.payments.find((p) => p.id === paymentId);
      if (!payment) {
        const err = new Error('Pago no encontrado en esta venta.');
        err.status = 404;
        throw err;
      }
      if (payment.anulado) {
        const err = new Error('Este pago ya estaba anulado.');
        err.status = 400;
        throw err;
      }

      const updatedPayment = await tx.payment.update({
        where: { id: paymentId },
        data: { anulado: true, motivoAnulacion: motivo.trim() },
      });

      const totalCents = toCents(sale.total);
      const pagadoCents = sumaPagosActivos(sale.payments.filter((p) => !p.anulado && p.id !== paymentId));
      const nuevoEstado = calcularEstadoPago(totalCents, pagadoCents);

      const updatedSale = await tx.sale.update({
        where: { id: saleId },
        data: { estadoPago: nuevoEstado },
      });

      return { payment: updatedPayment, sale: updatedSale };
    });

    res.json(result);
  } catch (error) {
    console.error('Error al anular el pago:', error);
    res.status(error.status || 500).json({ error: error.message || 'Error interno al anular el pago.' });
  }
};

module.exports = {
  registrarPago,
  listarPagos,
  anularPago,
  METODOS_VALIDOS,
};
