const request = require('supertest');
const app = require('../src/app');
const { prisma, createCompany, createUser, signToken } = require('./helpers/factory');

describe('GET /api/mi-compania', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('un admin ve la configuración de su propia compañía', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const token = signToken(admin);

    const res = await request(app)
      .get('/api/mi-compania')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(company.id);
    expect(res.body.catalogoPublicoActivo).toBe(false);
    expect(res.body.slug).toBeNull();
  });

  test('un empleado no puede ver la configuración de la compañía', async () => {
    const company = await createCompany();
    const empleado = await createUser(company.id, 'empleado_inventario');
    const token = signToken(empleado);

    const res = await request(app)
      .get('/api/mi-compania')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/mi-compania — slug', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('configura y normaliza el slug (minúsculas, sin tildes, con guiones)', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const token = signToken(admin);
    // slug es único GLOBALMENTE (no por compañía, ver schema.prisma), así
    // que necesita un sufijo único por corrida como el resto de la suite.
    const sufijo = Date.now();

    const res = await request(app)
      .patch('/api/mi-compania')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: `Tienda La Ñañita ${sufijo} ` });

    expect(res.status).toBe(200);
    expect(res.body.slug).toBe(`tienda-la-nanita-${sufijo}`);
  });

  test('un slug demasiado corto se rechaza', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const token = signToken(admin);

    const res = await request(app)
      .patch('/api/mi-compania')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: 'ab' });

    expect(res.status).toBe(400);
  });

  test('un slug ya usado por otra compañía se rechaza', async () => {
    const companyA = await createCompany();
    const companyB = await createCompany();
    const adminA = await createUser(companyA.id, 'admin_compania');
    const adminB = await createUser(companyB.id, 'admin_compania');
    const tokenA = signToken(adminA);
    const tokenB = signToken(adminB);
    const slugCompartido = `tienda-unica-${Date.now()}`;

    await request(app)
      .patch('/api/mi-compania')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ slug: slugCompartido });

    const res = await request(app)
      .patch('/api/mi-compania')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ slug: slugCompartido });

    expect(res.status).toBe(409);
  });
});

describe('PATCH /api/mi-compania — whatsappVentas', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('normaliza los números de WhatsApp y quita duplicados', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const token = signToken(admin);

    const res = await request(app)
      .patch('/api/mi-compania')
      .set('Authorization', `Bearer ${token}`)
      .send({ whatsappVentas: ['300 111 2222', '+57-300-111-2222', '3009998888'] });

    expect(res.status).toBe(200);
    expect(res.body.whatsappVentas).toEqual(['+573001112222', '+573009998888']);
  });

  test('un número de WhatsApp inválido se rechaza con mensaje claro', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const token = signToken(admin);

    const res = await request(app)
      .patch('/api/mi-compania')
      .set('Authorization', `Bearer ${token}`)
      .send({ whatsappVentas: ['123'] });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/inválido/i);
  });
});

describe('PATCH /api/mi-compania — activar catálogo público', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('no se puede activar sin slug configurado', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const token = signToken(admin);

    const res = await request(app)
      .patch('/api/mi-compania')
      .set('Authorization', `Bearer ${token}`)
      .send({ catalogoPublicoActivo: true, whatsappVentas: ['3001234567'] });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/slug/i);
  });

  test('no se puede activar sin al menos un número de WhatsApp', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const token = signToken(admin);

    await request(app)
      .patch('/api/mi-compania')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: `tienda-sin-whatsapp-${Date.now()}` });

    const res = await request(app)
      .patch('/api/mi-compania')
      .set('Authorization', `Bearer ${token}`)
      .send({ catalogoPublicoActivo: true });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/whatsapp/i);
  });

  test('se activa cuando ya tiene slug y whatsapp (mandados en la misma petición)', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const token = signToken(admin);

    const res = await request(app)
      .patch('/api/mi-compania')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: `tienda-completa-${Date.now()}`, whatsappVentas: ['3001234567'], catalogoPublicoActivo: true });

    expect(res.status).toBe(200);
    expect(res.body.catalogoPublicoActivo).toBe(true);
  });

  test('se activa cuando slug y whatsapp ya estaban configurados de antes', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const token = signToken(admin);

    await request(app)
      .patch('/api/mi-compania')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: `tienda-previa-${Date.now()}`, whatsappVentas: ['3001234567'] });

    const res = await request(app)
      .patch('/api/mi-compania')
      .set('Authorization', `Bearer ${token}`)
      .send({ catalogoPublicoActivo: true });

    expect(res.status).toBe(200);
    expect(res.body.catalogoPublicoActivo).toBe(true);
  });
});

describe('PATCH /api/mi-compania — domicilio y descripción', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('guarda ofreceDomicilio, valorDomicilioDefault y descripcionCatalogo', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const token = signToken(admin);

    const res = await request(app)
      .patch('/api/mi-compania')
      .set('Authorization', `Bearer ${token}`)
      .send({ ofreceDomicilio: true, valorDomicilioDefault: 5000, descripcionCatalogo: 'La mejor tienda del barrio' });

    expect(res.status).toBe(200);
    expect(res.body.ofreceDomicilio).toBe(true);
    expect(Number(res.body.valorDomicilioDefault)).toBe(5000);
    expect(res.body.descripcionCatalogo).toBe('La mejor tienda del barrio');
  });

  test('un valor de domicilio negativo se rechaza', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const token = signToken(admin);

    const res = await request(app)
      .patch('/api/mi-compania')
      .set('Authorization', `Bearer ${token}`)
      .send({ valorDomicilioDefault: -100 });

    expect(res.status).toBe(400);
  });
});
