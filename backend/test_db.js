const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  try {
    await prisma.$connect();
    console.log('Database Connected Successfully!');
    
    const tables = ['OrderMaster', 'PlannedAssignment', 'LoomMaster', 'BeamStockMaster', 'ReedStockMaster', 'User', 'ErpAlert'];
    for (const t of tables) {
      const modelName = t.charAt(0).toLowerCase() + t.slice(1);
      const count = await prisma[modelName].count();
      console.log('Table ' + t + ': ' + count + ' records');
    }
    
    console.log('ALL MODULES AND TABLES VERIFIED SUCCESSFULLY!');
  } catch (e) {
    console.error('Connection/Query Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

test();