// backend/src/config/plans.js
//
// Límites de uso por plan. Todo centralizado aquí para poder ajustar los
// números sin tocar los controladores/middlewares que los aplican.

const PLAN_LIMITS = {
  FREE: {
    label: 'Gratis',
    maxProducts: 50,
    maxSalesPerMonth: 100,
  },
  PRO: {
    label: 'Pro',
    maxProducts: Infinity,
    maxSalesPerMonth: Infinity,
  },
};

// Cualquier valor de `plan` que no reconozcamos cae en FREE por seguridad
// (mejor limitar de más que dejar un plan desconocido sin límites).
const getPlanLimits = (plan) => PLAN_LIMITS[plan] || PLAN_LIMITS.FREE;

module.exports = { PLAN_LIMITS, getPlanLimits };
