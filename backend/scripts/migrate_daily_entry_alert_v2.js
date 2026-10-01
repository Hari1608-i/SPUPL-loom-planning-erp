const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function migrate() {
  console.log('--- Starting Non-Destructive Additive Migration for DailyEntryAlert ---');

  try {
    // 1. Add columns to DailyEntryAlertConfig
    console.log('1. Adding columns to DailyEntryAlertConfig if not present...');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "DailyEntryAlertConfig" 
      ADD COLUMN IF NOT EXISTS "receiver_number_1" TEXT,
      ADD COLUMN IF NOT EXISTS "receiver_number_2" TEXT,
      ADD COLUMN IF NOT EXISTS "sender_provider_id" TEXT,
      ADD COLUMN IF NOT EXISTS "sender_verification_status" TEXT DEFAULT 'NOT_VERIFIED',
      ADD COLUMN IF NOT EXISTS "sender_verified_at" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "final_message_template" TEXT;
    `);

    // Copy legacy receiver_number to receiver_number_1 if null
    await prisma.$executeRawUnsafe(`
      UPDATE "DailyEntryAlertConfig"
      SET "receiver_number_1" = "receiver_number"
      WHERE "receiver_number_1" IS NULL AND "receiver_number" IS NOT NULL;
    `);

    // 2. Create DailyEntryAlertSchedule table
    console.log('2. Creating DailyEntryAlertSchedule table if not exists...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "DailyEntryAlertSchedule" (
        "id" SERIAL PRIMARY KEY,
        "alert_config_id" INTEGER NOT NULL REFERENCES "DailyEntryAlertConfig"("id") ON DELETE CASCADE,
        "slot_time" TEXT NOT NULL,
        "slot_type" TEXT NOT NULL DEFAULT 'NORMAL',
        "is_enabled" BOOLEAN NOT NULL DEFAULT true,
        "display_order" INTEGER NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "DailyEntryAlertSchedule_config_time_unique" UNIQUE ("alert_config_id", "slot_time")
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "DailyEntryAlertSchedule_config_id_idx"
      ON "DailyEntryAlertSchedule" ("alert_config_id");
    `);

    // 3. Add columns to DailyEntryAlertLog
    console.log('3. Adding columns to DailyEntryAlertLog if not present...');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "DailyEntryAlertLog" 
      ADD COLUMN IF NOT EXISTS "provider_message_id" TEXT,
      ADD COLUMN IF NOT EXISTS "provider_status" TEXT,
      ADD COLUMN IF NOT EXISTS "is_test" BOOLEAN NOT NULL DEFAULT false;
    `);

    // 4. Seed default schedules for each department config
    console.log('4. Seeding default time slots for departments without slots...');
    const configs = await prisma.$queryRawUnsafe(`SELECT "id", "department_code" FROM "DailyEntryAlertConfig"`);
    
    const defaultSlots = [
      { time: '08:00', type: 'NORMAL', order: 1 },
      { time: '08:30', type: 'NORMAL', order: 2 },
      { time: '09:00', type: 'NORMAL', order: 3 },
      { time: '09:30', type: 'NORMAL', order: 4 },
      { time: '10:00', type: 'NORMAL', order: 5 },
      { time: '10:15', type: 'NORMAL', order: 6 },
      { time: '10:30', type: 'RAPID',  order: 7 },
      { time: '10:35', type: 'RAPID',  order: 8 },
      { time: '10:40', type: 'RAPID',  order: 9 },
      { time: '10:45', type: 'RAPID',  order: 10 },
      { time: '10:50', type: 'RAPID',  order: 11 },
      { time: '10:55', type: 'RAPID',  order: 12 },
      { time: '11:00', type: 'FINAL',  order: 13 }
    ];

    for (const c of configs) {
      const existing = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*) FROM "DailyEntryAlertSchedule" WHERE "alert_config_id" = $1`,
        c.id
      );
      const count = Number(existing[0]?.count || 0);
      if (count === 0) {
        for (const slot of defaultSlots) {
          await prisma.$executeRawUnsafe(`
            INSERT INTO "DailyEntryAlertSchedule" 
            ("alert_config_id", "slot_time", "slot_type", "is_enabled", "display_order")
            VALUES ($1, $2, $3, true, $4)
            ON CONFLICT ("alert_config_id", "slot_time") DO NOTHING;
          `, c.id, slot.time, slot.type, slot.order);
        }
      }
    }

    console.log('✓ Additive migration completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

migrate();
