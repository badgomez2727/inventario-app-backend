const request = require('supertest');
const app = require('../src/app');
const { prisma, createCompany, createUser, createProduct, signToken } = require('./helpers/factory');

describe('POST /api/stock/add (CRÍTICO-2: fuga entre compañías)', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('un usuario de la compañía A no puede registrar entrada de stock sobre un producto de la compañía B', async () => {
    const companyA = await createCompany();
    const companyB = await createCompany();
    const userA = await createUser(companyA.id, 'admin_compania');
    const productB = await createProduct(companyB.id, { stockActual: 5 });
    const tokenA = signToken(userA);

    const res = await request(app)
      .post('/api/stock/add')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ productId: productB.id, cantidad: 100, motivo: 'intento cruzado' });

    expect(res.status).toBe(404);

    const productoActualizado = await prisma.product.findUnique({ where: { id: productB.id } });
    expect(productoActualizado.stockActual).toBe(5); // sin cambios

    const movimientos = await prisma.stockMovement.count({ where: { productId: productB.id } });
    expect(movimientos).toBe(0); // tampoco quedó ningún movimiento fantasma
  });

  test('un usuario SÍ puede registrar entrada de stock sobre un producto de su propia compañía', async () => {
    const company = await createCompany();
    const user = await createUser(company.id, 'admin_compania');
    const product = await createProduct(company.id, { stockActual: 5 });
    const token = signToken(user);

    const res = await request(app)
      .post('/api/stock/add')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: product.id, cantidad: 3, motivo: 'reposición' });

    expect(res.status).toBe(201);

    const productoActualizado = await prisma.product.findUnique({ where: { id: product.id } });
    expect(productoActualizado.stockActual).toBe(8);
  });
});

describe('POST /api/stock/remove (salida de stock sigue funcionando)', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('una salida de stock válida descuenta correctamente', async () => {
    const company = await createCompany();
    const user = await createUser(company.id, 'admin_compania');
    const product = await createProduct(company.id, { stockActual: 10 });
    const token = signToken(user);

    const res = await request(app)
      .post('/api/stock/remove')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: product.id, cantidad: 4, motivo: 'merma' });

    expect(res.status).toBe(201);

    const productoActualizado = await prisma.product.findUnique({ where: { id: product.id } });
    expect(productoActualizado.stockActual).toBe(6);
  });

  test('una salida que supera el stock disponible se rechaza sin descontar', async () => {
    const company = await createCompany();
    const user = await createUser(company.id, 'admin_compania');
    const product = await createProduct(company.id, { stockActual: 2 });
    const token = signToken(user);

    const res = await request(app)
      .post('/api/stock/remove')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: product.id, cantidad: 5, motivo: 'intento inválido' });

    expect(res.status).toBe(400);

    const productoActualizado = await prisma.product.findUnique({ where: { id: product.id } });
    expect(productoActualizado.stockActual).toBe(2);
  });
});
