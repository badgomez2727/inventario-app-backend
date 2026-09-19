// backend/src/controllers/adminController.js
//
// Panel para el super_admin_sistema: ver todas las compañías registradas,
// su uso real vs el límite de su plan, y poder pasarlas a PRO (p. ej. cuando
// donan o pagan). Solo accesible con el rol super_admin_sistema
// (ver middlewares/authMiddleware.js -> authorizeSuperAdmin).

const { PrismaClient } = require('@prisma/client');
const { getPlanLimits, getEffectivePlanName, PLAN_LIMITS } = require('../config/plans');
const prisma = new PrismaClient();

// Lista todas las compañías del sistema (de cualquier empresa, a propósito:
// esta es la única parte del sistema donde eso es correcto) con su uso actual.
const listCompanies = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  try {
    const [companies, totalCount] = await Promise.all([
      prisma.company.findMany({
        orderBy: { fechaCreacion: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          nombre: true,
          emailContacto: true,
          plan: true,
          planExpiresAt: true,
          activo: true,
          esInterna: true,
          fechaCreacion: true,
          _count: { select: { products: true, users: true, sales: true } },
        },
      }),
      prisma.company.count(),
    ]);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const companiesWithUsage = await Promise.all(
      companies.map(async (c) => {
        const salesThisMonth = await prisma.sale.count({
          where: { companyId: c.id, fechaVenta: { gte: startOfMonth } },
        });
        const effectivePlan = getEffectivePlanName(c);
        return {
          id: c.id,
          nombre: c.nombre,
          emailContacto: c.emailContacto,
          plan: c.plan,
          planExpiresAt: c.planExpiresAt,
          // Si el plan pago venció, esto ya muestra "FREE" aunque `plan`
          // en la BD todavía diga "BASICO"/"PRO" (no se actualiza el campo
          // en la BD hasta que un admin lo cambie a mano; esto es solo lo
          // que realmente aplica ahora mismo).
          effectivePlan,
          activo: c.activo,
          esInterna: c.esInterna,
          fechaCreacion: c.fechaCreacion,
          productCount: c._count.products,
          userCount: c._count.users,
          salesTotalCount: c._count.sales,
          salesThisMonth,
          limits: getPlanLimits(effectivePlan),
        };
      })
    );

    res.json({
      companies: companiesWithUsage,
      totalPages: Math.ceil(totalCount / limit),
      currentPage: page,
      totalCount,
    });
  } catch (error) {
    console.error('Error al listar compañías (admin):', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

// Cambia el plan de una compañía (p. ej. de FREE a BASICO/PRO tras un pago).
// La fecha de vencimiento se calcula sola a partir de `durationDays` del plan
// (ver config/plans.js) salvo que se mande `durationDays` explícito en el
// body, útil para una renovación con un periodo distinto al estándar.
const updateCompanyPlan = async (req, res) => {
  const { id } = req.params;
  const { plan, durationDays } = req.body;

  const validPlans = Object.keys(PLAN_LIMITS);
  if (!validPlans.includes(plan)) {
    return res.status(400).json({ error: `Plan inválido. Debe ser uno de: ${validPlans.join(', ')}` });
  }

  // durationDays: días de vigencia. Ausente = la duración estándar del plan;
  // null o 0 = sin vencimiento (pago único); un entero positivo = esa cantidad
  // de días (30 = un mes). Cualquier otra cosa se rechaza: antes un valor
  // absurdo (texto, negativo) dejaba una fecha inválida o ya vencida.
  if (durationDays !== undefined && durationDays !== null) {
    if (!Number.isInteger(durationDays) || durationDays < 0 || durationDays > 3650) {
      return res.status(400).json({ error: 'durationDays debe ser un entero entre 0 y 3650 (0 o null = sin vencimiento).' });
    }
  }

  const planConfig = getPlanLimits(plan);
  const effectiveDurationDays = durationDays !== undefined ? durationDays : planConfig.durationDays;
  const planExpiresAt = effectiveDurationDays
    ? new Date(Date.now() + effectiveDurationDays * 24 * 60 * 60 * 1000)
    : null; // FREE (o un plan sin duración) nunca vence

  try {
    const updated = await prisma.company.update({
      where: { id: parseInt(id) },
      data: { plan, planExpiresAt },
    });
    res.json(updated);
  } catch (error) {
    console.error('Error al actualizar plan de compañía:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Compañía no encontrada.' });
    }
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

// Activa/desactiva una compañía. Nunca aplica a la compañía interna de
// Tyndall (esInterna=true): ahí vive el super_admin_sistema real y la
// cuenta demo, desactivarla te dejaría sin acceso al propio panel.
// Los usuarios de una compañía inactiva no pueden iniciar sesión
// (ver authController.login) ni seguir operando con una sesión ya abierta
// (ver middlewares/authMiddleware.js).
const setCompanyActivo = async (req, res) => {
  const { id } = req.params;
  const { activo } = req.body;

  if (typeof activo !== 'boolean') {
    return res.status(400).json({ error: 'El campo "activo" debe ser true o false.' });
  }

  try {
    const company = await prisma.company.findUnique({ where: { id: parseInt(id) } });
    if (!company) {
      return res.status(404).json({ error: 'Compañía no encontrada.' });
    }
    if (company.esInterna) {
      return res.status(400).json({ error: 'No puedes desactivar la compañía interna.' });
    }

    const updated = await prisma.company.update({
      where: { id: parseInt(id) },
      data: { activo },
    });
    res.json(updated);
  } catch (error) {
    console.error('Error al cambiar el estado de la compañía:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

module.exports = {
  listCompanies,
  updateCompanyPlan,
  setCompanyActivo,
};
