require('dotenv').config();
const { PrismaClient: SqliteClient } = require('@prisma/client');
const { PrismaClient: PostgresClient } = require('@prisma/client');

// Force local sqlite connection for reading local data
const localPrisma = new SqliteClient({
  datasources: {
    db: {
      url: "file:./dev.db"
    }
  }
});

// Force Supabase postgresql connection for writing server data
const supabasePrisma = new PostgresClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

async function migrateData() {
  console.log("==================================================");
  console.log("STARTING LOCAL TO SUPABASE DATABASE MIGRATION...");
  console.log("==================================================");
  try {
    // 1. Migrate Users
    const users = await localPrisma.user.findMany();
    console.log(`Found ${users.length} users locally. Migrating to server...`);
    for (const user of users) {
      await supabasePrisma.user.upsert({
        where: { username: user.username },
        update: {},
        create: user
      });
    }

    // 2. Migrate Design Masters
    const designs = await localPrisma.designMaster.findMany();
    console.log(`Found ${designs.length} designs locally. Migrating...`);
    for (const design of designs) {
      await supabasePrisma.designMaster.upsert({
        where: { design_no_sp_no: design.design_no_sp_no },
        update: {},
        create: design
      });
    }

    // 3. Migrate Loom Masters
    const looms = await localPrisma.loomMaster.findMany();
    console.log(`Found ${looms.length} looms locally. Migrating...`);
    for (const loom of looms) {
      await supabasePrisma.loomMaster.upsert({
        where: { loom_no: loom.loom_no },
        update: {},
        create: loom
      });
    }

    // 4. Migrate Beam Stock
    const beams = await localPrisma.beamStockMaster.findMany();
    console.log(`Found ${beams.length} beam stocks locally. Migrating...`);
    for (const beam of beams) {
      const { id, ...data } = beam;
      await supabasePrisma.beamStockMaster.create({ data });
    }

    // 5. Migrate Reed Stock
    const reeds = await localPrisma.reedStockMaster.findMany();
    console.log(`Found ${reeds.length} reed stocks locally. Migrating...`);
    for (const reed of reeds) {
      const { id, ...data } = reed;
      await supabasePrisma.reedStockMaster.create({ data });
    }

    // 6. Migrate Daily Report Entries
    const reports = await localPrisma.dailyReportEntry.findMany();
    console.log(`Found ${reports.length} daily report entries locally. Migrating...`);
    for (const report of reports) {
      const { id, ...data } = report;
      await supabasePrisma.dailyReportEntry.upsert({
        where: {
          report_date_department_code_metric_code: {
            report_date: report.report_date,
            department_code: report.department_code,
            metric_code: report.metric_code
          }
        },
        update: data,
        create: data
      });
    }

    console.log("==================================================");
    console.log("MIGRATION COMPLETED SUCCESSFULLY TO SUPABASE SERVER!");
    console.log("==================================================");
  } catch (error) {
    console.error("MIGRATION FAILED:", error);
  } finally {
    await localPrisma.$disconnect();
    await supabasePrisma.$disconnect();
  }
}

migrateData();