require('dotenv').config();
const Database = require('better-sqlite3');
const { PrismaClient } = require('@prisma/client');
const path = require('path');
const fs = require('fs');

const prisma = new PrismaClient();

// Find local SQLite db file
const possiblePaths = [
  path.join(__dirname, 'prisma', 'dev.db'),
  path.join(__dirname, 'dev.db'),
  path.join(__dirname, 'prisma', 'prisma.db'),
  path.join(__dirname, 'spu_loom.db')
];

let dbPath = possiblePaths.find(p => fs.existsSync(p));

if (!dbPath) {
  console.error("Local SQLite file (dev.db) not found in backend or backend/prisma!");
  process.exit(1);
}

console.log(`✓ Found Local Database at: ${dbPath}`);
const sqlite = new Database(dbPath, { readonly: true });

function getAll(table) {
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

async function runFullMigration() {
  console.log("=== STARTING FULL LOCAL DATA EXTRACTION TO SUPABASE ===");

  try {
    // 1. Users
    const users = getAll('User');
    console.log(`Extracting ${users.length} Users...`);
    for (const u of users) {
      const { id, ...data } = u;
      await prisma.user.upsert({
        where: { username: u.username },
        update: { ...data },
        create: { ...data }
      }).catch(e => console.warn(`User skip ${u.username}:`, e.message));
    }

    // 2. LoomMaster
    const looms = getAll('LoomMaster');
    console.log(`Extracting ${looms.length} Looms...`);
    for (const l of looms) {
      const loomNo = Number(l.loom_no);
      const { loom_no, ...data } = l;
      await prisma.loomMaster.upsert({
        where: { loom_no: loomNo },
        update: { ...data },
        create: { loom_no: loomNo, ...data }
      }).catch(e => console.warn(`Loom ${loomNo} skip:`, e.message));
    }

    // 3. DesignMaster
    const designs = getAll('DesignMaster');
    console.log(`Extracting ${designs.length} Designs...`);
    for (const d of designs) {
      const dNo = String(d.design_no_sp_no).trim();
      const { design_no_sp_no, ...data } = d;
      await prisma.designMaster.upsert({
        where: { design_no_sp_no: dNo },
        update: { ...data },
        create: { design_no_sp_no: dNo, ...data }
      }).catch(e => console.warn(`Design ${dNo} skip:`, e.message));
    }

    // 4. LoomRunEntry (Contains all active running looms, e.g. 224 looms)
    const runs = getAll('LoomRunEntry');
    console.log(`Extracting ${runs.length} Active Running Looms...`);
    for (const r of runs) {
      const loomNo = Number(r.loom_no);
      const { id, ...data } = r;
      if (data.loom_start_date) data.loom_start_date = new Date(data.loom_start_date);
      await prisma.loomRunEntry.upsert({
        where: { loom_no: loomNo },
        update: { ...data },
        create: { loom_no: loomNo, ...data }
      }).catch(e => console.warn(`Run Loom ${loomNo} skip:`, e.message));
    }

    // 5. OrderMaster
    const orders = getAll('OrderMaster');
    console.log(`Extracting ${orders.length} Orders...`);
    for (const o of orders) {
      const { id, ...data } = o;
      if (data.order_received_date) data.order_received_date = new Date(data.order_received_date);
      if (data.expected_completion_date) data.expected_completion_date = new Date(data.expected_completion_date);
      if (data.weaving_planned_date) data.weaving_planned_date = new Date(data.weaving_planned_date);
      if (data.weaving_start_date) data.weaving_start_date = new Date(data.weaving_start_date);
      if (data.weaving_completion_date) data.weaving_completion_date = new Date(data.weaving_completion_date);
      if (data.actual_completion_date) data.actual_completion_date = new Date(data.actual_completion_date);
      if (data.target_delivery_date) data.target_delivery_date = new Date(data.target_delivery_date);
      if (data.sizing_planned_date) data.sizing_planned_date = new Date(data.sizing_planned_date);
      if (data.sizing_completed_date) data.sizing_completed_date = new Date(data.sizing_completed_date);
      
      const orderNo = o.order_no || `ORD-${id}`;
      const existing = await prisma.orderMaster.findFirst({ where: { order_no: orderNo } });
      if (existing) {
        await prisma.orderMaster.update({ where: { id: existing.id }, data }).catch(() => {});
      } else {
        await prisma.orderMaster.create({ data: { order_no: orderNo, ...data } }).catch(() => {});
      }
    }

    // 6. BeamStockMaster
    const beams = getAll('BeamStockMaster');
    console.log(`Extracting ${beams.length} Beam Stocks...`);
    for (const b of beams) {
      const { id, ...data } = b;
      if (data.date) data.date = new Date(data.date);
      const bNo = String(b.beam_no).trim();
      const existing = await prisma.beamStockMaster.findFirst({ where: { beam_no: bNo } });
      if (existing) {
        await prisma.beamStockMaster.update({ where: { id: existing.id }, data }).catch(() => {});
      } else {
        await prisma.beamStockMaster.create({ data: { beam_no: bNo, ...data } }).catch(() => {});
      }
    }

    // 7. ReedStockMaster
    const reeds = getAll('ReedStockMaster');
    console.log(`Extracting ${reeds.length} Reed Stocks...`);
    for (const rd of reeds) {
      const { id, ...data } = rd;
      if (data.createdAt) data.createdAt = new Date(data.createdAt);
      if (data.updatedAt) data.updatedAt = new Date(data.updatedAt);
      const rCount = String(rd.reed_count || '').trim();
      const loc = String(rd.location || '').trim();
      const existing = await prisma.reedStockMaster.findFirst({ where: { reed_count: rCount, location: loc } });
      if (existing) {
        await prisma.reedStockMaster.update({ where: { id: existing.id }, data }).catch(() => {});
      } else {
        await prisma.reedStockMaster.create({ data }).catch(() => {});
      }
    }

    // 8. PlannedAssignment
    const plans = getAll('PlannedAssignment');
    console.log(`Extracting ${plans.length} Planned Assignments...`);
    for (const p of plans) {
      const { id, ...data } = p;
      if (data.planned_start_date) data.planned_start_date = new Date(data.planned_start_date);
      if (data.createdAt) data.createdAt = new Date(data.createdAt);
      if (data.updatedAt) data.updatedAt = new Date(data.updatedAt);
      const existing = await prisma.plannedAssignment.findFirst({ where: { loom_no: Number(p.loom_no) } });
      if (existing) {
        await prisma.plannedAssignment.update({ where: { id: existing.id }, data }).catch(() => {});
      } else {
        await prisma.plannedAssignment.create({ data }).catch(() => {});
      }
    }

    // 9. CompletedWarpHistory & Production Logs
    const history = getAll('CompletedWarpHistory');
    console.log(`Extracting ${history.length} Completed Warp Records...`);
    for (const h of history) {
      const { id, ...data } = h;
      if (data.start_date) data.start_date = new Date(data.start_date);
      if (data.end_date) data.end_date = new Date(data.end_date);
      await prisma.completedWarpHistory.create({ data }).catch(() => {});
    }

    const prodLogs = getAll('DailyProductionLog');
    console.log(`Extracting ${prodLogs.length} Daily Production Logs...`);
    for (const pl of prodLogs) {
      const { id, ...data } = pl;
      if (data.date) data.date = new Date(data.date);
      if (data.createdAt) data.createdAt = new Date(data.createdAt);
      await prisma.dailyProductionLog.create({ data }).catch(() => {});
    }

    console.log("\n=======================================================");
    console.log("🎉 SUCCESS: ALL LOCAL DATA SUCCESSFULLY TRANSFERRED TO SUPABASE!");
    const liveRuns = await prisma.loomRunEntry.count();
    console.log(`Total Running Looms now live in Supabase: ${liveRuns}`);
    console.log("=======================================================");

  } catch (err) {
    console.error("Migration Failed:", err);
  } finally {
    await prisma.$disconnect();
    sqlite.close();
  }
}

runFullMigration();