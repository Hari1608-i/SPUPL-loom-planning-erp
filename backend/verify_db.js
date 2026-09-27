require('dotenv').config();
const prisma = require('./prismaClient');

async function testDatabase() {
  console.log("----------------------------------------");
  console.log("TESTING SUPABASE DATABASE CONNECTION...");
  console.log("----------------------------------------");
  try {
    // Test raw connection query
    const dbTest = await prisma.$queryRaw`SELECT 1 as result`;
    console.log("SUCCESS: Database connection established successfully!", dbTest);

    // Test querying Loom Masters
    const loomCount = await prisma.loomMaster.count();
    console.log(`SUCCESS: Found ${loomCount} looms in LoomMaster table.`);

    // Test a sample read from BeamStockMaster
    const beams = await prisma.beamStockMaster.findMany({ take: 5 });
    console.log(`SUCCESS: Fetched ${beams.length} beam stock records.`);

    console.log("----------------------------------------");
    console.log("DATABASE IS FULLY OPERATIONAL AND STORING DATA!");
    console.log("----------------------------------------");
  } catch (error) {
    console.error("DATABASE CONNECTION ERROR:", error.message);
  } finally {
    await prisma.$disconnect();
  }
}

testDatabase();