// backend/scripts/check-latest-pedidos.js
//
// Diagnóstico de solo lectura: muestra los pedidos más recientes del
// catálogo público (cualquier compañía), con su cliente e ítems. Útil para
// confirmar que un pedido de prueba sí quedó guardado, sin esperar al
// panel de administración (Bloque 1 parte 5).
//
// Uso:
//   DATABASE_URL="..." node scripts/check-latest-pedidos.js [cantidad]
//   (cantidad es opcional, por defecto 5)

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const cantidad = parseInt(process.argv[2], 10) || 5;

  const pedidos = await prisma.pedido.findMany({
    take: cantidad,
    orderBy: { fechaPedido: 'desc' },
    include: {
      company: { select: { nombre: true } },
      client: { select: { nombre: true, telefono: true } },
      items: { include: { product: { select: { nombre: true } } } },
    },
  });

  if (pedidos.length === 0) {
    console.log('No hay ningún pedido registrado todavía.');
    return;
  }

  for (const pedido of pedidos) {
    console.log(`\nPedido #${pedido.id} — ${pedido.estado}`);
    console.log(`  Compañía: ${pedido.company.nombre}`);
    console.log(`  Cliente: ${pedido.client.nombre} (${pedido.client.telefono})`);
    console.log(`  Entrega: ${pedido.tipoEntrega}${pedido.direccionEntrega ? ` — ${pedido.direccionEntrega}` : ''}`);
    console.log(`  Fecha: ${pedido.fechaPedido.toLocaleString('es-CO')}`);
    console.log(`  Total: $${Number(pedido.total).toLocaleString('es-CO')}`);
    console.log('  Ítems:');
    for (const item of pedido.items) {
      console.log(`    - ${item.cantidad}x ${item.product.nombre} ($${Number(item.subtotal).toLocaleString('es-CO')})`);
    }
  }
}

main()
  .catch((err) => {
    console.error('Error al consultar pedidos:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
