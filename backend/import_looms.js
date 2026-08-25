const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const text = fs.readFileSync(path.join(__dirname, '../frontend/loom_data.txt'), 'utf8');
  const parsedLooms = [];
  const blocks = text.split(/={10,}/);
  
  for (const block of blocks) {
    if (!block.trim()) continue;
    
    const loom = {};
    const lines = block.split('\n').map(l => l.trim());
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('LOOM NO :')) loom.loomNo = parseInt(line.split(':')[1].trim());
      else if (line.startsWith('Loom Type:')) loom.loomType = line.split(':')[1].trim();
      else if (line.startsWith('Weft Colours:')) loom.weftColours = parseInt(line.split(':')[1].trim());
      else if (line.startsWith('Beam Type:')) loom.beamType = line.split(':')[1].trim();
      else if (line.startsWith('Beam Dia:')) loom.beamDia = parseInt(line.split(':')[1].trim());
      else if (line.startsWith('Installed Lever:')) loom.installedLever = parseInt(line.split(':')[1].trim());
      else if (line.startsWith('Width:')) loom.width = line.split(':')[1].trim();
      else if (line.startsWith('Unit:')) loom.unit = line.split(':')[1].trim();
      else if (line.startsWith('Make:')) loom.make = line.split(':')[1].trim();
      else if (line.startsWith('Model:')) loom.model = line.split(':')[1].trim();
      else if (line.startsWith('WEAVE:')) loom.weave = line.substring(6).trim();
    }
    
    if (loom.loomNo) parsedLooms.push(loom);
  }

  console.log(`Parsed ${parsedLooms.length} looms. Clearing DB and saving...`);

  await prisma.loomMaster.deleteMany({});

  for (const loom of parsedLooms) {
    await prisma.loomMaster.upsert({
      where: { loom_no: loom.loomNo },
      update: {
        loom_type: loom.loomType,
        weft_colours: loom.weftColours,
        beam_type: loom.beamType,
        beam_dia: loom.beamDia,
        installed_lever: loom.installedLever,
        width: loom.width,
        unit: loom.unit,
        make: loom.make,
        model: loom.model,
        weave: loom.weave,
      },
      create: {
        loom_no: loom.loomNo,
        loom_type: loom.loomType,
        weft_colours: loom.weftColours,
        beam_type: loom.beamType,
        beam_dia: loom.beamDia,
        installed_lever: loom.installedLever,
        width: loom.width,
        unit: loom.unit,
        make: loom.make,
        model: loom.model,
        weave: loom.weave,
      }
    });
  }
  
  console.log('Successfully saved all looms to DB!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
