const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const designs = await prisma.designMaster.findMany();
  console.log('--- DESIGN MASTER RECORDS ---');
  console.log(JSON.stringify(designs, null, 2));
  
  const orders = await prisma.orderMaster.findMany();
  console.log('--- ORDER MASTER RECORDS ---');
  console.log(JSON.stringify(orders.map(o => ({
    order_no: o.order_no,
    design_no_sp_no: o.design_no_sp_no,
    construction: o.construction,
    reed_count: o.reed_count,
    ppi: o.ppi,
    epi: o.epi,
    total_ends: o.total_ends
  })), null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
