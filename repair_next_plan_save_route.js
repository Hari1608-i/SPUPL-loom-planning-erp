const fs = require('fs');
const path = require('path');

const root = process.cwd();
const file = path.join(root, 'backend', 'upload_server.js');

const source = fs.readFileSync(file, 'utf8');

const routeMarker = "app.post('/api/planning/next-plan/save'";
const insertMarker = "app.post('/api/production/cut-beam'";

if (source.includes(routeMarker)) {
  console.log('ROUTE ALREADY EXISTS - NO CHANGE MADE');
  process.exit(0);
}

const backup = `${file}.backup-before-next-plan-save-${Date.now()}`;
fs.copyFileSync(file, backup);
console.log('Backup created:', backup);

const route = `
// Recovered Next Plan Save Route
app.post('/api/planning/next-plan/save', async (req, res) => {
  try {
    const {
      loomNo,
      nextDesign,
      orderNo,
      ibpoNo,
      expectedStartDate,
      targetRunoutDate,
      remarks,
      allowOverplan
    } = req.body;

    const loomNum = Number(loomNo);

    if (!loomNum || (!nextDesign && !orderNo && !ibpoNo)) {
      return res.status(400).json({
        error: 'Loom Number and Order/Design information are required.'
      });
    }

    const cleanIbpo = (ibpoNo || orderNo || '').toString().trim();
    const cleanDesign = (nextDesign || cleanIbpo).toString().trim();

    const currentRun = await prisma.loomRunEntry.findUnique({
      where: { loom_no: loomNum }
    });

    const isLoomRunning =
      currentRun &&
      currentRun.design_no_sp_no &&
      currentRun.design_no_sp_no.trim() !== '';

    const existingPlans = await prisma.plannedAssignment.findMany({
      where: {
        loom_no: loomNum,
        status: {
          in: [
            'PLANNED',
            'NOT PLANNED',
            'PENDING',
            'BEAM ALLOCATED',
            'CONFIRMED'
          ]
        }
      }
    });

    const matchingPlan = existingPlans.find(
      p =>
        (p.next_design || '').trim().toLowerCase() ===
          cleanDesign.toLowerCase() ||
        (p.order_no || '').trim().toLowerCase() ===
          cleanIbpo.toLowerCase()
    );

    const beam = await prisma.beamStockMaster.findFirst({
      where: {
        design_no: cleanDesign,
        status: 'Available'
      }
    });

    const design = await prisma.designMaster.findUnique({
      where: {
        design_no_sp_no: cleanDesign
      }
    });

    const reqReedCount = design
      ? (design.reed_count || '').toString().trim()
      : '';

    const reed = await prisma.reedStockMaster.findFirst({
      where: {
        reed_count: reqReedCount,
        status: 'Available',
        available_qty: { gt: 0 }
      }
    });

    const assignmentData = {
      loom_no: loomNum,
      current_design: isLoomRunning
        ? currentRun.design_no_sp_no
        : 'AVAILABLE',
      next_design: cleanDesign,
      order_no: cleanIbpo || 'SPUPL-ORD-NEXT',
      planned_start_date: new Date(
        expectedStartDate ||
        targetRunoutDate ||
        new Date()
      ),
      planned_warp_meter: 10000,
      planned_avg_daily_production: 200,
      status: 'PLANNED',
      reserved_beam_id: null,
      reserved_beam_no: null,
      reserved_reed_id: reed ? reed.id : null,
      reserved_reed_no: reed ? reed.reed_no : null,
      reed_status: reed
        ? 'REED AVAILABLE'
        : 'REED REQUIRED',
      beam_status: 'BEAM PENDING',
      sizing_status: beam
        ? 'COMPLETED'
        : 'RUNNING',
      readiness_status: 'BEAM PENDING',
      planning_score: 75,
      remarks:
        remarks ||
        'Saved as Loom Plan (Beam Allocation Pending)',
      confirmation_status: 'PLAN CREATED'
    };

    let assignment;

    if (matchingPlan) {
      assignment = await prisma.plannedAssignment.update({
        where: { id: matchingPlan.id },
        data: assignmentData
      });
    } else {
      assignment = await prisma.plannedAssignment.create({
        data: assignmentData
      });
    }

    let warpPreparation = null;

    try {
      warpPreparation =
        await warpPreparationService.getPreparationDetailsForPlan(
          assignment
        );
    } catch (e) {
      console.error(
        'Error evaluating warp preparation:',
        e
      );
    }

    res.json({
      success: true,
      assignment,
      beamAvailable: !!beam,
      reedAvailable: !!reed,
      warpPreparation,
      message:
        \`Loom \${loomNum} plan saved successfully! Status: PLANNED (Beam Allocation Pending).\`
    });
  } catch (error) {
    console.error(
      'Next Plan Save Error:',
      error
    );

    res.status(500).json({
      error: error.message
    });
  }
});

`;

let updated;

if (source.includes(insertMarker)) {
  updated = source.replace(
    insertMarker,
    route + insertMarker
  );
} else {
  const listenIndex = source.lastIndexOf('app.listen(');

  if (listenIndex === -1) {
    throw new Error(
      'Could not find insertion point in upload_server.js'
    );
  }

  updated =
    source.slice(0, listenIndex) +
    route +
    source.slice(listenIndex);
}

fs.writeFileSync(file, updated, 'utf8');

console.log('NEXT PLAN SAVE ROUTE ADDED SUCCESSFULLY');
console.log('File:', file);