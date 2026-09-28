require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT column_name, data_type, is_nullable
     FROM information_schema.columns
     WHERE table_name = 'PlannedAssignment'
       AND (column_name LIKE 'reserved_%' OR column_name LIKE '%beam%' OR column_name LIKE '%reed%')
     ORDER BY column_name`
  );
  console.table(rows);
  await prisma.$disconnect();
})();