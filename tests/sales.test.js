const request = require('supertest');
const app = require('../src/app');
const { prisma, createCompany, createUser, createProduct, signToken } = require('./helpers/factory');

describe('POST /api/sales (venta normal)', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('una venta normal descuenta el stock y guarda el precio en la línea', async () => {
    const company = await createCompany();
    const user = await createUser(company.id, 'admin_compania');
    const product = await createProduct(company.id, { stockActual: 10, precioVenta: 2500 });
    const token = signToken(user);

    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ productId: product.id, cantidad: 3 }],
        total: 7500,
        estadoPago: 'PAGADA',
      });

    expect(res.status).toBe(201);

    const productoActualizado = await prisma.product.findUnique({ where: { id: product.id } });
    expect(productoActualizado.stockActual).toBe(7);

    const saleItem = await prisma.saleItem.findFirst({ where: { saleId: res.body.sale.id } });
    expect(Number(saleItem.precioUnitario)).toBe(2500);
  });
});

describe('POST /api/sales (CRÍTICO-3: condición de carrera en el stock)', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('dos ventas simultáneas del último ítem disponible: una se completa, la otra falla, el stock queda en 0', async () => {
    const company = await createCompany();
    const user = await createUser(company.id, 'admin_compania');
    const product = await createProduct(company.id, { stockActual: 1 });
    const token = signToken(user);

    const hacerVenta = () =>
      request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${token}`)
        .send({
          items: [{ productId: product.id, cantidad: 1 }],
          total: Number(product.precioVenta),
          estadoPago: 'PAGADA',
        });

    // Se disparan a la vez (no una tras otra) para que compitan de verdad
    // por el mismo stock, en vez de quedar serializadas por el test.
    const [resultado1, resultado2] = await Promise.all([hacerVenta(), hacerVenta()]);

    const statuses = [resultado1.status, resultado2.status].sort();
    // Una se completa (201); la otra choca con "stock insuficiente", que
    // ahora responde 400 (antes cualquier error de la transacción caía a
    // 500 genérico — "stock insuficiente" es un error de validación, no un
    // fallo interno del servidor).
    expect(statuses).toEqual([201, 400]);

    const productoFinal = await prisma.product.findUnique({ where: { id: product.id } });
    expect(productoFinal.stockActual).toBe(0); // nunca negativo

    const ventasCompletadas = await prisma.sale.count({ where: { companyId: company.id } });
    expect(ventasCompletadas).toBe(1); // solo una venta quedó registrada
  });
});

describe('GET /api/sales/:id (detalle de una venta puntual)', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('devuelve la venta con sus ítems, cliente y vendedor', async () => {
    const company = await createCompany();
    const user = await createUser(company.id, 'admin_compania');
    const product = await createProduct(company.id, { stockActual: 10 });
    const token = signToken(user);

    const creada = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ productId: product.id, cantidad: 2 }], total: Number(product.precioVenta) * 2, estadoPago: 'PAGADA' });

    const res = await request(app)
      .get(`/api/sales/${creada.body.sale.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(creada.body.sale.id);
    expect(res.body.saleItems).toHaveLength(1);
    expect(res.body.saleItems[0].product.nombre).toBe(product.nombre);
    expect(res.body.user.nombreUsuario).toBe(user.nombreUsuario);
  });

  test('no se puede ver el detalle de una venta de otra compañía', async () => {
    const companyA = await createCompany();
    const companyB = await createCompany();
    const adminA = await createUser(companyA.id, 'admin_compania');
    const userB = await createUser(companyB.id, 'admin_compania');
    const ventaDeB = await prisma.sale.create({
      data: { companyId: companyB.id, userId: userB.id, total: 5000, estado: 'Completada', estadoPago: 'PAGADA' },
    });
    const tokenA = signToken(adminA);

    const res = await request(app)
      .get(`/api/sales/${ventaDeB.id}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
  });

  test('un id que no existe responde 404, no un error de servidor', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const token = signToken(admin);

    const res = await request(app)
      .get('/api/sales/999999999')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});
