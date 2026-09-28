const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const d1 = await prisma.plannedAssignment.deleteMany({});
  const d2 = await prisma.loomRunEntry.deleteMany({});
  const d3 = await prisma.completedWarpHistory.deleteMany({});
  
  await prisma.loomMaster.updateMany({
    data: { status: 'Available' }
  });

  console.log(`Deleted ${d1.count} planned assignments, ${d2.count} running entries, ${d3.count} warp history entries.`);
  await prisma.$disconnect();
}

main();
