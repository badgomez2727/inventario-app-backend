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

describe('PUT /api/users/:id (editar usuario)', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('un admin puede editar nombre, email y rol de un empleado de su compañía', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const empleado = await createUser(company.id, 'empleado_inventario');
    const token = signToken(admin);
    // email/nombreUsuario son únicos GLOBALMENTE (no solo por compañía, ver
    // schema.prisma), así que hay que usar valores únicos por corrida como
    // hace el resto de la suite, o esto choca con datos de una corrida anterior.
    const nuevoEmail = `editado_${Date.now()}@test.local`;

    const res = await request(app)
      .put(`/api/users/${empleado.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ nombreUsuario: `empleado_editado_${Date.now()}`, email: nuevoEmail, rol: 'admin_compania' });

    expect(res.status).toBe(200);
    expect(res.body.user.rol).toBe('admin_compania');
    expect(res.body.user.email).toBe(nuevoEmail);
  });

  test('editar un usuario de otra compañía se rechaza', async () => {
    const companyA = await createCompany();
    const companyB = await createCompany();
    const adminA = await createUser(companyA.id, 'admin_compania');
    const empleadoB = await createUser(companyB.id, 'empleado_inventario');
    const token = signToken(adminA);

    const res = await request(app)
      .put(`/api/users/${empleadoB.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ nombreUsuario: 'hackeado' });

    expect(res.status).toBe(404);

    const sinCambios = await prisma.user.findUnique({ where: { id: empleadoB.id } });
    expect(sinCambios.nombreUsuario).toBe(empleadoB.nombreUsuario);
  });

  test('asignar un rol no permitido se rechaza', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const empleado = await createUser(company.id, 'empleado_inventario');
    const token = signToken(admin);

    const res = await request(app)
      .put(`/api/users/${empleado.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rol: 'super_admin_sistema' });

    expect(res.status).toBe(400);

    const sinCambios = await prisma.user.findUnique({ where: { id: empleado.id } });
    expect(sinCambios.rol).toBe('empleado_inventario');
  });

  test('un admin no puede quitarse a sí mismo el rol de administrador', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    await createUser(company.id, 'admin_compania'); // otro admin, para que no sea el caso de "último admin"
    const token = signToken(admin);

    const res = await request(app)
      .put(`/api/users/${admin.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rol: 'empleado_inventario' });

    expect(res.status).toBe(400);

    const sinCambios = await prisma.user.findUnique({ where: { id: admin.id } });
    expect(sinCambios.rol).toBe('admin_compania');
  });

  test('degradar al último admin activo de la compañía se rechaza (probado desde un segundo admin ya inactivo)', async () => {
    const company = await createCompany();
    const unicoAdmin = await createUser(company.id, 'admin_compania');

    // Un segundo admin, luego desactivado, deja a unicoAdmin como el único
    // admin ACTIVO — su token JWT sigue siendo técnicamente válido, así que
    // sirve para probar la regla de "último admin" sin que authorizeAdmin
    // (que no mira `activo`) bloquee la petición antes de tiempo.
    const segundoAdmin = await createUser(company.id, 'admin_compania');
    await prisma.user.update({ where: { id: segundoAdmin.id }, data: { activo: false } });
    const tokenSegundoAdmin = signToken(segundoAdmin);

    const res = await request(app)
      .put(`/api/users/${unicoAdmin.id}`)
      .set('Authorization', `Bearer ${tokenSegundoAdmin}`)
      .send({ rol: 'empleado_inventario' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/último administrador/i);

    const sinCambios = await prisma.user.findUnique({ where: { id: unicoAdmin.id } });
    expect(sinCambios.rol).toBe('admin_compania');
  });

  test('el email duplicado en la misma compañía da un mensaje claro', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const emailOcupado = `ocupado_${Date.now()}@test.local`;
    await createUser(company.id, 'empleado_inventario', { email: emailOcupado });
    const token = signToken(admin);

    const res = await request(app)
      .put(`/api/users/${admin.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ email: emailOcupado });

    expect(res.status).toBe(409);
  });
});

describe('PATCH /api/users/:id/activo (activar/desactivar usuario)', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('un admin puede desactivar y reactivar a un empleado', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const empleado = await createUser(company.id, 'empleado_inventario');
    const token = signToken(admin);

    const desactivar = await request(app)
      .patch(`/api/users/${empleado.id}/activo`)
      .set('Authorization', `Bearer ${token}`)
      .send({ activo: false });
    expect(desactivar.status).toBe(200);
    expect(desactivar.body.user.activo).toBe(false);

    const reactivar = await request(app)
      .patch(`/api/users/${empleado.id}/activo`)
      .set('Authorization', `Bearer ${token}`)
      .send({ activo: true });
    expect(reactivar.status).toBe(200);
    expect(reactivar.body.user.activo).toBe(true);
  });

  test('un admin no puede desactivarse a sí mismo', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    await createUser(company.id, 'admin_compania'); // para que no sea además el caso de "último admin"
    const token = signToken(admin);

    const res = await request(app)
      .patch(`/api/users/${admin.id}/activo`)
      .set('Authorization', `Bearer ${token}`)
      .send({ activo: false });

    expect(res.status).toBe(400);

    const sinCambios = await prisma.user.findUnique({ where: { id: admin.id } });
    expect(sinCambios.activo).toBe(true);
  });

  test('desactivar al último administrador activo de la compañía se rechaza', async () => {
    const company = await createCompany();
    const unicoAdmin = await createUser(company.id, 'admin_compania');
    const segundoAdmin = await createUser(company.id, 'admin_compania');
    await prisma.user.update({ where: { id: segundoAdmin.id }, data: { activo: false } });
    const tokenSegundoAdmin = signToken(segundoAdmin);

    const res = await request(app)
      .patch(`/api/users/${unicoAdmin.id}/activo`)
      .set('Authorization', `Bearer ${tokenSegundoAdmin}`)
      .send({ activo: false });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/último administrador/i);

    const sinCambios = await prisma.user.findUnique({ where: { id: unicoAdmin.id } });
    expect(sinCambios.activo).toBe(true);
  });

  test('desactivar un usuario de otra compañía se rechaza', async () => {
    const companyA = await createCompany();
    const companyB = await createCompany();
    const adminA = await createUser(companyA.id, 'admin_compania');
    const empleadoB = await createUser(companyB.id, 'empleado_inventario');
    const token = signToken(adminA);

    const res = await request(app)
      .patch(`/api/users/${empleadoB.id}/activo`)
      .set('Authorization', `Bearer ${token}`)
      .send({ activo: false });

    expect(res.status).toBe(404);
  });

  test('un empleado no puede activar/desactivar usuarios', async () => {
    const company = await createCompany();
    const empleado = await createUser(company.id, 'empleado_inventario');
    const otroEmpleado = await createUser(company.id, 'empleado_inventario');
    const token = signToken(empleado);

    const res = await request(app)
      .patch(`/api/users/${otroEmpleado.id}/activo`)
      .set('Authorization', `Bearer ${token}`)
      .send({ activo: false });

    expect(res.status).toBe(403);
  });
});
