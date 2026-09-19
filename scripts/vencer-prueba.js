// backend/scripts/vencer-prueba.js
//
// Solo para PROBAR el modo solo lectura sin esperar a que termine la prueba
// gratis: deja la prueba de UNA compañía como vencida desde ayer, así su cuenta
// pasa a solo lectura. Para revertirlo, un super admin le asigna un plan desde
// el panel de compañías.
//
// Por seguridad: solo actúa sobre compañías en plan LANZAMIENTO, muestra a cuál
// va a afectar, y por defecto NO cambia nada (--ejecutar para aplicar). Úsalo
// únicamente contra STAGING o una compañía de prueba.
//
// Uso:
//   DATABASE_URL="..." node scripts/vencer-prueba.js <companyId>               (solo muestra)
//   DATABASE_URL="..." node scripts/vencer-prueba.js <companyId> --ejecutar    (aplica)

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const companyId = parseInt(process.argv[2], 10);
  const ejecutar = process.argv.includes('--ejecutar');

  if (!Number.isInteger(companyId)) {
    console.error('Falta el id de la compañía. Uso: node scripts/vencer-prueba.js <companyId> [--ejecutar]');
    process.exit(1);
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, nombre: true, plan: true, planExpiresAt: true, esInterna: true },
  });

  if (!company) {
    console.error(`No existe la compañía ${companyId}.`);
    process.exit(1);
  }

  console.log(`Compañía ${company.id}: "${company.nombre}" — plan ${company.plan}, vence ${company.planExpiresAt ? company.planExpiresAt.toISOString() : 'nunca'}`);

  if (company.esInterna) {
    console.error('Es una compañía interna de Tyndall: no se toca.');
    process.exit(1);
  }
  if (company.plan !== 'LANZAMIENTO') {
    console.error(`Solo se puede vencer la prueba de una compañía en plan LANZAMIENTO (esta está en ${company.plan}).`);
    process.exit(1);
  }

  const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000);

  if (!ejecutar) {
    console.log(`Simulación: su prueba pasaría a vencer el ${ayer.toISOString()} y la cuenta quedaría en SOLO LECTURA. Agrega --ejecutar para aplicarlo.`);
    return;
  }

  await prisma.company.update({ where: { id: companyId }, data: { planExpiresAt: ayer } });
  console.log('Listo: la prueba quedó vencida. La cuenta está en solo lectura (se ve en la siguiente petición).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
