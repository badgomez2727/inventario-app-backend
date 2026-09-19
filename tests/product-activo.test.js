const request = require('supertest');
const app = require('../src/app');
const { prisma, createCompany, createUser, createProduct, signToken } = require('./helpers/factory');

const auth = (token) => ({ Authorization: `Bearer ${token}` });

// Venta real vía POST /api/sales (deja saleItems y un StockMovement de salida,
// igual que en producción).
async function venderProducto(token, product, cantidad = 2) {
  return request(app)
    .post('/api/sales')
    .set(auth(token))
    .send({ items: [{ productId: product.id, cantidad }], total: cantidad * Number(product.precioVenta), estadoPago: 'PAGADA' });
}

describe('PATCH /api/productos/:id/activo (desactivar / reactivar)', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('desactiva y reactiva un producto, y deja constancia en su historial', async () => {
    const company = await createCompany();
    const user = await createUser(company.id, 'empleado_inventario');
    const product = await createProduct(company.id);
    const token = signToken(user);

    const off = await request(app).patch(`/api/productos/${product.id}/activo`).set(auth(token)).send({ activo: false });
    expect(off.status).toBe(200);
    expect(off.body.product.activo).toBe(false);

    const on = await request(app).patch(`/api/productos/${product.id}/activo`).set(auth(token)).send({ activo: true });
    expect(on.status).toBe(200);
    expect(on.body.product.activo).toBe(true);

    const log = await prisma.productChangeLog.findMany({ where: { productId: product.id, campo: 'activo' }, orderBy: { id: 'asc' } });
    expect(log.map((l) => [l.valorAnterior, l.valorNuevo])).toEqual([['true', 'false'], ['false', 'true']]);
  });

  test('pedir el mismo estado que ya tiene responde 200 sin duplicar el historial', async () => {
    const company = await createCompany();
    const user = await createUser(company.id, 'admin_compania');
    const product = await createProduct(company.id);
    const token = signToken(user);

    const res = await request(app).patch(`/api/productos/${product.id}/activo`).set(auth(token)).send({ activo: true });
    expect(res.status).toBe(200);
    expect(await prisma.productChangeLog.count({ where: { productId: product.id, campo: 'activo' } })).toBe(0);
  });

  test('rechaza un cuerpo inválido y un id inválido', async () => {
    const company = await createCompany();
    const user = await createUser(company.id, 'admin_compania');
    const product = await createProduct(company.id);
    const token = signToken(user);

    const noBool = await request(app).patch(`/api/productos/${product.id}/activo`).set(auth(token)).send({ activo: 'no' });
    expect(noBool.status).toBe(400);

    const badId = await request(app).patch('/api/productos/abc/activo').set(auth(token)).send({ activo: false });
    expect(badId.status).toBe(400);
  });

  test('no se puede cambiar el estado de un producto de otra compañía', async () => {
    const companyA = await createCompany();
    const companyB = await createCompany();
    const userA = await createUser(companyA.id, 'admin_compania');
    const productB = await createProduct(companyB.id);

    const res = await request(app).patch(`/api/productos/${productB.id}/activo`).set(auth(signToken(userA))).send({ activo: false });
    expect(res.status).toBe(404);
    expect((await prisma.product.findUnique({ where: { id: productB.id } })).activo).toBe(true);
  });
});

describe('GET /api/productos con productos inactivos', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('por defecto no lista los inactivos; con incluirInactivos=true sí, y el conteo coincide', async () => {
    const company = await createCompany();
    const user = await createUser(company.id, 'admin_compania');
    const activo = await createProduct(company.id);
    const inactivo = await createProduct(company.id, { activo: false });
    const token = signToken(user);

    const normal = await request(app).get('/api/productos?limit=100').set(auth(token));
    expect(normal.body.products.map((p) => p.id)).toEqual([activo.id]);
    expect(normal.body.totalCount).toBe(1);

    const todos = await request(app).get('/api/productos?limit=100&incluirInactivos=true').set(auth(token));
    expect(todos.body.products.map((p) => p.id).sort()).toEqual([activo.id, inactivo.id].sort());
    expect(todos.body.totalCount).toBe(2);
  });
});

