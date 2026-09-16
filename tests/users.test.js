const request = require('supertest');
const app = require('../src/app');
const { prisma, createCompany, createUser, signToken } = require('./helpers/factory');

describe('POST /api/users (CRÍTICO-1: escalación de privilegios)', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('un empleado (no admin) no puede crear usuarios: 403', async () => {
    const company = await createCompany();
    const empleado = await createUser(company.id, 'empleado_inventario');
    const token = signToken(empleado);
    const nombreUsuario = `nuevo_intento_${Date.now()}`;

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombreUsuario,
        email: `${nombreUsuario}@test.local`,
        password: 'x',
        rol: 'empleado_inventario',
      });

    expect(res.status).toBe(403);

    const created = await prisma.user.findFirst({ where: { nombreUsuario } });
    expect(created).toBeNull();
  });

  test('un admin no puede crear un usuario con rol super_admin_sistema', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const token = signToken(admin);
    const nombreUsuario = `aspirante_superadmin_${Date.now()}`;

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombreUsuario,
        email: `${nombreUsuario}@test.local`,
        password: 'x',
        rol: 'super_admin_sistema',
      });

    expect(res.status).toBe(400);

    const created = await prisma.user.findFirst({ where: { nombreUsuario } });
    expect(created).toBeNull();
  });

  test('un admin SÍ puede crear un empleado normal dentro de su propia compañía', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const token = signToken(admin);

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombreUsuario: `empleado_valido_${Date.now()}`,
        email: `empleado_valido_${Date.now()}@test.local`,
        password: 'x',
        rol: 'empleado_inventario',
      });

    expect(res.status).toBe(201);
    expect(res.body.user.rol).toBe('empleado_inventario');

    const created = await prisma.user.findUnique({ where: { id: res.body.user.id } });
    // El usuario creado siempre debe quedar en la compañía del admin que lo crea.
    expect(created.companyId).toBe(company.id);
  });

  test('un companyId enviado en el body se ignora: el usuario siempre queda en la compañía del admin que llama', async () => {
    const companyDelAdmin = await createCompany();
    const otraCompania = await createCompany();
    const admin = await createUser(companyDelAdmin.id, 'admin_compania');
    const token = signToken(admin);
    const nombreUsuario = `intento_cross_company_${Date.now()}`;

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombreUsuario,
        email: `${nombreUsuario}@test.local`,
        password: 'x',
        rol: 'empleado_inventario',
        companyId: otraCompania.id, // intento de colar otra compañía por el body
      });

    expect(res.status).toBe(201);

    const created = await prisma.user.findUnique({ where: { id: res.body.user.id } });
    expect(created.companyId).toBe(companyDelAdmin.id); // no otraCompania.id
  });

  test('regresión: los valores viejos del frontend (ADMIN_COMPANIA, OPERARIO, VENDEDOR) ya no son válidos', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const token = signToken(admin);

    for (const rolViejo of ['ADMIN_COMPANIA', 'OPERARIO', 'VENDEDOR']) {
      const nombreUsuario = `rol_viejo_${rolViejo}_${Date.now()}`;
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${token}`)
        .send({
          nombreUsuario,
          email: `${nombreUsuario}@test.local`,
          password: 'x',
          rol: rolViejo,
        });

      expect(res.status).toBe(400);
      const created = await prisma.user.findFirst({ where: { nombreUsuario } });
      expect(created).toBeNull();
    }
  });
});
