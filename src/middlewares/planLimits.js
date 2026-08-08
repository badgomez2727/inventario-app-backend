// backend/src/middlewares/planLimits.js
//
// Middlewares que frenan la creación de recursos cuando la compañía alcanzó
// el techo de su plan. Consultan el plan actual desde la BD (no desde el
// JWT) para que un cambio de plan surta efecto sin necesidad de reloguear.

const { PrismaClient } = require('@prisma/client');
const { getPlanLimits } = require('../config/plans');
const prisma = new PrismaClient();

const enforceProductLimit = async (req, res, next) => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.companyId },
      select: { plan: true },
    });
    const limits = getPlanLimits(company?.plan);

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

const enforceSaleLimit = async (req, res, next) => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.companyId },
      select: { plan: true },
    });
    const limits = getPlanLimits(company?.plan);

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
