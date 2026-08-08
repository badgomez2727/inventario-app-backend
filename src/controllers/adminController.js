// backend/src/controllers/adminController.js
//
// Panel para el super_admin_sistema: ver todas las compañías registradas,
// su uso real vs el límite de su plan, y poder pasarlas a PRO (p. ej. cuando
// donan o pagan). Solo accesible con el rol super_admin_sistema
// (ver middlewares/authMiddleware.js -> authorizeSuperAdmin).

const { PrismaClient } = require('@prisma/client');
const { getPlanLimits, PLAN_LIMITS } = require('../config/plans');
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
          activo: true,
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
        return {
          id: c.id,
          nombre: c.nombre,
          emailContacto: c.emailContacto,
          plan: c.plan,
          activo: c.activo,
          fechaCreacion: c.fechaCreacion,
          productCount: c._count.products,
          userCount: c._count.users,
          salesTotalCount: c._count.sales,
          salesThisMonth,
          limits: getPlanLimits(c.plan),
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

// Cambia el plan de una compañía (p. ej. de FREE a PRO tras una donación/pago).
const updateCompanyPlan = async (req, res) => {
  const { id } = req.params;
  const { plan } = req.body;

  const validPlans = Object.keys(PLAN_LIMITS);
  if (!validPlans.includes(plan)) {
    return res.status(400).json({ error: `Plan inválido. Debe ser uno de: ${validPlans.join(', ')}` });
  }

  try {
    const updated = await prisma.company.update({
      where: { id: parseInt(id) },
      data: { plan },
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

module.exports = {
  listCompanies,
  updateCompanyPlan,
};
