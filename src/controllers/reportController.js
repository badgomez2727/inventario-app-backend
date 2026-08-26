// venta_inventario_app/backend/src/controllers/reportController.js

const { PrismaClient } = require('@prisma/client');
const { getPlanLimits, getEffectivePlanName } = require('../config/plans');
const prisma = new PrismaClient();

// Uso actual de la compañía vs los límites de su plan (para mostrar un
// aviso tipo "llevas 45/50 productos" en el frontend). Cualquier usuario
// de la compañía puede verlo, no solo el admin — es informativo, no sensible.
const getPlanStatus = async (req, res) => {
  const companyId = req.companyId;
  try {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { plan: true, planExpiresAt: true },
    });
    const effectivePlan = getEffectivePlanName(company);
    const limits = getPlanLimits(effectivePlan);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [productCount, salesThisMonth] = await Promise.all([
      prisma.product.count({ where: { companyId } }),
      prisma.sale.count({ where: { companyId, fechaVenta: { gte: startOfMonth } } }),
    ]);

    res.json({
      plan: effectivePlan,
      planExpiresAt: company?.planExpiresAt || null,
      label: limits.label,
      products: { used: productCount, limit: limits.maxProducts },
      salesThisMonth: { used: salesThisMonth, limit: limits.maxSalesPerMonth },
    });
  } catch (error) {
    console.error('Error al obtener el estado del plan:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

const getGeneralStats = async (req, res) => {
  const companyId = req.companyId;
  try {
    const [productCount, clientCount, supplierCount] = await Promise.all([
      prisma.product.count({ where: { companyId } }),
      prisma.client.count({ where: { companyId } }),
      prisma.supplier.count({ where: { companyId } }),
    ]);

    res.json({
      productCount,
      clientCount,
      supplierCount,
    });
  } catch (error) {
    console.error('Error al obtener estadísticas generales:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

// Función para obtener el valor del inventario a costo (sin cambios de fecha aquí, es un snapshot actual)
const getInventoryValue = async (req, res) => {
  const companyId = req.companyId;
  try {
    const result = await prisma.$queryRaw`
      SELECT SUM(CAST(p."stock_actual" AS DECIMAL) * p."precio_compra") AS "totalInventoryCost", SUM(CAST(p."stock_actual" AS DECIMAL) * p."precio_venta") AS "totalInventoryValue"
      FROM productos AS p
      WHERE p."company_id" = ${companyId};
    `;

    const totalInventoryCost = result[0]?.totalInventoryCost || 0;
    const totalInventoryValue = result[0]?.totalInventoryValue || 0; // Si se necesita en el futuro

    res.json({
      valorTotalCosto: parseFloat(totalInventoryCost),
      valorTotalVenta: parseFloat(totalInventoryValue),
    });
  } catch (error) {
    console.error('Error al obtener el valor del inventario:', error);
    res.status(500).json({ error: 'Error interno del servidor al calcular el valor del inventario.' });
  }
};

// Función para obtener el reporte de ventas mensuales (ahora con filtro de fechas)
const getMonthlySales = async (req, res) => {
  const companyId = req.companyId;
  const { startDate, endDate } = req.query; // Obtener fechas de los query parameters

  let dateFilter = '';
  // Si startDate y endDate están presentes, construye la parte del filtro SQL
  if (startDate && endDate) {
    // Asegurarse de que las fechas sean válidas y estén en formato ISO para la consulta SQL
    const startIso = new Date(startDate).toISOString();
    const endIso = new Date(endDate).toISOString();
    dateFilter = `"fecha_venta" BETWEEN '${startIso}' AND '${endIso}' AND`;
  }

  try {
    // Usamos $queryRawUnsafe para construir la consulta dinámicamente con el filtro de fecha
    // y `$1` para el company_id para prevenir inyección SQL en ese parámetro
    const monthlySales = await prisma.$queryRawUnsafe(`
      SELECT
        TO_CHAR("fecha_venta", 'YYYY-MM') AS month,
        SUM(total) AS total
      FROM sales
      WHERE ${dateFilter} company_id = $1
      GROUP BY month
      ORDER BY month;
    `, companyId);

    const formattedSales = monthlySales.map(item => ({
      month: item.month,
      total: parseFloat(item.total),
    }));

    res.json(formattedSales);
  } catch (error) {
    console.error('Error al obtener el reporte de ventas mensuales:', error);
    res.status(500).json({ error: 'Error interno del servidor al obtener el reporte de ventas mensuales.' });
  }
};

// Función para obtener los productos más vendidos (ahora con filtro de fechas)
const getTopSellingProducts = async (req, res) => {
  const companyId = req.companyId;
  const { startDate, endDate } = req.query; // Obtener fechas de los query parameters

  let dateFilter = {};
  // Si startDate y endDate están presentes, construye el objeto de filtro para Prisma
  if (startDate && endDate) {
    dateFilter = {
      fechaVenta: {
        gte: new Date(startDate), // Greater than or equal to (mayor o igual que)
        lte: new Date(endDate),   // Less than or equal to (menor o igual que)
      },
    };
  }

  try {
    const topProducts = await prisma.saleItem.groupBy({
      by: ['productId'],
      where: {
        sale: {
          companyId: companyId,
          ...dateFilter, // Aplica el filtro de fechas aquí
        },
      },
      _sum: {
        cantidad: true,
      },
      orderBy: {
        _sum: {
          cantidad: 'desc',
        },
      },
      take: 5,
    });

    const productIds = topProducts.map(item => item.productId);
    const productsInfo = await prisma.product.findMany({
      where: {
        id: {
          in: productIds,
        },
      },
      select: {
        id: true,
        nombre: true,
        sku: true,
      },
    });

    const topSellingProductsWithNames = topProducts.map(item => {
      const product = productsInfo.find(p => p.id === item.productId);
      return {
        productId: item.productId,
        productName: product ? product.nombre : 'Producto Desconocido',
        productSku: product ? product.sku : 'N/A',
        totalQuantitySold: item._sum.cantidad || 0,
      };
    });

    res.json(topSellingProductsWithNames);
  } catch (error) {
    console.error('Error al obtener los productos más vendidos:', error);
    res.status(500).json({ error: 'Error interno del servidor al obtener los productos más vendidos.' });
  }
};

module.exports = {
  getGeneralStats,
  getInventoryValue,
  getMonthlySales,
  getTopSellingProducts,
  getPlanStatus,
};
