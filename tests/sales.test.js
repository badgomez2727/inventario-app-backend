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
    expect(statuses).toEqual([201, 500]); // una se completa (201), la otra revienta la transacción (500) con "stock insuficiente"

    const productoFinal = await prisma.product.findUnique({ where: { id: product.id } });
    expect(productoFinal.stockActual).toBe(0); // nunca negativo

    const ventasCompletadas = await prisma.sale.count({ where: { companyId: company.id } });
    expect(ventasCompletadas).toBe(1); // solo una venta quedó registrada
  });
});
