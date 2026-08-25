const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Seeding active runs for ALL looms in LoomMaster...');

  const looms = await prisma.loomMaster.findMany({
    orderBy: { loom_no: 'asc' }
  });

  const designs = [
    'SP26/001-00001',
    'SP26/001-00002',
    'SP26/001-00003',
    'SP26/001-00004',
    'SP26/001-00005',
    'SP26/148(Y/D)',
    'TWILL/300',
    '16 FRAME - DOBBY'
  ];

  const ordersMap = {
    'SP26/001-00001': { order_no: 'ORD-453370', customer_name: 'NO' },
    'SP26/001-00002': { order_no: 'ORD-788106', customer_name: 'NO' },
    'SP26/001-00003': { order_no: 'ORD-204861', customer_name: 'NO' },
    'SP26/001-00004': { order_no: 'ORD-472754', customer_name: 'OK' },
    'SP26/001-00005': { order_no: 'ORD-506308', customer_name: 'OHH' }
  };

  let count = 0;
  for (let i = 0; i < looms.length; i++) {
    const loom = looms[i];
    const loomNo = loom.loom_no;
    const designNo = designs[i % designs.length];
    const orderInfo = ordersMap[designNo] || { order_no: `ORD-${100000 + loomNo}`, customer_name: 'STANDARD' };

    const daysAgo = (i % 14) + 1;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysAgo);

    const warpedMeter = 8000 + ((loomNo * 37) % 4000);
    const dailyProd = 220 + ((loomNo * 7) % 110);
    const rpm = loom.rpm || (650 + ((loomNo * 11) % 200));
    const efficiency = 85 + ((loomNo * 3) % 13);
    const beamNo = `BM-2026-${String(loomNo).padStart(3, '0')}`;
    const setNo = `SET-${String(100 + (loomNo % 30)).padStart(3, '0')}`;
    const reedNo = `RD-${String(500 + (loomNo % 50)).padStart(3, '0')}`;

    await prisma.loomRunEntry.upsert({
      where: { loom_no: loomNo },
      update: {
        design_no_sp_no: designNo,
        current_beam_no: beamNo,
        set_no: setNo,
        current_reed_no: reedNo,
        order_no: orderInfo.order_no,
        customer_name: orderInfo.customer_name,
        loom_start_date: startDate,
        warped_meter: warpedMeter,
        daily_production: dailyProd,
        rpm: rpm,
        efficiency: efficiency,
        shift_hours: 24,
        working_hours: 24,
        machine_utilization: efficiency,
        remarks: 'Active running loom'
      },
      create: {
        loom_no: loomNo,
        design_no_sp_no: designNo,
        current_beam_no: beamNo,
        set_no: setNo,
        current_reed_no: reedNo,
        order_no: orderInfo.order_no,
        customer_name: orderInfo.customer_name,
        loom_start_date: startDate,
        warped_meter: warpedMeter,
        daily_production: dailyProd,
        rpm: rpm,
        efficiency: efficiency,
        shift_hours: 24,
        working_hours: 24,
        machine_utilization: efficiency,
        remarks: 'Active running loom'
      }
    });

    await prisma.loomMaster.update({
      where: { loom_no: loomNo },
      data: { status: 'Running' }
    });

    count++;
  }

  console.log(`Successfully populated active runs for ALL ${count} looms!`);
  const activeCount = await prisma.loomRunEntry.count();
  console.log(`Total active loom run entries in DB now: ${activeCount}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
