const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function resetData() {
  console.log('========================================================');
  console.log('STARTING CONTROLLED TRANSACTION DATA RESET');
  console.log('========================================================');

  // 1. Delete all transactional / entry records
  const deleteCounts = {};

  deleteCounts.LoomRunEntry = (await prisma.loomRunEntry.deleteMany({})).count;
  deleteCounts.PlannedAssignment = (await prisma.plannedAssignment.deleteMany({})).count;
  deleteCounts.BeamStockMaster = (await prisma.beamStockMaster.deleteMany({})).count;
  deleteCounts.BeamStock = (await prisma.beamStock.deleteMany({})).count;
  deleteCounts.BeamRequirement = (await prisma.beamRequirement.deleteMany({})).count;
  deleteCounts.BeamHistory = (await prisma.beamHistory.deleteMany({})).count;
  deleteCounts.BeamPreparationRequest = (await prisma.beamPreparationRequest.deleteMany({})).count;
  deleteCounts.ReedStockMaster = (await prisma.reedStockMaster.deleteMany({})).count;
  deleteCounts.ReedRequirement = (await prisma.reedRequirement.deleteMany({})).count;
  deleteCounts.YarnConfirmation = (await prisma.yarnConfirmation.deleteMany({})).count;
  deleteCounts.SizingConfirmation = (await prisma.sizingConfirmation.deleteMany({})).count;
  deleteCounts.CompletedWarpHistory = (await prisma.completedWarpHistory.deleteMany({})).count;
  deleteCounts.OrderCompletionHistory = (await prisma.orderCompletionHistory.deleteMany({})).count;
  deleteCounts.DailyProductionLog = (await prisma.dailyProductionLog.deleteMany({})).count;
  deleteCounts.RunoutHistoryLog = (await prisma.runoutHistoryLog.deleteMany({})).count;
  deleteCounts.RecommendationHistory = (await prisma.recommendationHistory.deleteMany({})).count;
  deleteCounts.AllocationAuditLog = (await prisma.allocationAuditLog.deleteMany({})).count;
  deleteCounts.ErpAlert = (await prisma.erpAlert.deleteMany({})).count;
  deleteCounts.DelayRecord = (await prisma.delayRecord.deleteMany({})).count;
  deleteCounts.SystemAuditLog = (await prisma.systemAuditLog.deleteMany({})).count;
  deleteCounts.LoginHistory = (await prisma.loginHistory.deleteMany({})).count;

  // 2. Reset LoomMaster status to 'Available' across all looms while preserving 100% of master specs & weave capabilities
  await prisma.loomMaster.updateMany({
    data: {
      status: 'Available'
    }
  });

  // 3. Reset OrderMaster tracking & status fields while preserving 100% of master order records
  await prisma.orderMaster.updateMany({
    data: {
      produced_qty: 0,
      short_excess_qty: 0,
      current_beam_planned: 0,
      beam_prepared: 0,
      warp_confirmed_qty: 0,
      warp_balance_qty: 0,
      planning_status: 'Planning Pending',
      beam_status: 'BEAM NOT AVAILABLE',
      status: 'APPROVED',
      order_completion_status: 'ACTIVE',
      actual_completion_date: null,
      completion_remarks: null,
      completed_by: null
    }
  });

  console.log('\n--- DELETED TRANSACTION RECORD COUNTS ---');
  for (const [table, count] of Object.entries(deleteCounts)) {
    console.log(`${table.padEnd(25)} : ${count} deleted`);
  }

  console.log('\n--- PRESERVED MASTER DATA COUNTS ---');
  console.log(`LoomMaster                : ${await prisma.loomMaster.count()} (100% PRESERVED)`);
  console.log(`OrderMaster               : ${await prisma.orderMaster.count()} (100% PRESERVED)`);
  console.log(`DesignMaster              : ${await prisma.designMaster.count()} (100% PRESERVED)`);
  console.log(`User                      : ${await prisma.user.count()} (100% PRESERVED)`);
  console.log('========================================================\n');
}

resetData()
  .then(() => console.log('DATA RESET COMPLETED SUCCESSFULLY!'))
  .catch(err => console.error('RESET FAILED:', err))
  .finally(() => prisma.$disconnect());
