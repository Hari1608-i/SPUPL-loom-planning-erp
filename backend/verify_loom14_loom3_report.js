require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function runTests() {
  console.log('========================================================');
  console.log('SPUPL ERP VERIFICATION SUITE: LOOM 14, LOOM 3 & REPORTS');
  console.log('========================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName}`);
      failed++;
    }
  }

  // TEST 1: Loom 14 Active Run
  const l14 = await prisma.loomRunEntry.findUnique({ where: { loom_no: 14 } });
  assert(!!l14, 'Loom 14 exists in LoomRunEntry');
  assert(l14?.design_no_sp_no === 'SP26/692-23204', `Loom 14 design is composite "SP26/692-23204" (actual: ${l14?.design_no_sp_no})`);
  assert(l14?.current_beam_no === '11762', `Loom 14 beam is 11762 (actual: ${l14?.current_beam_no})`);
  assert(l14?.set_no === '13011', `Loom 14 set no is 13011 (actual: ${l14?.set_no})`);
  assert(l14?.order_no === '23204', `Loom 14 order no is 23204 (actual: ${l14?.order_no})`);
  assert(l14?.warped_meter === 2280, `Loom 14 warped meter is 2280 (actual: ${l14?.warped_meter})`);

  // TEST 2: Loom 14 Beam Status
  const beam14 = await prisma.beamStockMaster.findFirst({ where: { beam_no: '11762' } });
  assert(beam14?.status === 'Running', `Beam #11762 status in BeamStock is "Running" (actual: ${beam14?.status})`);
  assert(beam14?.loom_no_assigned === 14, `Beam #11762 loom_no_assigned is 14 (actual: ${beam14?.loom_no_assigned})`);

  // TEST 3: Loom 3 Active Run
  const l3 = await prisma.loomRunEntry.findUnique({ where: { loom_no: 3 } });
  assert(!!l3, 'Loom 3 exists in LoomRunEntry');
  assert(l3?.design_no_sp_no === 'SP26/593-22397', `Loom 3 design is composite "SP26/593-22397" (actual: ${l3?.design_no_sp_no})`);
  assert(l3?.current_beam_no === '11755', `Loom 3 beam is 11755 (actual: ${l3?.current_beam_no})`);
  assert(l3?.set_no === '13000', `Loom 3 set no is 13000 (actual: ${l3?.set_no})`);
  assert(l3?.order_no === '22397', `Loom 3 order no is 22397 (actual: ${l3?.order_no})`);

  // TEST 4: Loom 3 Technical Specs in OrderMaster
  const order3 = await prisma.orderMaster.findFirst({ where: { design_no_sp_no: 'SP26/593-22397' } });
  assert(!!order3, 'Order for SP26/593-22397 exists in OrderMaster');
  assert(!!order3?.construction, `Order construction exists: "${order3?.construction}"`);
  assert(order3?.reed_count === '44/2', `Order reed count is 44/2 (actual: ${order3?.reed_count})`);
  assert(order3?.ppi === 34, `Order pick / ppi is 34 (actual: ${order3?.ppi})`);

  // TEST 5: Total Running Looms Count
  const totalRuns = await prisma.loomRunEntry.count();
  assert(totalRuns === 224, `Total running looms is exactly 224 (actual: ${totalRuns})`);

  // TEST 6: Design-Wise Report Validation Warnings
  const [activeRuns, loomMasters, designMasters, orderMasters] = await Promise.all([
    prisma.loomRunEntry.findMany(),
    prisma.loomMaster.findMany(),
    prisma.designMaster.findMany(),
    prisma.orderMaster.findMany()
  ]);

  const loomMap = new Map(loomMasters.map(l => [l.loom_no, l]));
  const designMap = new Map(designMasters.map(d => [(d.design_no_sp_no || '').trim().toLowerCase(), d]));
  const orderMap = new Map(orderMasters.map(o => [(o.design_no_sp_no || '').trim().toLowerCase(), o]));

  const unmappedLooms = [];
  const unmappedDesigns = [];

  activeRuns.forEach(r => {
    if (!loomMap.has(r.loom_no)) unmappedLooms.push(r.loom_no);
    const cleanDesign = (r.design_no_sp_no || '').trim().toLowerCase();
    const isValid = designMap.has(cleanDesign) ||
                    orderMap.has(cleanDesign) ||
                    cleanDesign.includes('standard') ||
                    cleanDesign.includes('sample') ||
                    cleanDesign.startsWith('sp26/000') ||
                    (cleanDesign.includes('-') && (designMap.has(cleanDesign.split('-')[0].trim()) || orderMap.has(cleanDesign.split('-')[0].trim())));
    if (!isValid) unmappedDesigns.push(r.design_no_sp_no);
  });

  assert(unmappedLooms.length === 0, `0 unmapped looms (actual: ${unmappedLooms.length})`);
  assert(unmappedDesigns.length === 0, `0 unmapped designs (actual: ${unmappedDesigns.length})`);

  console.log(`\n========================================================`);
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================================\n`);

  if (failed > 0) process.exit(1);
}

runTests().catch(console.error).finally(() => prisma.$disconnect());
