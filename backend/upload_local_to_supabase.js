require('dotenv').config();
const { PrismaClient: SqliteClient } = require('@prisma/client');
const { PrismaClient: PostgresClient } = require('@prisma/client');

// Connect safely to local SQLite database file
const localPrisma = new SqliteClient({
  datasources: {
    db: {
      url: "file:./dev.db"
    }
  }
});

// Explicitly pass Supabase live PostgreSQL connection string to avoid schema env lookup errors
const supabaseUrl = process.env.DATABASE_URL || "postgresql://postgres.gjuushefiuldsebehlqv:hariph%401608@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1";

const supabasePrisma = new PostgresClient({
  datasources: {
    db: {
      url: supabaseUrl
    }
  }
});

async function uploadLocalToSupabase() {
  console.log("==================================================");
  console.log("MIGRATING LOCAL DATABASE TO LIVE SUPABASE...");
  console.log("==================================================");
  try {
    // 1. Migrate Users
    const users = await localPrisma.user.findMany();
    console.log(`Migrating ${users.length} users...`);
    for (const u of users) {
      await supabasePrisma.user.upsert({
        where: { username: u.username },
        update: {},
        create: u
      });
    }

    // 2. Migrate Design Masters
    const designs = await localPrisma.designMaster.findMany();
    console.log(`Migrating ${designs.length} designs...`);
    for (const d of designs) {
      await supabasePrisma.designMaster.upsert({
        where: { design_no_sp_no: d.design_no_sp_no },
        update: {},
        create: d
      });
    }

    // 3. Migrate Loom Masters
    const looms = await localPrisma.loomMaster.findMany();
    console.log(`Migrating ${looms.length} looms...`);
    for (const l of looms) {
      await supabasePrisma.loomMaster.upsert({
        where: { loom_no: l.loom_no },
        update: {},
        create: l
      });
    }

    // 4. Migrate Beam Stock
    const beams = await localPrisma.beamStockMaster.findMany();
    console.log(`Migrating ${beams.length} beam stocks...`);
    for (const b of beams) {
      const { id, ...data } = b;
      await supabasePrisma.beamStockMaster.create({ data });
    }

    // 5. Migrate Reed Stock
    const reeds = await localPrisma.reedStockMaster.findMany();
    console.log(`Migrating ${reeds.length} reed stocks...`);
    for (const r of reeds) {
      const { id, ...data } = r;
      await supabasePrisma.reedStockMaster.create({ data });
    }

    // 6. Migrate Daily Report Entries
    const reports = await localPrisma.dailyReportEntry.findMany();
    console.log(`Migrating ${reports.length} daily report entries...`);
    for (const rep of reports) {
      const { id, ...data } = rep;
      await supabasePrisma.dailyReportEntry.upsert({
        where: {
          report_date_department_code_metric_code: {
            report_date: rep.report_date,
            department_code: rep.department_code,
            metric_code: rep.metric_code
          }
        },
        update: data,
        create: data
      });
    }

    console.log("==================================================");
    console.log("ALL LOCAL DATA SUCCESSFULLY UPLOADED TO SUPABASE!");
    console.log("==================================================");
  } catch (error) {
    console.error("MIGRATION ERROR:", error);
  } finally {
    await localPrisma.$disconnect();
    await supabasePrisma.$disconnect();
  }
}

uploadLocalToSupabase();