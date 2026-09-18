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
