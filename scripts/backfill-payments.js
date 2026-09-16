// backend/scripts/backfill-payments.js
//
// Migración de datos para el módulo de pagos: antes de este módulo, una
// venta solo tenía dos estados posibles (PAGADA o PENDIENTE) y ningún
// registro de pagos. Este script crea el primer pago histórico para las
// ventas que ya estaban en estadoPago='PAGADA' (un pago por el total, con
// la fecha original de la venta, metodo OTRO y nota "Registro previo a
// módulo de pagos"). Las ventas PENDIENTE quedan sin pagos — el estado
// derivado (sin pagos activos = PENDIENTE) sigue coincidiendo.
//
// Por defecto corre en modo --dry-run (solo cuenta, no crea nada). Aplicar
// de verdad requiere --ejecutar explícito.
//
// Al final verifica, para el 100% de las ventas de la base, que el estado
// derivado de sus pagos activos (PENDIENTE/PARCIAL/PAGADA) coincide con el
// estadoPago guardado, y muestra el conteo. Nunca imprime DATABASE_URL.
//
// Uso:
//   node scripts/backfill-payments.js                          (dry-run, staging o local)
//   node scripts/backfill-payments.js --ejecutar                (aplica, staging o local)
//   node scripts/backfill-payments.js --ejecutar --produccion   (aplica, producción)

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const STAGING_HOST_HINT = 'ep-bold-wind-aysg1akn';
const NOTA_MIGRACION = 'Registro previo a módulo de pagos';

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    ejecutar: args.includes('--ejecutar'),
    produccion: args.includes('--produccion'),
  };
}

function verificarDestino(produccion) {
  const dbUrl = process.env.DATABASE_URL || '';
  const pareceStaging = dbUrl.includes(STAGING_HOST_HINT);
  const esLocal = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1');
  if (!pareceStaging && !esLocal && !produccion) {
    console.error(
      'ABORTADO: DATABASE_URL no parece ser la rama "staging" de Neon ni una base local.\n' +
      'Si de verdad quieres correr esto contra otra base (ej. producción),\n' +
      'agrega --produccion explícitamente. No se imprime la URL por seguridad.'
    );
    process.exit(1);
  }
  if (produccion) {
    console.log('⚠️  Corriendo con --produccion: se asume intencional contra la base de PRODUCCIÓN.');
  }
}

// Los montos son pesos con hasta 2 decimales; se comparan en centavos
// (enteros) para no arrastrar errores de punto flotante.
const toCents = (value) => Math.round(Number(value) * 100);

function calcularEstadoPago(totalCents, pagadoCents) {
  if (pagadoCents <= 0) return 'PENDIENTE';
  if (pagadoCents >= totalCents) return 'PAGADA';
  return 'PARCIAL';
}

async function verificar() {
  const todasLasVentas = await prisma.sale.findMany({
    select: {
      id: true,
      total: true,
      estadoPago: true,
      payments: { where: { anulado: false }, select: { monto: true } },
    },
  });

  let coinciden = 0;
  const discrepancias = [];
  for (const sale of todasLasVentas) {
    const totalCents = toCents(sale.total);
    const pagadoCents = sale.payments.reduce((sum, p) => sum + toCents(p.monto), 0);
    const estadoDerivado = calcularEstadoPago(totalCents, pagadoCents);
    if (estadoDerivado === sale.estadoPago) {
      coinciden++;
    } else {
      discrepancias.push({ saleId: sale.id, estadoGuardado: sale.estadoPago, estadoDerivado });
    }
  }

  console.log(`\nVerificación: ${coinciden}/${todasLasVentas.length} ventas con estado coincidente.`);
  if (discrepancias.length > 0) {
    console.log('Discrepancias encontradas:', JSON.stringify(discrepancias, null, 2));
  } else {
    console.log('100% de las ventas coinciden con su estado derivado. ✅');
  }
  return { total: todasLasVentas.length, coinciden, discrepancias };
}

async function main() {
  const { ejecutar, produccion } = parseArgs();
  verificarDestino(produccion);

  const totalVentas = await prisma.sale.count();
  console.log(`Modo: ${ejecutar ? 'EJECUTAR (crea pagos de verdad)' : 'DRY-RUN (solo cuenta, no crea nada)'}`);
  console.log(`Total de ventas en la base: ${totalVentas}`);

  // Ventas PAGADA que todavía no tienen ningún pago (nunca pasaron por este
  // backfill ni por el módulo de pagos nuevo).
  const ventasPagadaSinPagos = await prisma.sale.findMany({
    where: { estadoPago: 'PAGADA', payments: { none: {} } },
    select: { id: true, companyId: true, userId: true, total: true, fechaVenta: true },
  });

  console.log(`Ventas PAGADA sin pagos registrados (a migrar): ${ventasPagadaSinPagos.length}`);

  if (!ejecutar) {
    console.log('\nDRY-RUN: no se creó ningún pago. Corre de nuevo con --ejecutar para aplicar.');
    console.log('(La verificación de abajo va a mostrar como "discrepancia" cada venta PAGADA que aún no tiene pago — eso es justo lo que --ejecutar corrige.)');
  } else if (ventasPagadaSinPagos.length > 0) {
    const { count } = await prisma.payment.createMany({
      data: ventasPagadaSinPagos.map((sale) => ({
        saleId: sale.id,
        companyId: sale.companyId,
        userId: sale.userId,
        monto: sale.total,
        fecha: sale.fechaVenta,
        metodo: 'OTRO',
        nota: NOTA_MIGRACION,
      })),
    });
    console.log(`Pagos creados: ${count}`);
  } else {
    console.log('Nada que migrar.');
  }

  await verificar();
}

main()
  .catch((err) => {
    console.error('Error:', err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
