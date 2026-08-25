const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash('admin123', 10);
  await prisma.user.update({
    where: { username: 'admin' },
    data: { password_hash: hash }
  });
  console.log('Password reset to admin123');
}

main().catch(console.error).finally(() => prisma.$disconnect());
