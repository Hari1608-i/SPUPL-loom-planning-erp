const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const xlsx = require('xlsx');

// Global Prisma instance or create new
const prisma = global.prisma || new PrismaClient();

// Helper: parse numeric width in inches
function parseWidthInInches(widthStr) {
  if (!widthStr) return 0;
  const str = String(widthStr).toLowerCase();
  const num = parseFloat(str.replace(/[^0-9.]/g, ''));
  if (isNaN(num)) return 0;
  if (str.includes('cm')) {
    return num / 2.54; // convert cm to inches
  }
  return num; // assume inches by default
}

// Helper: safe date parsing
function safeDate(d) {
  if (!d) return new Date();
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

// Helper: format YYYY-MM-DD
function formatDate(d) {
  if (!d) return '';
  const date = new Date(d);
  return isNaN(date.getTime()) ? '' : date.toISOString().split('T')[0];
}

// Helper: add days to date
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + Math.max(0, Math.ceil(days)));
  return result;
}

// Exact KPX Product Group Factor Engine (KPX 2026 Engine)
function getProductGroupFactor(group) {
  if (!group) return 1.25;
  const g = String(group).trim().toLowerCase();
  if (g.includes('linen')) return 1.66; // Linen Blind or Linen Blend
  if (g.includes('special')) return 1.65;
  if (g.includes('grey') || g.includes('greige')) return 1.00;
  return 1.25; // Normal YD default
}

function calculateKpxValues(greyReq, greyCompleted, ppi, factor, daysTaken) {
  const req = Number(greyReq) || 0;
  const comp = Number(greyCompleted) || 0;
  const balanceToWeave = Math.max(0, req - comp);
  const ppiVal = Number(ppi) || 0;
  const kpx = ppiVal > 0 ? (balanceToWeave * ppiVal * 39.37) / 1000 : 0;
  const kpxFactor = factor !== undefined && factor !== null && !isNaN(Number(factor)) ? Number(factor) : 1.25;
  const correctedKpx = kpx * kpxFactor;
  const days = Number(daysTaken) || 0;
  const correctedKpxPerDay = days > 0 ? (correctedKpx / days) : null;
  return {
    balanceToWeave,
    kpx,
    kpxFactor,
    correctedKpx,
    correctedKpxPerDay
  };
}

