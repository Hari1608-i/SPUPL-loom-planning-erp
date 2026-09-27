require('dotenv').config();
const Database = require('better-sqlite3');
const { Pool } = require('pg');
const path = require('path');

const dbPath = path.resolve(__dirname, 'prisma', 'dev.db');
console.log(`Connecting to local SQLite database at: ${dbPath}`);

let sqlite;
try {
  sqlite = new Database(dbPath, { readonly: true });
  console.log("SUCCESS: Local SQLite database opened successfully.");
} catch (err) {
  console.error("ERROR: Could not open local SQLite database file at:", dbPath);
  console.error(err.message);
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://postgres.gjuushefiuldsebehlqv:hariph%401608@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1",
  ssl: { rejectUnauthorized: false }
});

function parseDate(val) {
  if (!val) return new Date();
  if (typeof val === 'number' || /^\d+$/.test(val)) {
    return new Date(Number(val));
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? new Date() : d;
}

async function runDirectUpload() {
  console.log("==================================================");
  console.log("STARTING DIRECT SQLITE TO SUPABASE UPLOAD...");
  console.log("==================================================");
  
  const client = await pool.connect();
  try {
    // 1. Migrate Users (Resolved employeeId unique constraint conflict)
    const users = sqlite.prepare('SELECT * FROM "User"').all();
    console.log(`Migrating ${users.length} users to Supabase...`);
    for (const u of users) {
      await client.query(
        `INSERT INTO "User" ("employeeId", "employeeName", "username", "email", "mobile", "department", "designation", "password_hash", "role", "status", "failedAttempts", "createdAt", "updatedAt") 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) 
         ON CONFLICT ("employeeId") DO UPDATE SET 
         "employeeName" = EXCLUDED."employeeName",
         "username" = EXCLUDED."username",
         "password_hash" = EXCLUDED."password_hash",
         "role" = EXCLUDED."role",
         "status" = EXCLUDED."status"`,
        [
          u.employeeId, u.employeeName, u.username, u.email, u.mobile, u.department, u.designation, 
          u.password_hash, u.role, u.status, u.failedAttempts || 0, 
          parseDate(u.createdAt), parseDate(u.updatedAt)
        ]
      );
    }

    // 2. Migrate Design Masters
    const designs = sqlite.prepare('SELECT * FROM "DesignMaster"').all();
    console.log(`Migrating ${designs.length} designs to Supabase...`);
    for (const d of designs) {
      await client.query(
        `INSERT INTO "DesignMaster" ("design_no_sp_no", "construction", "weft_colours", "weft_colour_details", "frames", "reed_count", "pick", "greige_width", "total_ends", "reed_space_warp_width", "weave_type", "beam_type", "crimp_percent", "beam_dia", "epi", "ppi", "status", "createdAt", "updatedAt") 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19) 
         ON CONFLICT ("design_no_sp_no") DO UPDATE SET 
         "construction" = EXCLUDED."construction",
         "reed_count" = EXCLUDED."reed_count",
         "status" = EXCLUDED."status"`,
        [
          d.design_no_sp_no, d.construction, d.weft_colours, d.weft_colour_details, d.frames, d.reed_count, 
          d.pick, d.greige_width, d.total_ends, d.reed_space_warp_width, d.weave_type, d.beam_type, 
          d.crimp_percent, d.beam_dia, d.epi, d.ppi, d.status || 'ACTIVE', 
          parseDate(d.createdAt), parseDate(d.updatedAt)
        ]
      );
    }

    // 3. Migrate Loom Masters
    const looms = sqlite.prepare('SELECT * FROM "LoomMaster"').all();
    console.log(`Migrating ${looms.length} looms to Supabase...`);
    for (const l of looms) {
      await client.query(
        `INSERT INTO "LoomMaster" ("loom_no", "loom_type", "shed", "shed_name", "rpm", "make", "model", "width", "unit", "weave", "status", "remarks", "createdAt", "updatedAt", "createdBy") 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) 
         ON CONFLICT ("loom_no") DO UPDATE SET 
         "rpm" = EXCLUDED."rpm",
         "status" = EXCLUDED."status",
         "remarks" = EXCLUDED."remarks"`,
        [
          l.loom_no, l.loom_type, l.shed, l.shed_name, l.rpm, l.make, l.model, l.width, 
          l.unit || 'UNIT 1', l.weave, l.status || 'Available', l.remarks, 
          parseDate(l.createdAt), parseDate(l.updatedAt), l.createdBy || 'ADMIN'
        ]
      );
    }

    // 4. Migrate Beam Stock
    const beams = sqlite.prepare('SELECT * FROM "BeamStockMaster"').all();
    console.log(`Migrating ${beams.length} beam stocks to Supabase...`);
    for (const b of beams) {
      await client.query(
        `INSERT INTO "BeamStockMaster" ("design_no", "vendor_name", "beam_no", "available_meter", "current_balance_meter", "beam_type", "status", "unit", "date") 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          b.design_no, b.vendor_name, b.beam_no, b.available_meter, 
          b.current_balance_meter || b.available_meter, b.beam_type || 'STANDARD', 
          b.status || 'Available', b.unit || 'UNIT 1', parseDate(b.date)
        ]
      );
    }

    // 5. Migrate Reed Stock
    const reeds = sqlite.prepare('SELECT * FROM "ReedStockMaster"').all();
    console.log(`Migrating ${reeds.length} reed stocks to Supabase...`);
    for (const r of reeds) {
      await client.query(
        `INSERT INTO "ReedStockMaster" ("reed_no", "reed_type", "reed_count", "available_qty", "total_qty", "vendor", "location", "status", "createdAt", "updatedAt") 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          r.reed_no, r.reed_type, r.reed_count, r.available_qty || 1, r.total_qty || 1, 
          r.vendor, r.location, r.status || 'Available', parseDate(r.createdAt), parseDate(r.updatedAt)
        ]
      );
    }

    console.log("==================================================");
    console.log("ALL LOCAL DATA SUCCESSFULLY UPLOADED TO SUPABASE!");
    console.log("==================================================");
  } catch (error) {
    console.error("MIGRATION EXECUTION ERROR:", error);
  } finally {
    client.release();
    sqlite.close();
    await pool.end();
  }
}

runDirectUpload();