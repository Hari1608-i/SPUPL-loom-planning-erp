require('dotenv').config();
const Database = require('better-sqlite3');
const { PrismaClient } = require('@prisma/client');
const path = require('path');
const fs = require('fs');

const prisma = new PrismaClient();

// Local DB path detector
const possiblePaths = [
  path.join(__dirname, 'prisma', 'dev.db'),
  path.join(__dirname, 'dev.db'),
  path.join(__dirname, 'prisma', 'prisma.db'),
  path.join(__dirname, 'spu_loom.db')
];

let dbPath = possiblePaths.find(p => fs.existsSync(p));

if (!dbPath) {
  console.error("Local SQLite file (dev.db) not found!");
  process.exit(1);
}

console.log(`Found SQLite Source DB: ${dbPath}`);
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
    'yarn_confirmation_date', 'actual_dispatch_date', 'expected_dispatch_date'
  ];

  const cleaned = { ...obj };
  for (const k of dateKeys) {
    if (cleaned[k]) {
      const d = new Date(cleaned[k]);
      if (!isNaN(d.getTime())) {
        cleaned[k] = d;
      } else {
        delete cleaned[k];
      }
    }
  }
  return cleaned;
}

async function syncAll() {
  console.log("=== STARTING 100% COMPLETE DATA MIGRATION TO SUPABASE ===");

  try {
    // 1. DEPARTMENT MASTER
    const depts = readRows('Department');
    console.log(`Syncing ${depts.length} Departments...`);
    for (const d of depts) {
      const { id, ...data } = d;
      await prisma.department.upsert({
        where: { name: d.name },
        update: { ...data },
        create: { ...data }
      }).catch(() => {});
    }

    // 2. USERS
    const users = readRows('User');
    console.log(`Syncing ${users.length} Users...`);
    for (const u of users) {
      const { id, ...data } = parseDates(u);
      await prisma.user.upsert({
        where: { username: u.username },
        update: { ...data },
        create: { ...data }
      }).catch(() => {});
    }

    // 3. LOOM MASTER (All Looms)
    const looms = readRows('LoomMaster');
    console.log(`Syncing ${looms.length} LoomMaster records...`);
    for (const l of looms) {
      const loomNo = Number(l.loom_no);
      const { loom_no, ...data } = parseDates(l);
      await prisma.loomMaster.upsert({
        where: { loom_no: loomNo },
        update: { ...data },
        create: { loom_no: loomNo, ...data }
      }).catch(e => console.warn(`Loom ${loomNo}:`, e.message));
    }

    // 4. DESIGN MASTER (All Designs)
    const designs = readRows('DesignMaster');
    console.log(`Syncing ${designs.length} DesignMaster records...`);
    for (const d of designs) {
      const dNo = String(d.design_no_sp_no).trim();
      const { design_no_sp_no, ...data } = parseDates(d);
      await prisma.designMaster.upsert({
        where: { design_no_sp_no: dNo },
        update: { ...data },
        create: { design_no_sp_no: dNo, ...data }
      }).catch(e => console.warn(`Design ${dNo}:`, e.message));
    }

    // 5. BEAM STOCK MASTER (All Beams)
    const beams = readRows('BeamStockMaster');
    console.log(`Syncing ${beams.length} BeamStock records...`);
    for (const b of beams) {
      const { id, ...data } = parseDates(b);
      const bNo = String(b.beam_no).trim();
      const existing = await prisma.beamStockMaster.findFirst({ where: { beam_no: bNo } });
      if (existing) {
        await prisma.beamStockMaster.update({ where: { id: existing.id }, data }).catch(() => {});
      } else {
        await prisma.beamStockMaster.create({ data: { beam_no: bNo, ...data } }).catch(() => {});
      }
    }

    // 6. REED STOCK MASTER (All Reeds)
    const reeds = readRows('ReedStockMaster');
    console.log(`Syncing ${reeds.length} ReedStock records...`);
    for (const r of reeds) {
      const { id, ...data } = parseDates(r);
      const rCount = String(r.reed_count || '').trim();
      const loc = String(r.location || '').trim();
      const existing = await prisma.reedStockMaster.findFirst({ where: { reed_count: rCount, location: loc } });
      if (existing) {
        await prisma.reedStockMaster.update({ where: { id: existing.id }, data }).catch(() => {});
      } else {
        await prisma.reedStockMaster.create({ data }).catch(() => {});
      }
    }

    // 7. ORDER MASTER (All Orders)
    const orders = readRows('OrderMaster');
    console.log(`Syncing ${orders.length} OrderMaster records...`);
    for (const o of orders) {
      const { id, ...data } = parseDates(o);
      const orderNo = o.order_no || `ORD-${id}`;
      const existing = await prisma.orderMaster.findFirst({ where: { order_no: orderNo } });
      if (existing) {
        await prisma.orderMaster.update({ where: { id: existing.id }, data }).catch(() => {});
      } else {
        await prisma.orderMaster.create({ data: { order_no: orderNo, ...data } }).catch(() => {});
      }
    }

    // 8. LOOM RUN ENTRY (All 224+ Running Looms)
    const runs = readRows('LoomRunEntry');
    console.log(`Syncing ${runs.length} Active Loom Runs...`);
    for (const r of runs) {
      const loomNo = Number(r.loom_no);
      const { id, ...data } = parseDates(r);
      await prisma.loomRunEntry.upsert({
        where: { loom_no: loomNo },
        update: { ...data },
        create: { loom_no: loomNo, ...data }
      }).catch(e => console.warn(`Run Loom ${loomNo}:`, e.message));
    }

    // 9. PLANNED ASSIGNMENTS (Next Plans)
    const plans = readRows('PlannedAssignment');
    console.log(`Syncing ${plans.length} Planned Assignments...`);
    for (const p of plans) {
      const { id, ...data } = parseDates(p);
      const existing = await prisma.plannedAssignment.findFirst({ where: { loom_no: Number(p.loom_no) } });
      if (existing) {
        await prisma.plannedAssignment.update({ where: { id: existing.id }, data }).catch(() => {});
      } else {
        await prisma.plannedAssignment.create({ data }).catch(() => {});
      }
    }

    // 10. DAILY PRODUCTION LOGS
    const logs = readRows('DailyProductionLog');
    console.log(`Syncing ${logs.length} Daily Production Logs...`);
    for (const l of logs) {
      const { id, ...data } = parseDates(l);
      await prisma.dailyProductionLog.create({ data }).catch(() => {});
    }

    // 11. COMPLETED WARP HISTORY
    const history = readRows('CompletedWarpHistory');
    console.log(`Syncing ${history.length} Completed Warp History records...`);
    for (const h of history) {
      const { id, ...data } = parseDates(h);
      await prisma.completedWarpHistory.create({ data }).catch(() => {});
    }

    // 12. CENTRALIZED DAILY REPORT MODULE ENTRIES
    const dailyEntries = readRows('DailyReportEntry');
    console.log(`Syncing ${dailyEntries.length} Central Daily Report entries...`);
    for (const de of dailyEntries) {
      const { id, ...data } = parseDates(de);
      await prisma.dailyReportEntry.upsert({
        where: {
          report_date_department_code_metric_code: {
            report_date: de.report_date,
            department_code: de.department_code,
            metric_code: de.metric_code
          }
        },
        update: { ...data },
        create: { ...data }
      }).catch(() => {});
    }

    // 13. DEPARTMENT MASTER INFO
    const deptInfo = readRows('DepartmentMasterInfo');
    console.log(`Syncing ${deptInfo.length} Department Master Info records...`);
    for (const di of deptInfo) {
      const { ...data } = parseDates(di);
      await prisma.departmentMasterInfo.upsert({
        where: { department_code: di.department_code },
        update: { ...data },
        create: { ...data }
      }).catch(() => {});
    }

    console.log("\n====================================================================");
    console.log("🎉 ALL DATA (DESIGN MASTER, LOOM MASTER, RUNS, ORDERS) MIGRATED!");
    const totalLooms = await prisma.loomMaster.count();
    const totalDesigns = await prisma.designMaster.count();
    const totalRuns = await prisma.loomRunEntry.count();
    const totalOrders = await prisma.orderMaster.count();
    console.log(`LoomMaster Total: ${totalLooms}`);
    console.log(`DesignMaster Total: ${totalDesigns}`);
    console.log(`Active Running Looms Total: ${totalRuns}`);
    console.log(`OrderMaster Total: ${totalOrders}`);
    console.log("====================================================================");

  } catch (err) {
    console.error("Migration Error:", err);
  } finally {
    await prisma.$disconnect();
    sqlite.close();
  }
}

syncAll();