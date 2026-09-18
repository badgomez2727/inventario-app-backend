const request = require('supertest');
const app = require('../src/app');
const { prisma, createCompany, createUser, createProduct, createClient, signToken } = require('./helpers/factory');

describe('Cliente obligatorio en ventas a crédito (POST /api/sales)', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('una venta PENDIENTE sin cliente se rechaza con un mensaje claro', async () => {
    const company = await createCompany();
    const user = await createUser(company.id, 'admin_compania');
    const product = await createProduct(company.id, { stockActual: 10 });
    const token = signToken(user);

    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ productId: product.id, cantidad: 1 }],
        total: Number(product.precioVenta),
        estadoPago: 'PENDIENTE',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cliente/i);

    const ventasCreadas = await prisma.sale.count({ where: { companyId: company.id } });
    expect(ventasCreadas).toBe(0);
  });

  test('una venta PARCIAL sin cliente se rechaza', async () => {
    const company = await createCompany();
    const user = await createUser(company.id, 'admin_compania');
    const product = await createProduct(company.id, { stockActual: 10 });
    const token = signToken(user);

    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ productId: product.id, cantidad: 1 }],
        total: Number(product.precioVenta),
        estadoPago: 'PARCIAL',
      });

    expect(res.status).toBe(400);
  });

  test('una venta PAGADA sigue permitiendo cliente opcional', async () => {
    const company = await createCompany();
    const user = await createUser(company.id, 'admin_compania');
    const product = await createProduct(company.id, { stockActual: 10 });
    const token = signToken(user);

    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ productId: product.id, cantidad: 1 }],
        total: Number(product.precioVenta),
        estadoPago: 'PAGADA',
      });

    expect(res.status).toBe(201);
    expect(res.body.sale.clientId).toBeNull();
  });

  test('una venta PENDIENTE con clientId existente se acepta', async () => {
    const company = await createCompany();
    const user = await createUser(company.id, 'admin_compania');
    const product = await createProduct(company.id, { stockActual: 10 });
    const client = await createClient(company.id);
    const token = signToken(user);

    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ productId: product.id, cantidad: 1 }],
        total: Number(product.precioVenta),
        estadoPago: 'PENDIENTE',
        clientId: client.id,
      });

    expect(res.status).toBe(201);
    expect(res.body.sale.clientId).toBe(client.id);
  });

  test('clienteNuevo crea un cliente nuevo y lo asocia a la venta', async () => {
    const company = await createCompany();
    const user = await createUser(company.id, 'admin_compania');
    const product = await createProduct(company.id, { stockActual: 10 });
    const token = signToken(user);

    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ productId: product.id, cantidad: 1 }],
        total: Number(product.precioVenta),
        estadoPago: 'PENDIENTE',
        clienteNuevo: { nombre: 'Cliente Nuevo Desde Venta', telefono: '3001234567' },
      });

    expect(res.status).toBe(201);
    expect(res.body.cliente).toBeDefined();
    expect(res.body.cliente.telefono).toBe('+573001234567');
    expect(res.body.clienteReutilizado).toBe(false);
    expect(res.body.sale.clientId).toBe(res.body.cliente.id);

    const clienteEnBD = await prisma.client.findUnique({ where: { id: res.body.cliente.id } });
    expect(clienteEnBD.companyId).toBe(company.id);
    expect(clienteEnBD.nombre).toBe('Cliente Nuevo Desde Venta');
  });

  test('una segunda venta con el mismo celular reutiliza el cliente en vez de duplicarlo', async () => {
    const company = await createCompany();
    const user = await createUser(company.id, 'admin_compania');
    const product = await createProduct(company.id, { stockActual: 10 });
    const token = signToken(user);

    const primeraVenta = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ productId: product.id, cantidad: 1 }],
        total: Number(product.precioVenta),
        estadoPago: 'PENDIENTE',
        clienteNuevo: { nombre: 'Ana Pérez', telefono: '300 111 2222' },
      });
    expect(primeraVenta.status).toBe(201);

    const segundaVenta = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ productId: product.id, cantidad: 1 }],
        total: Number(product.precioVenta),
        estadoPago: 'PENDIENTE',
        // Mismo número, formato distinto (con +57 y guiones) — debe normalizar igual.
        clienteNuevo: { nombre: 'Ana Pérez (otra vez)', telefono: '+57-300-111-2222' },
      });

    expect(segundaVenta.status).toBe(201);
    expect(segundaVenta.body.clienteReutilizado).toBe(true);
    expect(segundaVenta.body.cliente.id).toBe(primeraVenta.body.cliente.id);

    const totalClientes = await prisma.client.count({ where: { companyId: company.id } });
    expect(totalClientes).toBe(1); // no se duplicó
  });

  test('un celular inválido en clienteNuevo se rechaza con mensaje claro', async () => {
    const company = await createCompany();
    const user = await createUser(company.id, 'admin_compania');
    const product = await createProduct(company.id, { stockActual: 10 });
    const token = signToken(user);

    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ productId: product.id, cantidad: 1 }],
        total: Number(product.precioVenta),
        estadoPago: 'PENDIENTE',
        clienteNuevo: { nombre: 'Cliente Sin Celular Válido', telefono: '123' },
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/celular/i);
  });
});

