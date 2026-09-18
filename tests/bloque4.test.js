const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const {
  prisma,
  createCompany,
  createUser,
  createProduct,
  createClient,
  createSupplier,
  signToken,
} = require('./helpers/factory');

describe('PATCH /api/admin/companies/:id/activo', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function crearAdminSistema() {
    // El super_admin_sistema necesita pertenecer a alguna compañía (el token
    // lleva companyId), pero esta ruta no filtra por companyId — solo exige
    // el rol. Usamos una compañía cualquiera, no la interna real.
    const companySuper = await createCompany();
    return createUser(companySuper.id, 'super_admin_sistema');
  }

  test('desactivar una compañía bloquea el login de sus usuarios con un mensaje claro', async () => {
    const superAdmin = await crearAdminSistema();
    const tokenSuper = signToken(superAdmin);

    const company = await createCompany();
    const passwordPlano = 'clave-super-segura-123';
    const hashed = await bcrypt.hash(passwordPlano, 10);
    const user = await createUser(company.id, 'admin_compania', {
      nombreUsuario: `login_test_${company.id}`,
      password: hashed,
    });

    const desactivar = await request(app)
      .patch(`/api/admin/companies/${company.id}/activo`)
      .set('Authorization', `Bearer ${tokenSuper}`)
      .send({ activo: false });

    expect(desactivar.status).toBe(200);
    expect(desactivar.body.activo).toBe(false);

    const loginRes = await request(app)
      .post('/auth/login')
      .send({ nombreUsuario: user.nombreUsuario, password: passwordPlano });

    expect(loginRes.status).toBe(403);
    expect(loginRes.body.error).toMatch(/desactivada/i);
  });

  test('desactivar una compañía corta las sesiones ya abiertas de sus usuarios', async () => {
    const superAdmin = await crearAdminSistema();
    const tokenSuper = signToken(superAdmin);

    const company = await createCompany();
    const user = await createUser(company.id, 'admin_compania');
    const tokenUsuario = signToken(user); // sesión "ya abierta" antes de desactivar

    // La sesión funciona normalmente mientras la compañía está activa.
    const antes = await request(app).get('/api/sales/history').set('Authorization', `Bearer ${tokenUsuario}`);
    expect(antes.status).toBe(200);

    await request(app)
      .patch(`/api/admin/companies/${company.id}/activo`)
      .set('Authorization', `Bearer ${tokenSuper}`)
      .send({ activo: false });

    const despues = await request(app).get('/api/sales/history').set('Authorization', `Bearer ${tokenUsuario}`);
    expect(despues.status).toBe(403);
    expect(despues.body.error).toMatch(/desactivada/i);
  });

  test('reactivar una compañía restaura el acceso', async () => {
    const superAdmin = await crearAdminSistema();
    const tokenSuper = signToken(superAdmin);

    const company = await createCompany();
    const user = await createUser(company.id, 'admin_compania');
    const tokenUsuario = signToken(user);

    await request(app)
      .patch(`/api/admin/companies/${company.id}/activo`)
      .set('Authorization', `Bearer ${tokenSuper}`)
      .send({ activo: false });

    const reactivar = await request(app)
      .patch(`/api/admin/companies/${company.id}/activo`)
      .set('Authorization', `Bearer ${tokenSuper}`)
      .send({ activo: true });

    expect(reactivar.status).toBe(200);
    expect(reactivar.body.activo).toBe(true);

    const res = await request(app).get('/api/sales/history').set('Authorization', `Bearer ${tokenUsuario}`);
    expect(res.status).toBe(200);
  });

  test('un admin_compania no puede desactivar compañías', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const tokenAdmin = signToken(admin);

    const otraCompany = await createCompany();

    const res = await request(app)
      .patch(`/api/admin/companies/${otraCompany.id}/activo`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ activo: false });

    expect(res.status).toBe(403);
  });

  test('no se puede desactivar la compañía interna', async () => {
    const superAdmin = await crearAdminSistema();
    const tokenSuper = signToken(superAdmin);

    const companyInterna = await createCompany({ esInterna: true });

    const res = await request(app)
      .patch(`/api/admin/companies/${companyInterna.id}/activo`)
      .set('Authorization', `Bearer ${tokenSuper}`)
      .send({ activo: false });

    expect(res.status).toBe(400);

    const companiaEnBD = await prisma.company.findUnique({ where: { id: companyInterna.id } });
    expect(companiaEnBD.activo).toBe(true);
  });
});

