const request = require('supertest');
const app = require('../src/app');
const { prisma, createCompany, createUser, createProduct, signToken } = require('./helpers/factory');

// Estos tests no configuran CLOUDINARY_* (ver tests/jest.setupEnv.js) a
// propósito: así se prueba el camino "no configurado todavía" (503 claro)
// y, para lo demás, que la lógica de la base de datos funciona sin
// necesidad de una cuenta de Cloudinary real. addImage/deleteImage/reorder
// no dependen de si Cloudinary está configurado (la subida ya pasó por el
// navegador antes de llegar acá; el borrado en Cloudinary se salta solo
// cuando no hay credenciales, sin fallar).

describe('POST /api/productos/:id/imagenes/firma', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('sin credenciales de Cloudinary configuradas, responde 503 con mensaje claro', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const product = await createProduct(company.id);
    const token = signToken(admin);

    const res = await request(app)
      .post(`/api/productos/${product.id}/imagenes/firma`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/Cloudinary/i);
  });

  test('pedir firma para un producto de otra compañía se rechaza', async () => {
    const companyA = await createCompany();
    const companyB = await createCompany();
    const adminA = await createUser(companyA.id, 'admin_compania');
    const productB = await createProduct(companyB.id);
    const token = signToken(adminA);

    const res = await request(app)
      .post(`/api/productos/${productB.id}/imagenes/firma`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

describe('POST /api/productos/:id/imagenes', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('registra una imagen ya subida y le asigna el siguiente orden', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const product = await createProduct(company.id);
    const token = signToken(admin);

    const primera = await request(app)
      .post(`/api/productos/${product.id}/imagenes`)
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://res.cloudinary.com/demo/image/upload/foto1.jpg', publicId: 'vendita/foto1' });
    expect(primera.status).toBe(201);
    expect(primera.body.orden).toBe(0);

    const segunda = await request(app)
      .post(`/api/productos/${product.id}/imagenes`)
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://res.cloudinary.com/demo/image/upload/foto2.jpg', publicId: 'vendita/foto2' });
    expect(segunda.status).toBe(201);
    expect(segunda.body.orden).toBe(1);

    const imagenes = await prisma.productImage.findMany({ where: { productId: product.id } });
    expect(imagenes).toHaveLength(2);
  });

  test('un empleado (no solo admin) puede agregar fotos, igual que editar el producto', async () => {
    const company = await createCompany();
    const empleado = await createUser(company.id, 'empleado_inventario');
    const product = await createProduct(company.id);
    const token = signToken(empleado);

    const res = await request(app)
      .post(`/api/productos/${product.id}/imagenes`)
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://res.cloudinary.com/demo/image/upload/foto.jpg', publicId: 'vendita/foto' });

    expect(res.status).toBe(201);
  });

  test('agregar una imagen a un producto de otra compañía se rechaza', async () => {
    const companyA = await createCompany();
    const companyB = await createCompany();
    const adminA = await createUser(companyA.id, 'admin_compania');
    const productB = await createProduct(companyB.id);
    const token = signToken(adminA);

    const res = await request(app)
      .post(`/api/productos/${productB.id}/imagenes`)
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://res.cloudinary.com/demo/image/upload/foto.jpg', publicId: 'vendita/foto' });

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/productos/:id/imagenes/:imageId', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('elimina el registro de la imagen (sin Cloudinary configurado, no revienta)', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const product = await createProduct(company.id);
    const token = signToken(admin);
    const image = await prisma.productImage.create({
      data: { productId: product.id, url: 'https://res.cloudinary.com/demo/image/upload/x.jpg', publicId: 'vendita/x' },
    });

    const res = await request(app)
      .delete(`/api/productos/${product.id}/imagenes/${image.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(204);

    const enBD = await prisma.productImage.findUnique({ where: { id: image.id } });
    expect(enBD).toBeNull();
  });

  test('borrar una imagen que no pertenece al producto indicado se rechaza', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const productA = await createProduct(company.id);
    const productB = await createProduct(company.id);
    const token = signToken(admin);
    const imageDeA = await prisma.productImage.create({
      data: { productId: productA.id, url: 'https://res.cloudinary.com/demo/image/upload/a.jpg', publicId: 'vendita/a' },
    });

    const res = await request(app)
      .delete(`/api/productos/${productB.id}/imagenes/${imageDeA.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);

    const sigueExistiendo = await prisma.productImage.findUnique({ where: { id: imageDeA.id } });
    expect(sigueExistiendo).not.toBeNull();
  });
});

describe('PATCH /api/productos/:id/imagenes/orden', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('reordena las imágenes según la lista de ids dada', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const product = await createProduct(company.id);
    const token = signToken(admin);

    const img1 = await prisma.productImage.create({
      data: { productId: product.id, url: 'u1', publicId: 'p1', orden: 0 },
    });
    const img2 = await prisma.productImage.create({
      data: { productId: product.id, url: 'u2', publicId: 'p2', orden: 1 },
    });

    const res = await request(app)
      .patch(`/api/productos/${product.id}/imagenes/orden`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [img2.id, img1.id] }); // invierte el orden

    expect(res.status).toBe(200);
    expect(res.body[0].id).toBe(img2.id);
    expect(res.body[0].orden).toBe(0);
    expect(res.body[1].id).toBe(img1.id);
    expect(res.body[1].orden).toBe(1);
  });

  test('una lista de ids que no coincide con las imágenes del producto se rechaza', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const product = await createProduct(company.id);
    const token = signToken(admin);

    await prisma.productImage.create({ data: { productId: product.id, url: 'u1', publicId: 'p1' } });

    const res = await request(app)
      .patch(`/api/productos/${product.id}/imagenes/orden`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [999999] });

    expect(res.status).toBe(400);
  });
});

describe('visibleEnCatalogo en create/update de producto', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('un producto nuevo no es visible en el catálogo por defecto', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const token = signToken(admin);

    const res = await request(app)
      .post('/api/productos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'Producto sin catálogo',
        sku: `SKU-${Date.now()}`,
        precioCompra: 1000,
        precioVenta: 2000,
        stockActual: 5,
        unidadMedida: 'unidad',
        categoria: 'general',
      });

    expect(res.status).toBe(201);
    expect(res.body.visibleEnCatalogo).toBe(false);
  });

  test('se puede marcar un producto como visible en el catálogo al crearlo', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const token = signToken(admin);

    const res = await request(app)
      .post('/api/productos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'Producto visible',
        sku: `SKU-${Date.now()}`,
        precioCompra: 1000,
        precioVenta: 2000,
        stockActual: 5,
        unidadMedida: 'unidad',
        categoria: 'general',
        visibleEnCatalogo: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.visibleEnCatalogo).toBe(true);
  });

  test('editar un producto sin mandar visibleEnCatalogo no lo desactiva', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const product = await createProduct(company.id, { visibleEnCatalogo: true });
    const token = signToken(admin);

    const res = await request(app)
      .put(`/api/productos/${product.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: product.nombre,
        sku: product.sku,
        precioCompra: Number(product.precioCompra),
        precioVenta: Number(product.precioVenta),
        stockActual: product.stockActual,
        unidadMedida: product.unidadMedida,
        categoria: product.categoria,
        // visibleEnCatalogo deliberadamente omitido
      });

    expect(res.status).toBe(200);
    expect(res.body.visibleEnCatalogo).toBe(true);
  });
});
