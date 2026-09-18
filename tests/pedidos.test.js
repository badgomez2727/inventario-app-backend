const request = require('supertest');
const app = require('../src/app');
const { prisma, createCompany, createUser, createProduct, signToken } = require('./helpers/factory');

// Crea un pedido real vía el flujo público (catálogo activo + POST pedido),
// igual que haría un cliente de verdad.
async function crearPedidoReal(company, admin, product, overrides = {}) {
  const token = signToken(admin);
  const slug = `pedido-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await request(app)
    .patch('/api/mi-compania')
    .set('Authorization', `Bearer ${token}`)
    .send({ slug, whatsappVentas: ['3001234567'], catalogoPublicoActivo: true });

  const res = await request(app)
    .post(`/public/catalogo/${slug}/pedido`)
    .send({
      items: [{ productId: product.id, cantidad: 2 }],
      cliente: { nombre: 'Cliente Pedido Test', telefono: '3009991111' },
      tipoEntrega: 'RECOGE',
      ...overrides,
    });
  return res.body.pedidoId;
}

describe('GET /api/pedidos', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('lista los pedidos de la propia compañía, más reciente primero', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const product = await createProduct(company.id, { precioVenta: 5000, stockActual: 20, visibleEnCatalogo: true });
    await crearPedidoReal(company, admin, product);
    await crearPedidoReal(company, admin, product);
    const token = signToken(admin);

    const res = await request(app)
      .get('/api/pedidos')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.pedidos).toHaveLength(2);
    expect(res.body.pedidos[0].client.nombre).toBe('Cliente Pedido Test');
    expect(res.body.pedidos[0].items[0].product.nombre).toBe(product.nombre);
  });

  test('filtra por estado', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const product = await createProduct(company.id, { precioVenta: 5000, stockActual: 20, visibleEnCatalogo: true });
    const pedidoId = await crearPedidoReal(company, admin, product);
    const token = signToken(admin);

    await request(app)
      .patch(`/api/pedidos/${pedidoId}/rechazar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ motivo: 'Ya no hay stock real' });

    const pendientes = await request(app)
      .get('/api/pedidos?estado=PENDIENTE_REVISION')
      .set('Authorization', `Bearer ${token}`);
    const rechazados = await request(app)
      .get('/api/pedidos?estado=RECHAZADO')
      .set('Authorization', `Bearer ${token}`);

    expect(pendientes.body.pedidos).toHaveLength(0);
    expect(rechazados.body.pedidos).toHaveLength(1);
  });

  test('no muestra pedidos de otra compañía', async () => {
    const companyA = await createCompany();
    const companyB = await createCompany();
    const adminA = await createUser(companyA.id, 'admin_compania');
    const adminB = await createUser(companyB.id, 'admin_compania');
    const productB = await createProduct(companyB.id, { precioVenta: 5000, stockActual: 20, visibleEnCatalogo: true });
    await crearPedidoReal(companyB, adminB, productB);
    const tokenA = signToken(adminA);

    const res = await request(app)
      .get('/api/pedidos')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.body.pedidos).toHaveLength(0);
  });
});

