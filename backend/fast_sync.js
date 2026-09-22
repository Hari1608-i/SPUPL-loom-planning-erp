require('dotenv').config();
const Database = require('better-sqlite3');
const { PrismaClient } = require('@prisma/client');
const path = require('path');
const fs = require('fs');

const prisma = new PrismaClient();
const dbPath = path.join(__dirname, 'prisma', 'dev.db');

if (!fs.existsSync(dbPath)) {
  console.error("Local SQLite file not found at " + dbPath);
  process.exit(1);
}

const sqlite = new Database(dbPath, { readonly: true });

function readRows(table) {
  try {
    return sqlite.prepare(`SELECT * FROM "${table}"`).all();
  } catch (e) {
    try {
      return sqlite.prepare(`SELECT * FROM ${table}`).all();
    } catch (err) {
      return [];
    }
  }
}

function toValidDate(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === 'number') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof val === 'string') {
    const num = Number(val);
    if (!isNaN(num) && num > 1000000000) {
      const d = new Date(num);
      return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function parseDates(obj) {
  const dateKeys = [
    'createdAt', 'updatedAt', 'timestamp', 'date', 'loginTime', 'logoutTime',
    'loom_start_date', 'start_date', 'end_date', 'target_date', 'order_received_date',
    'target_delivery_date', 'sizing_planned_date', 'sizing_completed_date',
    'weaving_planned_date', 'weaving_start_date', 'weaving_completion_date',
    'expected_completion_date', 'actual_completion_date', 'recovery_date',
    'planned_date', 'actual_date', 'reserved_date', 'beam_ready_date',
    'warping_start_date', 'warping_completion_date', 'sizing_start_date',
    'acknowledged_date', 'confirmed_date', 'change_requested_date',
    'yarn_confirmation_date', 'actual_dispatch_date', 'expected_dispatch_date',
    'planned_start_date', 'expected_start_date', 'expected_finish_date'
  ];

  const cleaned = { ...obj };
  for (const k of dateKeys) {
    if (cleaned[k] !== undefined && cleaned[k] !== null) {
      cleaned[k] = toValidDate(cleaned[k]);
    }
  }
  return cleaned;
}

async function fastSync() {
  console.log("=== BATCH MIGRATING ALL TABLES TO SUPABASE ===");
  try {
    // 1. LoomMaster
    const looms = readRows('LoomMaster').map(l => {
      const parsed = parseDates(l);
      parsed.loom_no = Number(parsed.loom_no);
      return parsed;
    });
    console.log(`Syncing ${looms.length} Looms...`);
    await prisma.loomMaster.createMany({ data: looms, skipDuplicates: true });

    // 2. DesignMaster
    const designs = readRows('DesignMaster').map(d => parseDates(d));
    console.log(`Syncing ${designs.length} Designs...`);
    await prisma.designMaster.createMany({ data: designs, skipDuplicates: true });

    // 3. LoomRunEntry (224 Running Looms)
    const runs = readRows('LoomRunEntry').map(r => {
      const { id, ...data } = parseDates(r);
      data.loom_no = Number(data.loom_no);
      return data;
    });
    console.log(`Syncing ${runs.length} Running Looms...`);
    await prisma.loomRunEntry.createMany({ data: runs, skipDuplicates: true });

    // 4. Orders
    const orders = readRows('OrderMaster').map(o => {
      const { id, ...data } = parseDates(o);
      return data;
    });
    console.log(`Syncing ${orders.length} Orders...`);
    await prisma.orderMaster.createMany({ data: orders, skipDuplicates: true });

    // 5. BeamStockMaster
    const beams = readRows('BeamStockMaster').map(b => {
      const { id, ...data } = parseDates(b);
      return data;
    });
    console.log(`Syncing ${beams.length} Beams...`);
    await prisma.beamStockMaster.createMany({ data: beams, skipDuplicates: true });

    // 6. ReedStockMaster
    const reeds = readRows('ReedStockMaster').map(r => {
      const { id, ...data } = parseDates(r);
      return data;
    });
    console.log(`Syncing ${reeds.length} Reeds...`);
    await prisma.reedStockMaster.createMany({ data: reeds, skipDuplicates: true });

    // 7. PlannedAssignment (Handles numeric planned_start_date safely)
    const plans = readRows('PlannedAssignment').map(p => {
      const { id, ...data } = parseDates(p);
      data.loom_no = Number(data.loom_no);
      if (!data.planned_start_date) data.planned_start_date = new Date();
      return data;
    });
    console.log(`Syncing ${plans.length} Next Plans...`);
    await prisma.plannedAssignment.createMany({ data: plans, skipDuplicates: true });

    // 8. DailyProductionLog
    const logs = readRows('DailyProductionLog').map(l => {
      const { id, ...data } = parseDates(l);
      data.loom_no = Number(data.loom_no);
      if (!data.date) data.date = new Date();
      return data;
    });
    console.log(`Syncing ${logs.length} Daily Production Logs...`);
    await prisma.dailyProductionLog.createMany({ data: logs, skipDuplicates: true });

    // 9. CompletedWarpHistory
    const warps = readRows('CompletedWarpHistory').map(w => {
      const { id, ...data } = parseDates(w);
      data.loom_no = Number(data.loom_no);
      if (!data.start_date) data.start_date = new Date();
      if (!data.end_date) data.end_date = new Date();
      return data;
    });
    console.log(`Syncing ${warps.length} Warp History records...`);
    await prisma.completedWarpHistory.createMany({ data: warps, skipDuplicates: true });

    // 10. DailyReportEntry
    const dailyEntries = readRows('DailyReportEntry').map(de => {
      const { id, ...data } = parseDates(de);
      return data;
    });
    console.log(`Syncing ${dailyEntries.length} Daily Report Entries...`);
    if (dailyEntries.length > 0) {
      await prisma.dailyReportEntry.createMany({ data: dailyEntries, skipDuplicates: true });
    }

    console.log("\n=======================================================");
    console.log("🎉 SUCCESS! ALL MASTER AND RUNNING DATA SYNCED TO SUPABASE!");
    console.log(`Total Looms: ${await prisma.loomMaster.count()}`);
    console.log(`Total Designs: ${await prisma.designMaster.count()}`);
    console.log(`Total Running Looms: ${await prisma.loomRunEntry.count()}`);
    console.log(`Total Orders: ${await prisma.orderMaster.count()}`);
    console.log(`Total Planned Assignments: ${await prisma.plannedAssignment.count()}`);
    console.log("=======================================================");
  } catch (err) {
    console.error("Batch Sync Error:", err);
  } finally {
    await prisma.$disconnect();
    sqlite.close();
  }
}

fastSync();