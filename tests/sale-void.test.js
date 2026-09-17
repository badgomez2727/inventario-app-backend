const request = require('supertest');
const app = require('../src/app');
const { prisma, createCompany, createUser, createProduct, signToken } = require('./helpers/factory');

// Crea una venta real (vía POST /api/sales) para tener saleItems y un
// StockMovement de salida, igual que en producción — anular exige que el
// stock efectivamente vuelva a subir.
async function crearVentaConItem(app, token, product, cantidad = 2) {
  const res = await request(app)
    .post('/api/sales')
    .set('Authorization', `Bearer ${token}`)
    .send({
      items: [{ productId: product.id, cantidad }],
      total: cantidad * Number(product.precioVenta),
      estadoPago: 'PENDIENTE',
    });
  return res.body.sale;
}

describe('PATCH /api/sales/:id/anular', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('un admin anula una venta: devuelve el stock y registra motivo/fecha/usuario', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const product = await createProduct(company.id, { stockActual: 10 });
    const token = signToken(admin);

    const sale = await crearVentaConItem(app, token, product, 3);
    const productoTrasVenta = await prisma.product.findUnique({ where: { id: product.id } });
    expect(productoTrasVenta.stockActual).toBe(7);

    const res = await request(app)
      .patch(`/api/sales/${sale.id}/anular`)
      .set('Authorization', `Bearer ${token}`)
      .send({ motivo: 'Cliente se arrepintió' });

    expect(res.status).toBe(200);
    expect(res.body.sale.estado).toBe('ANULADA');
    expect(res.body.sale.motivoAnulacion).toBe('Cliente se arrepintió');
    expect(res.body.sale.anuladoPorUserId).toBe(admin.id);
    expect(res.body.sale.fechaAnulacion).not.toBeNull();

    const productoFinal = await prisma.product.findUnique({ where: { id: product.id } });
    expect(productoFinal.stockActual).toBe(10); // stock devuelto

    const devolucion = await prisma.stockMovement.findFirst({
      where: { productId: product.id, tipo: 'devolucion' },
    });
    expect(devolucion).not.toBeNull();
    expect(devolucion.cantidad).toBe(3);
  });

  test('no se puede anular una venta con pagos activos', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const product = await createProduct(company.id, { stockActual: 5 });
    const token = signToken(admin);

    const sale = await crearVentaConItem(app, token, product, 1);

    await request(app)
      .post(`/api/sales/${sale.id}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ monto: Number(sale.total), metodo: 'EFECTIVO' });

    const res = await request(app)
      .patch(`/api/sales/${sale.id}/anular`)
      .set('Authorization', `Bearer ${token}`)
      .send({ motivo: 'Intento con pago activo' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/pagos activos/i);

    const saleEnBD = await prisma.sale.findUnique({ where: { id: sale.id } });
    expect(saleEnBD.estado).not.toBe('ANULADA');

    const productoSinCambios = await prisma.product.findUnique({ where: { id: product.id } });
    expect(productoSinCambios.stockActual).toBe(4); // el stock no se devolvió
  });

  test('un empleado no puede anular una venta', async () => {
    const company = await createCompany();
    const empleado = await createUser(company.id, 'empleado_inventario');
    const product = await createProduct(company.id, { stockActual: 5 });
    const token = signToken(empleado);

    const sale = await crearVentaConItem(app, token, product, 1);

    const res = await request(app)
      .patch(`/api/sales/${sale.id}/anular`)
      .set('Authorization', `Bearer ${token}`)
      .send({ motivo: 'Intento de empleado' });

    expect(res.status).toBe(403);

    const saleEnBD = await prisma.sale.findUnique({ where: { id: sale.id } });
    expect(saleEnBD.estado).not.toBe('ANULADA');
  });

  test('un admin no puede anular una venta de otra compañía', async () => {
    const companyA = await createCompany();
    const companyB = await createCompany();
    const adminA = await createUser(companyA.id, 'admin_compania');
    const adminB = await createUser(companyB.id, 'admin_compania');
    const productB = await createProduct(companyB.id, { stockActual: 5 });
    const tokenB = signToken(adminB);

    const ventaDeB = await crearVentaConItem(app, tokenB, productB, 1);
    const tokenA = signToken(adminA);

    const res = await request(app)
      .patch(`/api/sales/${ventaDeB.id}/anular`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ motivo: 'Intento entre compañías' });

    expect(res.status).toBe(404);

    const saleEnBD = await prisma.sale.findUnique({ where: { id: ventaDeB.id } });
    expect(saleEnBD.estado).not.toBe('ANULADA');
  });

  test('no se puede anular una venta ya anulada', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const product = await createProduct(company.id, { stockActual: 5 });
    const token = signToken(admin);

    const sale = await crearVentaConItem(app, token, product, 1);

    await request(app)
      .patch(`/api/sales/${sale.id}/anular`)
      .set('Authorization', `Bearer ${token}`)
      .send({ motivo: 'Primera anulación' });

    const segundoIntento = await request(app)
      .patch(`/api/sales/${sale.id}/anular`)
      .set('Authorization', `Bearer ${token}`)
      .send({ motivo: 'Segunda anulación' });

    expect(segundoIntento.status).toBe(400);
    expect(segundoIntento.body.error).toMatch(/ya fue anulada/i);
  });

  test('el motivo es obligatorio', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const product = await createProduct(company.id, { stockActual: 5 });
    const token = signToken(admin);

    const sale = await crearVentaConItem(app, token, product, 1);

    const res = await request(app)
      .patch(`/api/sales/${sale.id}/anular`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
  });

  test('una venta anulada no puede recibir pagos', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const product = await createProduct(company.id, { stockActual: 5 });
    const token = signToken(admin);

    const sale = await crearVentaConItem(app, token, product, 1);

    await request(app)
      .patch(`/api/sales/${sale.id}/anular`)
      .set('Authorization', `Bearer ${token}`)
      .send({ motivo: 'Anulada antes de pagar' });

    const res = await request(app)
      .post(`/api/sales/${sale.id}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ monto: Number(sale.total), metodo: 'EFECTIVO' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/anulada/i);
  });
});

