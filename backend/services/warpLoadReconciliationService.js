const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

function normalizeDesignNo(d) {
  if (!d) return '';
  return String(d).trim().toUpperCase();
}

function getBaseSort(d) {
  if (!d) return '';
  const s = String(d).trim().toUpperCase();
  const idx = s.indexOf('-');
  return idx > 0 ? s.slice(0, idx).trim() : s;
}

function resolveWorkbookPath() {
  const candidates = [
    path.join(__dirname, '../data/WARP_LOADED_DETAILS_03_10.xlsx'),
    path.join(process.cwd(), 'backend/data/WARP_LOADED_DETAILS_03_10.xlsx'),
    'C:/Users/SPUPL-PLANNING/Downloads/WARP LOADED DETAILS 03.10.xlsx'
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function parseWorkbook(bufferOrPath) {
  let wb;
  if (Buffer.isBuffer(bufferOrPath)) {
    wb = XLSX.read(bufferOrPath, { type: 'buffer' });
  } else if (typeof bufferOrPath === 'string' && fs.existsSync(bufferOrPath)) {
    wb = XLSX.readFile(bufferOrPath);
  } else {
    const defaultPath = resolveWorkbookPath();
    if (!defaultPath) throw new Error('WARP LOADED DETAILS 03.10.xlsx not found.');
    wb = XLSX.readFile(defaultPath);
  }

  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  const dataRows = rows.slice(1).filter(r => r && r[0] != null && r[1] != null);

  const parsedItems = [];
  for (const r of dataRows) {
    const sno = Number(r[0]);
    const loomStr = String(r[1] || '').trim();
    const machineNo = parseInt(r[2], 10);
    const rawDate = r[3];
    const beamNo = String(r[4] || '').trim();
    const setNo = String(r[5] || '').trim();
    const workbookDesign = String(r[6] || '').trim();
    const ibpo = String(r[7] || '').trim();
    const warpMtr = Number(r[8]);

    let loadDate = '';
    if (typeof rawDate === 'number') {
      const dc = XLSX.SSF.parse_date_code(rawDate);
      loadDate = `${dc.y}-${String(dc.m).padStart(2, '0')}-${String(dc.d).padStart(2, '0')}`;
    } else if (rawDate) {
      loadDate = String(rawDate).trim();
    }

    parsedItems.push({
      sno,
      loomStr,
      machineNo,
      loadDate,
      beamNo,
      setNo,
      workbookDesign,
      ibpo,
      warpMtr
    });
  }

  return parsedItems;
}

async function reconcileWarpLoadedData(prisma, bufferOrPath) {
  const sourceItems = parseWorkbook(bufferOrPath);

  // Load all required master tables in parallel
  const [looms, designs, orders, activeRuns, beams, reeds] = await Promise.all([
    prisma.loomMaster.findMany(),
    prisma.designMaster.findMany(),
    prisma.orderMaster.findMany(),
    prisma.loomRunEntry.findMany({ include: { LoomMaster: true } }),
    prisma.beamStockMaster.findMany(),
    prisma.reedStockMaster.findMany()
  ]);

  const loomMap = new Map();
  looms.forEach(l => loomMap.set(l.loom_no, l));

  const designByFull = new Map();
  const designByBase = new Map();
  designs.forEach(d => {
    const full = normalizeDesignNo(d.design_no_sp_no);
    designByFull.set(full, d);
    const base = getBaseSort(full);
    if (!designByBase.has(base)) designByBase.set(base, []);
    designByBase.get(base).push(d);
  });

  const orderByIbpo = new Map();
  orders.forEach(o => {
    if (o.ibpo_no) {
      const key = String(o.ibpo_no).trim().toUpperCase();
      if (!orderByIbpo.has(key)) orderByIbpo.set(key, []);
      orderByIbpo.get(key).push(o);
    }
  });

  const runByLoom = new Map();
  activeRuns.forEach(r => runByLoom.set(r.loom_no, r));

  const beamByNo = new Map();
  beams.forEach(b => {
    if (b.beam_no) beamByNo.set(b.beam_no.trim().toUpperCase(), b);
  });

  // Index reeds by reed count
  const reedsByCount = new Map();
  reeds.forEach(rd => {
    const rc = String(rd.reed_count || '').trim().toUpperCase();
    if (rc) {
      if (!reedsByCount.has(rc)) reedsByCount.set(rc, []);
      reedsByCount.get(rc).push(rd);
    }
  });

  const accepted = [];
  const rejected = [];
  const conflicts = [];
  const duplicateBeams = [];
  const seenBeamsInFile = new Map();

  let totalWarpMtr = 0;
  let acceptedWarpMtr = 0;

  for (const item of sourceItems) {
    totalWarpMtr += item.warpMtr || 0;

    // Check Duplicate Beam in source
    if (seenBeamsInFile.has(item.beamNo.toUpperCase())) {
      item.duplicateSource = true;
      item.firstOccurrence = seenBeamsInFile.get(item.beamNo.toUpperCase());
      duplicateBeams.push({
        ...item,
        reason: `DUPLICATE BEAM IN SOURCE: Beam "${item.beamNo}" is already loaded on Loom ${item.firstOccurrence.loomStr} (M#${item.firstOccurrence.machineNo}) in row ${item.firstOccurrence.sno}. Placed in collision list to prevent double allocation.`
      });
      continue;
    } else {
      seenBeamsInFile.set(item.beamNo.toUpperCase(), item);
    }

    // Check A: Machine No exists in Loom Master
    if (isNaN(item.machineNo) || !loomMap.has(item.machineNo)) {
      rejected.push({
        ...item,
        reason: `Machine No ${item.machineNo} (Loom ${item.loomStr}) not found in Loom Master`,
        existingValue: 'None',
        actionRequired: 'Verify loom number in Loom Master or update workbook machine number'
      });
      continue;
    }

    // Check C: IBPO exists in OrderMaster
    const matchedOrders = orderByIbpo.get(item.ibpo.toUpperCase());
    if (!matchedOrders || matchedOrders.length === 0) {
      rejected.push({
        ...item,
        reason: `IBPO "${item.ibpo}" not found in Order Management / OrderMaster`,
        existingValue: 'No order with this IBPO',
        actionRequired: 'Create order in Order Management before importing warp load'
      });
      continue;
    }

    // Check D: Exact design compatibility between OrderMaster and Workbook
    const orderWithMatchingDesign = matchedOrders.find(o => {
      const ordDesignFull = normalizeDesignNo(o.design_no_sp_no);
      const ordDesignBase = getBaseSort(ordDesignFull);
      const wbDesignNorm = normalizeDesignNo(item.workbookDesign);
      return ordDesignBase === wbDesignNorm || ordDesignFull === wbDesignNorm || ordDesignFull === `${wbDesignNorm}-${item.ibpo.toUpperCase()}`;
    });

    if (!orderWithMatchingDesign) {
      const existingDesigns = matchedOrders.map(o => o.design_no_sp_no).join(', ');
      rejected.push({
        ...item,
        reason: `MISMATCH: Workbook Design "${item.workbookDesign}" does not match Order IBPO "${item.ibpo}" Design(s) [${existingDesigns}]`,
        existingValue: existingDesigns,
        actionRequired: 'Correct design number in workbook or update order specification in Order Management'
      });
      continue;
    }

    // Check B: Design Master resolution
    const fullExpectedDesign = orderWithMatchingDesign.design_no_sp_no || `${item.workbookDesign}-${item.ibpo}`;
    let matchedDesign = designByFull.get(normalizeDesignNo(fullExpectedDesign)) || 
      designByFull.get(normalizeDesignNo(item.workbookDesign));

    if (!matchedDesign) {
      const baseMatches = designByBase.get(normalizeDesignNo(item.workbookDesign));
      if (baseMatches && baseMatches.length > 0) {
        matchedDesign = baseMatches[0];
      }
    }

    if (!matchedDesign) {
      rejected.push({
        ...item,
        reason: `Design "${item.workbookDesign}" (or "${fullExpectedDesign}") not found in Design Master`,
        existingValue: 'None',
        actionRequired: 'Register design in Design Master'
      });
      continue;
    }

    // Check H: Running loom conflict
    const currentRun = runByLoom.get(item.machineNo);
    if (currentRun && currentRun.design_no_sp_no) {
      const curRunBase = getBaseSort(currentRun.design_no_sp_no);
      const wbDesignNorm = normalizeDesignNo(item.workbookDesign);
      if (curRunBase !== wbDesignNorm && normalizeDesignNo(currentRun.design_no_sp_no) !== normalizeDesignNo(fullExpectedDesign)) {
        conflicts.push({
          ...item,
          reason: `RUNNING CONFLICT: Loom ${item.machineNo} (${item.loomStr}) is currently running Design "${currentRun.design_no_sp_no}" (Order: ${currentRun.order_no || 'none'}), cannot overwrite with "${item.workbookDesign}"`,
          existingValue: `Running Design: ${currentRun.design_no_sp_no}`,
          actionRequired: 'Complete or stop active sort change before loading new warp sort'
        });
        continue;
      }
    }

    // Check Reed Readiness
    const requiredReed = matchedDesign.reed_count || orderWithMatchingDesign.reed_count || '';
    const matchingReeds = requiredReed ? (reedsByCount.get(requiredReed.trim().toUpperCase()) || []) : [];
    const reedAvailable = matchingReeds.reduce((sum, r) => sum + (r.available_qty || 0), 0);
    const reedReserved = matchingReeds.reduce((sum, r) => sum + (r.reserved_qty || 0), 0);
    const reedRunning = matchingReeds.reduce((sum, r) => sum + (r.running_qty || 0), 0);
    const reedStatus = reedAvailable > 0 ? 'READY' : (matchingReeds.length > 0 ? 'RESERVED / RUNNING' : 'REED REQUIRED');

    acceptedWarpMtr += item.warpMtr || 0;

    accepted.push({
      ...item,
      resolvedDesignNo: fullExpectedDesign,
      matchedOrderId: orderWithMatchingDesign.id,
      matchedOrderNo: orderWithMatchingDesign.order_no,
      customerName: orderWithMatchingDesign.customer_name || item.ibpo,
      construction: orderWithMatchingDesign.construction || matchedDesign.construction || '',
      reedCount: requiredReed,
      pick: orderWithMatchingDesign.pick || orderWithMatchingDesign.ppi || matchedDesign.pick || '',
      greigeWidth: orderWithMatchingDesign.greige_width || matchedDesign.greige_width || '',
      crimpPercent: matchedDesign.crimp_percent ? Number(matchedDesign.crimp_percent) : 0,
      existingBeamId: beamByNo.get(item.beamNo.toUpperCase())?.id || null,
      reedReadiness: {
        requiredReed,
        availableQty: reedAvailable,
        reservedQty: reedReserved,
        runningQty: reedRunning,
        status: reedStatus
      }
    });
  }

  return {
    summary: {
      totalRows: sourceItems.length,
      acceptedRows: accepted.length,
      rejectedRows: rejected.length,
      conflictRows: conflicts.length,
      duplicateBeamRows: duplicateBeams.length,
      totalWarpMtr,
      acceptedWarpMtr
    },
    acceptedList: accepted,
    rejectedList: rejected,
    conflictList: conflicts,
    duplicateList: duplicateBeams
  };
}

async function executeWarpLoadImport(prisma, acceptedRows, adminUser = 'System') {
  if (!Array.isArray(acceptedRows) || acceptedRows.length === 0) {
    return { success: true, count: 0, message: 'No accepted rows to import.' };
  }

  let beamCreatedCount = 0;
  let beamUpdatedCount = 0;
  let loomRunUpdatedCount = 0;
  let loomRunCreatedCount = 0;

  // Pre-fetch existing beams and runs in 2 queries to avoid repetitive findFirst/findUnique
  const beamNos = acceptedRows.map(r => r.beamNo).filter(Boolean);
  const loomNos = acceptedRows.map(r => r.machineNo).filter(n => !isNaN(n));

  const [existingBeams, existingRuns] = await Promise.all([
    prisma.beamStockMaster.findMany({
      where: { beam_no: { in: beamNos } }
    }),
    prisma.loomRunEntry.findMany({
      where: { loom_no: { in: loomNos } }
    })
  ]);

  const existingBeamMap = new Map();
  existingBeams.forEach(b => {
    if (b.beam_no) existingBeamMap.set(b.beam_no.trim().toUpperCase(), b);
  });

  const existingRunMap = new Map();
  existingRuns.forEach(r => {
    existingRunMap.set(r.loom_no, r);
  });

  // Process in batches of 5 with Promise.all for fast non-blocking execution over pgBouncer
  const BATCH_SIZE = 5;
  for (let bi = 0; bi < acceptedRows.length; bi += BATCH_SIZE) {
    const batch = acceptedRows.slice(bi, bi + BATCH_SIZE);

    await Promise.all(batch.map(async (item) => {
      // 1. Find or create physical beam in BeamStockMaster
      const existingBeam = existingBeamMap.get(item.beamNo.trim().toUpperCase());
      let beamRecord;

      if (existingBeam) {
        beamRecord = await prisma.beamStockMaster.update({
          where: { id: existingBeam.id },
          data: {
            status: 'Running',
            loom_no_assigned: item.machineNo,
            design_no: item.resolvedDesignNo,
            order_no: item.ibpo,
            ibpo: item.ibpo,
            set_no: item.setNo,
            total_warped_meter: item.warpMtr,
            available_meter: item.warpMtr,
            current_balance_meter: item.warpMtr,
            date: item.loadDate ? new Date(item.loadDate) : new Date(),
            location: `Running on Loom ${item.machineNo}`
          }
        });
        beamUpdatedCount++;
      } else {
        beamRecord = await prisma.beamStockMaster.create({
          data: {
            beam_no: item.beamNo,
            design_no: item.resolvedDesignNo,
            set_no: item.setNo,
            order_no: item.ibpo,
            ibpo: item.ibpo,
            total_warped_meter: item.warpMtr,
            available_meter: item.warpMtr,
            current_balance_meter: item.warpMtr,
            status: 'Running',
            loom_no_assigned: item.machineNo,
            date: item.loadDate ? new Date(item.loadDate) : new Date(),
            vendor_name: 'In-House Warping',
            location: `Running on Loom ${item.machineNo}`
          }
        });
        beamCreatedCount++;
        existingBeamMap.set(item.beamNo.trim().toUpperCase(), beamRecord);
      }

      // 2. Synchronize LoomRunEntry
      const existingRun = existingRunMap.get(item.machineNo);

      if (existingRun) {
        await prisma.loomRunEntry.update({
          where: { loom_no: item.machineNo },
          data: {
            design_no_sp_no: item.resolvedDesignNo,
            current_beam_no: item.beamNo,
            set_no: item.setNo,
            beam_id: beamRecord.id,
            order_no: item.ibpo,
            customer_name: item.customerName || item.ibpo,
            warped_meter: item.warpMtr,
            loom_start_date: item.loadDate ? new Date(item.loadDate) : new Date(),
            prep_status: 'COMPLETED',
            remarks: 'Warp Loaded via Reconciliation'
          }
        });
        loomRunUpdatedCount++;
      } else {
        await prisma.loomRunEntry.create({
          data: {
            loom_no: item.machineNo,
            design_no_sp_no: item.resolvedDesignNo,
            current_beam_no: item.beamNo,
            set_no: item.setNo,
            beam_id: beamRecord.id,
            order_no: item.ibpo,
            customer_name: item.customerName || item.ibpo,
            warped_meter: item.warpMtr,
            loom_start_date: item.loadDate ? new Date(item.loadDate) : new Date(),
            daily_production: 250,
            rpm: 650,
            efficiency: 85,
            shift_hours: 24,
            working_hours: 24,
            machine_utilization: 85,
            sort_change_type: 'GAITING',
            prep_status: 'COMPLETED',
            remarks: 'Warp Loaded via Reconciliation'
          }
        });
        loomRunCreatedCount++;
      }
    }));
  }

  // 3. Batch update LoomMaster status to Running in a single query
  await prisma.loomMaster.updateMany({
    where: { loom_no: { in: loomNos } },
    data: { status: 'Running' }
  }).catch(() => {});

  // Audit Log
  await prisma.systemAuditLog.create({
    data: {
      username: adminUser,
      screen: 'Main Entry / Warp Load',
      action: 'WARP_LOAD_RECONCILIATION_IMPORT',
      newValue: `${acceptedRows.length} looms synchronized (${loomRunCreatedCount} created, ${loomRunUpdatedCount} updated, ${beamCreatedCount} beams created, ${beamUpdatedCount} beams updated)`
    }
  }).catch(() => {});

  return {
    success: true,
    totalImported: acceptedRows.length,
    loomRunCreatedCount,
    loomRunUpdatedCount,
    beamCreatedCount,
    beamUpdatedCount
  };
}

module.exports = {
  parseWorkbook,
  reconcileWarpLoadedData,
  executeWarpLoadImport
};
