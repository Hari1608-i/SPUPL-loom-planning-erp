const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function clearTestData() {
  console.log('--- Clearing test operational entries (Keeping LoomMaster & OrderMaster) ---');

  try {
    // Delete operational runtime logs and assignments
    const deletedLoomRun = await prisma.loomRunEntry.deleteMany({});
    console.log(`Cleared LoomRunEntry: ${deletedLoomRun.count} records`);

    const deletedDailyLog = await prisma.dailyProductionLog.deleteMany({});
    console.log(`Cleared DailyProductionLog: ${deletedDailyLog.count} records`);

    const deletedRunoutLog = await prisma.runoutHistoryLog.deleteMany({});
    console.log(`Cleared RunoutHistoryLog: ${deletedRunoutLog.count} records`);

    const deletedPlannedAss = await prisma.plannedAssignment.deleteMany({});
    console.log(`Cleared PlannedAssignment: ${deletedPlannedAss.count} records`);

    const deletedBeamReq = await prisma.beamRequirement.deleteMany({});
    console.log(`Cleared BeamRequirement: ${deletedBeamReq.count} records`);

    const deletedBeamPrep = await prisma.beamPreparationRequest.deleteMany({});
    console.log(`Cleared BeamPreparationRequest: ${deletedBeamPrep.count} records`);

    const deletedBeamStockM = await prisma.beamStockMaster.deleteMany({});
    console.log(`Cleared BeamStockMaster: ${deletedBeamStockM.count} records`);

    const deletedBeamHist = await prisma.beamHistory.deleteMany({});
    console.log(`Cleared BeamHistory: ${deletedBeamHist.count} records`);

    const deletedBeamStock = await prisma.beamStock.deleteMany({});
    console.log(`Cleared BeamStock: ${deletedBeamStock.count} records`);

    const deletedWarpHist = await prisma.completedWarpHistory.deleteMany({});
    console.log(`Cleared CompletedWarpHistory: ${deletedWarpHist.count} records`);

    const deletedOrderCompHist = await prisma.orderCompletionHistory.deleteMany({});
    console.log(`Cleared OrderCompletionHistory: ${deletedOrderCompHist.count} records`);

    const deletedReedReq = await prisma.reedRequirement.deleteMany({});
    console.log(`Cleared ReedRequirement: ${deletedReedReq.count} records`);

    const deletedYarnConf = await prisma.yarnConfirmation.deleteMany({});
    console.log(`Cleared YarnConfirmation: ${deletedYarnConf.count} records`);

    const deletedSizingConf = await prisma.sizingConfirmation.deleteMany({});
    console.log(`Cleared SizingConfirmation: ${deletedSizingConf.count} records`);

    const deletedErpAlert = await prisma.erpAlert.deleteMany({});
    console.log(`Cleared ErpAlert: ${deletedErpAlert.count} records`);

    const deletedDelayRec = await prisma.delayRecord.deleteMany({});
    console.log(`Cleared DelayRecord: ${deletedDelayRec.count} records`);

    const deletedAllocAudit = await prisma.allocationAuditLog.deleteMany({});
    console.log(`Cleared AllocationAuditLog: ${deletedAllocAudit.count} records`);

    const deletedRecomHist = await prisma.recommendationHistory.deleteMany({});
    console.log(`Cleared RecommendationHistory: ${deletedRecomHist.count} records`);

    const deletedSysAudit = await prisma.systemAuditLog.deleteMany({});
    console.log(`Cleared SystemAuditLog: ${deletedSysAudit.count} records`);

    // Reset ReedStockMaster reserved & running quantities back to 0
    await prisma.reedStockMaster.updateMany({
      data: {
        reserved_qty: 0,
        running_qty: 0,
        available_qty: 1,
        status: 'Available',
        reserved_for_loom: null,
        reserved_for_order: null,
        reserved_for_design: null
      }
    });
    console.log('Reset ReedStockMaster reserved/running statuses to Available');

    // Reset all LoomMaster statuses back to Available since no loom is currently running
    await prisma.loomMaster.updateMany({
      data: {
        status: 'Available'
      }
    });
    console.log('Reset all LoomMaster statuses to Available');

    // Count remaining records to confirm LoomMaster and OrderMaster are preserved
    const loomCount = await prisma.loomMaster.count();
    const orderCount = await prisma.orderMaster.count();
    console.log(`\nPRESERVED RECORDS:`);
    console.log(`- LoomMaster: ${loomCount} looms preserved`);
    console.log(`- OrderMaster: ${orderCount} orders preserved`);

  } catch (error) {
    console.error('Error clearing test data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

clearTestData();
