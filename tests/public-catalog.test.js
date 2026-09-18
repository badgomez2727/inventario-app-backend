const request = require('supertest');
const app = require('../src/app');
const { prisma, createCompany, createUser, createProduct, signToken } = require('./helpers/factory');

// Activa el catálogo de una compañía de prueba con los mínimos necesarios
// (slug + whatsapp), vía la propia API de configuración — así el test
// también sirve de cable a tierra entre company-settings y el catálogo.
async function activarCatalogo(token, overrides = {}) {
  const slug = `catalogo-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const res = await request(app)
    .patch('/api/mi-compania')
    .set('Authorization', `Bearer ${token}`)
    .send({ slug, whatsappVentas: ['3001234567'], catalogoPublicoActivo: true, ...overrides });
  return res.body.slug;
}

describe('GET /public/catalogo/:slug', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('un slug inexistente responde 404 genérico', async () => {
    const res = await request(app).get('/public/catalogo/no-existe-esto-nunca');
    expect(res.status).toBe(404);
  });

  test('una compañía con el catálogo desactivado responde 404 (aunque el slug exista)', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const token = signToken(admin);
    const slug = `slug-inactivo-${Date.now()}`;

    await request(app)
      .patch('/api/mi-compania')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug }); // configurado pero nunca activado

    const res = await request(app).get(`/public/catalogo/${slug}`);
    expect(res.status).toBe(404);
  });

  test('devuelve solo productos activos y visibles en catálogo, sin datos sensibles', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const token = signToken(admin);

    const visible = await createProduct(company.id, {
      nombre: 'Producto Visible',
      precioCompra: 1000,
      precioVenta: 2500,
      stockActual: 5,
      visibleEnCatalogo: true,
    });
    await createProduct(company.id, { nombre: 'Producto Oculto', visibleEnCatalogo: false });
    const agotado = await createProduct(company.id, {
      nombre: 'Producto Agotado',
      stockActual: 0,
      visibleEnCatalogo: true,
    });
    await prisma.productImage.create({
      data: { productId: visible.id, url: 'https://res.cloudinary.com/demo/foto.jpg', publicId: 'x', orden: 0 },
    });

    const slug = await activarCatalogo(token);
    const res = await request(app).get(`/public/catalogo/${slug}`);

    expect(res.status).toBe(200);
    expect(res.body.products).toHaveLength(2); // visible + agotado, no el oculto

    const productoVisible = res.body.products.find((p) => p.id === visible.id);
    expect(productoVisible.disponible).toBe(true);
    expect(productoVisible.imagenes).toEqual(['https://res.cloudinary.com/demo/foto.jpg']);
    expect(productoVisible.precioCompra).toBeUndefined(); // nunca se expone
    expect(productoVisible.stockActual).toBeUndefined(); // nunca el stock exacto

    const productoAgotado = res.body.products.find((p) => p.id === agotado.id);
    expect(productoAgotado.disponible).toBe(false);

    expect(res.body.products.find((p) => p.nombre === 'Producto Oculto')).toBeUndefined();
  });

  test('un producto inactivo no aparece aunque esté marcado visible en catálogo', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const token = signToken(admin);

    await createProduct(company.id, { nombre: 'Inactivo pero visible', visibleEnCatalogo: true, activo: false });

    const slug = await activarCatalogo(token);
    const res = await request(app).get(`/public/catalogo/${slug}`);

    expect(res.status).toBe(200);
    expect(res.body.products).toHaveLength(0);
  });

  test('incluye los datos de la compañía necesarios para el checkout (whatsapp, domicilio)', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const token = signToken(admin);

    await request(app)
      .patch('/api/mi-compania')
      .set('Authorization', `Bearer ${token}`)
      .send({ ofreceDomicilio: true, valorDomicilioDefault: 4000, descripcionCatalogo: 'Tienda de prueba' });
    const slug = await activarCatalogo(token);

    const res = await request(app).get(`/public/catalogo/${slug}`);

    expect(res.status).toBe(200);
    expect(res.body.company.whatsappVentas).toEqual(['+573001234567']);
    expect(res.body.company.ofreceDomicilio).toBe(true);
    expect(Number(res.body.company.valorDomicilioDefault)).toBe(4000);
    expect(res.body.company.descripcionCatalogo).toBe('Tienda de prueba');
  });

  test('una compañía desactivada (activo=false) no expone su catálogo aunque catalogoPublicoActivo sea true', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const token = signToken(admin);
    const slug = await activarCatalogo(token);

    await prisma.company.update({ where: { id: company.id }, data: { activo: false } });

    const res = await request(app).get(`/public/catalogo/${slug}`);
    expect(res.status).toBe(404);
  });
});

describe('POST /public/catalogo/:slug/pedido', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('crea un pedido RECOGE válido, con su cliente y link de WhatsApp', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const token = signToken(admin);
    const product = await createProduct(company.id, {
      nombre: 'Gaseosa 1.5L', precioVenta: 5000, stockActual: 10, visibleEnCatalogo: true,
    });
    const slug = await activarCatalogo(token);

    const res = await request(app)
      .post(`/public/catalogo/${slug}/pedido`)
      .send({
        items: [{ productId: product.id, cantidad: 2 }],
        cliente: { nombre: 'Juan Pérez', telefono: '3009998877' },
        tipoEntrega: 'RECOGE',
      });

    expect(res.status).toBe(201);
    expect(Number(res.body.total)).toBe(10000);
    expect(res.body.whatsappUrl).toContain('https://wa.me/573001234567');
    expect(res.body.whatsappUrl).toContain(encodeURIComponent('Gaseosa 1.5L'));

    const pedidoEnBD = await prisma.pedido.findUnique({
      where: { id: res.body.pedidoId },
      include: { items: true, client: true },
    });
    expect(pedidoEnBD.estado).toBe('PENDIENTE_REVISION');
    expect(pedidoEnBD.tipoEntrega).toBe('RECOGE');
    expect(pedidoEnBD.items).toHaveLength(1);
    expect(Number(pedidoEnBD.items[0].precioUnitario)).toBe(5000);
    expect(pedidoEnBD.client.telefono).toBe('+573009998877');

    // No toca stock — eso pasa solo al confirmar (siguiente parte).
    const productoSinCambios = await prisma.product.findUnique({ where: { id: product.id } });
    expect(productoSinCambios.stockActual).toBe(10);
  });

  test('crea un pedido a DOMICILIO, sumando el valor del domicilio al total', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const token = signToken(admin);
    await request(app)
      .patch('/api/mi-compania')
      .set('Authorization', `Bearer ${token}`)
      .send({ ofreceDomicilio: true, valorDomicilioDefault: 3000 });
    const product = await createProduct(company.id, { precioVenta: 10000, stockActual: 5, visibleEnCatalogo: true });
    const slug = await activarCatalogo(token);

    const res = await request(app)
      .post(`/public/catalogo/${slug}/pedido`)
      .send({
        items: [{ productId: product.id, cantidad: 1 }],
        cliente: { nombre: 'Ana López', telefono: '3011112233' },
        tipoEntrega: 'DOMICILIO',
        direccionEntrega: 'Calle 123 #45-67',
      });

    expect(res.status).toBe(201);
    expect(Number(res.body.total)).toBe(13000); // 10000 + 3000 de domicilio

    const pedidoEnBD = await prisma.pedido.findUnique({ where: { id: res.body.pedidoId } });
    expect(pedidoEnBD.direccionEntrega).toBe('Calle 123 #45-67');
    expect(Number(pedidoEnBD.valorDomicilio)).toBe(3000);
  });

  test('domicilio sin dirección se rechaza', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const token = signToken(admin);
    await request(app)
      .patch('/api/mi-compania')
      .set('Authorization', `Bearer ${token}`)
      .send({ ofreceDomicilio: true });
    const product = await createProduct(company.id, { visibleEnCatalogo: true, stockActual: 5 });
    const slug = await activarCatalogo(token);

    const res = await request(app)
      .post(`/public/catalogo/${slug}/pedido`)
      .send({
        items: [{ productId: product.id, cantidad: 1 }],
        cliente: { nombre: 'Sin Dirección', telefono: '3021234567' },
        tipoEntrega: 'DOMICILIO',
      });

    expect(res.status).toBe(400);
  });

  test('domicilio se rechaza si la tienda no lo ofrece', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const token = signToken(admin);
    const product = await createProduct(company.id, { visibleEnCatalogo: true, stockActual: 5 });
    const slug = await activarCatalogo(token); // ofreceDomicilio queda en false por defecto

    const res = await request(app)
      .post(`/public/catalogo/${slug}/pedido`)
      .send({
        items: [{ productId: product.id, cantidad: 1 }],
        cliente: { nombre: 'Cliente', telefono: '3031234567' },
        tipoEntrega: 'DOMICILIO',
        direccionEntrega: 'Calle falsa 123',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no ofrece domicilio/i);
  });

  test('un producto oculto o inactivo en el pedido se rechaza (no se confía en lo que manda el visitante)', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const token = signToken(admin);
    const productoOculto = await createProduct(company.id, { visibleEnCatalogo: false, stockActual: 5 });
    const slug = await activarCatalogo(token);

    const res = await request(app)
      .post(`/public/catalogo/${slug}/pedido`)
      .send({
        items: [{ productId: productoOculto.id, cantidad: 1 }],
        cliente: { nombre: 'Cliente', telefono: '3041234567' },
        tipoEntrega: 'RECOGE',
      });

    expect(res.status).toBe(400);

    const pedidosCreados = await prisma.pedido.count({ where: { companyId: company.id } });
    expect(pedidosCreados).toBe(0);
  });

  test('pedir más cantidad de la disponible se rechaza', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const token = signToken(admin);
    const product = await createProduct(company.id, { visibleEnCatalogo: true, stockActual: 2 });
    const slug = await activarCatalogo(token);

    const res = await request(app)
      .post(`/public/catalogo/${slug}/pedido`)
      .send({
        items: [{ productId: product.id, cantidad: 5 }],
        cliente: { nombre: 'Cliente', telefono: '3051234567' },
        tipoEntrega: 'RECOGE',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/stock/i);
  });

  test('un pedido sin nombre o celular del cliente se rechaza', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const token = signToken(admin);
    const product = await createProduct(company.id, { visibleEnCatalogo: true, stockActual: 5 });
    const slug = await activarCatalogo(token);

    const res = await request(app)
      .post(`/public/catalogo/${slug}/pedido`)
      .send({
        items: [{ productId: product.id, cantidad: 1 }],
        cliente: { nombre: '', telefono: '' },
        tipoEntrega: 'RECOGE',
      });

    expect(res.status).toBe(400);
  });

  test('dos pedidos con el mismo celular reutilizan el mismo cliente', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const token = signToken(admin);
    const product = await createProduct(company.id, { visibleEnCatalogo: true, stockActual: 10 });
    const slug = await activarCatalogo(token);

    const primero = await request(app)
      .post(`/public/catalogo/${slug}/pedido`)
      .send({
        items: [{ productId: product.id, cantidad: 1 }],
        cliente: { nombre: 'Cliente Repetido', telefono: '3061112233' },
        tipoEntrega: 'RECOGE',
      });
    const segundo = await request(app)
      .post(`/public/catalogo/${slug}/pedido`)
      .send({
        items: [{ productId: product.id, cantidad: 1 }],
        cliente: { nombre: 'Cliente Repetido Otra Vez', telefono: '306-111-2233' },
        tipoEntrega: 'RECOGE',
      });

    expect(primero.status).toBe(201);
    expect(segundo.status).toBe(201);

    const pedido1 = await prisma.pedido.findUnique({ where: { id: primero.body.pedidoId } });
    const pedido2 = await prisma.pedido.findUnique({ where: { id: segundo.body.pedidoId } });
    expect(pedido1.clientId).toBe(pedido2.clientId);

    const totalClientes = await prisma.client.count({ where: { companyId: company.id } });
    expect(totalClientes).toBe(1);
  });

  test('un catálogo inexistente o desactivado no crea ningún pedido', async () => {
    const res = await request(app)
      .post('/public/catalogo/no-existe-esto-nunca/pedido')
      .send({
        items: [{ productId: 1, cantidad: 1 }],
        cliente: { nombre: 'Cliente', telefono: '3071234567' },
        tipoEntrega: 'RECOGE',
      });

    expect(res.status).toBe(404);
  });
});
