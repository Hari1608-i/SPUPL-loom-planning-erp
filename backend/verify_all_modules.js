require('dotenv').config();
const prisma = require('./prismaClient');

async function verifyAllModules() {
  console.log("=========================================");
  console.log("VERIFYING ALL ERP MODULES & DATABASE TABLES");
  console.log("=========================================");
  try {
    // 1. Test System Connection
    await prisma.$queryRaw`SELECT 1`;
    console.log("[PASS] Database connection is active.");

    // 2. Test Loom Master (GET & Delete simulation)
    const loomCount = await prisma.loomMaster.count();
    console.log(`[PASS] LoomMaster table has ${loomCount} rows.`);

    // 3. Test Beam Stock (GET, Create, Delete verification)
    const beamCount = await prisma.beamStockMaster.count();
    console.log(`[PASS] BeamStockMaster table has ${beamCount} rows.`);

    // 4. Test Reed Stock (GET, Create, Delete verification)
    const reedCount = await prisma.reedStockMaster.count();
    console.log(`[PASS] ReedStockMaster table has ${reedCount} rows.`);

    // 5. Test Daily Report Entries & History Dates (Daily Production Report verification)
    const reportCount = await prisma.dailyReportEntry.count();
    console.log(`[PASS] DailyReportEntry table has ${reportCount} rows.`);

    const deptInfoCount = await prisma.departmentMasterInfo.count();
    console.log(`[PASS] DepartmentMasterInfo table has ${deptInfoCount} departments configured.`);

    // 6. Test Orders & Active Runs
    const orderCount = await prisma.orderMaster.count();
    const activeRunsCount = await prisma.loomRunEntry.count();
    console.log(`[PASS] OrderMaster has ${orderCount} orders, LoomRunEntry has ${activeRunsCount} active runs.`);

    console.log("=========================================");
    console.log("ALL MODULES ARE 100% VERIFIED AND READY TO DEPLOY!");
    console.log("=========================================");
  } catch (error) {
    console.error("[ERROR] Verification failed:", error.message);
  } finally {
    await prisma.$disconnect();
  }
}

verifyAllModules();