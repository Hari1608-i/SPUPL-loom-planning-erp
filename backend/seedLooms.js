const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Generating and seeding 256 looms...');
  const looms = [];

  for (let i = 1; i <= 256; i++) {
    let loomType = 'AIR';
    let shed = 1;
    let shedName = 'SPU 1';
    let area = 190;
    let rpm = 700;
    let make = 'Tsudakoma';
    let model = 'ZAX9100';

    if (i <= 12) {
      loomType = 'OMNI';
      make = 'Picanol';
      model = 'OMNI Plus 800';
    } else if (i <= 16) {
      loomType = 'OMNI';
      area = 220;
      rpm = 600;
      make = 'Picanol';
      model = 'OMNI Plus 800';
    } else if (i <= 48) {
      // already set to defaults for SPU 1 AIR
    } else if (i <= 104) {
      shed = 2;
      shedName = 'SPU 2';
    } else if (i <= 130) {
      shed = 2;
      shedName = 'SPU 2';
      area = 220;
      rpm = 600;
    } else {
      shed = 3;
      shedName = 'SPU 3';
      area = 190;
    }

    looms.push({
      loom_no: i,
      loom_type: loomType,
      shed: shed,
      shed_name: shedName,
      area: area,
      installed_date: '-',
      rpm: rpm,
      act_rpm: rpm,
      make: make,
      model: model,
      motor_kw_hp: '4 KW',
      drive: 'Inverter',
      control_panel: 'Standard',
    });
  }

  for (const loom of looms) {
    await prisma.loomMaster.upsert({
      where: { loom_no: loom.loom_no },
      update: loom,
      create: loom,
    });
  }

  console.log('Successfully seeded all 256 looms based on patterns.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
