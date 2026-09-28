const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function inspectAll() {
  console.log('--- DETAILED TABLE INSPECTION ---');
  
  // 1. LoomRunEntry
  const runs = await prisma.loomRunEntry.findMany();
  console.log(`LoomRunEntry (${runs.length}):`, runs);

  // 2. PlannedAssignment
  const planned = await prisma.plannedAssignment.findMany();
  console.log(`PlannedAssignment (${planned.length}):`, planned);

  // 3. CompletedWarpHistory
  const warpComp = await prisma.completedWarpHistory.findMany();
  console.log(`CompletedWarpHistory (${warpComp.length}):`, warpComp);

  // 4. OrderCompletionHistory
  const orderComp = await prisma.orderCompletionHistory.findMany();
  console.log(`OrderCompletionHistory (${orderComp.length}):`, orderComp);

  // 5. LoomMaster with status != Available
  const nonAvailLooms = await prisma.loomMaster.findMany({ where: { status: { not: 'Available' } } });
  console.log(`LoomMaster non-Available (${nonAvailLooms.length}):`, nonAvailLooms.map(l => ({ loom_no: l.loom_no, status: l.status })));

  // 6. OrderMaster with completed status or produced_qty > 0
  const ordersWithProd = await prisma.orderMaster.findMany({
    where: {
      OR: [
        { produced_qty: { gt: 0 } },
        { status: 'WEAVING COMPLETED' },
        { status: 'ORDER COMPLETED' },
        { order_completion_status: 'COMPLETED' }
      ]
    }
  });
  console.log(`OrderMaster completed/in-progress (${ordersWithProd.length}):`, ordersWithProd.map(o => ({ order_no: o.order_no, ibpo: o.ibpo_no, design: o.design_no_sp_no, status: o.status, produced: o.produced_qty })));

  // 7. BeamStockMaster
  const beams = await prisma.beamStockMaster.findMany();
  console.log(`BeamStockMaster (${beams.length}):`, beams.map(b => ({ id: b.id, beam_no: b.beam_no, design: b.design_no, status: b.status, loom: b.loom_no_assigned })));

  await prisma.$disconnect();
}

inspectAll();