// ==========================================
// 1. DASHBOARD & KPIS
// ==========================================
router.get('/dashboard', async (req, res) => {
  try {
    const orders = await prisma.toaOrder.findMany({
      include: {
        allocations: true,
        productionLogs: true,
        completionReview: true
      },
      orderBy: { received_date: 'desc' }
    });

    const totalOrders = orders.length;
    const pendingOrders = orders.filter(o => o.status === 'PENDING').length;
    const allocatedOrders = orders.filter(o => o.status === 'ALLOCATED').length;
    const inProductionOrders = orders.filter(o => o.status === 'IN_PRODUCTION').length;
    const completedOrders = orders.filter(o => o.status === 'COMPLETED').length;

    let totalOrderedMtr = 0;
    let totalAllocatedMtr = 0;
    let totalProducedMtr = 0;
    let inHouseAllocatedMtr = 0;
    let vendorAllocatedMtr = 0;

    let inHouseLoomSet = new Set();
    let vendorLoomSet = new Set();

    let approachingCompletion = 0;
    let delayedOrders = 0;
    let awaitingConfirmation = 0;

    const today = new Date();

    orders.forEach(order => {
      totalOrderedMtr += Number(order.order_qty) || 0;

      let orderProduced = 0;
      order.productionLogs.forEach(p => {
        const m = Number(p.produced_meter) || 0;
        totalProducedMtr += m;
        orderProduced += m;
      });

      order.allocations.forEach(a => {
        const m = Number(a.allocated_meters) || 0;
        totalAllocatedMtr += m;
        if (a.allocation_type === 'IN_HOUSE') {
          inHouseAllocatedMtr += m;
          if (a.loom_no) inHouseLoomSet.add(a.loom_no);
        } else {
          vendorAllocatedMtr += m;
          if (a.vendor_loom_id || a.loom_no) vendorLoomSet.add(a.vendor_loom_id || a.loom_no);
        }
      });

      if (order.status !== 'COMPLETED') {
        const remaining = (order.order_qty || 0) - orderProduced;
        const completionPct = order.order_qty > 0 ? (orderProduced / order.order_qty) * 100 : 0;
        if (completionPct >= 97 && completionPct <= 103) {
          awaitingConfirmation++;
        } else if (completionPct >= 80 && completionPct < 97) {
          approachingCompletion++;
        }

        if (order.target_date && new Date(order.target_date) < today && remaining > 0) {
          delayedOrders++;
        }
      }
    });

    const remainingMtr = Math.max(0, totalOrderedMtr - totalProducedMtr);
    const unallocatedMtr = Math.max(0, totalOrderedMtr - totalAllocatedMtr);

    // Total In-House Looms Count
    const totalInHouseLooms = await prisma.loomMaster.count();
    // Total Vendor Looms Count
    const totalVendorLooms = await prisma.toaVendorLoom.count();

    // Reference targets from Excel
    const weeklyTargetKpx = 2926000;
    const weeklyMtrCapacity = 810121.52;
    const dailyMtrCapacity = Math.round(weeklyMtrCapacity / 7);

    res.json({
      success: true,
      data: {
        totalOrders,
        pendingOrders,
        allocatedOrders,
        inProductionOrders,
        completedOrders,
        approachingCompletion,
        delayedOrders,
        awaitingConfirmation,
        totalOrderedMtr,
        totalAllocatedMtr,
        totalProducedMtr,
        remainingMtr,
        unallocatedMtr,
        inHouseAllocatedMtr,
        vendorAllocatedMtr,
        allocatedInHouseLooms: inHouseLoomSet.size,
        allocatedVendorLooms: vendorLoomSet.size,
        totalInHouseLooms,
        totalVendorLooms,
        dailyMtrCapacity,
        weeklyMtrCapacity,
        weeklyTargetKpx,
        orders: orders.slice(0, 50)
      }
    });
  } catch (err) {
    console.error('TOA Dashboard error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 2. ORDER CRUD & BULK IMPORT
// ==========================================
router.get('/orders', async (req, res) => {
  try {
    const { status, allocation_type, search, include_completed } = req.query;

    const where = {};
    if (status) {
      where.status = status;
    } else if (include_completed !== 'true') {
      // Exclude completed orders by default from active screens
      where.status = { not: 'COMPLETED' };
    }

    if (allocation_type) {
      where.allocation_type = allocation_type;
    }

    if (search) {
      where.OR = [
        { ibpo: { contains: search, mode: 'insensitive' } },
        { sp_no: { contains: search, mode: 'insensitive' } },
        { customer: { contains: search, mode: 'insensitive' } },
        { order_no: { contains: search, mode: 'insensitive' } }
      ];
    }

    const orders = await prisma.toaOrder.findMany({
      where,
      include: {
        allocations: {
          include: {
            vendor: true,
            vendorLoom: true
          }
        },
        productionLogs: true,
        completionReview: true
      },
      orderBy: [
        { received_date: 'asc' },
        { id: 'asc' }
      ]
    });

    // Compute progress on each order
    const processedOrders = orders.map(o => {
      const produced = o.productionLogs.reduce((acc, p) => acc + (Number(p.produced_meter) || 0), 0);
      const allocated = o.allocations.reduce((acc, a) => acc + (Number(a.allocated_meters) || 0), 0);
      const balanceToWeave = (Number(o.order_qty) || 0) - produced;
      const unallocated = Math.max(0, (Number(o.order_qty) || 0) - allocated);
      const completionPct = o.order_qty > 0 ? (produced / o.order_qty) * 100 : 0;
      const varianceMtr = produced - (Number(o.order_qty) || 0);
      const variancePct = o.order_qty > 0 ? (varianceMtr / o.order_qty) * 100 : 0;

      return {
        ...o,
        total_produced: Math.round(produced * 100) / 100,
        total_allocated: Math.round(allocated * 100) / 100,
        balance_to_weave: Math.round(balanceToWeave * 100) / 100,
        unallocated_meters: Math.round(unallocated * 100) / 100,
        completion_pct: Math.round(completionPct * 10) / 10,
        variance_mtr: Math.round(varianceMtr * 100) / 100,
        variance_pct: Math.round(variancePct * 10) / 10,
        is_completed: o.status === 'COMPLETED'
      };
    });

    res.json({ success: true, data: processedOrders });
  } catch (err) {
    console.error('TOA GET Orders error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Single order details with complete lifecycle
router.get('/orders/:ibpo', async (req, res) => {
  try {
    const { ibpo } = req.params;
    const order = await prisma.toaOrder.findUnique({
      where: { ibpo },
      include: {
        allocations: {
          include: {
            vendor: true,
            vendorLoom: true
          }
        },
        productionLogs: {
          orderBy: { production_date: 'desc' }
        },
        completionReview: true
      }
    });

    if (!order) {
      return res.status(404).json({ success: false, error: `Order with IBPO ${ibpo} not found` });
    }

    const produced = order.productionLogs.reduce((acc, p) => acc + (Number(p.produced_meter) || 0), 0);
    const inHouseProduced = order.productionLogs
      .filter(p => p.allocation_type === 'IN_HOUSE')
      .reduce((acc, p) => acc + (Number(p.produced_meter) || 0), 0);
    const vendorProduced = order.productionLogs
      .filter(p => p.allocation_type === 'VENDOR')
      .reduce((acc, p) => acc + (Number(p.produced_meter) || 0), 0);

    const allocated = order.allocations.reduce((acc, a) => acc + (Number(a.allocated_meters) || 0), 0);
    const balanceToWeave = (Number(order.order_qty) || 0) - produced;
    const varianceMtr = produced - (Number(order.order_qty) || 0);
    const variancePct = order.order_qty > 0 ? (varianceMtr / order.order_qty) * 100 : 0;

    // Fetch design details from DesignMaster if exists
    const design = await prisma.designMaster.findUnique({
      where: { design_no_sp_no: order.sp_no }
    }).catch(() => null);

    res.json({
      success: true,
      data: {
        ...order,
        design_details: design,
        total_produced: Math.round(produced * 100) / 100,
        in_house_produced: Math.round(inHouseProduced * 100) / 100,
        vendor_produced: Math.round(vendorProduced * 100) / 100,
        total_allocated: Math.round(allocated * 100) / 100,
        balance_to_weave: Math.round(balanceToWeave * 100) / 100,
        unallocated_meters: Math.max(0, Math.round(((order.order_qty || 0) - allocated) * 100) / 100),
        completion_pct: order.order_qty > 0 ? Math.round((produced / order.order_qty) * 1000) / 10 : 0,
        variance_mtr: Math.round(varianceMtr * 100) / 100,
        variance_pct: Math.round(variancePct * 10) / 10,
        is_within_3_pct: Math.abs(variancePct) <= 3.0
      }
    });
  } catch (err) {
    console.error('TOA GET Order Details error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create single order
router.post('/orders', async (req, res) => {
  try {
    const {
      ibpo, customer, order_no, sp_no, order_type,
      construction, order_qty, grey_req, product_group,
      ppi, kpx, kpx_factor, width, reed_count, pick,
      frames, weft_colours, received_date, target_date,
      priority, remarks, user
    } = req.body;

    if (!ibpo || !sp_no || !order_qty) {
      return res.status(400).json({ success: false, error: 'IBPO, SP No, and Order Quantity are required' });
    }

    // Check duplicate IBPO
    const existing = await prisma.toaOrder.findUnique({
      where: { ibpo: String(ibpo).trim() }
    });
    if (existing) {
      return res.status(409).json({ success: false, error: `IBPO "${ibpo}" already exists. Cannot duplicate IBPO.` });
    }

    // Auto-populate missing technical specifications from DesignMaster if design exists
    let finalWidth = width;
    let finalConstruction = construction;
    let finalFrames = frames ? Number(frames) : null;
    let finalColors = weft_colours ? Number(weft_colours) : null;
    let finalReed = reed_count;
    let finalPick = pick;
    let finalPpi = ppi ? Number(ppi) : null;

    const design = await prisma.designMaster.findUnique({
      where: { design_no_sp_no: String(sp_no).trim() }
    }).catch(() => null);

    if (design) {
      if (!finalWidth && design.greige_width) finalWidth = design.greige_width;
      if (!finalConstruction && design.construction) finalConstruction = design.construction;
      if (!finalFrames && design.frames) finalFrames = design.frames;
      if (!finalColors && design.weft_colours) finalColors = design.weft_colours;
      if (!finalReed && design.reed_count) finalReed = design.reed_count;
      if (!finalPick && design.pick) finalPick = design.pick;
      if (!finalPpi && design.ppi) finalPpi = design.ppi;
    }

    const finalProductGroup = product_group || (order_type === 'Grey' ? 'Normal Grey' : 'Normal YD');
    const finalFactor = (kpx_factor !== undefined && kpx_factor !== null && !isNaN(Number(kpx_factor)))
      ? Number(kpx_factor)
      : getProductGroupFactor(finalProductGroup);
    const finalGreyReq = grey_req ? Number(grey_req) : Number(order_qty);
    const kpxVals = calculateKpxValues(finalGreyReq, 0, finalPpi, finalFactor, null);

    const created = await prisma.toaOrder.create({
      data: {
        ibpo: String(ibpo).trim(),
        customer: customer ? String(customer).trim() : null,
        order_no: order_no ? String(order_no).trim() : null,
        sp_no: String(sp_no).trim(),
        order_type: order_type ? String(order_type).trim() : 'YD',
        construction: finalConstruction || null,
        order_qty: Number(order_qty),
        grey_req: finalGreyReq,
        grey_completed: 0,
        balance_to_weave: kpxVals.balanceToWeave,
        product_group: finalProductGroup,
        ppi: finalPpi,
        kpx: kpxVals.kpx,
        kpx_factor: kpxVals.kpxFactor,
        corrected_kpx: kpxVals.correctedKpx,
        tolerance_status: 'ACTIVE',
        width: finalWidth ? String(finalWidth).trim() : null,
        reed_count: finalReed ? String(finalReed).trim() : null,
        pick: finalPick ? String(finalPick).trim() : null,
        frames: finalFrames,
        weft_colours: finalColors,
        received_date: safeDate(received_date),
        target_date: target_date ? safeDate(target_date) : null,
        priority: priority || 'Medium',
        status: 'PENDING',
        allocation_type: 'UNALLOCATED',
        remarks: remarks || null
      }
    });

    await prisma.toaAuditLog.create({
      data: {
        ibpo: created.ibpo,
        action: 'ORDER_CREATED',
        entity: 'ToaOrder',
        details: JSON.stringify({ order_qty, sp_no, customer }),
        user: user || 'System'
      }
    });

    res.json({ success: true, data: created });
  } catch (err) {
    console.error('TOA Create Order error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Bulk Import Orders (from Excel or Copy-Paste Grid)
router.post('/orders/bulk', async (req, res) => {
  try {
    const { rows, user } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, error: 'No rows provided for bulk order entry' });
    }

    const results = {
      total: rows.length,
      successCount: 0,
      failedCount: 0,
      errors: [],
      inserted: []
    };

    // Pre-fetch all existing IBPOs to avoid duplicate checks in loop
    const existingIbpos = new Set(
      (await prisma.toaOrder.findMany({ select: { ibpo: true } })).map(o => o.ibpo.toLowerCase())
    );

    // Pre-fetch all designs for auto-enrichment
    const designs = await prisma.designMaster.findMany();
    const designMap = new Map();
    designs.forEach(d => designMap.set(d.design_no_sp_no.toLowerCase(), d));

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 1;
      const ibpo = String(row.ibpo || row['IBPO'] || '').trim();
      const sp_no = String(row.sp_no || row['SP NO'] || row['SP_NO'] || row['Design'] || '').trim();
      const order_qty = parseFloat(row.order_qty || row['GREY REQ'] || row['GREY_REQ'] || row['Quantity'] || row['Qty'] || 0);

      if (!ibpo) {
        results.failedCount++;
        results.errors.push({ row: rowNum, error: 'Missing IBPO' });
        continue;
      }
      if (!sp_no) {
        results.failedCount++;
        results.errors.push({ row: rowNum, ibpo, error: 'Missing SP No / Design' });
        continue;
      }
      if (isNaN(order_qty) || order_qty <= 0) {
        results.failedCount++;
        results.errors.push({ row: rowNum, ibpo, error: 'Invalid or missing Order Quantity' });
        continue;
      }

      if (existingIbpos.has(ibpo.toLowerCase())) {
        results.failedCount++;
        results.errors.push({ row: rowNum, ibpo, error: `Duplicate IBPO "${ibpo}" already exists in system` });
        continue;
      }

      // Check design details
      const design = designMap.get(sp_no.toLowerCase());
      const width = row.width || row['Width'] || (design ? design.greige_width : null);
      const construction = row.construction || row['Construction'] || (design ? design.construction : null);
      const frames = row.frames || (design ? design.frames : null);
      const weft_colours = row.weft_colours || (design ? design.weft_colours : null);
      const reed_count = row.reed_count || row['Reed'] || (design ? design.reed_count : null);
      const pick = row.pick || row['Pick'] || (design ? design.pick : null);
      const ppi = row.ppi || row['PPI'] || (design ? design.ppi : null);
      const order_type = row.order_type || row['Order Type'] || (sp_no.toUpperCase().includes('GREY') ? 'Grey' : 'YD');
      const finalProductGroup = row.product_group || row['Product Group'] || (order_type === 'Grey' ? 'Normal Grey' : 'Normal YD');
      const finalFactor = (row.kpx_factor || row['KPX Factor'])
        ? parseFloat(row.kpx_factor || row['KPX Factor'])
        : getProductGroupFactor(finalProductGroup);
      const finalGreyReq = row.grey_req ? Number(row.grey_req) : order_qty;
      const finalPpi = ppi ? Number(ppi) : null;
      const kpxVals = calculateKpxValues(finalGreyReq, 0, finalPpi, finalFactor, null);
      const received_date = safeDate(row.received_date || row['Order Received Date'] || row['Date']);
      const target_date = row.target_date ? safeDate(row.target_date) : null;

      try {
        const created = await prisma.toaOrder.create({
          data: {
            ibpo,
            customer: row.customer ? String(row.customer).trim() : null,
            order_no: row.order_no ? String(row.order_no).trim() : null,
            sp_no,
            order_type,
            construction: construction ? String(construction).trim() : null,
            order_qty,
            grey_req: finalGreyReq,
            grey_completed: 0,
            balance_to_weave: kpxVals.balanceToWeave,
            product_group: finalProductGroup,
            ppi: finalPpi,
            kpx: kpxVals.kpx,
            kpx_factor: kpxVals.kpxFactor,
            corrected_kpx: kpxVals.correctedKpx,
            tolerance_status: 'ACTIVE',
            width: width ? String(width).trim() : null,
            reed_count: reed_count ? String(reed_count).trim() : null,
            pick: pick ? String(pick).trim() : null,
            frames: frames ? Number(frames) : null,
            weft_colours: weft_colours ? Number(weft_colours) : null,
            received_date,
            target_date,
            priority: row.priority || 'Medium',
            status: 'PENDING',
            allocation_type: 'UNALLOCATED',
            remarks: row.remarks || null
          }
        });

        existingIbpos.add(ibpo.toLowerCase());
        results.successCount++;
        results.inserted.push(created);
      } catch (insertErr) {
        results.failedCount++;
        results.errors.push({ row: rowNum, ibpo, error: insertErr.message });
      }
    }

    await prisma.toaAuditLog.create({
      data: {
        action: 'BULK_ORDERS_IMPORTED',
        entity: 'ToaOrder',
        details: JSON.stringify({ successCount: results.successCount, failedCount: results.failedCount }),
        user: user || 'System'
      }
    });

    res.json({ success: true, data: results });
  } catch (err) {
    console.error('TOA Bulk Orders error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update single order
router.put('/orders/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const data = { ...req.body };
    delete data.id;
    delete data.createdAt;
    delete data.updatedAt;

    if (data.order_qty) data.order_qty = Number(data.order_qty);
    if (data.grey_req) data.grey_req = Number(data.grey_req);
    if (data.frames) data.frames = Number(data.frames);
    if (data.weft_colours) data.weft_colours = Number(data.weft_colours);
    if (data.ppi) data.ppi = Number(data.ppi);
    if (data.kpx) data.kpx = Number(data.kpx);
    if (data.kpx_factor) data.kpx_factor = Number(data.kpx_factor);
    if (data.received_date) data.received_date = safeDate(data.received_date);
    if (data.target_date) data.target_date = safeDate(data.target_date);

    const updated = await prisma.toaOrder.update({
      where: { id },
      data
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('TOA Update Order error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 3. CAPABILITY CHECKING & FIFO SCHEDULING
// ==========================================

// IN-HOUSE CAPABILITY ENGINE
router.get('/capability/in-house/:ibpo', async (req, res) => {
  try {
    const { ibpo } = req.params;
    const order = await prisma.toaOrder.findUnique({
      where: { ibpo },
      include: { allocations: true, productionLogs: true }
    });

    if (!order) {
      return res.status(404).json({ success: false, error: `Order ${ibpo} not found` });
    }

    // Determine order technical requirements
    let design = await prisma.designMaster.findUnique({
      where: { design_no_sp_no: order.sp_no }
    }).catch(() => null);

    const reqWidthInches = parseWidthInInches(order.width || (design ? design.greige_width : ''));
    const reqFrames = order.frames || (design ? design.frames : 0);
    const reqWeftColors = order.weft_colours || (design ? design.weft_colours : 0);
    const reqPpi = order.ppi || (design ? design.ppi : 66);

    const orderQty = Number(order.order_qty) || 0;
    const alreadyAllocated = order.allocations.reduce((acc, a) => acc + (Number(a.allocated_meters) || 0), 0);
    const alreadyProduced = order.productionLogs.reduce((acc, p) => acc + (Number(p.produced_meter) || 0), 0);
    const remainingToAllocate = Math.max(0, orderQty - alreadyAllocated);

    // Fetch all in-house looms and their running entries
    const looms = await prisma.loomMaster.findMany({
      include: {
        LoomRunEntry: true
      },
      orderBy: { loom_no: 'asc' }
    });

    // Fetch all future confirmed allocations on in-house looms
    const futureAllocations = await prisma.toaAllocation.findMany({
      where: {
        allocation_type: 'IN_HOUSE',
        status: { in: ['CONFIRMED', 'RUNNING'] }
      },
      orderBy: { estimated_runout_date: 'desc' }
    });

    const candidateLooms = [];
    let eligibleCount = 0;
    let totalFeasibleCapacity = 0;
    const today = new Date();

    for (const loom of looms) {
      const loomWidthInches = parseWidthInInches(loom.width);
      const loomFrames = loom.frame_capacity || 16;
      const loomColors = loom.max_weft_colours || loom.weft_colours || 4;

      const matchedCriteria = [];
      const failedReasons = [];

      // 1. Width Compatibility
      if (reqWidthInches > 0 && loomWidthInches > 0) {
        if (loomWidthInches >= reqWidthInches) {
          matchedCriteria.push(`Width compatible (${loomWidthInches.toFixed(1)}" >= ${reqWidthInches.toFixed(1)}")`);
        } else {
          failedReasons.push(`Width too narrow (Loom: ${loomWidthInches.toFixed(1)}", Req: ${reqWidthInches.toFixed(1)}")`);
        }
      } else {
        matchedCriteria.push('Width within standard range');
      }

      // 2. Frame Capacity Compatibility
      if (reqFrames > 0) {
        if (loomFrames >= reqFrames) {
          matchedCriteria.push(`Frames compatible (${loomFrames} >= ${reqFrames})`);
        } else {
          failedReasons.push(`Insufficient frames (Loom: ${loomFrames}, Req: ${reqFrames})`);
        }
      }

      // 3. Weft Colour Compatibility
      if (reqWeftColors > 0) {
        if (loomColors >= reqWeftColors) {
          matchedCriteria.push(`Colours compatible (${loomColors} >= ${reqWeftColors})`);
        } else {
          failedReasons.push(`Insufficient weft colors (Loom: ${loomColors}, Req: ${reqWeftColors})`);
        }
      }

      // 4. Status Check
      if (loom.status && loom.status.toUpperCase() === 'MAINTENANCE') {
        failedReasons.push('Loom currently under maintenance');
      }

      const isEligible = failedReasons.length === 0;
      if (isEligible) eligibleCount++;

      // Schedule & Availability calculation
      let currentRunoutDate = today;
      let currentRunningDesign = null;
      let currentRunningBalance = 0;
      let dailyProd = 160; // Standard fallback MTR/day

      if (loom.LoomRunEntry) {
        const lre = loom.LoomRunEntry;
        currentRunningDesign = lre.design_no_sp_no;
        if (lre.daily_production && lre.daily_production > 0) {
          dailyProd = Number(lre.daily_production);
        } else if (lre.rpm && reqPpi > 0) {
          // Calculate theoretical prod = (rpm * 60 * 24 * 0.85) / (ppi * 39.37)
          dailyProd = Math.round(((lre.rpm * 1440 * 0.85) / (reqPpi * 39.37)));
        }

        if (lre.warped_meter > 0) {
          // Estimate remaining warp days
          const daysRunning = Math.max(0, (today.getTime() - new Date(lre.loom_start_date).getTime()) / (1000 * 3600 * 24));
          const approxProduced = daysRunning * dailyProd;
          currentRunningBalance = Math.max(0, lre.warped_meter - approxProduced);
          const daysLeft = currentRunningBalance > 0 ? Math.ceil(currentRunningBalance / dailyProd) : 0;
          currentRunoutDate = addDays(today, daysLeft);
        }
      }

      // Check future queued allocations on this specific loom
      const loomQueued = futureAllocations.filter(a => a.loom_no === loom.loom_no);
      let earliestStartDate = currentRunoutDate > today ? currentRunoutDate : today;

      loomQueued.forEach(qa => {
        const qEnd = new Date(qa.estimated_runout_date);
        if (qEnd > earliestStartDate) {
          earliestStartDate = qEnd;
        }
      });

      // Calculate days required if this loom runs remaining order
      const daysRequiredForRemaining = Math.max(1, Math.ceil(remainingToAllocate / (dailyProd || 160)));
      const estimatedRunout = addDays(earliestStartDate, daysRequiredForRemaining);

      candidateLooms.push({
        loom_no: loom.loom_no,
        loom_type: loom.loom_type || 'Airjet',
        shed_name: loom.shed_name || `Shed ${loom.shed || 1}`,
        width: loom.width || '190 cm',
        frame_capacity: loomFrames,
        weft_colours: loomColors,
        rpm: loom.rpm || loom.act_rpm || 650,
        daily_prod_rate: dailyProd,
        current_running_design: currentRunningDesign,
        current_running_balance: Math.round(currentRunningBalance),
        current_runout_date: formatDate(currentRunoutDate),
        earliest_start_date: formatDate(earliestStartDate),
        estimated_completion_date: formatDate(estimatedRunout),
        is_eligible: isEligible,
        matched_criteria: matchedCriteria,
        failed_reasons: failedReasons,
        recommended_allocation_meters: isEligible ? remainingToAllocate : 0
      });
    }

    // Sort candidate looms: Eligible first, then earliest start date ASC, then loom_no ASC
    candidateLooms.sort((a, b) => {
      if (a.is_eligible !== b.is_eligible) return a.is_eligible ? -1 : 1;
      return new Date(a.earliest_start_date) - new Date(b.earliest_start_date);
    });

    res.json({
      success: true,
      data: {
        order,
        requirements: {
          sp_no: order.sp_no,
          order_qty: orderQty,
          remaining_to_allocate: remainingToAllocate,
          already_allocated: alreadyAllocated,
          already_produced: alreadyProduced,
          req_width_inches: reqWidthInches,
          req_frames: reqFrames,
          req_weft_colours: reqWeftColors,
          req_ppi: reqPpi
        },
        eligible_looms_count: eligibleCount,
        total_in_house_looms: looms.length,
        candidate_looms: candidateLooms
      }
    });
  } catch (err) {
    console.error('TOA In-House Capability error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// VENDOR CAPABILITY ENGINE
router.get('/capability/vendor/:ibpo', async (req, res) => {
  try {
    const { ibpo } = req.params;
    const order = await prisma.toaOrder.findUnique({
      where: { ibpo },
      include: { allocations: true, productionLogs: true }
    });

    if (!order) {
      return res.status(404).json({ success: false, error: `Order ${ibpo} not found` });
    }

    const design = await prisma.designMaster.findUnique({
      where: { design_no_sp_no: order.sp_no }
    }).catch(() => null);

    const reqWidthInches = parseWidthInInches(order.width || (design ? design.greige_width : ''));
    const reqFrames = order.frames || (design ? design.frames : 0);
    const reqWeftColors = order.weft_colours || (design ? design.weft_colours : 0);
    const reqPpi = order.ppi || (design ? design.ppi : 66);

    const orderQty = Number(order.order_qty) || 0;
    const alreadyAllocated = order.allocations.reduce((acc, a) => acc + (Number(a.allocated_meters) || 0), 0);
    const remainingToAllocate = Math.max(0, orderQty - alreadyAllocated);

    const vendors = await prisma.toaVendor.findMany({
      where: { active: true },
      include: {
        looms: true
      },
      orderBy: { vendor_name: 'asc' }
    });

    const futureAllocations = await prisma.toaAllocation.findMany({
      where: {
        allocation_type: 'VENDOR',
        status: { in: ['CONFIRMED', 'RUNNING'] }
      }
    });

    const today = new Date();
    const vendorResults = [];

    for (const v of vendors) {
      const suitableLooms = [];
      for (const loom of v.looms) {
        const loomWidthInches = parseWidthInInches(loom.width);
        const loomFrames = loom.frame_capacity || 16;
        const loomColors = loom.max_weft_colours || 4;

        const matchedCriteria = [];
        const failedReasons = [];

        if (reqWidthInches > 0 && loomWidthInches > 0) {
          if (loomWidthInches >= reqWidthInches) {
            matchedCriteria.push(`Width compatible (${loomWidthInches.toFixed(1)}" >= ${reqWidthInches.toFixed(1)}")`);
          } else {
            failedReasons.push(`Width too narrow (Loom: ${loomWidthInches.toFixed(1)}", Req: ${reqWidthInches.toFixed(1)}")`);
          }
        }

        if (reqFrames > 0 && loomFrames < reqFrames) {
          failedReasons.push(`Frames inadequate (${loomFrames} < ${reqFrames})`);
        }

        if (reqWeftColors > 0 && loomColors < reqWeftColors) {
          failedReasons.push(`Weft colors inadequate (${loomColors} < ${reqWeftColors})`);
        }

        if (loom.status === 'MAINTENANCE') {
          failedReasons.push('Under maintenance');
        }

        const isEligible = failedReasons.length === 0;

        // Check queued commitments
        const queued = futureAllocations.filter(a => a.vendor_loom_id === loom.id);
        let earliestStartDate = today;
        queued.forEach(qa => {
          const qEnd = new Date(qa.estimated_runout_date);
          if (qEnd > earliestStartDate) earliestStartDate = qEnd;
        });

        const dailyRate = loom.avg_daily_prod || 150;
        const daysRequired = Math.max(1, Math.ceil(remainingToAllocate / dailyRate));
        const estimatedRunout = addDays(earliestStartDate, daysRequired);

        suitableLooms.push({
          id: loom.id,
          loom_no: loom.loom_no,
          loom_type: loom.loom_type || 'Rapier',
          width: loom.width,
          frame_capacity: loomFrames,
          max_weft_colours: loomColors,
          avg_daily_prod: dailyRate,
          status: loom.status,
          earliest_start_date: formatDate(earliestStartDate),
          estimated_completion_date: formatDate(estimatedRunout),
          is_eligible: isEligible,
          matched_criteria: matchedCriteria,
          failed_reasons: failedReasons
        });
      }

      vendorResults.push({
        vendor_id: v.id,
        vendor_name: v.vendor_name,
        vendor_code: v.vendor_code,
        contact_person: v.contact_person,
        phone: v.phone,
        total_declared_looms: v.total_declared_looms,
        actual_looms_count: v.looms.length,
        eligible_looms_count: suitableLooms.filter(l => l.is_eligible).length,
        looms: suitableLooms
      });
    }

    res.json({
      success: true,
      data: {
        order,
        remaining_to_allocate: remainingToAllocate,
        vendors: vendorResults
      }
    });
  } catch (err) {
    console.error('TOA Vendor Capability error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 4. CONFIRM ALLOCATION
// ==========================================
router.post('/allocate', async (req, res) => {
  try {
    const { ibpo, allocation_type, allocations, user } = req.body;

    if (!ibpo || !allocation_type || !Array.isArray(allocations) || allocations.length === 0) {
      return res.status(400).json({ success: false, error: 'IBPO, allocation type, and allocation list are required' });
    }

    const order = await prisma.toaOrder.findUnique({
      where: { ibpo },
      include: { allocations: true }
    });

    if (!order) {
      return res.status(404).json({ success: false, error: `Order with IBPO ${ibpo} not found` });
    }

    if (order.status === 'COMPLETED') {
      return res.status(400).json({ success: false, error: `Order ${ibpo} is already COMPLETED and closed` });
    }

    // Save each allocation in transaction
    const createdAllocations = [];
    let totalNewAllocated = 0;

    await prisma.$transaction(async (tx) => {
      for (const item of allocations) {
        const meters = Number(item.allocated_meters) || 0;
        if (meters <= 0) continue;

        totalNewAllocated += meters;
        const startDate = safeDate(item.estimated_start_date);
        const daysTaken = Math.max(1, Math.ceil(meters / (Number(item.avg_daily_prod) || 160)));
        const runoutDate = item.estimated_runout_date ? safeDate(item.estimated_runout_date) : addDays(startDate, daysTaken);

        const record = await tx.toaAllocation.create({
          data: {
            order_id: order.id,
            ibpo: order.ibpo,
            allocation_type: allocation_type,
            loom_no: item.loom_no ? parseInt(item.loom_no) : null,
            vendor_id: item.vendor_id ? parseInt(item.vendor_id) : null,
            vendor_loom_id: item.vendor_loom_id ? parseInt(item.vendor_loom_id) : null,
            allocated_meters: meters,
            estimated_start_date: startDate,
            estimated_runout_date: runoutDate,
            avg_daily_prod: Number(item.avg_daily_prod) || 160,
            days_taken: daysTaken,
            status: 'CONFIRMED',
            remarks: item.remarks || null
          }
        });
        createdAllocations.push(record);
      }

      // Update Order Status and Allocation Type
      await tx.toaOrder.update({
        where: { id: order.id },
        data: {
          status: 'ALLOCATED',
          allocation_type: allocation_type
        }
      });

      await tx.toaAuditLog.create({
        data: {
          ibpo: order.ibpo,
          action: 'ORDER_ALLOCATED',
          entity: 'ToaAllocation',
          details: JSON.stringify({ allocation_type, totalNewAllocated, count: createdAllocations.length }),
          user: user || 'System'
        }
      });
    });

    res.json({ success: true, data: createdAllocations });
  } catch (err) {
    console.error('TOA Confirm Allocation error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 5. VENDOR MASTER & VENDOR LOOM CRUD
// ==========================================
router.get('/vendors', async (req, res) => {
  try {
    const vendors = await prisma.toaVendor.findMany({
      include: {
        looms: true,
        allocations: {
          where: { status: { in: ['CONFIRMED', 'RUNNING'] } }
        }
      },
      orderBy: { vendor_name: 'asc' }
    });

    const enriched = vendors.map(v => {
      const activeAllocatedMtr = v.allocations.reduce((acc, a) => acc + (Number(a.allocated_meters) || 0), 0);
      return {
        ...v,
        actual_looms_count: v.looms.length,
        active_allocations_count: v.allocations.length,
        active_allocated_meters: activeAllocatedMtr
      };
    });

    res.json({ success: true, data: enriched });
  } catch (err) {
    console.error('TOA GET Vendors error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/vendors', async (req, res) => {
  try {
    const { vendor_name, vendor_code, contact_person, phone, email, total_declared_looms, remarks, user } = req.body;
    if (!vendor_name) {
      return res.status(400).json({ success: false, error: 'Vendor name is required' });
    }

    const created = await prisma.toaVendor.create({
      data: {
        vendor_name: String(vendor_name).trim(),
        vendor_code: vendor_code ? String(vendor_code).trim() : null,
        contact_person: contact_person ? String(contact_person).trim() : null,
        phone: phone ? String(phone).trim() : null,
        email: email ? String(email).trim() : null,
        total_declared_looms: total_declared_looms ? parseInt(total_declared_looms) : 0,
        remarks: remarks || null
      }
    });

    await prisma.toaAuditLog.create({
      data: {
        action: 'VENDOR_CREATED',
        entity: 'ToaVendor',
        details: JSON.stringify(created),
        user: user || 'System'
      }
    });

    res.json({ success: true, data: created });
  } catch (err) {
    console.error('TOA Create Vendor error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Bulk Create Vendor Looms (e.g. create 45 looms with sequence)
router.post('/vendors/:id/looms/bulk', async (req, res) => {
  try {
    const vendor_id = parseInt(req.params.id);
    const {
      count, prefix, start_number, loom_type,
      width, frame_capacity, max_weft_colours,
      max_ppi, avg_daily_prod, user
    } = req.body;

    const vendor = await prisma.toaVendor.findUnique({ where: { id: vendor_id } });
    if (!vendor) return res.status(404).json({ success: false, error: 'Vendor not found' });

    const totalToCreate = parseInt(count) || 1;
    const loomPrefix = prefix || 'L-';
    const startNum = parseInt(start_number) || 1;

    const createdLooms = [];
    const errors = [];

    for (let i = 0; i < totalToCreate; i++) {
      const seq = startNum + i;
      const loom_no = `${loomPrefix}${String(seq).padStart(2, '0')}`;

      try {
        const loom = await prisma.toaVendorLoom.create({
          data: {
            vendor_id,
            loom_no,
            loom_type: loom_type || 'Rapier',
            width: width || '75 inch',
            frame_capacity: frame_capacity ? parseInt(frame_capacity) : 16,
            max_weft_colours: max_weft_colours ? parseInt(max_weft_colours) : 4,
            max_ppi: max_ppi ? parseInt(max_ppi) : 90,
            avg_daily_prod: avg_daily_prod ? Number(avg_daily_prod) : 150.0,
            status: 'AVAILABLE'
          }
        });
        createdLooms.push(loom);
      } catch (err) {
        errors.push({ loom_no, error: err.message });
      }
    }

    // Update vendor total_declared_looms if needed
    const actualCount = await prisma.toaVendorLoom.count({ where: { vendor_id } });
    await prisma.toaVendor.update({
      where: { id: vendor_id },
      data: { total_declared_looms: Math.max(vendor.total_declared_looms, actualCount) }
    });

    await prisma.toaAuditLog.create({
      data: {
        action: 'VENDOR_LOOMS_BULK_CREATED',
        entity: 'ToaVendorLoom',
        details: JSON.stringify({ vendor_id, created: createdLooms.length, errors }),
        user: user || 'System'
      }
    });

    res.json({
      success: true,
      data: {
        createdCount: createdLooms.length,
        createdLooms,
        errors
      }
    });
  } catch (err) {
    console.error('TOA Bulk Vendor Looms error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update single vendor loom
router.put('/vendor-looms/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const data = { ...req.body };
    delete data.id;
    delete data.createdAt;
    delete data.updatedAt;

    if (data.frame_capacity) data.frame_capacity = parseInt(data.frame_capacity);
    if (data.max_weft_colours) data.max_weft_colours = parseInt(data.max_weft_colours);
    if (data.avg_daily_prod) data.avg_daily_prod = Number(data.avg_daily_prod);

    const updated = await prisma.toaVendorLoom.update({
      where: { id },
      data
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('TOA Update Vendor Loom error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 6. PRODUCTION UPDATE ENTRY
// ==========================================
router.get('/production/:ibpo', async (req, res) => {
  try {
    const { ibpo } = req.params;
    const order = await prisma.toaOrder.findUnique({
      where: { ibpo },
      include: {
        allocations: true,
        productionLogs: {
          orderBy: { production_date: 'desc' }
        }
      }
    });

    if (!order) {
      return res.status(404).json({ success: false, error: `Order ${ibpo} not found` });
    }

    const totalProduced = order.productionLogs.reduce((acc, p) => acc + (Number(p.produced_meter) || 0), 0);
    const balanceToWeave = (Number(order.order_qty) || 0) - totalProduced;

    res.json({
      success: true,
      data: {
        order,
        totalProduced: Math.round(totalProduced * 100) / 100,
        balanceToWeave: Math.round(balanceToWeave * 100) / 100,
        logs: order.productionLogs
      }
    });
  } catch (err) {
    console.error('TOA GET Production error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Single Daily Production Entry
router.post('/production', async (req, res) => {
  try {
    const {
      ibpo, allocation_type, loom_no, vendor_id,
      vendor_loom_id, production_date, produced_meter,
      entered_by, remarks
    } = req.body;

    if (!ibpo || produced_meter === undefined || produced_meter === null) {
      return res.status(400).json({ success: false, error: 'IBPO and Produced Meters are required' });
    }

    const order = await prisma.toaOrder.findUnique({
      where: { ibpo },
      include: { allocations: true, productionLogs: true }
    });

    if (!order) {
      return res.status(404).json({ success: false, error: `Order ${ibpo} not found` });
    }

    if (order.status === 'COMPLETED') {
      return res.status(400).json({ success: false, error: `Order ${ibpo} is already COMPLETED and closed. Reopen first if corrections are required.` });
    }

    const pDate = safeDate(production_date);
    const mtr = Number(produced_meter);
    if (isNaN(mtr) || mtr < 0) {
      return res.status(400).json({ success: false, error: 'Produced meters must be a non-negative number' });
    }

    // Find corresponding allocation
    let allocationId = null;
    if (loom_no) {
      const matchAlloc = order.allocations.find(a => a.loom_no === parseInt(loom_no));
      if (matchAlloc) allocationId = matchAlloc.id;
    }

    const createdLog = await prisma.toaProductionLog.create({
      data: {
        order_id: order.id,
        allocation_id: allocationId,
        ibpo: order.ibpo,
        allocation_type: allocation_type || order.allocation_type || 'IN_HOUSE',
        loom_no: loom_no ? parseInt(loom_no) : null,
        vendor_id: vendor_id ? parseInt(vendor_id) : null,
        vendor_loom_id: vendor_loom_id ? parseInt(vendor_loom_id) : null,
        production_date: pDate,
        produced_meter: mtr,
        entered_by: entered_by || 'System',
        remarks: remarks || null
      }
    });

    // Update Order Status to IN_PRODUCTION if currently ALLOCATED or PENDING
    if (order.status === 'PENDING' || order.status === 'ALLOCATED') {
      await prisma.toaOrder.update({
        where: { id: order.id },
        data: { status: 'IN_PRODUCTION' }
      });
    }

    await prisma.toaAuditLog.create({
      data: {
        ibpo: order.ibpo,
        action: 'PRODUCTION_ENTRY_ADDED',
        entity: 'ToaProductionLog',
        details: JSON.stringify({ mtr, pDate: formatDate(pDate), loom_no }),
        user: entered_by || 'System'
      }
    });

    res.json({ success: true, data: createdLog });
  } catch (err) {
    console.error('TOA Production Entry error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Bulk Production Entry (supports Excel paste)
router.post('/production/bulk', async (req, res) => {
  try {
    const { rows, entered_by } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, error: 'No rows provided for bulk production entry' });
    }

    const results = {
      total: rows.length,
      successCount: 0,
      failedCount: 0,
      errors: [],
      inserted: []
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 1;
      const ibpo = String(row.ibpo || row['IBPO'] || '').trim();
      const produced_meter = parseFloat(row.produced_meter || row['Meters'] || row['MTR'] || row['Production'] || 0);
      const production_date = safeDate(row.production_date || row['Date'] || row['Production Date']);
      const loom_no = row.loom_no || row['Loom'] || row['Loom No'] ? parseInt(row.loom_no || row['Loom'] || row['Loom No']) : null;
      const allocation_type = row.allocation_type || (row.vendor_id ? 'VENDOR' : 'IN_HOUSE');

      if (!ibpo) {
        results.failedCount++;
        results.errors.push({ row: rowNum, error: 'Missing IBPO' });
        continue;
      }

      if (isNaN(produced_meter) || produced_meter <= 0) {
        results.failedCount++;
        results.errors.push({ row: rowNum, ibpo, error: 'Invalid produced meters' });
        continue;
      }

      const order = await prisma.toaOrder.findUnique({
        where: { ibpo }
      });

      if (!order) {
        results.failedCount++;
        results.errors.push({ row: rowNum, ibpo, error: `Order ${ibpo} not found` });
        continue;
      }

      if (order.status === 'COMPLETED') {
        results.failedCount++;
        results.errors.push({ row: rowNum, ibpo, error: `Order ${ibpo} is COMPLETED and closed` });
        continue;
      }

      try {
        const log = await prisma.toaProductionLog.create({
          data: {
            order_id: order.id,
            ibpo: order.ibpo,
            allocation_type,
            loom_no,
            production_date,
            produced_meter,
            entered_by: entered_by || 'System',
            remarks: row.remarks || null
          }
        });

        if (order.status !== 'IN_PRODUCTION') {
          await prisma.toaOrder.update({
            where: { id: order.id },
            data: { status: 'IN_PRODUCTION' }
          });
        }

        results.successCount++;
        results.inserted.push(log);
      } catch (err) {
        results.failedCount++;
        results.errors.push({ row: rowNum, ibpo, error: err.message });
      }
    }

    res.json({ success: true, data: results });
  } catch (err) {
    console.error('TOA Bulk Production error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 6B. EXACT 2-COLUMN BULK PRODUCTION PASTE GRID [IBPO | Total Mtrs]
// Cumulative update with 2% tolerance completion (>=98%) and overproduction (>102%)
// ==========================================
router.post(['/production/bulk-paste', '/orders/bulk-paste-production'], async (req, res) => {
  try {
    let { rows, text, entered_by } = req.body;

    // Support raw Excel clipboard text: "IBPO\tTotal Mtrs\n..."
    if ((!rows || !Array.isArray(rows) || rows.length === 0) && typeof text === 'string' && text.trim()) {
      const lines = text.trim().split(/\r?\n/);
      rows = [];
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        if (line.toLowerCase().includes('ibpo') && (line.toLowerCase().includes('mtr') || line.toLowerCase().includes('total'))) {
          continue; // skip header row
        }
        const parts = line.split(/[\t,;]+|\s{2,}/);
        if (parts.length >= 2) {
          rows.push({
            ibpo: parts[0].trim(),
            total_meters: parseFloat(parts[1].trim())
          });
        } else {
          const spaceParts = line.split(/\s+/);
          if (spaceParts.length >= 2) {
            rows.push({
              ibpo: spaceParts[0].trim(),
              total_meters: parseFloat(spaceParts[1].trim())
            });
          }
        }
      }
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, error: 'No rows provided. Paste 2 columns: [IBPO | Total Mtrs]' });
    }

    const updated = [];
    const unchanged = [];
    const autoCompleted = [];
    const overproduced = [];
    const notFound = [];
    const invalid = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 1;
      const ibpo = String(row.ibpo || row['IBPO'] || '').trim();
      const rawMeters = row.total_meters !== undefined ? row.total_meters : (row['Total Mtrs'] || row['Total Meters'] || row['Meters']);
      const totalMeters = parseFloat(rawMeters);

      if (!ibpo) {
        invalid.push({ row: rowNum, error: 'Missing IBPO' });
        continue;
      }
      if (isNaN(totalMeters) || totalMeters < 0) {
        invalid.push({ row: rowNum, ibpo, error: 'Invalid or negative Total Mtrs' });
        continue;
      }

      const order = await prisma.toaOrder.findUnique({
        where: { ibpo }
      });

      if (!order) {
        notFound.push({ row: rowNum, ibpo, error: `IBPO "${ibpo}" not found in Total Order Allocation system` });
        continue;
      }

      const currentCompleted = Number(order.grey_completed || 0);

      // Check if unchanged (within 0.001 MTR) -> Skip unnecessary DB writes
      if (Math.abs(totalMeters - currentCompleted) < 0.001) {
        unchanged.push({
          row: rowNum,
          ibpo,
          meters: currentCompleted,
          status: order.status,
          tolerance_status: order.tolerance_status || 'UNCHANGED',
          message: 'Cumulative meters identical to current record. Row skipped.'
        });
        continue;
      }

      // Changed row: Recalculate exact KPX engine values
      const greyReq = Number(order.grey_req || order.order_qty || 1);
      const factor = Number(order.kpx_factor || getProductGroupFactor(order.product_group));
      const kpxVals = calculateKpxValues(greyReq, totalMeters, order.ppi, factor, order.days_taken);
      const completionPct = (totalMeters / greyReq) * 100;
      const deltaMeters = totalMeters - currentCompleted;

      let newStatus = order.status;
      let toleranceStatus = 'IN_PROGRESS';

      if (completionPct >= 98.0 && completionPct <= 102.0) {
        newStatus = 'COMPLETED';
        toleranceStatus = '2% AUTO-COMPLETED (>=98%)';
      } else if (completionPct > 102.0) {
        newStatus = 'COMPLETED';
        toleranceStatus = 'OVERPRODUCED (>102%)';
      } else {
        newStatus = totalMeters > 0 ? 'IN_PRODUCTION' : order.status;
        toleranceStatus = 'IN_PROGRESS';
      }

      // Update ToaOrder
      await prisma.toaOrder.update({
        where: { id: order.id },
        data: {
          grey_completed: totalMeters,
          balance_to_weave: kpxVals.balanceToWeave,
          kpx: kpxVals.kpx,
          corrected_kpx: kpxVals.correctedKpx,
          corrected_kpx_per_day: kpxVals.correctedKpxPerDay,
          status: newStatus,
          tolerance_status: toleranceStatus,
          current_updated_date: new Date()
        }
      });

      // Log production entry
      await prisma.toaProductionLog.create({
        data: {
          order_id: order.id,
          ibpo: order.ibpo,
          allocation_type: order.allocation_type || 'IN_HOUSE',
          production_date: new Date(),
          produced_meter: deltaMeters > 0 ? deltaMeters : totalMeters,
          entered_by: entered_by || '2-Col Paste Grid',
          remarks: `Cumulative total: ${totalMeters} MTR (${completionPct.toFixed(1)}%). Prev: ${currentCompleted} MTR (Delta: ${deltaMeters >= 0 ? '+' : ''}${deltaMeters.toFixed(1)} MTR).`
        }
      });

      // If order reached completion tolerance, upsert Completion Review
      if (completionPct >= 98.0) {
        await prisma.toaCompletionReview.upsert({
          where: { order_id: order.id },
          create: {
            order_id: order.id,
            ibpo: order.ibpo,
            total_ordered: greyReq,
            total_produced: totalMeters,
            difference_meters: greyReq - totalMeters,
            variance_percent: Math.abs(100 - completionPct),
            is_within_3_pct: completionPct >= 97 && completionPct <= 103,
            status: 'CLOSED',
            closed_by: entered_by || '2-Col Paste Grid (2% Auto-Complete)',
            approval_reason: `Auto-completed via 2-column paste grid: ${totalMeters} / ${greyReq} MTR (${completionPct.toFixed(1)}%). Satisfies 2% tolerance threshold.`
          },
          update: {
            total_produced: totalMeters,
            difference_meters: greyReq - totalMeters,
            variance_percent: Math.abs(100 - completionPct),
            status: 'CLOSED',
            closed_by: entered_by || '2-Col Paste Grid (2% Auto-Complete)',
            approval_reason: `Auto-completed via 2-column paste grid: ${totalMeters} / ${greyReq} MTR (${completionPct.toFixed(1)}%). Satisfies 2% tolerance threshold.`,
            closed_at: new Date()
          }
        });
      }

      const updateRecord = {
        row: rowNum,
        ibpo,
        sp_no: order.sp_no,
        previousMeters: currentCompleted,
        updatedMeters: totalMeters,
        deltaMeters: Math.round(deltaMeters * 10) / 10,
        greyReq,
        balanceToWeave: kpxVals.balanceToWeave,
        completionPct: completionPct.toFixed(1),
        status: newStatus,
        tolerance_status: toleranceStatus
      };

      updated.push(updateRecord);

      if (completionPct >= 98.0 && completionPct <= 102.0) {
        autoCompleted.push(updateRecord);
      } else if (completionPct > 102.0) {
        overproduced.push(updateRecord);
      }
    }

    res.json({
      success: true,
      data: {
        totalRows: rows.length,
        updatedCount: updated.length,
        unchangedCount: unchanged.length,
        autoCompletedCount: autoCompleted.length,
        overproducedCount: overproduced.length,
        notFoundCount: notFound.length,
        invalidCount: invalid.length,
        updated,
        unchanged,
        autoCompleted,
        overproduced,
        notFound,
        invalid
      }
    });
  } catch (err) {
    console.error('TOA Bulk Paste Production error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 7B. EXACT 1-COLUMN BULK COMPLETION REVIEW GRID [IBPO]
// Bulk completes orders satisfying >=98% tolerance, otherwise explains balance
// ==========================================
router.post('/completion/bulk-complete', async (req, res) => {
  try {
    let { ibpos, text, user } = req.body;

    // Parse single-column clipboard text: "IBPO\n..."
    if ((!ibpos || !Array.isArray(ibpos) || ibpos.length === 0) && typeof text === 'string' && text.trim()) {
      const lines = text.trim().split(/\r?\n/);
      ibpos = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed.toLowerCase() === 'ibpo' || trimmed.toLowerCase() === 'ibpo no') continue;
        const firstCol = trimmed.split(/[\t,;\s]+/)[0];
        if (firstCol) ibpos.push(firstCol);
      }
    }

    if (!Array.isArray(ibpos) || ibpos.length === 0) {
      return res.status(400).json({ success: false, error: 'No IBPO list provided. Paste 1 column: [IBPO]' });
    }

    const completed = [];
    const alreadyCompleted = [];
    const rejected = [];
    const notFound = [];

    for (let i = 0; i < ibpos.length; i++) {
      const rawIbpo = ibpos[i];
      const ibpo = String(rawIbpo).trim();
      if (!ibpo) continue;

      const order = await prisma.toaOrder.findUnique({
        where: { ibpo }
      });

      if (!order) {
        notFound.push({ ibpo, reason: `IBPO "${ibpo}" not found in system` });
        continue;
      }

      if (order.status === 'COMPLETED') {
        alreadyCompleted.push({
          ibpo,
          sp_no: order.sp_no,
          grey_completed: order.grey_completed,
          order_qty: order.order_qty,
          message: 'Order is already marked as COMPLETED'
        });
        continue;
      }

      const greyReq = Number(order.grey_req || order.order_qty || 1);
      const greyCompleted = Number(order.grey_completed || 0);
      const completionPct = (greyCompleted / greyReq) * 100;
      const remainingMtr = Math.max(0, greyReq - greyCompleted);

      // 2% completion tolerance threshold (>= 98%)
      if (completionPct >= 98.0) {
        const isOver = completionPct > 102.0;
        const toleranceStatus = isOver ? 'OVERPRODUCED (>102%)' : 'TOLERANCE_APPROVED (>=98%)';

        await prisma.toaOrder.update({
          where: { id: order.id },
          data: {
            status: 'COMPLETED',
            tolerance_status: toleranceStatus,
            current_updated_date: new Date()
          }
        });

        await prisma.toaCompletionReview.upsert({
          where: { order_id: order.id },
          create: {
            order_id: order.id,
            ibpo: order.ibpo,
            total_ordered: greyReq,
            total_produced: greyCompleted,
            difference_meters: greyReq - greyCompleted,
            variance_percent: Math.abs(100 - completionPct),
            is_within_3_pct: completionPct >= 97 && completionPct <= 103,
            status: 'CLOSED',
            closed_by: user || '1-Col Bulk Complete Grid',
            approval_reason: `Bulk completed via 1-column grid. Completed: ${greyCompleted} / ${greyReq} MTR (${completionPct.toFixed(1)}%). 2% tolerance threshold satisfied.`
          },
          update: {
            total_produced: greyCompleted,
            difference_meters: greyReq - greyCompleted,
            variance_percent: Math.abs(100 - completionPct),
            status: 'CLOSED',
            closed_by: user || '1-Col Bulk Complete Grid',
            approval_reason: `Bulk completed via 1-column grid. Completed: ${greyCompleted} / ${greyReq} MTR (${completionPct.toFixed(1)}%). 2% tolerance threshold satisfied.`,
            closed_at: new Date()
          }
        });

        completed.push({
          ibpo,
          sp_no: order.sp_no,
          greyReq,
          greyCompleted,
          completionPct: completionPct.toFixed(1),
          tolerance_status: toleranceStatus,
          message: `Closed successfully (${completionPct.toFixed(1)}% complete satisfies >=98% tolerance)`
        });
      } else {
        const remainingPct = (100 - completionPct).toFixed(1);
        rejected.push({
          ibpo,
          sp_no: order.sp_no,
          greyReq,
          greyCompleted,
          remainingMtr: Math.round(remainingMtr * 10) / 10,
          completionPct: completionPct.toFixed(1),
          remainingPct,
          reason: `Cannot close: produced only ${completionPct.toFixed(1)}%. Balance remaining is ${Math.round(remainingMtr * 10) / 10} MTR (${remainingPct}% remaining). Required >=98%.`
        });
      }
    }

    res.json({
      success: true,
      data: {
        totalRequested: ibpos.length,
        completedCount: completed.length,
        alreadyCompletedCount: alreadyCompleted.length,
        rejectedCount: rejected.length,
        notFoundCount: notFound.length,
        completed,
        alreadyCompleted,
        rejected,
        notFound
      }
    });
  } catch (err) {
    console.error('TOA Bulk Completion error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 9. IDEMPOTENT BASELINE SEED FROM ORDER MASTER
// Seeds initial orders into ToaOrder if empty or force=true
// ==========================================
router.post('/seed-baseline', async (req, res) => {
  try {
    const force = req.query.force === 'true' || req.body?.force === true;
    const currentCount = await prisma.toaOrder.count();

    if (currentCount > 0 && !force) {
      return res.json({
        success: true,
        message: `Total Order Allocation already contains ${currentCount} orders. Skipping seed (use ?force=true to append missing).`,
        count: currentCount
      });
    }

    // Fetch existing OrderMaster orders and DesignMaster
    const masterOrders = await prisma.orderMaster.findMany({
      orderBy: { id: 'asc' }
    });

    const designs = await prisma.designMaster.findMany();
    const designMap = new Map();
    designs.forEach(d => designMap.set((d.design_no_sp_no || '').trim().toLowerCase(), d));

    const existingIbpos = new Set(
      (await prisma.toaOrder.findMany({ select: { ibpo: true } })).map(o => o.ibpo.toLowerCase())
    );

    let seededCount = 0;

    for (const mo of masterOrders) {
      const ibpo = String(mo.ibpo_no || mo.order_no || `IBPO-${mo.id}`).trim();
      if (!ibpo || existingIbpos.has(ibpo.toLowerCase())) continue;

      const sp_no = String(mo.design_no_sp_no || mo.design_no || 'UNKNOWN').trim();
      const design = designMap.get(sp_no.toLowerCase());

      const order_qty = Number(mo.order_meters || mo.planned_meters || 1000);
      const order_type = mo.order_type || (sp_no.toUpperCase().includes('GREY') ? 'Grey' : 'YD');
      const product_group = order_type === 'Grey' ? 'Normal Grey' : 'Normal YD';
      const factor = getProductGroupFactor(product_group);
      const ppi = Number(mo.ppi || (design ? design.ppi : 90)) || 90;

      const kpxVals = calculateKpxValues(order_qty, 0, ppi, factor, null);

      await prisma.toaOrder.create({
        data: {
          ibpo,
          customer: mo.buyer_name || mo.customer || null,
          order_no: mo.order_no || null,
          sp_no,
          order_type,
          construction: mo.construction || (design ? design.construction : null),
          order_qty,
          grey_req: order_qty,
          grey_completed: 0,
          balance_to_weave: kpxVals.balanceToWeave,
          product_group,
          ppi,
          kpx: kpxVals.kpx,
          kpx_factor: kpxVals.kpxFactor,
          corrected_kpx: kpxVals.correctedKpx,
          tolerance_status: 'ACTIVE',
          width: mo.width || (design ? design.greige_width : null),
          reed_count: mo.reed_count || (design ? design.reed_count : null),
          pick: mo.pick || (design ? design.pick : null),
          frames: mo.frames ? Number(mo.frames) : (design ? design.frames : null),
          weft_colours: mo.weft_colours ? Number(mo.weft_colours) : (design ? design.weft_colours : null),
          received_date: mo.createdAt || new Date(),
          target_date: mo.delivery_date ? new Date(mo.delivery_date) : null,
          priority: 'Medium',
          status: 'PENDING',
          allocation_type: 'UNALLOCATED'
        }
      });

      existingIbpos.add(ibpo.toLowerCase());
      seededCount++;
    }

    const totalCount = await prisma.toaOrder.count();
    res.json({
      success: true,
      message: `Seeded ${seededCount} orders from OrderMaster into Total Order Allocation. Total active orders: ${totalCount}.`,
      seededCount,
      totalCount
    });
  } catch (err) {
    console.error('TOA Seed Baseline error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 7. COMPLETION REVIEW & CLOSE WORKFLOW
// ==========================================
router.get('/completion-review/:ibpo', async (req, res) => {
  try {
    const { ibpo } = req.params;
    const order = await prisma.toaOrder.findUnique({
      where: { ibpo },
      include: {
        productionLogs: true,
        completionReview: true
      }
    });

    if (!order) {
      return res.status(404).json({ success: false, error: `Order ${ibpo} not found` });
    }

    const orderedMtr = Number(order.order_qty) || 0;
    let inHouseMtr = 0;
    let vendorMtr = 0;
    let totalProducedMtr = 0;

    order.productionLogs.forEach(p => {
      const m = Number(p.produced_meter) || 0;
      totalProducedMtr += m;
      if (p.allocation_type === 'IN_HOUSE') {
        inHouseMtr += m;
      } else {
        vendorMtr += m;
      }
    });

    const varianceMtr = totalProducedMtr - orderedMtr;
    const variancePct = orderedMtr > 0 ? (varianceMtr / orderedMtr) * 100 : 0;
    const absVariancePct = Math.abs(variancePct);
    const isWithin3Pct = absVariancePct <= 3.0;

    res.json({
      success: true,
      data: {
        ibpo: order.ibpo,
        sp_no: order.sp_no,
        customer: order.customer,
        order_qty: orderedMtr,
        in_house_meter: Math.round(inHouseMtr * 100) / 100,
        vendor_meter: Math.round(vendorMtr * 100) / 100,
        total_produced_meter: Math.round(totalProducedMtr * 100) / 100,
        remaining_meter: Math.max(0, orderedMtr - totalProducedMtr),
        excess_meter: Math.max(0, totalProducedMtr - orderedMtr),
        variance_meter: Math.round(varianceMtr * 100) / 100,
        variance_pct: Math.round(variancePct * 10) / 10,
        is_within_3_pct: isWithin3Pct,
        requires_special_approval: !isWithin3Pct,
        status: order.status,
        completionReview: order.completionReview
      }
    });
  } catch (err) {
    console.error('TOA Completion Review error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Explicit Order Closure with Threshold Validation
router.post('/close-order', async (req, res) => {
  try {
    const { ibpo, closed_by, is_approved, approval_reason, approved_by } = req.body;

    if (!ibpo || !closed_by) {
      return res.status(400).json({ success: false, error: 'IBPO and Closed By user name are required' });
    }

    const order = await prisma.toaOrder.findUnique({
      where: { ibpo },
      include: {
        productionLogs: true,
        completionReview: true
      }
    });

    if (!order) {
      return res.status(404).json({ success: false, error: `Order ${ibpo} not found` });
    }

    if (order.status === 'COMPLETED') {
      return res.status(400).json({ success: false, error: `Order ${ibpo} is already closed.` });
    }

    const orderedMtr = Number(order.order_qty) || 0;
    if (orderedMtr <= 0) {
      return res.status(400).json({ success: false, error: 'Order quantity is 0 or invalid. Cannot close order.' });
    }

    let inHouseMtr = 0;
    let vendorMtr = 0;
    let totalProducedMtr = 0;

    order.productionLogs.forEach(p => {
      const m = Number(p.produced_meter) || 0;
      totalProducedMtr += m;
      if (p.allocation_type === 'IN_HOUSE') {
        inHouseMtr += m;
      } else {
        vendorMtr += m;
      }
    });

    const varianceMtr = totalProducedMtr - orderedMtr;
    const variancePct = (varianceMtr / orderedMtr) * 100;
    const absVariancePct = Math.abs(variancePct);

    // CRITICAL VALIDATION: If variance > 3%, require explicit approval and reason
    if (absVariancePct > 3.0) {
      if (!is_approved || !approval_reason || !approval_reason.trim()) {
        return res.status(400).json({
          success: false,
          error: `Variance is ${variancePct.toFixed(1)}% (exceeds allowable ±3% limit). Authorised approval and mandatory explanation are required to close this order.`
        });
      }
    }

    // Execute closure in transaction
    const review = await prisma.$transaction(async (tx) => {
      const reviewRecord = await tx.toaCompletionReview.upsert({
        where: { ibpo: order.ibpo },
        create: {
          order_id: order.id,
          ibpo: order.ibpo,
          ordered_meter: orderedMtr,
          in_house_meter: inHouseMtr,
          vendor_meter: vendorMtr,
          total_produced_meter: totalProducedMtr,
          variance_meter: varianceMtr,
          variance_pct: variancePct,
          is_approved: Boolean(is_approved),
          approval_reason: approval_reason || null,
          approved_by: approved_by || null,
          closed_by: String(closed_by).trim(),
          closed_at: new Date()
        },
        update: {
          ordered_meter: orderedMtr,
          in_house_meter: inHouseMtr,
          vendor_meter: vendorMtr,
          total_produced_meter: totalProducedMtr,
          variance_meter: varianceMtr,
          variance_pct: variancePct,
          is_approved: Boolean(is_approved),
          approval_reason: approval_reason || null,
          approved_by: approved_by || null,
          closed_by: String(closed_by).trim(),
          closed_at: new Date(),
          is_reopened: false
        }
      });

      // Update order status to COMPLETED
      await tx.toaOrder.update({
        where: { id: order.id },
        data: { status: 'COMPLETED' }
      });

      // Update allocations status
      await tx.toaAllocation.updateMany({
        where: { order_id: order.id },
        data: { status: 'COMPLETED' }
      });

      await tx.toaAuditLog.create({
        data: {
          ibpo: order.ibpo,
          action: 'ORDER_COMPLETED_AND_CLOSED',
          entity: 'ToaCompletionReview',
          details: JSON.stringify({
            orderedMtr,
            totalProducedMtr,
            varianceMtr,
            variancePct: variancePct.toFixed(2),
            closed_by
          }),
          user: closed_by || 'System'
        }
      });

      return reviewRecord;
    });

    res.json({
      success: true,
      message: `Order ${ibpo} successfully closed and marked COMPLETED.`,
      data: review
    });
  } catch (err) {
    console.error('TOA Close Order error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Reopen Order Workflow
router.post('/reopen-order', async (req, res) => {
  try {
    const { ibpo, reopened_by, reopen_reason } = req.body;
    if (!ibpo || !reopened_by || !reopen_reason) {
      return res.status(400).json({ success: false, error: 'IBPO, Reopened By, and Reopen Reason are mandatory' });
    }

    const order = await prisma.toaOrder.findUnique({ where: { ibpo } });
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });

    await prisma.$transaction(async (tx) => {
      await tx.toaOrder.update({
        where: { id: order.id },
        data: { status: 'IN_PRODUCTION' }
      });

      await tx.toaAllocation.updateMany({
        where: { order_id: order.id },
        data: { status: 'CONFIRMED' }
      });

      await tx.toaCompletionReview.update({
        where: { ibpo: order.ibpo },
        data: {
          is_reopened: true,
          reopened_by: String(reopened_by).trim(),
          reopened_at: new Date(),
          reopen_reason: String(reopen_reason).trim()
        }
      });

      await tx.toaAuditLog.create({
        data: {
          ibpo: order.ibpo,
          action: 'ORDER_REOPENED',
          entity: 'ToaOrder',
          details: JSON.stringify({ reopened_by, reopen_reason }),
          user: reopened_by
        }
      });
    });

    res.json({ success: true, message: `Order ${ibpo} reopened successfully.` });
  } catch (err) {
    console.error('TOA Reopen Order error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 8. EXCEL REPORT GENERATION
// ==========================================
router.get('/reports/export-excel', async (req, res) => {
  try {
    const orders = await prisma.toaOrder.findMany({
      include: {
        allocations: { include: { vendor: true, vendorLoom: true } },
        productionLogs: true,
        completionReview: true
      },
      orderBy: { id: 'asc' }
    });

    const allAllocations = await prisma.toaAllocation.findMany({
      include: { vendor: true, vendorLoom: true, order: true },
      orderBy: { estimated_start_date: 'asc' }
    });

    const allLogs = await prisma.toaProductionLog.findMany({
      orderBy: { production_date: 'asc' }
    });

    // ----------------------------------------------------
    // Sheet 1: Dashboard (KPX 2026 Engine Executive Overview)
    // ----------------------------------------------------
    let totalGreyReq = 0;
    let totalGreyCompleted = 0;
    let totalBalanceToWeave = 0;
    let totalKpx = 0;
    let totalCorrectedKpx = 0;

    const statusCounts = {};
    const groupCounts = {};

    orders.forEach(o => {
      const req = Number(o.grey_req || o.order_qty) || 0;
      const comp = Number(o.grey_completed) || 0;
      const bal = o.balance_to_weave !== null && o.balance_to_weave !== undefined ? Number(o.balance_to_weave) : Math.max(0, req - comp);
      const kpxVal = Number(o.kpx) || 0;
      const corrKpxVal = Number(o.corrected_kpx) || 0;

      totalGreyReq += req;
      totalGreyCompleted += comp;
      totalBalanceToWeave += bal;
      totalKpx += kpxVal;
      totalCorrectedKpx += corrKpxVal;

      statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
      const grp = o.product_group || 'Normal YD';
      groupCounts[grp] = (groupCounts[grp] || 0) + 1;
    });

    const overallPct = totalGreyReq > 0 ? ((totalGreyCompleted / totalGreyReq) * 100).toFixed(2) + '%' : '0.00%';

    const dashboardSummary = [
      { 'METRIC / KPI': 'SPUPL Total Order Allocation System', 'VALUE / STATISTIC': 'Ref: KPX 2026 Engine' },
      { 'METRIC / KPI': 'Report Generated On', 'VALUE / STATISTIC': new Date().toLocaleString() },
      { 'METRIC / KPI': 'Total Orders Registered', 'VALUE / STATISTIC': orders.length },
      { 'METRIC / KPI': 'Total Grey Required (MTR)', 'VALUE / STATISTIC': Math.round(totalGreyReq).toLocaleString() },
      { 'METRIC / KPI': 'Total Grey Completed (MTR)', 'VALUE / STATISTIC': Math.round(totalGreyCompleted).toLocaleString() },
      { 'METRIC / KPI': 'Total Balance To Weave (MTR)', 'VALUE / STATISTIC': Math.round(totalBalanceToWeave).toLocaleString() },
      { 'METRIC / KPI': 'Overall Completion Percentage', 'VALUE / STATISTIC': overallPct },
      { 'METRIC / KPI': 'Total Cumulative KPX', 'VALUE / STATISTIC': Math.round(totalKpx).toLocaleString() },
      { 'METRIC / KPI': 'Total Corrected KPX', 'VALUE / STATISTIC': Math.round(totalCorrectedKpx).toLocaleString() },
      { 'METRIC / KPI': 'Pending Orders', 'VALUE / STATISTIC': statusCounts['PENDING'] || 0 },
      { 'METRIC / KPI': 'Allocated Orders', 'VALUE / STATISTIC': statusCounts['ALLOCATED'] || 0 },
      { 'METRIC / KPI': 'In-Production Orders', 'VALUE / STATISTIC': statusCounts['IN_PRODUCTION'] || 0 },
      { 'METRIC / KPI': 'Completed Orders (2% Tolerance / Closed)', 'VALUE / STATISTIC': statusCounts['COMPLETED'] || 0 },
      { 'METRIC / KPI': 'Active In-House Loom Allocations', 'VALUE / STATISTIC': allAllocations.filter(a => a.allocation_type === 'IN_HOUSE' && a.status !== 'CANCELLED').length },
      { 'METRIC / KPI': 'Active Vendor Loom Allocations', 'VALUE / STATISTIC': allAllocations.filter(a => a.allocation_type === 'VENDOR' && a.status !== 'CANCELLED').length }
    ];

    // ----------------------------------------------------
    // Sheet 2: YD LM Alloction (Exact KPX Engine Formula Sheet)
    // ----------------------------------------------------
    const ydAllocationData = orders.map(o => {
      const activeAlloc = o.allocations && o.allocations.length > 0 ? o.allocations[0] : null;
      const req = Number(o.grey_req || o.order_qty) || 0;
      const comp = Number(o.grey_completed) || 0;
      const bal = o.balance_to_weave !== null && o.balance_to_weave !== undefined ? Number(o.balance_to_weave) : Math.max(0, req - comp);
      const factor = Number(o.kpx_factor || getProductGroupFactor(o.product_group));
      const ppi = o.ppi || 90;
      const kpxVals = calculateKpxValues(req, comp, ppi, factor, o.days_taken);

      const loomNoStr = activeAlloc
        ? (activeAlloc.allocation_type === 'IN_HOUSE' ? `L-${activeAlloc.loom_no}` : (activeAlloc.vendor ? `${activeAlloc.vendor.vendor_name} (${activeAlloc.vendorLoom?.loom_no || 'V'})` : 'Vendor'))
        : (o.allocation_type === 'IN_HOUSE' ? 'In-House Queue' : 'Unallocated');

      const startDateStr = formatDate(o.loom_start_date || (activeAlloc ? activeAlloc.estimated_start_date : null));
      const runoutDateStr = formatDate(o.loom_runout_date || (activeAlloc ? activeAlloc.estimated_runout_date : null));
      const daysTaken = o.days_taken || (activeAlloc ? activeAlloc.days_taken : null) || '';
      const corrKpxPerDay = (daysTaken && Number(daysTaken) > 0 && kpxVals.correctedKpx)
        ? (kpxVals.correctedKpx / Number(daysTaken)).toFixed(2)
        : '';

      return {
        'IBPO': o.ibpo,
        'SP NO': o.sp_no,
        'Product Group': o.product_group || 'Normal YD',
        'Reed': o.reed_count || '',
        'PPI': ppi,
        'Width': o.width || '',
        'Grey Qty Req': req,
        'Grey Completed': comp,
        'Balance To Weave': bal,
        'KPX': kpxVals.kpx ? Math.round(kpxVals.kpx * 100) / 100 : 0,
        'KPX Factor': factor,
        'Corrected KPX': kpxVals.correctedKpx ? Math.round(kpxVals.correctedKpx * 100) / 100 : 0,
        'Loom No': loomNoStr,
        'Start Date': startDateStr,
        'Runout Date': runoutDateStr,
        'Days Taken': daysTaken,
        'Corrected KPX/Day': corrKpxPerDay,
        'Status': o.status,
        'Tolerance Status': o.tolerance_status || 'ACTIVE'
      };
    });

    // ----------------------------------------------------
    // Sheet 3: Weekly MTR Report
    // ----------------------------------------------------
    const weeklyMap = new Map();
    allLogs.forEach(l => {
      const d = new Date(l.production_date);
      if (isNaN(d.getTime())) return;
      // Get ISO Week string
      const tempDate = new Date(d.getTime());
      tempDate.setHours(0, 0, 0, 0);
      tempDate.setDate(tempDate.getDate() + 3 - (tempDate.getDay() + 6) % 7);
      const week1 = new Date(tempDate.getFullYear(), 0, 4);
      const weekNo = 1 + Math.round(((tempDate.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
      const key = `${tempDate.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;

      let stat = weeklyMap.get(key);
      if (!stat) {
        stat = { week: key, totalMtrs: 0, inHouseMtrs: 0, vendorMtrs: 0, looms: new Set(), logCount: 0 };
        weeklyMap.set(key, stat);
      }
      const m = Number(l.produced_meter) || 0;
      stat.totalMtrs += m;
      if (l.allocation_type === 'IN_HOUSE') stat.inHouseMtrs += m;
      else stat.vendorMtrs += m;
      if (l.loom_no) stat.looms.add(l.loom_no);
      stat.logCount++;
    });

    const weeklyMtrData = Array.from(weeklyMap.values()).map(w => ({
      'Week Period': w.week,
      'Total Mtrs Produced': Math.round(w.totalMtrs),
      'In-House Mtrs': Math.round(w.inHouseMtrs),
      'Vendor Mtrs': Math.round(w.vendorMtrs),
      'Active Looms': w.looms.size,
      'Production Entries': w.logCount
    }));

    if (weeklyMtrData.length === 0) {
      weeklyMtrData.push({
        'Week Period': 'No production logs yet',
        'Total Mtrs Produced': 0,
        'In-House Mtrs': 0,
        'Vendor Mtrs': 0,
        'Active Looms': 0,
        'Production Entries': 0
      });
    }

    // ----------------------------------------------------
    // Sheet 4: Monthly MTR Report
    // ----------------------------------------------------
    const monthlyMap = new Map();
    allLogs.forEach(l => {
      const d = new Date(l.production_date);
      if (isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      let stat = monthlyMap.get(key);
      if (!stat) {
        stat = { month: key, totalMtrs: 0, inHouseMtrs: 0, vendorMtrs: 0, ibpos: new Set(), daysSet: new Set() };
        monthlyMap.set(key, stat);
      }
      const m = Number(l.produced_meter) || 0;
      stat.totalMtrs += m;
      if (l.allocation_type === 'IN_HOUSE') stat.inHouseMtrs += m;
      else stat.vendorMtrs += m;
      if (l.ibpo) stat.ibpos.add(l.ibpo);
      stat.daysSet.add(d.toISOString().split('T')[0]);
    });

    const monthlyMtrData = Array.from(monthlyMap.values()).map(m => {
      const activeDays = m.daysSet.size || 1;
      return {
        'Month / Year': m.month,
        'Total Mtrs Produced': Math.round(m.totalMtrs),
        'In-House Mtrs': Math.round(m.inHouseMtrs),
        'Vendor Mtrs': Math.round(m.vendorMtrs),
        'Unique IBPOs Produced': m.ibpos.size,
        'Daily Average MTR': Math.round(m.totalMtrs / activeDays)
      };
    });

    if (monthlyMtrData.length === 0) {
      monthlyMtrData.push({
        'Month / Year': 'No production logs yet',
        'Total Mtrs Produced': 0,
        'In-House Mtrs': 0,
        'Vendor Mtrs': 0,
        'Unique IBPOs Produced': 0,
        'Daily Average MTR': 0
      });
    }

    // ----------------------------------------------------
    // Sheet 5: Operational IBPO Lifecycle (Complete Audit Record)
    // ----------------------------------------------------
    const lifecycleData = orders.map(o => {
      const req = Number(o.grey_req || o.order_qty) || 0;
      const comp = Number(o.grey_completed) || 0;
      const bal = o.balance_to_weave !== null && o.balance_to_weave !== undefined ? Number(o.balance_to_weave) : Math.max(0, req - comp);
      const pct = req > 0 ? ((comp / req) * 100).toFixed(1) + '%' : '0.0%';
      const review = o.completionReview;

      return {
        'IBPO': o.ibpo,
        'SP NO': o.sp_no,
        'Customer': o.customer || '—',
        'Order Received Date': formatDate(o.received_date),
        'Target Delivery Date': formatDate(o.target_date),
        'Order Qty (MTR)': o.order_qty,
        'Grey Required (MTR)': req,
        'Grey Completed (MTR)': comp,
        'Balance To Weave (MTR)': bal,
        'Completion Rate': pct,
        'Allocation Stream': o.allocation_type || 'UNALLOCATED',
        'Order Status': o.status,
        'Tolerance Status': o.tolerance_status || 'ACTIVE',
        'Review Status': review ? review.status : 'PENDING',
        'Closed By': review ? (review.closed_by || '—') : '—',
        'Approval Reason / Notes': review ? (review.approval_reason || '—') : '—',
        'Last Updated': formatDate(o.current_updated_date || o.updatedAt)
      };
    });

    // ----------------------------------------------------
    // Build Excel Workbook
    // ----------------------------------------------------
    const wb = xlsx.utils.book_new();

    const wsDashboard = xlsx.utils.json_to_sheet(dashboardSummary);
    const wsYdAlloc = xlsx.utils.json_to_sheet(ydAllocationData);
    const wsWeekly = xlsx.utils.json_to_sheet(weeklyMtrData);
    const wsMonthly = xlsx.utils.json_to_sheet(monthlyMtrData);
    const wsLifecycle = xlsx.utils.json_to_sheet(lifecycleData);

    xlsx.utils.book_append_sheet(wb, wsDashboard, 'Dashboard');
    xlsx.utils.book_append_sheet(wb, wsYdAlloc, 'YD LM Alloction');
    xlsx.utils.book_append_sheet(wb, wsWeekly, 'Weekly MTR Report');
    xlsx.utils.book_append_sheet(wb, wsMonthly, 'Monthly MTR Report');
    xlsx.utils.book_append_sheet(wb, wsLifecycle, 'Operational Lifecycle');

    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="SPUPL_Total_Order_Allocation_KPX_Report_2026.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) {
    console.error('TOA Export Excel error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