describe('Un producto inactivo no se puede vender', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('POST /api/sales lo rechaza y no toca el stock', async () => {
    const company = await createCompany();
    const user = await createUser(company.id, 'admin_compania');
    const product = await createProduct(company.id, { stockActual: 10, activo: false });

    const res = await venderProducto(signToken(user), product, 2);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/inactivo/i);
    expect((await prisma.product.findUnique({ where: { id: product.id } })).stockActual).toBe(10);
    expect(await prisma.sale.count({ where: { companyId: company.id } })).toBe(0);
  });

  test('confirmar un pedido del catálogo con un producto ya desactivado se rechaza con un mensaje claro', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const product = await createProduct(company.id, { precioVenta: 5000, stockActual: 20, visibleEnCatalogo: true });
    const token = signToken(admin);

    const slug = `activo-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    await request(app).patch('/api/mi-compania').set(auth(token)).send({ slug, whatsappVentas: ['3001234567'], catalogoPublicoActivo: true });
    const pedido = await request(app)
      .post(`/public/catalogo/${slug}/pedido`)
      .send({ items: [{ productId: product.id, cantidad: 2 }], cliente: { nombre: 'Cliente Activo Test', telefono: '3009991111' }, tipoEntrega: 'RECOGE' });
    expect(pedido.status).toBe(201);

    await request(app).patch(`/api/productos/${product.id}/activo`).set(auth(token)).send({ activo: false });

    const confirmar = await request(app).patch(`/api/pedidos/${pedido.body.pedidoId}/confirmar`).set(auth(token));
    expect(confirmar.status).toBe(400);
    expect(confirmar.body.error).toMatch(/inactivo/i);
    expect((await prisma.product.findUnique({ where: { id: product.id } })).stockActual).toBe(20);
  });
});

describe('Producto con historial: no se borra, pero sí se puede desactivar', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('aunque la venta esté anulada el producto no se puede borrar; desactivarlo sí, y anular sigue devolviendo el stock', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const product = await createProduct(company.id, { stockActual: 10 });
    const token = signToken(admin);

    const venta = await venderProducto(token, product, 3);
    expect(venta.status).toBe(201);
    const saleId = venta.body.sale.id;

    // Se desactiva ANTES de anular: anular debe seguir funcionando.
    const off = await request(app).patch(`/api/productos/${product.id}/activo`).set(auth(token)).send({ activo: false });
    expect(off.status).toBe(200);

    const anular = await request(app).patch(`/api/sales/${saleId}/anular`).set(auth(token)).send({ motivo: 'Prueba de anulación' });
    expect(anular.status).toBe(200);
    expect((await prisma.product.findUnique({ where: { id: product.id } })).stockActual).toBe(10);

    // Con la venta anulada el producto sigue teniendo historial: no se borra.
    const borrar = await request(app).delete(`/api/productos/${product.id}`).set(auth(token));
    expect(borrar.status).toBe(409);
    expect(borrar.body.error).toMatch(/ventas|movimientos/i);
    expect(await prisma.product.findUnique({ where: { id: product.id } })).not.toBeNull();
  });
});

describe('Los productos inactivos no cuentan para el plan ni para los totales', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('un producto desactivado libera un cupo del plan FREE (límite de 50)', async () => {
    const company = await createCompany({ plan: 'FREE' });
    const admin = await createUser(company.id, 'admin_compania');
    const token = signToken(admin);

    await prisma.product.createMany({
      data: Array.from({ length: 50 }, (_, i) => ({
        companyId: company.id,
        nombre: `Producto plan ${i}`,
        sku: `PLAN-${company.id}-${i}`,
        precioCompra: 1000,
        precioVenta: 2000,
        stockActual: 1,
        unidadMedida: 'unidad',
        categoria: 'general',
      })),
    });

    const nuevo = { nombre: 'Producto extra', sku: `EXTRA-${company.id}`, precioCompra: 1000, precioVenta: 2000, stockActual: 1, unidadMedida: 'unidad', categoria: 'general' };

    const bloqueado = await request(app).post('/api/productos').set(auth(token)).send(nuevo);
    expect(bloqueado.status).toBe(403);
    expect(bloqueado.body.code).toBe('PLAN_LIMIT_REACHED');

    const uno = await prisma.product.findFirst({ where: { companyId: company.id } });
    await request(app).patch(`/api/productos/${uno.id}/activo`).set(auth(token)).send({ activo: false });

    const permitido = await request(app).post('/api/productos').set(auth(token)).send(nuevo);
    expect(permitido.status).toBe(201);
  });

  test('el SKU de un producto inactivo sigue ocupado y el error lo explica', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const token = signToken(admin);
    const inactivo = await createProduct(company.id, { activo: false });

    const res = await request(app)
      .post('/api/productos')
      .set(auth(token))
      .send({ nombre: 'Otro', sku: inactivo.sku, precioCompra: 1000, precioVenta: 2000, stockActual: 1, unidadMedida: 'unidad', categoria: 'general' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/inactivo/i);
  });

  test('el valor del inventario y el conteo de productos ignoran los inactivos', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const token = signToken(admin);
    await createProduct(company.id, { precioCompra: 1000, precioVenta: 2000, stockActual: 10 });
    await createProduct(company.id, { precioCompra: 5000, precioVenta: 9000, stockActual: 100, activo: false });

    const valor = await request(app).get('/api/reports/inventory-value').set(auth(token));
    expect(valor.body.valorTotalCosto).toBe(10 * 1000);
    expect(valor.body.valorTotalVenta).toBe(10 * 2000);

    const stats = await request(app).get('/api/reports/general-stats').set(auth(token));
    expect(stats.body.productCount).toBe(1);
  });
});
