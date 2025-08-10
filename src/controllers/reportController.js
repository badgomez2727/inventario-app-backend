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

const getInventoryValue = async (req, res) => {
  const companyId = req.companyId;
  try {
    const inventoryValueResult = await prisma.product.aggregate({
      where: { companyId },
      _sum: {
        stockActual: true,
        precioCompra: true,
      },
    });

    // Asegúrate de que los valores no sean nulos antes de multiplicar
    const totalStock = inventoryValueResult._sum.stockActual || 0;
    const totalPrecioCompra = inventoryValueResult._sum.precioCompra ? parseFloat(inventoryValueResult._sum.precioCompra.toString()) : 0; // Convertir Decimal a float

    const valorTotalCosto = (totalStock * totalPrecioCompra).toFixed(2);

    res.json({
      valorTotalCosto: parseFloat(valorTotalCosto),
    });
  } catch (error) {
    console.error('Error al obtener el valor del inventario:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
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

module.exports = {
  getGeneralStats,
  getInventoryValue,
  getMonthlySales,
};
