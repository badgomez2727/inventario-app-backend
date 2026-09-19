const request = require('supertest');
const app = require('../src/app');
const { prisma, createCompany, createUser, createProduct, signToken } = require('./helpers/factory');

const DIA_MS = 24 * 60 * 60 * 1000;
const auth = (token) => ({ Authorization: `Bearer ${token}` });

// Registra un negocio nuevo por el flujo real (POST /auth/register-company).
// email y nombreUsuario son únicos en todo el sistema: siempre con sufijo.
async function registrarNegocio() {
  const sufijo = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const usuario = `dueno_${sufijo}`;
  const credenciales = { nombreUsuario: usuario, password: 'clave-de-prueba-123' };
  const res = await request(app).post('/auth/register-company').send({
    companyName: `Negocio Lanzamiento ${sufijo}`,
    companyEmail: `negocio_${sufijo}@test.local`,
    username: usuario,
    email: `dueno_${sufijo}@test.local`,
    password: credenciales.password,
  });
  expect(res.status).toBe(201);
  const company = await prisma.company.findUnique({ where: { id: res.body.company.id } });
  const admin = await prisma.user.findFirst({ where: { companyId: company.id } });
  return { company, token: signToken(admin), credenciales };
}

// Deja la prueba de un negocio ya vencida (terminó ayer).
const vencerPrueba = (companyId) =>
  prisma.company.update({ where: { id: companyId }, data: { planExpiresAt: new Date(Date.now() - DIA_MS) } });

const productoNuevo = (companyId, i = 'extra') => ({
  nombre: `Producto ${i}`,
  sku: `LANZ-${companyId}-${i}`,
  precioCompra: 1000,
  precioVenta: 2000,
  stockActual: 1,
  unidadMedida: 'unidad',
  categoria: 'general',
});

async function cargarProductos(companyId, cantidad) {
  await prisma.product.createMany({
    data: Array.from({ length: cantidad }, (_, i) => ({ companyId, ...productoNuevo(companyId, i) })),
  });
}

// LAUNCH_PLAN_DAYS se lee en cada registro; se restaura siempre al terminar.
async function conLaunchDays(valor, fn) {
  const previo = process.env.LAUNCH_PLAN_DAYS;
  if (valor === undefined) delete process.env.LAUNCH_PLAN_DAYS;
  else process.env.LAUNCH_PLAN_DAYS = valor;
  try {
    return await fn();
  } finally {
    if (previo === undefined) delete process.env.LAUNCH_PLAN_DAYS;
    else process.env.LAUNCH_PLAN_DAYS = previo;
  }
}

const diasHastaVencer = (company) => (new Date(company.planExpiresAt).getTime() - Date.now()) / DIA_MS;

describe('Prueba gratis al registrarse', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('por defecto el negocio nuevo entra al plan LANZAMIENTO por 7 días', async () => {
    const { company } = await conLaunchDays(undefined, registrarNegocio);
    expect(company.plan).toBe('LANZAMIENTO');
    expect(diasHastaVencer(company)).toBeCloseTo(7, 2); // tolerancia de minutos: la BD redondea el vencimiento
  });

  test('LAUNCH_PLAN_DAYS cambia la duración', async () => {
    const { company } = await conLaunchDays('14', registrarNegocio);
    expect(company.plan).toBe('LANZAMIENTO');
    expect(diasHastaVencer(company)).toBeCloseTo(14, 2);
  });

  test('un valor vacío, 0 o inválido usa 7 días: nunca deja un plan gratis permanente', async () => {
    for (const valor of ['', '0', '-3', 'abc']) {
      const { company } = await conLaunchDays(valor, registrarNegocio);
      expect(company.plan).toBe('LANZAMIENTO');
      expect(diasHastaVencer(company)).toBeCloseTo(7, 2);
    }
  });
});

