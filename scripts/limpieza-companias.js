// backend/scripts/limpieza-companias.js
//
// Borra TODAS las compañías excepto las que se pasen explícitamente en
// --keep y cualquier compañía marcada esInterna=true (la de Tyndall, ver
// crear-compania-interna.js — así nunca hay que acordarse de su id a mano).
//
// Por defecto corre en modo --dry-run (solo cuenta, no borra nada). Borrar
// de verdad requiere --ejecutar explícito.
//
// Se niega a correr contra cualquier base que no "parezca" ser la rama
// staging de Neon, salvo que se pase --produccion explícitamente (misma
// protección que crear-compania-interna.js). Nunca imprime DATABASE_URL.
//
// Uso:
//   node scripts/limpieza-companias.js --keep=11                       (dry-run, staging)
//   node scripts/limpieza-companias.js --keep=11 --ejecutar            (borra de verdad, staging)
//   node scripts/limpieza-companias.js --keep=11 --produccion          (dry-run, producción)
//   node scripts/limpieza-companias.js --keep=11 --ejecutar --produccion  (borra de verdad, producción)

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const STAGING_HOST_HINT = 'ep-bold-wind-aysg1akn';

function parseArgs() {
  const args = process.argv.slice(2);
  const keepArg = args.find((a) => a.startsWith('--keep='));
  const keepIds = keepArg
    ? keepArg.replace('--keep=', '').split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n))
    : [];
  return {
    keepIdsExplicit: keepIds,
    ejecutar: args.includes('--ejecutar'),
    produccion: args.includes('--produccion'),
  };
}

function verificarDestino(produccion) {
  const dbUrl = process.env.DATABASE_URL || '';
  const pareceStaging = dbUrl.includes(STAGING_HOST_HINT);
  if (!pareceStaging && !produccion) {
    console.error(
      'ABORTADO: DATABASE_URL no parece ser la rama "staging" de Neon.\n' +
      'Si de verdad quieres correr esto contra otra base (ej. producción),\n' +
      'agrega --produccion explícitamente. No se imprime la URL por seguridad.'
    );
    process.exit(1);
  }
  if (produccion) {
    console.log('⚠️  Corriendo con --produccion: se asume intencional contra la base de PRODUCCIÓN.');
  }
}

async function contarPorCompania(companyIds) {
  const conteos = {};
  for (const id of companyIds) {
    const [productos, ventas, clientes, proveedores, usuarios, movimientos, changelogs] = await Promise.all([
      prisma.product.count({ where: { companyId: id } }),
      prisma.sale.count({ where: { companyId: id } }),
      prisma.client.count({ where: { companyId: id } }),
      prisma.supplier.count({ where: { companyId: id } }),
      prisma.user.count({ where: { companyId: id } }),
      prisma.stockMovement.count({ where: { companyId: id } }),
      prisma.productChangeLog.count({ where: { companyId: id } }),
    ]);
    conteos[id] = { productos, ventas, clientes, proveedores, usuarios, movimientos, changelogs };
  }
  return conteos;
}

async function verificarHuerfanos(companyIdsSobrevivientes) {
  const saleIdsSobrevivientes = (await prisma.sale.findMany({ select: { id: true } })).map((s) => s.id);

  const [saleItemsHuerfanos, stockMovHuerfanos, changeLogHuerfanos, salesHuerfanas, productosHuerfanos, clientesHuerfanos, proveedoresHuerfanos, usuariosHuerfanos] =
    await Promise.all([
      prisma.saleItem.count({ where: { saleId: { notIn: saleIdsSobrevivientes.length ? saleIdsSobrevivientes : [-1] } } }),
      prisma.stockMovement.count({ where: { companyId: { notIn: companyIdsSobrevivientes } } }),
      prisma.productChangeLog.count({ where: { companyId: { notIn: companyIdsSobrevivientes } } }),
      prisma.sale.count({ where: { companyId: { notIn: companyIdsSobrevivientes } } }),
      prisma.product.count({ where: { companyId: { notIn: companyIdsSobrevivientes } } }),
      prisma.client.count({ where: { companyId: { notIn: companyIdsSobrevivientes } } }),
      prisma.supplier.count({ where: { companyId: { notIn: companyIdsSobrevivientes } } }),
      prisma.user.count({ where: { companyId: { notIn: companyIdsSobrevivientes } } }),
    ]);

  const total = saleItemsHuerfanos + stockMovHuerfanos + changeLogHuerfanos + salesHuerfanas + productosHuerfanos + clientesHuerfanos + proveedoresHuerfanos + usuariosHuerfanos;
  return {
    total,
    detalle: { saleItemsHuerfanos, stockMovHuerfanos, changeLogHuerfanos, salesHuerfanas, productosHuerfanos, clientesHuerfanos, proveedoresHuerfanos, usuariosHuerfanos },
  };
}

