// venta_inventario_app/backend/src/controllers/reportController.js

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

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

// Función corregida para obtener el valor del inventario a costo
const getInventoryValue = async (req, res) => {
  const companyId = req.companyId;
  try {
    // Consulta SQL RAW para sumar (stockActual * precioCompra) para cada producto
    const result = await prisma.$queryRaw`
      SELECT SUM(CAST(p."stock_actual" AS DECIMAL) * p."precio_compra") AS "totalInventoryCost"
      FROM productos AS p
      WHERE p."company_id" = ${companyId};
    `;

    // Prisma $queryRaw devuelve un array de objetos. El resultado está en el primer objeto.
    const totalInventoryCost = result[0]?.totalInventoryCost || 0;

    res.json({
      valorTotalCosto: parseFloat(totalInventoryCost), // Asegurarse de que sea un número flotante
    });
  } catch (error) {
    console.error('Error al obtener el valor del inventario:', error);
    res.status(500).json({ error: 'Error interno del servidor al calcular el valor del inventario.' });
  }
};

const getMonthlySales = async (req, res) => {
  const companyId = req.companyId;
  try {
    const monthlySales = await prisma.$queryRaw`
      SELECT
        TO_CHAR("fecha_venta", 'YYYY-MM') AS month, -- <-- CAMBIO AQUÍ: Usamos TO_CHAR para PostgreSQL
        SUM(total) AS total
      FROM sales
      WHERE company_id = ${companyId}
      GROUP BY month
      ORDER BY month;
    `;
    
    const formattedSales = monthlySales.map(item => ({
      month: item.month,
      total: parseFloat(item.total),
    }));

    res.json(formattedSales);
  } catch (error) {
    console.error('Error al obtener el reporte de ventas mensuales:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

// Función para obtener los productos más vendidos (sin cambios aquí)
const getTopSellingProducts = async (req, res) => {
  const companyId = req.companyId;
  try {
    const topProducts = await prisma.saleItem.groupBy({
      by: ['productId'],
      where: {
        sale: {
          companyId: companyId,
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
      take: 5, // Top 5 productos
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
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

module.exports = {
  getGeneralStats,
  getInventoryValue, // <-- Función corregida
  getMonthlySales,
  getTopSellingProducts,
};