describe('PATCH /api/sales/:id/cliente (asignar cliente a una venta existente)', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('asigna un cliente existente a una venta que no tenía', async () => {
    const company = await createCompany();
    const user = await createUser(company.id, 'admin_compania');
    const sale = await prisma.sale.create({
      data: { companyId: company.id, userId: user.id, total: 5000, estado: 'Completada', estadoPago: 'PENDIENTE' },
    });
    const client = await createClient(company.id);
    const token = signToken(user);

    const res = await request(app)
      .patch(`/api/sales/${sale.id}/cliente`)
      .set('Authorization', `Bearer ${token}`)
      .send({ clientId: client.id });

    expect(res.status).toBe(200);
    expect(res.body.sale.clientId).toBe(client.id);
  });

  test('asigna un cliente nuevo (por celular) a una venta existente', async () => {
    const company = await createCompany();
    const user = await createUser(company.id, 'admin_compania');
    const sale = await prisma.sale.create({
      data: { companyId: company.id, userId: user.id, total: 5000, estado: 'Completada', estadoPago: 'PARCIAL' },
    });
    const token = signToken(user);

    const res = await request(app)
      .patch(`/api/sales/${sale.id}/cliente`)
      .set('Authorization', `Bearer ${token}`)
      .send({ clienteNuevo: { nombre: 'Cliente Asignado Después', telefono: '3009998888' } });

    expect(res.status).toBe(200);
    expect(res.body.cliente.telefono).toBe('+573009998888');
    expect(res.body.sale.clientId).toBe(res.body.cliente.id);
  });

  test('no se puede asignar cliente a una venta de otra compañía', async () => {
    const companyA = await createCompany();
    const companyB = await createCompany();
    const adminA = await createUser(companyA.id, 'admin_compania');
    const userB = await createUser(companyB.id, 'admin_compania');
    const ventaDeB = await prisma.sale.create({
      data: { companyId: companyB.id, userId: userB.id, total: 5000, estado: 'Completada', estadoPago: 'PENDIENTE' },
    });
    const clientB = await createClient(companyB.id);
    const tokenA = signToken(adminA);

    const res = await request(app)
      .patch(`/api/sales/${ventaDeB.id}/cliente`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ clientId: clientB.id });

    expect(res.status).toBe(404);
  });

  test('no se puede asignar cliente a una venta anulada', async () => {
    const company = await createCompany();
    const user = await createUser(company.id, 'admin_compania');
    const sale = await prisma.sale.create({
      data: { companyId: company.id, userId: user.id, total: 5000, estado: 'ANULADA', estadoPago: 'PENDIENTE' },
    });
    const client = await createClient(company.id);
    const token = signToken(user);

    const res = await request(app)
      .patch(`/api/sales/${sale.id}/cliente`)
      .set('Authorization', `Bearer ${token}`)
      .send({ clientId: client.id });

    expect(res.status).toBe(400);
  });
});
