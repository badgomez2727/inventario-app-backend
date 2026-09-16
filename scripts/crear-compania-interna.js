// backend/scripts/crear-compania-interna.js
//
// Crea (o reutiliza si ya existe) la compañía interna de Tyndall — la que
// aloja el super_admin_sistema real y una cuenta demo — marcada con
// esInterna=true para que el script de limpieza (limpieza-companias.js)
// nunca la borre, sin depender de recordar su id a mano.
//
// Los dos usuarios se crean con una contraseña aleatoria que esta consola
// NUNCA muestra: la única forma de entrar es "olvidé mi contraseña" desde
// el login. Si un usuario ya existe, no se le toca la contraseña (para no
// invalidar un cambio que ya haya hecho la persona dueña de esa cuenta).
//
// Uso:
//   SUPERADMIN_EMAIL=... DEMO_EMAIL=... \
//   DATABASE_URL="postgresql://...staging..." \
//   node scripts/crear-compania-interna.js
//
// Contra producción, agregar --produccion al final (confirmación explícita
// de que sabes que NO es la base de staging):
//   SUPERADMIN_EMAIL=... DEMO_EMAIL=... DATABASE_URL="...produccion..." \
//   node scripts/crear-compania-interna.js --produccion

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const NOMBRE_COMPANIA_INTERNA = 'TyndallCore';
const EMAIL_CONTACTO_INTERNA = 'interno@tyndallcore.com';

// Fragmento del host de la rama "staging" de Neon (ver README) — sirve solo
// para frenar por accidente una corrida contra la base equivocada; no es un
// secreto, no revela credenciales.
const STAGING_HOST_HINT = 'ep-bold-wind-aysg1akn';

function verificarDestino() {
  const dbUrl = process.env.DATABASE_URL || '';
  const esProduccionForzada = process.argv.includes('--produccion');
  const pareceStaging = dbUrl.includes(STAGING_HOST_HINT);

  if (!pareceStaging && !esProduccionForzada) {
    console.error(
      'ABORTADO: DATABASE_URL no parece ser la rama "staging" de Neon.\n' +
      'Si de verdad quieres correr esto contra otra base (ej. producción),\n' +
      'agrega --produccion explícitamente. No se imprime la URL por seguridad.'
    );
    process.exit(1);
  }
  if (esProduccionForzada) {
    console.log('⚠️  Corriendo con --produccion: se asume intencional contra la base de PRODUCCIÓN.');
  }
}

async function upsertUsuarioInterno({ companyId, nombreUsuario, email, rol }) {
  const existente = await prisma.user.findUnique({ where: { email } });
  if (existente) {
    const actualizado = await prisma.user.update({
      where: { id: existente.id },
      data: { companyId, rol, activo: true, nombreUsuario },
    });
    console.log(`✓ Usuario ya existía, actualizado: ${actualizado.nombreUsuario} <${actualizado.email}> [${actualizado.rol}] (contraseña sin tocar)`);
    return actualizado;
  }

  const passwordAleatoria = crypto.randomBytes(24).toString('hex');
  const hashed = await bcrypt.hash(passwordAleatoria, 10);
  const creado = await prisma.user.create({
    data: { companyId, nombreUsuario, email, password: hashed, rol, activo: true },
  });
  console.log(`✓ Usuario creado: ${creado.nombreUsuario} <${creado.email}> [${creado.rol}] — usa "olvidé mi contraseña" para entrar.`);
  return creado;
}

async function main() {
  verificarDestino();

  const superadminEmail = process.env.SUPERADMIN_EMAIL;
  const demoEmail = process.env.DEMO_EMAIL;
  if (!superadminEmail || !demoEmail) {
    console.error('Uso: SUPERADMIN_EMAIL=... DEMO_EMAIL=... node scripts/crear-compania-interna.js [--produccion]');
    process.exit(1);
  }

  const company = await prisma.company.upsert({
    where: { nombre: NOMBRE_COMPANIA_INTERNA },
    update: { esInterna: true, activo: true },
    create: {
      nombre: NOMBRE_COMPANIA_INTERNA,
      emailContacto: EMAIL_CONTACTO_INTERNA,
      esInterna: true,
      activo: true,
    },
  });
  console.log(`✓ Compañía interna: "${company.nombre}" (id ${company.id}, esInterna=${company.esInterna})`);

  await upsertUsuarioInterno({
    companyId: company.id,
    nombreUsuario: 'tyndall_admin',
    email: superadminEmail,
    rol: 'super_admin_sistema',
  });

  await upsertUsuarioInterno({
    companyId: company.id,
    nombreUsuario: 'tyndall_demo',
    email: demoEmail,
    rol: 'admin_compania',
  });

  console.log('\nListo. Ningún password se imprimió — recupera acceso con "olvidé mi contraseña" en el login.');
}

main()
  .catch((err) => {
    console.error('Error:', err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