describe('Límites durante la prueba', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('permite pasar de los 50 productos del plan gratis (techo de 500)', async () => {
    const { company, token } = await conLaunchDays(undefined, registrarNegocio);
    await cargarProductos(company.id, 60);

    const res = await request(app).post('/api/productos').set(auth(token)).send(productoNuevo(company.id));
    expect(res.status).toBe(201);
  });

  test('NO incluye el asistente de IA (exclusivo de PRO)', async () => {
    const { token } = await conLaunchDays(undefined, registrarNegocio);
    const res = await request(app).post('/api/pedidos-ia/parse').set(auth(token)).send({ texto: 'hola' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PLAN_LIMIT_REACHED');
  });

  test('plan-status informa la prueba activa', async () => {
    const { token } = await conLaunchDays(undefined, registrarNegocio);
    const res = await request(app).get('/api/reports/plan-status').set(auth(token));
    expect(res.body.plan).toBe('LANZAMIENTO');
    expect(res.body.label).toBe('Prueba gratis');
    expect(res.body.products.limit).toBe(500);
  });
});

describe('Cuenta en solo lectura (prueba terminada sin plan)', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('plan-status informa VENCIDO y conserva el plan guardado', async () => {
    const { company, token } = await conLaunchDays(undefined, registrarNegocio);
    await vencerPrueba(company.id);

    const res = await request(app).get('/api/reports/plan-status').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.plan).toBe('VENCIDO');
    expect(res.body.storedPlan).toBe('LANZAMIENTO');
    expect(res.body.label).toBe('Prueba terminada');
  });

  test('se puede consultar todo (GET), sin perder nada de lo cargado', async () => {
    const { company, token } = await conLaunchDays(undefined, registrarNegocio);
    await cargarProductos(company.id, 60);
    await vencerPrueba(company.id);

    const lista = await request(app).get('/api/productos?limit=100').set(auth(token));
    expect(lista.status).toBe(200);
    expect(lista.body.totalCount).toBe(60);

    const clientes = await request(app).get('/api/clientes').set(auth(token));
    expect(clientes.status).toBe(200);
  });

  test('no se puede modificar nada: crear, editar, vender, borrar', async () => {
    const { company, token } = await conLaunchDays(undefined, registrarNegocio);
    const producto = await createProduct(company.id, { stockActual: 10 });
    await vencerPrueba(company.id);

    const intentos = [
      request(app).post('/api/productos').set(auth(token)).send(productoNuevo(company.id)),
      request(app).put(`/api/productos/${producto.id}`).set(auth(token)).send({ ...productoNuevo(company.id, 'edit') }),
      request(app).patch(`/api/productos/${producto.id}/activo`).set(auth(token)).send({ activo: false }),
      request(app).delete(`/api/productos/${producto.id}`).set(auth(token)),
      request(app).post('/api/sales').set(auth(token)).send({ items: [{ productId: producto.id, cantidad: 1 }], total: 2000, estadoPago: 'PAGADA' }),
      request(app).post('/api/stock/add').set(auth(token)).send({ productId: producto.id, cantidad: 5, motivo: 'prueba' }),
      request(app).post('/api/clientes').set(auth(token)).send({ nombre: 'Cliente Nuevo' }),
    ];
    for (const respuesta of await Promise.all(intentos)) {
      expect(respuesta.status).toBe(403);
      expect(respuesta.body.code).toBe('CUENTA_SOLO_LECTURA');
      expect(respuesta.body.error).toMatch(/solo lectura/i);
    }

    // Nada cambió en la base de datos.
    const intacto = await prisma.product.findUnique({ where: { id: producto.id } });
    expect(intacto.stockActual).toBe(10);
    expect(intacto.activo).toBe(true);
    expect(await prisma.sale.count({ where: { companyId: company.id } })).toBe(0);
  });

  test('los usuarios pueden seguir entrando (login) para ver su información', async () => {
    const { company, credenciales } = await conLaunchDays(undefined, registrarNegocio);
    await vencerPrueba(company.id);

    const res = await request(app).post('/auth/login').send(credenciales);
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  test('el catálogo público deja de recibir pedidos (404 genérico)', async () => {
    const { company, token } = await conLaunchDays(undefined, registrarNegocio);
    const producto = await createProduct(company.id, { stockActual: 10, visibleEnCatalogo: true });
    const slug = `solo-lectura-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const activar = await request(app)
      .patch('/api/mi-compania')
      .set(auth(token))
      .send({ slug, whatsappVentas: ['3001234567'], catalogoPublicoActivo: true });
    expect(activar.status).toBe(200);

    const antes = await request(app).get(`/public/catalogo/${slug}`);
    expect(antes.status).toBe(200);

    await vencerPrueba(company.id);

    const catalogo = await request(app).get(`/public/catalogo/${slug}`);
    expect(catalogo.status).toBe(404);

    const pedido = await request(app)
      .post(`/public/catalogo/${slug}/pedido`)
      .send({ items: [{ productId: producto.id, cantidad: 1 }], cliente: { nombre: 'Cliente', telefono: '3009991111' }, tipoEntrega: 'RECOGE' });
    expect(pedido.status).toBe(404);
  });

  test('un super admin nunca queda bloqueado, aunque su compañía tenga la prueba vencida', async () => {
    const interna = await createCompany({ plan: 'LANZAMIENTO', planExpiresAt: new Date(Date.now() - DIA_MS) });
    const superAdmin = await createUser(interna.id, 'super_admin_sistema');
    const objetivo = await createCompany();

    const res = await request(app)
      .patch(`/api/admin/companies/${objetivo.id}/plan`)
      .set(auth(signToken(superAdmin)))
      .send({ plan: 'BASICO', durationDays: 30 });
    expect(res.status).toBe(200);
  });

  test('al activar un plan de pago la cuenta vuelve a poder modificar', async () => {
    const { company, token } = await conLaunchDays(undefined, registrarNegocio);
    await vencerPrueba(company.id);

    const bloqueado = await request(app).post('/api/productos').set(auth(token)).send(productoNuevo(company.id));
    expect(bloqueado.status).toBe(403);

    const interna = await createCompany();
    const superAdmin = await createUser(interna.id, 'super_admin_sistema');
    const activar = await request(app)
      .patch(`/api/admin/companies/${company.id}/plan`)
      .set(auth(signToken(superAdmin)))
      .send({ plan: 'BASICO', durationDays: 30 });
    expect(activar.status).toBe(200);

    const permitido = await request(app).post('/api/productos').set(auth(token)).send(productoNuevo(company.id));
    expect(permitido.status).toBe(201);
  });

  test('un plan de pago vencido (BASICO) sigue cayendo a FREE, sin solo lectura', async () => {
    const company = await createCompany({ plan: 'BASICO', planExpiresAt: new Date(Date.now() - DIA_MS) });
    const admin = await createUser(company.id, 'admin_compania');

    const res = await request(app).post('/api/productos').set(auth(signToken(admin))).send(productoNuevo(company.id));
    expect(res.status).toBe(201);

    const estado = await request(app).get('/api/reports/plan-status').set(auth(signToken(admin)));
    expect(estado.body.plan).toBe('FREE');
  });

  test('las compañías del plan FREE de siempre no cambian', async () => {
    const company = await createCompany(); // plan FREE por defecto
    const admin = await createUser(company.id, 'admin_compania');

    const res = await request(app).post('/api/productos').set(auth(signToken(admin))).send(productoNuevo(company.id));
    expect(res.status).toBe(201);
  });
});

describe('Un super admin puede asignar planes a mano', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function asignarPlan(body) {
    const interna = await createCompany();
    const superAdmin = await createUser(interna.id, 'super_admin_sistema');
    const objetivo = await createCompany();
    return request(app).patch(`/api/admin/companies/${objetivo.id}/plan`).set(auth(signToken(superAdmin))).send(body);
  }

  test('LANZAMIENTO usa 7 días por defecto', async () => {
    const res = await asignarPlan({ plan: 'LANZAMIENTO' });
    expect(res.status).toBe(200);
    expect(res.body.plan).toBe('LANZAMIENTO');
    expect((new Date(res.body.planExpiresAt).getTime() - Date.now()) / DIA_MS).toBeCloseTo(7, 2);
  });

  test('VENCIDO no es un plan asignable', async () => {
    const res = await asignarPlan({ plan: 'VENCIDO' });
    expect(res.status).toBe(400);
  });

  test('durationDays: 30 activa el plan por un mes (cobro mensual)', async () => {
    const res = await asignarPlan({ plan: 'BASICO', durationDays: 30 });
    expect(res.status).toBe(200);
    expect(res.body.plan).toBe('BASICO');
    expect((new Date(res.body.planExpiresAt).getTime() - Date.now()) / DIA_MS).toBeCloseTo(30, 2);
  });

  test('durationDays 0 o null deja el plan sin vencimiento (pago único)', async () => {
    for (const durationDays of [0, null]) {
      const res = await asignarPlan({ plan: 'PRO', durationDays });
      expect(res.status).toBe(200);
      expect(res.body.planExpiresAt).toBeNull();
    }
  });

  test('rechaza una duración inválida (texto, negativa, decimal o absurda)', async () => {
    for (const durationDays of ['treinta', -5, 1.5, 999999]) {
      const res = await asignarPlan({ plan: 'BASICO', durationDays });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/durationDays/);
    }
  });
});