describe('POST /auth/forgot-password', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('responde 200 genérico aunque el correo no exista', async () => {
    const res = await request(app)
      .post('/auth/forgot-password')
      .send({ email: `no-existe-${Date.now()}@test.local` });

    expect(res.status).toBe(200);
    expect(res.body.message).toBeTruthy();
  });

  test('responde 200 genérico (mismo mensaje) cuando el correo sí existe', async () => {
    const company = await createCompany();
    const user = await createUser(company.id, 'admin_compania');

    const resExistente = await request(app)
      .post('/auth/forgot-password')
      .send({ email: user.email });

    const resInexistente = await request(app)
      .post('/auth/forgot-password')
      .send({ email: `no-existe-${Date.now()}@test.local` });

    expect(resExistente.status).toBe(200);
    expect(resExistente.body.message).toBe(resInexistente.body.message); // no se distingue por el mensaje

    const token = await prisma.passwordResetToken.findFirst({ where: { userId: user.id } });
    expect(token).not.toBeNull(); // sí se generó el token internamente
  });

  test('responde 200 genérico y no genera token para un usuario inactivo', async () => {
    const company = await createCompany();
    const user = await createUser(company.id, 'admin_compania', { activo: false });

    const res = await request(app)
      .post('/auth/forgot-password')
      .send({ email: user.email });

    expect(res.status).toBe(200);

    const token = await prisma.passwordResetToken.findFirst({ where: { userId: user.id } });
    expect(token).toBeNull();
  });
});

describe('Borrados con historial: P2003 capturado con mensaje claro', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('no se puede borrar un producto que ya tiene ventas (StockMovement/SaleItem)', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const product = await createProduct(company.id, { stockActual: 10 });
    const token = signToken(admin);

    await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ productId: product.id, cantidad: 1 }], total: Number(product.precioVenta), estadoPago: 'PAGADA' });

    const res = await request(app)
      .delete(`/api/productos/${product.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/ventas|movimientos/i);

    const productoSigueExistiendo = await prisma.product.findUnique({ where: { id: product.id } });
    expect(productoSigueExistiendo).not.toBeNull();
  });

  test('un producto sin historial sí se puede borrar', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const product = await createProduct(company.id);
    const token = signToken(admin);

    const res = await request(app)
      .delete(`/api/productos/${product.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(204);
  });

  // Nota: a diferencia de productos (FK RESTRICT), el esquema actual define
  // productos.supplier_id como ON DELETE SET NULL — borrar un proveedor con
  // historial no dispara P2003 (el dato queda huérfano en vez de bloquear
  // el borrado). El catch de P2003 se dejó igual en el controlador por
  // consistencia y como red de seguridad ante un futuro cambio de esquema;
  // este test documenta el comportamiento real actual.
  //
  // Clientes es distinto: aunque sales.client_id también es SET NULL a
  // nivel de esquema (sin tocar), deleteClient ahora valida a mano si el
  // cliente tiene ventas y rechaza el borrado antes de llegar a la base de
  // datos (ver tests/clients.test.js) — no hace falta un P2003 para eso.
  test('borrar un proveedor con productos asociados los deja sin proveedor (no falla)', async () => {
    const company = await createCompany();
    const admin = await createUser(company.id, 'admin_compania');
    const supplier = await createSupplier(company.id);
    const product = await createProduct(company.id, { supplierId: supplier.id });
    const token = signToken(admin);

    const res = await request(app)
      .delete(`/api/proveedores/${supplier.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);

    const productoActualizado = await prisma.product.findUnique({ where: { id: product.id } });
    expect(productoActualizado.supplierId).toBeNull();
  });

});
