const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function parseConstructionSpecs(constructionStr) {
  if (!constructionStr) return { pick: null, greigeWidth: null };
  const str = constructionStr.trim();
  const match = str.match(/(\d+)\s*[xX]\s*(\d+)\s*(?:\/|\s)+(\d+(?:\.\d+)?)\s*["']?/);
  if (match) {
    return { pick: match[2], greigeWidth: match[3] };
  }
  return { pick: null, greigeWidth: null };
}

async function fixDesignMasterRecords() {
  const designs = await prisma.designMaster.findMany();
  const orders = await prisma.orderMaster.findMany();

  console.log(`Checking ${designs.length} designs...`);

  for (const d of designs) {
    const parsed = parseConstructionSpecs(d.construction);
    const linkedOrder = orders.find(o => o.design_no_sp_no === d.design_no_sp_no);

    let newPick = d.pick && d.pick.trim() !== '' ? d.pick : null;
    let newWidth = d.greige_width && d.greige_width.trim() !== '' ? d.greige_width : null;
    let newReedSpace = d.reed_space_warp_width && d.reed_space_warp_width.trim() !== '' ? d.reed_space_warp_width : null;

    if (!newPick) {
      if (parsed.pick) newPick = parsed.pick;
      else if (linkedOrder && linkedOrder.ppi) newPick = String(linkedOrder.ppi);
    }

    if (!newWidth) {
      if (parsed.greigeWidth) newWidth = parsed.greigeWidth;
    }

    if (!newReedSpace) {
      if (newWidth) {
        // Calculate reed space as width + 1.5" or based on width
        const wNum = parseFloat(newWidth);
        if (!isNaN(wNum)) {
          newReedSpace = (wNum + 1.5).toString();
        }
      }
    }

    console.log(`Design: ${d.design_no_sp_no}`);
    console.log(`  Construction: "${d.construction}"`);
    console.log(`  Old: Pick="${d.pick}", Width="${d.greige_width}", ReedSpace="${d.reed_space_warp_width}"`);
    console.log(`  New: Pick="${newPick}", Width="${newWidth}", ReedSpace="${newReedSpace}"`);

    await prisma.designMaster.update({
      where: { design_no_sp_no: d.design_no_sp_no },
      data: {
        pick: newPick || '',
        greige_width: newWidth || '',
        reed_space_warp_width: newReedSpace || ''
      }
    });
  }

  console.log('✅ DB Auto-Update Completed Successfully!');
}

fixDesignMasterRecords()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
