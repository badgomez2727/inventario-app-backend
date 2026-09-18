const request = require('supertest');
const app = require('../src/app');
const { prisma, createCompany, createUser, createClient, signToken } = require('./helpers/factory');

describe('Normalización de celular en CRUD de clientes', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('crear un cliente normaliza el celular a formato internacional', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const token = signToken(admin);

    const res = await request(app)
      .post('/api/clientes')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Cliente Con Celular', telefono: '310 555 4444' });

    expect(res.status).toBe(201);
    expect(res.body.telefono).toBe('+573105554444');
  });

  test('un celular inválido al crear un cliente se rechaza con mensaje claro', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const token = signToken(admin);

    const res = await request(app)
      .post('/api/clientes')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Cliente Con Celular Inválido', telefono: '555-1234' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/celular/i);
  });

  test('editar un cliente también normaliza el celular', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const client = await createClient(company.id);
    const token = signToken(admin);

    const res = await request(app)
      .put(`/api/clientes/${client.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: client.nombre, telefono: '3201112233' });

    expect(res.status).toBe(200);
    expect(res.body.telefono).toBe('+573201112233');
  });
});

describe('PATCH /api/clientes/:id/activo (activar/desactivar cliente)', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('un admin puede desactivar y reactivar un cliente', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const client = await createClient(company.id);
    const token = signToken(admin);

    const desactivar = await request(app)
      .patch(`/api/clientes/${client.id}/activo`)
      .set('Authorization', `Bearer ${token}`)
      .send({ activo: false });
    expect(desactivar.status).toBe(200);
    expect(desactivar.body.client.activo).toBe(false);

    const reactivar = await request(app)
      .patch(`/api/clientes/${client.id}/activo`)
      .set('Authorization', `Bearer ${token}`)
      .send({ activo: true });
    expect(reactivar.status).toBe(200);
    expect(reactivar.body.client.activo).toBe(true);
  });

  test('no se puede desactivar un cliente de otra compañía', async () => {
    const companyA = await createCompany();
    const companyB = await createCompany();
    const adminA = await createUser(companyA.id, 'admin_compania');
    const clientB = await createClient(companyB.id);
    const token = signToken(adminA);

    const res = await request(app)
      .patch(`/api/clientes/${clientB.id}/activo`)
      .set('Authorization', `Bearer ${token}`)
      .send({ activo: false });

    expect(res.status).toBe(404);
  });
});

describe('GET /api/clientes/cartera', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('calcula el total adeudado, la cantidad de ventas pendientes y la antigüedad', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const client = await createClient(company.id);
    const token = signToken(admin);

    // Venta 1: PENDIENTE, sin pagos, de hace 10 días -> saldo = total completo.
    const haceDiezDias = new Date(Date.now() - 10 * 86400000);
    await prisma.sale.create({
      data: {
        companyId: company.id, userId: admin.id, clientId: client.id,
        total: 10000, estado: 'Completada', estadoPago: 'PENDIENTE', fechaVenta: haceDiezDias,
      },
    });

    // Venta 2: PARCIAL, con un abono de 3000 -> saldo = 2000.
    const ventaParcial = await prisma.sale.create({
      data: {
        companyId: company.id, userId: admin.id, clientId: client.id,
        total: 5000, estado: 'Completada', estadoPago: 'PARCIAL',
      },
    });
    await prisma.payment.create({
      data: { saleId: ventaParcial.id, companyId: company.id, monto: 3000, metodo: 'EFECTIVO', userId: admin.id },
    });

    // Venta 3: PAGADA -> no debe contar en la cartera.
    await prisma.sale.create({
      data: { companyId: company.id, userId: admin.id, clientId: client.id, total: 2000, estado: 'Completada', estadoPago: 'PAGADA' },
    });

    // Venta 4: ANULADA con estadoPago PENDIENTE -> tampoco debe contar.
    await prisma.sale.create({
      data: { companyId: company.id, userId: admin.id, clientId: client.id, total: 9999, estado: 'ANULADA', estadoPago: 'PENDIENTE' },
    });

    const res = await request(app)
      .get('/api/clientes/cartera')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const entrada = res.body.find((c) => c.clienteId === client.id);
    expect(entrada).toBeDefined();
    expect(entrada.totalAdeudado).toBe(10000 + 2000); // 10000 pendiente + 2000 de saldo en la parcial
    expect(entrada.ventasPendientes).toHaveLength(2);

    const ventaAntigua = entrada.ventasPendientes.find((v) => v.total === 10000);
    expect(ventaAntigua.diasAntiguedad).toBeGreaterThanOrEqual(9);
    expect(ventaAntigua.saldo).toBe(10000);

    const ventaParcialEnRespuesta = entrada.ventasPendientes.find((v) => v.total === 5000);
    expect(ventaParcialEnRespuesta.saldo).toBe(2000);
    expect(ventaParcialEnRespuesta.pagado).toBe(3000);
  });

  test('un cliente sin ventas pendientes no aparece en la cartera', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const client = await createClient(company.id);
    const token = signToken(admin);

    await prisma.sale.create({
      data: { companyId: company.id, userId: admin.id, clientId: client.id, total: 5000, estado: 'Completada', estadoPago: 'PAGADA' },
    });

    const res = await request(app)
      .get('/api/clientes/cartera')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const entrada = res.body.find((c) => c.clienteId === client.id);
    expect(entrada).toBeUndefined();
  });

  test('la cartera solo incluye clientes de la compañía del que consulta', async () => {
    const companyA = await createCompany();
    const companyB = await createCompany();
    const adminA = await createUser(companyA.id, 'admin_compania');
    const userB = await createUser(companyB.id, 'admin_compania');
    const clientB = await createClient(companyB.id);
    const tokenA = signToken(adminA);

    await prisma.sale.create({
      data: { companyId: companyB.id, userId: userB.id, clientId: clientB.id, total: 5000, estado: 'Completada', estadoPago: 'PENDIENTE' },
    });

    const res = await request(app)
      .get('/api/clientes/cartera')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.find((c) => c.clienteId === clientB.id)).toBeUndefined();
  });
});