async function main() {
  const { keepIdsExplicit, ejecutar, produccion } = parseArgs();
  verificarDestino(produccion);

  if (keepIdsExplicit.length === 0) {
    console.error('Uso: node scripts/limpieza-companias.js --keep=<id1,id2,...> [--ejecutar] [--produccion]');
    process.exit(1);
  }

  const companiasInternas = await prisma.company.findMany({ where: { esInterna: true }, select: { id: true, nombre: true } });
  const keepIds = Array.from(new Set([...keepIdsExplicit, ...companiasInternas.map((c) => c.id)]));

  const todasLasCompanias = await prisma.company.findMany({ select: { id: true, nombre: true } });
  const companiasABorrar = todasLasCompanias.filter((c) => !keepIds.includes(c.id));
  const idsABorrar = companiasABorrar.map((c) => c.id);

  console.log(`Modo: ${ejecutar ? 'EJECUTAR (borra de verdad)' : 'DRY-RUN (solo cuenta, no borra nada)'}`);
  console.log(`Compañías a conservar (${keepIds.length}): ${keepIds.join(', ')}`);
  companiasInternas.forEach((c) => console.log(`  - id ${c.id} "${c.nombre}" (esInterna=true, protegida automáticamente)`));
  console.log(`Compañías a borrar (${idsABorrar.length}): ${idsABorrar.join(', ') || '(ninguna)'}`);

  if (idsABorrar.length === 0) {
    console.log('Nada que borrar.');
    return;
  }

  const conteosABorrar = await contarPorCompania(idsABorrar);
  console.log('\nConteos de lo que se borraría por compañía:');
  for (const c of companiasABorrar) {
    console.log(`  id ${c.id} "${c.nombre}":`, JSON.stringify(conteosABorrar[c.id]));
  }
  const totales = Object.values(conteosABorrar).reduce(
    (acc, c) => ({
      productos: acc.productos + c.productos,
      ventas: acc.ventas + c.ventas,
      clientes: acc.clientes + c.clientes,
      proveedores: acc.proveedores + c.proveedores,
      usuarios: acc.usuarios + c.usuarios,
      movimientos: acc.movimientos + c.movimientos,
      changelogs: acc.changelogs + c.changelogs,
    }),
    { productos: 0, ventas: 0, clientes: 0, proveedores: 0, usuarios: 0, movimientos: 0, changelogs: 0 }
  );
  console.log('\nTotales a borrar:', JSON.stringify(totales));

  const conteosAntesDeLasQueQuedan = await contarPorCompania(keepIds.filter((id) => !companiasInternas.some((c) => c.id === id)));

  if (!ejecutar) {
    console.log('\nDRY-RUN: no se borró nada. Corre de nuevo con --ejecutar para aplicar.');
    return;
  }

  const saleIdsABorrar = (await prisma.sale.findMany({ where: { companyId: { in: idsABorrar } }, select: { id: true } })).map((s) => s.id);
  const userIdsABorrar = (await prisma.user.findMany({ where: { companyId: { in: idsABorrar } }, select: { id: true } })).map((u) => u.id);

  console.log('\nBorrando en una sola transacción...');
  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({ where: { userId: { in: userIdsABorrar.length ? userIdsABorrar : [-1] } } }),
    prisma.saleItem.deleteMany({ where: { saleId: { in: saleIdsABorrar.length ? saleIdsABorrar : [-1] } } }),
    prisma.stockMovement.deleteMany({ where: { companyId: { in: idsABorrar } } }),
    prisma.productChangeLog.deleteMany({ where: { companyId: { in: idsABorrar } } }),
    prisma.sale.deleteMany({ where: { companyId: { in: idsABorrar } } }),
    prisma.product.deleteMany({ where: { companyId: { in: idsABorrar } } }),
    prisma.client.deleteMany({ where: { companyId: { in: idsABorrar } } }),
    prisma.supplier.deleteMany({ where: { companyId: { in: idsABorrar } } }),
    prisma.user.deleteMany({ where: { companyId: { in: idsABorrar } } }),
    prisma.company.deleteMany({ where: { id: { in: idsABorrar } } }),
  ]);
  console.log('Borrado completo.');

  const companyIdsSobrevivientes = (await prisma.company.findMany({ select: { id: true } })).map((c) => c.id);
  const huerfanos = await verificarHuerfanos(companyIdsSobrevivientes);
  console.log('\nVerificación de huérfanos:', huerfanos.total === 0 ? 'OK, ninguno.' : '¡ATENCIÓN, hay huérfanos!');
  console.log(JSON.stringify(huerfanos.detalle));

  const conteosDespuesDeLasQueQuedan = await contarPorCompania(keepIds.filter((id) => !companiasInternas.some((c) => c.id === id)));
  console.log('\nVerificación de que las compañías conservadas no cambiaron:');
  for (const id of Object.keys(conteosAntesDeLasQueQuedan)) {
    const antes = JSON.stringify(conteosAntesDeLasQueQuedan[id]);
    const despues = JSON.stringify(conteosDespuesDeLasQueQuedan[id]);
    console.log(`  id ${id}: ${antes === despues ? 'OK, sin cambios' : `¡CAMBIÓ! antes=${antes} despues=${despues}`}`);
  }
}

main()
  .catch((err) => {
    console.error('Error:', err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
