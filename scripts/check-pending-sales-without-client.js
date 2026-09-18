// backend/scripts/check-pending-sales-without-client.js
//
// Diagnóstico de solo lectura (no modifica nada): antes del Bloque B, el
// cliente era opcional en cualquier venta. Este script cuenta cuántas
// ventas PENDIENTE/PARCIAL activas (no anuladas) ya existentes quedaron sin
// cliente, agrupadas por compañía — así se sabe qué tan grande es el hueco
// antes de decidir cómo cerrarlo (ver PATCH /api/sales/:id/cliente, que
// permite asignarle cliente a una venta existente desde el detalle).
//
// Uso:
//   DATABASE_URL="..." node scripts/check-pending-sales-without-client.js

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const ventasSinCliente = await prisma.sale.findMany({
    where: {
      estado: { not: 'ANULADA' },
      estadoPago: { in: ['PENDIENTE', 'PARCIAL'] },
      clientId: null,
    },
    select: {
      id: true,
      companyId: true,
      total: true,
      estadoPago: true,
      fechaVenta: true,
      company: { select: { nombre: true } },
    },
    orderBy: { companyId: 'asc' },
  });

  if (ventasSinCliente.length === 0) {
    console.log('Ninguna venta pendiente/parcial activa está sin cliente. No hay nada que corregir.');
    return;
  }

  const porCompania = new Map();
  for (const venta of ventasSinCliente) {
    const entry = porCompania.get(venta.companyId) || { nombre: venta.company.nombre, cantidad: 0, totalAdeudado: 0 };
    entry.cantidad += 1;
    entry.totalAdeudado += Number(venta.total);
    porCompania.set(venta.companyId, entry);
  }

  console.log(`${ventasSinCliente.length} venta(s) PENDIENTE/PARCIAL sin cliente, en ${porCompania.size} compañía(s):\n`);
  for (const [companyId, { nombre, cantidad, totalAdeudado }] of porCompania) {
    console.log(`  Compañía #${companyId} (${nombre}): ${cantidad} venta(s), $${totalAdeudado.toLocaleString('es-CO')} sin cliente asignado`);
  }
  console.log('\nSe pueden corregir una por una desde el detalle de la venta en el frontend (asigna un cliente existente o crea uno nuevo), sin tocar la base de datos directamente.');
}

main()
  .catch((err) => {
    console.error('Error al revisar ventas sin cliente:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
