const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Seeding full ERP production data...');

  // 1. Designs
  const designs = [
    {
      design_no_sp_no: 'SP26/148(Y/D)',
      construction: '40s x 40s / 120 x 80',
      weft_colours: 4,
      frames: 4,
      reed_count: '80s',
      pick: '80',
      greige_width: '190 CM',
      total_ends: 9600,
      reed_space_warp_width: '182 CM',
      weave_type: '4 FRAME CAM',
      beam_type: 'SINGLE BEAM',
      crimp_percent: 0.05
    },
    {
      design_no_sp_no: 'TWILL/300',
      construction: '50s x 50s / 132 x 90',
      weft_colours: 2,
      frames: 5,
      reed_count: '90s',
      pick: '90',
      greige_width: '195 CM',
      total_ends: 10500,
      reed_space_warp_width: '186 CM',
      weave_type: '3/1 TWILL',
      beam_type: 'SINGLE BEAM',
      crimp_percent: 0.08
    },
    {
      design_no_sp_no: '16 FRAME - DOBBY',
      construction: '60s x 60s / 140 x 100',
      weft_colours: 6,
      frames: 16,
      reed_count: '100s',
      pick: '100',
      greige_width: '200 CM',
      total_ends: 11200,
      reed_space_warp_width: '190 CM',
      weave_type: '16 FRAME - DOBBY',
      beam_type: 'SINGLE BEAM',
      crimp_percent: 0.12
    }
  ];

  for (const d of designs) {
    await prisma.designMaster.upsert({
      where: { design_no_sp_no: d.design_no_sp_no },
      update: d,
      create: d
    });
  }

  // 2. Active Runs for ALL Looms in LoomMaster
  const looms = await prisma.loomMaster.findMany({ orderBy: { loom_no: 'asc' } });
  const designKeys = ['SP26/001-00001', 'SP26/001-00002', 'SP26/001-00003', 'SP26/001-00004', 'SP26/001-00005', 'SP26/148(Y/D)', 'TWILL/300', '16 FRAME - DOBBY'];
  for (let idx = 0; idx < looms.length; idx++) {
    const loomNo = looms[idx].loom_no;
    const dNo = designKeys[idx % designKeys.length];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - ((idx % 14) + 1));

    const warpedMeter = 8000 + ((loomNo * 37) % 4000);
    const dailyProd = 220 + ((loomNo * 7) % 110);
    const rpm = looms[idx].rpm || (650 + ((loomNo * 11) % 200));
    const efficiency = 85 + ((loomNo * 3) % 13);
    const beamNo = `BM-2026-${String(loomNo).padStart(3, '0')}`;
    const setNo = `SET-${String(100 + (loomNo % 30)).padStart(3, '0')}`;
    const reedNo = `RD-${String(500 + (loomNo % 50)).padStart(3, '0')}`;

    await prisma.loomRunEntry.upsert({
      where: { loom_no: loomNo },
      update: {
        design_no_sp_no: dNo,
        current_beam_no: beamNo,
        set_no: setNo,
        current_reed_no: reedNo,
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
        design_no_sp_no: dNo,
        current_beam_no: beamNo,
        set_no: setNo,
        current_reed_no: reedNo,
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
  }

  // 3. Beam Stock
  const beams = [
    { id: 1, beam_no: 'BM-2026-001', design_no: 'SP26/148(Y/D)', available_meter: 8500, status: 'Available', unit: 'UNIT-I', reed_count: '80s' },
    { id: 2, beam_no: 'BM-2026-002', design_no: 'TWILL/300', available_meter: 9200, status: 'Available', unit: 'UNIT-I', reed_count: '90s' },
    { id: 3, beam_no: 'BM-2026-003', design_no: '16 FRAME - DOBBY', available_meter: 10000, status: 'Available', unit: 'UNIT-II', reed_count: '100s' },
    { id: 4, beam_no: 'BM-2026-004', design_no: 'SP26/148(Y/D)', available_meter: 7800, status: 'Available', unit: 'UNIT-II', reed_count: '80s' },
    { id: 5, beam_no: 'BM-2026-005', design_no: 'TWILL/300', available_meter: 9000, status: 'Available', unit: 'UNIT-III', reed_count: '90s' }
  ];

  for (const b of beams) {
    await prisma.beamStockMaster.upsert({
      where: { id: b.id },
      update: b,
      create: b
    });
  }

  console.log('Successfully seeded full ERP dataset (Looms, Active Runs, Designs, Beams).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
