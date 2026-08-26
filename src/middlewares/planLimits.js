// backend/src/middlewares/planLimits.js
//
// Middlewares que frenan la creación de recursos cuando la compañía alcanzó
// el techo de su plan. Consultan el plan actual desde la BD (no desde el
// JWT) para que un cambio de plan surta efecto sin necesidad de reloguear,
// y usan getEffectivePlanName() para que un plan pago vencido (planExpiresAt
// en el pasado) se trate como FREE aunque el campo `plan` todavía diga otra
// cosa.

const { PrismaClient } = require('@prisma/client');
const { getPlanLimits, getEffectivePlanName } = require('../config/plans');
const prisma = new PrismaClient();

const enforceProductLimit = async (req, res, next) => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.companyId },
      select: { plan: true, planExpiresAt: true },
    });
    const limits = getPlanLimits(getEffectivePlanName(company));

    if (limits.maxProducts === Infinity) return next();

    const count = await prisma.product.count({ where: { companyId: req.companyId } });
    if (count >= limits.maxProducts) {
      return res.status(403).json({
        code: 'PLAN_LIMIT_REACHED',
        error: `Alcanzaste el límite de ${limits.maxProducts} productos del plan ${limits.label}. Actualiza tu plan para seguir agregando productos.`,
      });
    }
    next();
  } catch (error) {
    console.error('Error al validar límite de plan (productos):', error);
    res.status(500).json({ error: 'Error interno al validar el plan.' });
  }
};

// Ventas/mes ya no se limita (ver config/plans.js: maxSalesPerMonth siempre
// es Infinity). Se deja este middleware montado en la ruta por si algún día
// se quiere usar esa señal para algo que NO sea bloquear una venta en curso
// (ej. un aviso informativo), pero hoy nunca bloquea.
const enforceSaleLimit = async (req, res, next) => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.companyId },
      select: { plan: true, planExpiresAt: true },
    });
    const limits = getPlanLimits(getEffectivePlanName(company));

    if (limits.maxSalesPerMonth === Infinity) return next();

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const count = await prisma.sale.count({
      where: { companyId: req.companyId, fechaVenta: { gte: startOfMonth } },
    });
    if (count >= limits.maxSalesPerMonth) {
      return res.status(403).json({
        code: 'PLAN_LIMIT_REACHED',
        error: `Alcanzaste el límite de ${limits.maxSalesPerMonth} ventas este mes del plan ${limits.label}. Actualiza tu plan para seguir vendiendo.`,
      });
    }
    next();
  } catch (error) {
    console.error('Error al validar límite de plan (ventas):', error);
    res.status(500).json({ error: 'Error interno al validar el plan.' });
  }
};

module.exports = { enforceProductLimit, enforceSaleLimit };
