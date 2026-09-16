const request = require('supertest');
const app = require('../src/app');
const { prisma, createCompany, createUser, createSale, signToken } = require('./helpers/factory');

describe('POST /api/sales/:id/payments', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('abono parcial deja la venta en PARCIAL con el saldo correcto', async () => {
    const company = await createCompany();
    const user = await createUser(company.id, 'admin_compania');
    const sale = await createSale(company.id, user.id, { total: 10000 });
    const token = signToken(user);

    const res = await request(app)
      .post(`/api/sales/${sale.id}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ monto: 4000, metodo: 'EFECTIVO', nota: 'Abono inicial' });

    expect(res.status).toBe(201);
    expect(res.body.sale.estadoPago).toBe('PARCIAL');
    expect(Number(res.body.payment.monto)).toBe(4000);
  });

  test('pago que cubre el total deja la venta en PAGADA', async () => {
    const company = await createCompany();
    const user = await createUser(company.id, 'admin_compania');
    const sale = await createSale(company.id, user.id, { total: 5000 });
    const token = signToken(user);

    const res = await request(app)
      .post(`/api/sales/${sale.id}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ monto: 5000, metodo: 'TRANSFERENCIA' });

    expect(res.status).toBe(201);
    expect(res.body.sale.estadoPago).toBe('PAGADA');
  });

  test('un sobrepago se rechaza y no modifica el estado de la venta', async () => {
    const company = await createCompany();
    const user = await createUser(company.id, 'admin_compania');
    const sale = await createSale(company.id, user.id, { total: 5000 });
    const token = signToken(user);

    // Abono parcial válido primero.
    await request(app)
      .post(`/api/sales/${sale.id}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ monto: 3000, metodo: 'EFECTIVO' });

    // Intento de pago que excede el saldo restante (2000).
    const res = await request(app)
      .post(`/api/sales/${sale.id}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ monto: 3000, metodo: 'EFECTIVO' });

    expect(res.status).toBe(400);

    const saleActualizada = await prisma.sale.findUnique({ where: { id: sale.id } });
    expect(saleActualizada.estadoPago).toBe('PARCIAL');

    const pagos = await prisma.payment.findMany({ where: { saleId: sale.id } });
    expect(pagos).toHaveLength(1); // el sobrepago no se creó
  });

  test('un pago sobre una venta de otra compañía se rechaza', async () => {
    const companyA = await createCompany();
    const companyB = await createCompany();
    const userA = await createUser(companyA.id, 'admin_compania');
    const userB = await createUser(companyB.id, 'admin_compania');
    const saleDeB = await createSale(companyB.id, userB.id, { total: 5000 });
    const tokenDeA = signToken(userA);

    const res = await request(app)
      .post(`/api/sales/${saleDeB.id}/payments`)
      .set('Authorization', `Bearer ${tokenDeA}`)
      .send({ monto: 1000, metodo: 'EFECTIVO' });

    expect(res.status).toBe(404);

    const pagos = await prisma.payment.findMany({ where: { saleId: saleDeB.id } });
    expect(pagos).toHaveLength(0);
  });
});

describe('PATCH /api/sales/:id/payments/:paymentId/anular', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('anular un pago recalcula el estado de la venta y no lo borra', async () => {
    const company = await createCompany();
    const user = await createUser(company.id, 'admin_compania');
    const sale = await createSale(company.id, user.id, { total: 5000 });
    const token = signToken(user);

    const pagoRes = await request(app)
      .post(`/api/sales/${sale.id}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ monto: 5000, metodo: 'EFECTIVO' });

    expect(pagoRes.body.sale.estadoPago).toBe('PAGADA');
    const paymentId = pagoRes.body.payment.id;

    const anularRes = await request(app)
      .patch(`/api/sales/${sale.id}/payments/${paymentId}/anular`)
      .set('Authorization', `Bearer ${token}`)
      .send({ motivo: 'Pago registrado por error' });

    expect(anularRes.status).toBe(200);
    expect(anularRes.body.sale.estadoPago).toBe('PENDIENTE');

    const pagoEnBD = await prisma.payment.findUnique({ where: { id: paymentId } });
    expect(pagoEnBD).not.toBeNull(); // nunca se borra
    expect(pagoEnBD.anulado).toBe(true);
    expect(pagoEnBD.motivoAnulacion).toBe('Pago registrado por error');
  });

  test('anular sin motivo se rechaza', async () => {
    const company = await createCompany();
    const user = await createUser(company.id, 'admin_compania');
    const sale = await createSale(company.id, user.id, { total: 5000 });
    const token = signToken(user);

    const pagoRes = await request(app)
      .post(`/api/sales/${sale.id}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ monto: 5000, metodo: 'EFECTIVO' });

    const res = await request(app)
      .patch(`/api/sales/${sale.id}/payments/${pagoRes.body.payment.id}/anular`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
  });
});
