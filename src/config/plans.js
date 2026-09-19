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
  // Prueba gratis de lanzamiento (campaña de difusión): todo negocio nuevo
  // entra acá, con el techo de productos de PRO pero SIN el asistente de IA
  // (gasta tokens reales y sigue siendo exclusivo de PRO). Al vencer NO cae a
  // FREE: la cuenta queda en SOLO LECTURA (estado VENCIDO, abajo) hasta que
  // paguen un plan — sin perder nada de lo cargado. Ver getLaunchPlanDays()
  // para la duración.
  LANZAMIENTO: {
    label: 'Prueba gratis',
    maxProducts: 500,
    maxSalesPerMonth: Infinity,
    priceCOP: 0,
    durationDays: 7, // duración estándar si un super admin lo asigna a mano
  },
  BASICO: {
    label: 'Básico',
    maxProducts: 150,
    maxSalesPerMonth: Infinity,
    // Precios (COP): $10.000 al mes; priceCOP es el paquete de 6 meses (al
    // mismo valor por mes). Solo informativos: el cobro es manual (Nequi) y
    // el admin activa el plan con la duración pagada (30, 180 días…).
    priceMonthlyCOP: 10000,
    priceCOP: 60000,
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
    priceMonthlyCOP: 20000, // el doble de BASICO: cubre 500 productos y el asistente de IA
    priceCOP: 120000, // 6 meses, mismo valor por mes
    priceLifetimeCOP: 500000, // mismo mecanismo que BASICO.priceLifetimeCOP
    durationDays: 180, // 6 meses
  },
};

// Estados que la app calcula pero que NO se pueden asignar como plan (por eso
// están aparte de PLAN_LIMITS, cuyas llaves son los planes válidos del admin).
// VENCIDO: la prueba gratis de lanzamiento terminó y no se ha pagado un plan.
// La cuenta queda en solo lectura (ver authMiddleware): se ve todo, no se
// modifica nada, y el catálogo público deja de recibir pedidos.
const ESTADOS_ESPECIALES = {
  VENCIDO: {
    label: 'Prueba terminada',
    maxProducts: 0,
    maxSalesPerMonth: Infinity,
    priceCOP: 0,
    durationDays: null,
  },
};

// Cualquier valor de `plan` que no reconozcamos cae en FREE por seguridad
// (mejor limitar de más que dejar un plan desconocido sin límites).
const getPlanLimits = (plan) => PLAN_LIMITS[plan] || ESTADOS_ESPECIALES[plan] || PLAN_LIMITS.FREE;

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
    // La prueba de lanzamiento vencida deja la cuenta en solo lectura hasta
    // que paguen. Los planes de pago vencidos (BASICO/PRO) siguen cayendo a
    // FREE, como siempre: no se cambia la regla de quien ya era cliente.
    return plan === 'LANZAMIENTO' ? 'VENCIDO' : 'FREE';
  }
  return plan;
};

// Días de prueba gratis que reciben los negocios que se registran ahora. Se lee
// de LAUNCH_PLAN_DAYS en cada registro (sin desplegar código para cambiarlo):
// sin definir = 7; un entero positivo = esa cantidad de días. Un valor vacío,
// 0 o inválido también da 7: un error de configuración nunca debe dejar a los
// negocios nuevos en un plan gratis permanente.
const DEFAULT_LAUNCH_PLAN_DAYS = 7;
const getLaunchPlanDays = () => {
  const raw = process.env.LAUNCH_PLAN_DAYS;
  if (raw === undefined || raw === '') return DEFAULT_LAUNCH_PLAN_DAYS;
  const days = parseInt(raw, 10);
  return Number.isInteger(days) && days > 0 ? days : DEFAULT_LAUNCH_PLAN_DAYS;
};

module.exports = { PLAN_LIMITS, getPlanLimits, getEffectivePlanName, getLaunchPlanDays };