describe('Reportes excluyen las ventas anuladas', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('getMonthlySales no suma el total de una venta anulada', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const product = await createProduct(company.id, { stockActual: 20, precioVenta: 1000 });
    const token = signToken(admin);

    const ventaBuena = await crearVentaConItem(app, token, product, 2); // 2000
    const ventaAAnular = await crearVentaConItem(app, token, product, 5); // 5000

    await request(app)
      .patch(`/api/sales/${ventaAAnular.id}/anular`)
      .set('Authorization', `Bearer ${token}`)
      .send({ motivo: 'No debe contar en reportes' });

    // end = primer día del mes SIGUIENTE (no el último del mes actual), para
    // no arriesgarse a excluir por hora las ventas creadas "ahora mismo".
    const hoy = new Date();
    const start = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);
    const end = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1).toISOString().slice(0, 10);

    const res = await request(app)
      .get(`/api/reports/monthly-sales?startDate=${start}&endDate=${end}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const totalDelMes = res.body.reduce((sum, m) => sum + m.total, 0);
    expect(totalDelMes).toBe(Number(ventaBuena.total)); // solo la venta no anulada
  });

  test('getTopSellingProducts no cuenta las unidades de una venta anulada', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const product = await createProduct(company.id, { stockActual: 20, precioVenta: 1000 });
    const token = signToken(admin);

    const venta = await crearVentaConItem(app, token, product, 4);

    await request(app)
      .patch(`/api/sales/${venta.id}/anular`)
      .set('Authorization', `Bearer ${token}`)
      .send({ motivo: 'Única venta, se anula' });

    const res = await request(app)
      .get('/api/reports/top-selling-products')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const entrada = res.body.find((p) => p.productId === product.id);
    expect(entrada).toBeUndefined();
  });
});
