// backend/src/config/plans.js
//
// Límites de uso por plan. Todo centralizado aquí para poder ajustar los
// números sin tocar los controladores/middlewares que los aplican.
//
// El freno de plan es SOLO por número de productos en el catálogo. Ventas/mes
// no se limita: el volumen de ventas de una tienda varía mucho por temporada
// y puede ser altísimo incluso en negocios pequeños, así que no es una buena
// señal de "hay que pagar más" — solo terminaría bloqueando una venta real
// frente a un cliente, que es el peor momento posible para un muro de pago.
// El catálogo (SKUs) sí refleja el tamaño real del negocio y crece despacio.
const PLAN_LIMITS = {
  FREE: {
    label: 'Gratis',
    maxProducts: 50,
    maxSalesPerMonth: Infinity,
    priceCOP: 0,
    durationDays: null, // no vence
  },
  // Plan de lanzamiento (campaña de difusión): todo negocio nuevo entra acá,
  // gratis, con el techo de productos de PRO pero SIN el asistente de IA
  // (gasta tokens reales y sigue siendo exclusivo de PRO). Vence solo y el
  // negocio cae a FREE (con todo lo que ya cargó intacto); el precio
  // definitivo se decide después, con datos de uso reales. Ver
  // getLaunchPlanDays() para la duración y para apagarlo.
  LANZAMIENTO: {
    label: 'Lanzamiento',
    maxProducts: 500,
    maxSalesPerMonth: Infinity,
    priceCOP: 0,
    durationDays: 180, // duración estándar si un super admin lo asigna a mano
  },
  BASICO: {
    label: 'Básico',
    maxProducts: 150,
    maxSalesPerMonth: Infinity,
    priceCOP: 30000,
    // priceLifetimeCOP: pago único, sin vencimiento (planExpiresAt queda null).
    // No hay una llave de plan separada para esto: al activarlo, el admin
    // manda { plan: 'BASICO', durationDays: null } en updateCompanyPlan
    // (ver adminController.js), que ya soporta ese override explícito.
    priceLifetimeCOP: 250000,
    durationDays: 180, // 6 meses
  },
  PRO: {
    label: 'Pro',
    maxProducts: 500,
    maxSalesPerMonth: Infinity,
    priceCOP: 60000,
    priceLifetimeCOP: 500000, // mismo mecanismo que BASICO.priceLifetimeCOP
    durationDays: 180, // 6 meses
  },
};

// Cualquier valor de `plan` que no reconozcamos cae en FREE por seguridad
// (mejor limitar de más que dejar un plan desconocido sin límites).
const getPlanLimits = (plan) => PLAN_LIMITS[plan] || PLAN_LIMITS.FREE;

// Devuelve el NOMBRE de plan que realmente aplica ahora mismo. Si el plan es
// de pago (BASICO/PRO) y `planExpiresAt` ya pasó, la compañía se trata como
// FREE aunque el campo `plan` en la BD todavía diga lo contrario — así un
// pago que no se renueva no deja acceso ilimitado para siempre. FREE nunca
// vence (planExpiresAt es null para ese plan).
//
// Recibe la compañía completa (o al menos { plan, planExpiresAt }) para no
// acoplar esta función a cómo se consulta la BD en cada lugar que la usa.
const getEffectivePlanName = (company) => {
  if (!company || !company.plan) return 'FREE';
  const { plan, planExpiresAt } = company;
  if (plan !== 'FREE' && planExpiresAt && new Date(planExpiresAt) < new Date()) {
    return 'FREE';
  }
  return plan;
};

// Días de plan LANZAMIENTO que reciben los negocios que se registran ahora.
// Se lee de LAUNCH_PLAN_DAYS en cada registro (sin desplegar código para
// cambiarlo): sin definir = 180; un número positivo = esa cantidad de días;
// 0 (o cualquier valor inválido) = lanzamiento apagado, y los negocios nuevos
// entran directo al plan FREE.
const DEFAULT_LAUNCH_PLAN_DAYS = 180;
const getLaunchPlanDays = () => {
  const raw = process.env.LAUNCH_PLAN_DAYS;
  if (raw === undefined || raw === '') return DEFAULT_LAUNCH_PLAN_DAYS;
  const days = parseInt(raw, 10);
  return Number.isInteger(days) && days > 0 ? days : 0;
};

module.exports = { PLAN_LIMITS, getPlanLimits, getEffectivePlanName, getLaunchPlanDays };