describe('PATCH /api/pedidos/:id/confirmar', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('confirma un pedido: crea la venta PENDIENTE, descuenta stock y aparece en la cartera', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const product = await createProduct(company.id, { precioVenta: 5000, stockActual: 20, visibleEnCatalogo: true });
    const pedidoId = await crearPedidoReal(company, admin, product); // 2 unidades
    const token = signToken(admin);

    const res = await request(app)
      .patch(`/api/pedidos/${pedidoId}/confirmar`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.sale.estadoPago).toBe('PENDIENTE');
    expect(Number(res.body.sale.total)).toBe(10000);
    expect(res.body.pedido.estado).toBe('CONFIRMADO');
    expect(res.body.pedido.saleId).toBe(res.body.sale.id);

    const productoActualizado = await prisma.product.findUnique({ where: { id: product.id } });
    expect(productoActualizado.stockActual).toBe(18); // 20 - 2

    const saleItems = await prisma.saleItem.findMany({ where: { saleId: res.body.sale.id } });
    expect(saleItems).toHaveLength(1);
    expect(saleItems[0].cantidad).toBe(2);

    const movimiento = await prisma.stockMovement.findFirst({ where: { productId: product.id, tipo: 'salida' } });
    expect(movimiento).not.toBeNull();

    // Reutiliza la cartera del Bloque B: la venta PENDIENTE con cliente debe aparecer.
    const cartera = await request(app)
      .get('/api/clientes/cartera')
      .set('Authorization', `Bearer ${token}`);
    const entradaCliente = cartera.body.find((c) => c.totalAdeudado === 10000);
    expect(entradaCliente).toBeDefined();
  });

  test('confirmar un pedido ya confirmado se rechaza', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const product = await createProduct(company.id, { precioVenta: 5000, stockActual: 20, visibleEnCatalogo: true });
    const pedidoId = await crearPedidoReal(company, admin, product);
    const token = signToken(admin);

    await request(app).patch(`/api/pedidos/${pedidoId}/confirmar`).set('Authorization', `Bearer ${token}`);
    const segundaVez = await request(app).patch(`/api/pedidos/${pedidoId}/confirmar`).set('Authorization', `Bearer ${token}`);

    expect(segundaVez.status).toBe(400);

    const ventasCreadas = await prisma.sale.count({ where: { companyId: company.id } });
    expect(ventasCreadas).toBe(1); // no se duplicó
  });

  test('no se puede confirmar un pedido de otra compañía', async () => {
    const companyA = await createCompany();
    const companyB = await createCompany();
    const adminA = await createUser(companyA.id, 'admin_compania');
    const adminB = await createUser(companyB.id, 'admin_compania');
    const productB = await createProduct(companyB.id, { precioVenta: 5000, stockActual: 20, visibleEnCatalogo: true });
    const pedidoId = await crearPedidoReal(companyB, adminB, productB);
    const tokenA = signToken(adminA);

    const res = await request(app)
      .patch(`/api/pedidos/${pedidoId}/confirmar`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
  });

  test('si el stock bajó desde que se hizo el pedido, confirmar se rechaza y el pedido sigue pendiente', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const product = await createProduct(company.id, { precioVenta: 5000, stockActual: 20, visibleEnCatalogo: true });
    const pedidoId = await crearPedidoReal(company, admin, product); // pide 2

    // El stock cae por debajo de lo pedido antes de que alguien confirme.
    await prisma.product.update({ where: { id: product.id }, data: { stockActual: 1 } });

    const token = signToken(admin);
    const res = await request(app)
      .patch(`/api/pedidos/${pedidoId}/confirmar`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/stock/i);

    const pedidoEnBD = await prisma.pedido.findUnique({ where: { id: pedidoId } });
    expect(pedidoEnBD.estado).toBe('PENDIENTE_REVISION');
    expect(pedidoEnBD.saleId).toBeNull();

    const ventasCreadas = await prisma.sale.count({ where: { companyId: company.id } });
    expect(ventasCreadas).toBe(0);
  });

  test('un empleado (no solo admin) puede confirmar pedidos', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const empleado = await createUser(company.id, 'empleado_inventario');
    const product = await createProduct(company.id, { precioVenta: 5000, stockActual: 20, visibleEnCatalogo: true });
    const pedidoId = await crearPedidoReal(company, admin, product);
    const tokenEmpleado = signToken(empleado);

    const res = await request(app)
      .patch(`/api/pedidos/${pedidoId}/confirmar`)
      .set('Authorization', `Bearer ${tokenEmpleado}`);

    expect(res.status).toBe(200);
  });
});

describe('PATCH /api/pedidos/:id/rechazar', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('rechaza un pedido con motivo, sin tocar stock ni crear venta', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const product = await createProduct(company.id, { precioVenta: 5000, stockActual: 20, visibleEnCatalogo: true });
    const pedidoId = await crearPedidoReal(company, admin, product);
    const token = signToken(admin);

    const res = await request(app)
      .patch(`/api/pedidos/${pedidoId}/rechazar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ motivo: 'Producto descontinuado' });

    expect(res.status).toBe(200);
    expect(res.body.pedido.estado).toBe('RECHAZADO');
    expect(res.body.pedido.motivoRechazo).toBe('Producto descontinuado');

    const productoSinCambios = await prisma.product.findUnique({ where: { id: product.id } });
    expect(productoSinCambios.stockActual).toBe(20);

    const ventasCreadas = await prisma.sale.count({ where: { companyId: company.id } });
    expect(ventasCreadas).toBe(0);
  });

  test('rechazar sin motivo se rechaza', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const product = await createProduct(company.id, { precioVenta: 5000, stockActual: 20, visibleEnCatalogo: true });
    const pedidoId = await crearPedidoReal(company, admin, product);
    const token = signToken(admin);

    const res = await request(app)
      .patch(`/api/pedidos/${pedidoId}/rechazar`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
  });

  test('rechazar un pedido ya confirmado se rechaza', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const product = await createProduct(company.id, { precioVenta: 5000, stockActual: 20, visibleEnCatalogo: true });
    const pedidoId = await crearPedidoReal(company, admin, product);
    const token = signToken(admin);

    await request(app).patch(`/api/pedidos/${pedidoId}/confirmar`).set('Authorization', `Bearer ${token}`);
    const res = await request(app)
      .patch(`/api/pedidos/${pedidoId}/rechazar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ motivo: 'Ya no aplica' });

    expect(res.status).toBe(400);
  });
});
