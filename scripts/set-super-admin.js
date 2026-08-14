// backend/scripts/set-super-admin.js
//
// Uso puntual y manual: convierte a un usuario existente en super_admin_sistema.
// Se corre con node directo (no npx prisma studio) para evitar el bug de
// Prisma Studio con versiones nuevas de Node.
//
// Ejemplo:
//   DATABASE_URL="postgresql://usuario:contraseña@host/db" node scripts/set-super-admin.js tu_nombre_de_usuario

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const username = process.argv[2];
  if (!username) {
    console.error('Uso: node scripts/set-super-admin.js <nombreUsuario>');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { nombreUsuario: username } });
  if (!user) {
    console.error(`No existe ningún usuario con nombreUsuario = "${username}" en esta base de datos.`);
    process.exit(1);
  }

  const updated = await prisma.user.update({
    where: { nombreUsuario: username },
    data: { rol: 'super_admin_sistema' },
  });

  console.log(`Listo: "${updated.nombreUsuario}" (id ${updated.id}) ahora tiene rol "${updated.rol}".`);
}

main()
  .catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
