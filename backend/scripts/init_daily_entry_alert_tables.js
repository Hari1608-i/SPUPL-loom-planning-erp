const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function initTables() {
  console.log('--- Initializing DailyEntryAlert Tables Safely ---');
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "DailyEntryAlertConfig" (
        "id" SERIAL PRIMARY KEY,
        "department_code" TEXT NOT NULL UNIQUE,
        "department_name" TEXT NOT NULL,
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        "sender_number" TEXT,
        "receiver_number" TEXT,
        "channel" TEXT NOT NULL DEFAULT 'WhatsApp',
        "start_time" TEXT NOT NULL DEFAULT '08:00',
        "rapid_start_time" TEXT NOT NULL DEFAULT '10:30',
        "rapid_interval_minutes" INTEGER NOT NULL DEFAULT 5,
        "end_time" TEXT NOT NULL DEFAULT '11:00',
        "sunday_enabled" BOOLEAN NOT NULL DEFAULT false,
        "message_template" TEXT,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ Table "DailyEntryAlertConfig" verified/created');

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "DailyEntryAlertLog" (
        "id" SERIAL PRIMARY KEY,
        "alert_config_id" INTEGER REFERENCES "DailyEntryAlertConfig"("id") ON DELETE SET NULL,
        "department_code" TEXT NOT NULL,
        "alert_date" TEXT NOT NULL,
        "scheduled_time" TEXT NOT NULL,
        "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "channel" TEXT NOT NULL DEFAULT 'WhatsApp',
        "sender_number" TEXT,
        "receiver_number" TEXT,
        "status" TEXT NOT NULL,
        "message" TEXT,
        "error_message" TEXT
      );
    `);
    console.log('✓ Table "DailyEntryAlertLog" verified/created');

    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "DailyEntryAlertLog_dept_date_time_unique"
      ON "DailyEntryAlertLog" ("department_code", "alert_date", "scheduled_time");
    `);
    console.log('✓ Unique index "DailyEntryAlertLog_dept_date_time_unique" verified/created');

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "DailyEntryAlertLog_alert_date_idx"
      ON "DailyEntryAlertLog" ("alert_date");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "DailyEntryAlertLog_dept_date_idx"
      ON "DailyEntryAlertLog" ("department_code", "alert_date");
    `);
    console.log('✓ Additional search indexes created');

    // Seed default departments if table is empty
    const count = await prisma.$queryRawUnsafe(`SELECT COUNT(*) FROM "DailyEntryAlertConfig"`);
    const num = Number(count[0]?.count || 0);
    console.log(`Current DailyEntryAlertConfig records: ${num}`);

    if (num === 0) {
      console.log('Seeding initial department configurations...');
      const defaultDepts = [
        { code: 'PLANNING', name: 'PLANNING' },
        { code: 'SIZING', name: 'SIZING' },
        { code: 'WEAVING', name: 'WEAVING' },
        { code: 'GREIGE_INSPECTION', name: 'GREIGE INSPECTION' },
        { code: 'FINISHED_INSPECTION', name: 'FINISHED INSPECTION' },
        { code: 'SAMPLING', name: 'SAMPLING' },
        { code: 'MENDING', name: 'MENDING' },
        { code: 'PROCESSING_DYEING', name: 'PROCESSING / DYEING' },
        { code: 'YARN_DEPARTMENT', name: 'YARN DEPARTMENT' },
        { code: 'OUTSOURCING', name: 'OUTSOURCING' },
        { code: 'DISPATCH_PACKING', name: 'DISPATCH & PACKING' },
        { code: 'SPINNING', name: 'SPINNING' },
        { code: 'HRD', name: 'HRD' },
        { code: 'TRANSPORT', name: 'TRANSPORT' }
      ];

      const defaultTemplate = 
`SPUPL DAILY ENTRY REMINDER

Department: {DEPARTMENT}
Date: {DATE}

Today's Daily Report entry has not been completed.

Please complete today's Daily Report entry as soon as possible.

Next reminder: {NEXT_REMINDER_TIME}`;

      for (const d of defaultDepts) {
        await prisma.$executeRawUnsafe(`
          INSERT INTO "DailyEntryAlertConfig" (
            "department_code", "department_name", "is_active", "channel",
            "start_time", "rapid_start_time", "rapid_interval_minutes",
            "end_time", "sunday_enabled", "message_template"
          ) VALUES (
            $1, $2, true, 'WhatsApp', '08:00', '10:30', 5, '11:00', false, $3
          ) ON CONFLICT ("department_code") DO NOTHING;
        `, d.code, d.name, defaultTemplate);
      }
      console.log('✓ Default departments seeded successfully.');
    }

    console.log('--- Database Setup Completed Safely ---');
  } catch (err) {
    console.error('Error initializing tables:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

initTables();
