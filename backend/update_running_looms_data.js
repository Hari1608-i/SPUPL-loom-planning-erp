require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function updateAll() {
  console.log('=== VERIFYING LOOM 14 ===');
  const l14 = await prisma.loomRunEntry.findUnique({ where: { loom_no: 14 } });
  console.log('Loom 14 status:', l14);

  console.log('=== UPDATING 31 LOOMS ===');
  const mapping = [
    { loom: 3, design: 'SP26/593-22397', beam: '11755', set: '13000', order: '22397' },
    { loom: 13, design: 'SP26/618-23121', beam: '82056', set: 'N8/22', order: '23121' },
    { loom: 15, design: 'SP26/593-22397', beam: '11757', set: '13000', order: '22397' },
    { loom: 28, design: 'SP26/707-23476', beam: '12665', set: '13032', order: '23476' },
    { loom: 52, design: 'SP26/619-22506', beam: '12587', set: '12966', order: '22506' },
    { loom: 54, design: 'SP26/715-23338', beam: '12680', set: '13039', order: '23338' },
    { loom: 55, design: 'SP26/298-23424', beam: '92002', set: 'L9/1', order: '23424' },
    { loom: 59, design: 'SP26/298-23424', beam: '92003', set: 'L9/1', order: '23424' },
    { loom: 103, design: 'SP26/758-23804', beam: '12696', set: '13049', order: '23804' },
    { loom: 106, design: 'SP26/765-23848', beam: '', set: null, order: '23848' },
    { loom: 138, design: 'SP26/619-23248', beam: '82028', set: 'N8/11', order: '23248' },
    { loom: 140, design: 'SP26/715-23338', beam: '12683', set: '13039', order: '23338' },
    { loom: 144, design: 'SP26/747-23771', beam: '11780', set: '13225', order: '23771' },
    { loom: 166, design: 'SP26/619-22510', beam: '82027', set: 'N8/11', order: '22510' },
    { loom: 168, design: 'SP26/621-22496', beam: '12637', set: '13012', order: '22496' },
    { loom: 206, design: 'SP26/743-23731', beam: '12688', set: '13044', order: '23731' },
    { loom: 212, design: 'SP26/764-23919', beam: '12685', set: '13043', order: '23919' },
    { loom: 219, design: 'SP26/765-23848', beam: '11721', set: '12971', order: '23848' },
    { loom: 220, design: 'SP26/743-23731', beam: '12687', set: '13044', order: '23731' },
    { loom: 221, design: 'SP26/764-23919', beam: '12684', set: '13043', order: '23919' },
    { loom: 232, design: 'SP26/692-23204', beam: '11764', set: '13011', order: '23204' },
    { loom: 240, design: 'SP26/620-22491', beam: '11825', set: '13053', order: '22491' },
    { loom: 248, design: 'SP26/692-23204', beam: '81972', set: 'N7/93', order: '23204' },
    { loom: 251, design: 'SP26/621-22496', beam: '82025', set: 'N8/10', order: '22496' },
    { loom: 253, design: 'SP26/658-23581', beam: '12692', set: '13048', order: '23581' },
    { loom: 265, design: 'SP26/682-23203', beam: '81917', set: 'N7/78', order: '23203' },
    { loom: 276, design: 'SP26/692-23204', beam: '81891', set: 'N7/69', order: '23204' },
    { loom: 277, design: 'SP26/658-23581', beam: '12693', set: '13048', order: '23581' },
    { loom: 281, design: 'SP26/743-23731', beam: '12689', set: '13044', order: '23731' },
    { loom: 293, design: 'SP26/692-23204', beam: '11795', set: '13035', order: '23204' },
    { loom: 301, design: 'SP26/682-23203', beam: '81915', set: 'N7/78', order: '23203' }
  ];

  for (const m of mapping) {
    const updateData = {
      design_no_sp_no: m.design,
      order_no: m.order
    };
    if (m.set) updateData.set_no = m.set;
    if (m.beam) updateData.current_beam_no = m.beam;

    await prisma.loomRunEntry.update({
      where: { loom_no: m.loom },
      data: updateData
    });
    console.log(`Loom ${m.loom} -> ${m.design} (Set: ${m.set || 'N/A'}, Beam: ${m.beam || 'N/A'})`);
  }

  const finalTotal = await prisma.loomRunEntry.count();
  console.log(`SUCCESS: Total running looms now in LoomRunEntry: ${finalTotal}`);
}

updateAll().catch(console.error).finally(() => prisma.$disconnect());
