const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function clearLoomsOnly() {
  console.log('========================================================');
  console.log('CLEARING LOOM & WORK-IN-PROGRESS ENTRIES ONLY');
  console.log('Targeting: Running Looms, Planned Looms, Completed Orders, Completed Warp History');
  console.log('Preserving: Master Looms, Master Orders, Master Designs, Beams, Reeds, Users');
  console.log('========================================================');

  try {
    // 1. Clear operational transaction records
    const deletedRunning = await prisma.loomRunEntry.deleteMany({});
    const deletedPlanned = await prisma.plannedAssignment.deleteMany({});
    const deletedWarpHistory = await prisma.completedWarpHistory.deleteMany({});
    const deletedOrderHistory = await prisma.orderCompletionHistory.deleteMany({});

    // 2. Unassign and set all BeamStockMaster statuses back to Available
    await prisma.beamStockMaster.updateMany({
      data: {
        status: 'Available',
        loom_no_assigned: null,
        reserved_status: null,
        reserved_for: null
      }
    });

    // 3. Reset OrderMaster completion statuses and produced quantities so completed/weaving states are cleared
    await prisma.orderMaster.updateMany({
      data: {
        status: 'APPROVED',
        order_completion_status: 'ACTIVE',
        planning_status: 'Planning Pending',
        produced_qty: 0,
        short_excess_qty: 0,
        current_beam_planned: 0,
        beam_prepared: 0,
        warp_confirmed_qty: 0,
        warp_balance_qty: 0,
        actual_completion_date: null,
        completion_remarks: null,
        completed_by: null
      }
    });

    // 4. Reset all LoomMaster statuses back to Available
    await prisma.loomMaster.updateMany({
      data: {
        status: 'Available'
      }
    });

    console.log('\n--- VERIFICATION SUMMARY ---');
    console.log(`- Running Looms remaining        : ${await prisma.loomRunEntry.count()}`);
    console.log(`- Planned Looms remaining        : ${await prisma.plannedAssignment.count()}`);
    console.log(`- Completed Warp Logs remaining  : ${await prisma.completedWarpHistory.count()}`);
    console.log(`- Completed Orders remaining     : ${await prisma.orderCompletionHistory.count()}`);
    console.log(`- Loom Master preserved          : ${await prisma.loomMaster.count()}`);
    console.log(`- Order Master preserved         : ${await prisma.orderMaster.count()}`);
    console.log(`- Design Master preserved        : ${await prisma.designMaster.count()}`);
    console.log(`- Beam Stock Master preserved    : ${await prisma.beamStockMaster.count()}`);
    console.log('========================================================\n');

  } catch (error) {
    console.error('Error clearing loom entries:', error);
  } finally {
    await prisma.$disconnect();
  }
}

clearLoomsOnly();
