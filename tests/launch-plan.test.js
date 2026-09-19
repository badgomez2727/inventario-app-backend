const request = require('supertest');
const app = require('../src/app');
const { prisma, createCompany, createUser, signToken } = require('./helpers/factory');

const DIA_MS = 24 * 60 * 60 * 1000;
const auth = (token) => ({ Authorization: `Bearer ${token}` });

// Registra un negocio nuevo por el flujo real (POST /auth/register-company).
// email y nombreUsuario son únicos en todo el sistema: siempre con sufijo.
async function registrarNegocio() {
  const sufijo = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const res = await request(app).post('/auth/register-company').send({
    companyName: `Negocio Lanzamiento ${sufijo}`,
    companyEmail: `negocio_${sufijo}@test.local`,
    username: `dueno_${sufijo}`,
    email: `dueno_${sufijo}@test.local`,
    password: 'clave-de-prueba-123',
  });
  expect(res.status).toBe(201);
  const company = await prisma.company.findUnique({ where: { id: res.body.company.id } });
  const admin = await prisma.user.findFirst({ where: { companyId: company.id } });
  return { company, token: signToken(admin) };
}

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

describe('Plan de lanzamiento al registrarse', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('por defecto el negocio nuevo entra al plan LANZAMIENTO por 180 días', async () => {
    const { company } = await conLaunchDays(undefined, registrarNegocio);
    expect(company.plan).toBe('LANZAMIENTO');
    const dias = (new Date(company.planExpiresAt).getTime() - Date.now()) / DIA_MS;
    expect(dias).toBeCloseTo(180, 2); // tolerancia de minutos: la BD redondea el vencimiento
  });

  test('LAUNCH_PLAN_DAYS cambia la duración', async () => {
    const { company } = await conLaunchDays('30', registrarNegocio);
    expect(company.plan).toBe('LANZAMIENTO');
    const dias = (new Date(company.planExpiresAt).getTime() - Date.now()) / DIA_MS;
    expect(dias).toBeCloseTo(30, 2);
  });

  test('con LAUNCH_PLAN_DAYS=0 el lanzamiento está apagado y el negocio entra a FREE', async () => {
    const { company } = await conLaunchDays('0', registrarNegocio);
    expect(company.plan).toBe('FREE');
    expect(company.planExpiresAt).toBeNull();
  });

  test('un valor inválido apaga el lanzamiento (falla hacia el plan restrictivo)', async () => {
    const { company } = await conLaunchDays('abc', registrarNegocio);
    expect(company.plan).toBe('FREE');
  });
});

describe('Límites del plan LANZAMIENTO', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('permite pasar de los 50 productos del plan gratis (techo de 500)', async () => {
    const { company, token } = await conLaunchDays(undefined, registrarNegocio);
    await cargarProductos(company.id, 60);

    const res = await request(app).post('/api/productos').set(auth(token)).send(productoNuevo(company.id));
    expect(res.status).toBe(201);
  });

  test('al vencer cae al plan FREE: conserva lo cargado pero ya no puede agregar más de 50', async () => {
    const { company, token } = await conLaunchDays(undefined, registrarNegocio);
    await cargarProductos(company.id, 60);
    await prisma.company.update({ where: { id: company.id }, data: { planExpiresAt: new Date(Date.now() - DIA_MS) } });

    const lista = await request(app).get('/api/productos?limit=100').set(auth(token));
    expect(lista.body.totalCount).toBe(60); // nada se pierde

    const res = await request(app).post('/api/productos').set(auth(token)).send(productoNuevo(company.id));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PLAN_LIMIT_REACHED');
  });

  test('plan-status informa el plan activo, y el plan guardado cuando ya venció', async () => {
    const { company, token } = await conLaunchDays(undefined, registrarNegocio);

    const activo = await request(app).get('/api/reports/plan-status').set(auth(token));
    expect(activo.body.plan).toBe('LANZAMIENTO');
    expect(activo.body.label).toBe('Lanzamiento');
    expect(activo.body.products.limit).toBe(500);

    await prisma.company.update({ where: { id: company.id }, data: { planExpiresAt: new Date(Date.now() - DIA_MS) } });
    const vencido = await request(app).get('/api/reports/plan-status').set(auth(token));
    expect(vencido.body.plan).toBe('FREE');
    expect(vencido.body.storedPlan).toBe('LANZAMIENTO');
    expect(vencido.body.products.limit).toBe(50);
  });

  test('NO incluye el asistente de IA (exclusivo de PRO)', async () => {
    const { token } = await conLaunchDays(undefined, registrarNegocio);
    const res = await request(app).post('/api/pedidos-ia/parse').set(auth(token)).send({ texto: 'hola' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PLAN_LIMIT_REACHED');
  });
});

describe('Un super admin puede asignar el plan LANZAMIENTO a mano', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('PATCH /api/admin/companies/:id/plan con LANZAMIENTO usa 180 días por defecto', async () => {
    const interna = await createCompany();
    const superAdmin = await createUser(interna.id, 'super_admin_sistema');
    const objetivo = await createCompany();

    const res = await request(app)
      .patch(`/api/admin/companies/${objetivo.id}/plan`)
      .set(auth(signToken(superAdmin)))
      .send({ plan: 'LANZAMIENTO' });

    expect(res.status).toBe(200);
    expect(res.body.plan).toBe('LANZAMIENTO');
    const dias = (new Date(res.body.planExpiresAt).getTime() - Date.now()) / DIA_MS;
    expect(dias).toBeGreaterThan(179);
  });
});
