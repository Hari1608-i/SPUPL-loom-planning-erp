require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function migrateData() {
  console.log("=== STARTING DATA SEED & SYNC TO SUPABASE ===");

  try {
    // 1. Verify / Create ADMIN User
    const hash = await bcrypt.hash("spupl!@#$%", 10);
    const adminUser = await prisma.user.upsert({
      where: { username: 'ADMIN' },
      update: {
        password_hash: hash,
        role: 'ADMINISTRATOR',
        status: 'ACTIVE',
        failedAttempts: 0
      },
      create: {
        employeeId: 'ADMIN001',
        employeeName: 'System Administrator',
        username: 'ADMIN',
        password_hash: hash,
        role: 'ADMINISTRATOR',
        status: 'ACTIVE'
      }
    });
    console.log("✓ Admin User verified/seeded in Supabase.");

    // 2. Seed Standard Reeds if empty
    const reedCount = await prisma.reedStockMaster.count();
    if (reedCount === 0) {
      const sampleReeds = [
        { reed_no: 'R001', reed_type: 'Standard', reed_count: '44/2', reed_space: '67.05"', reed_width: '67.05"', reed_dent: '44', dents_per_inch: 44, total_dents: 2950, reed_make: 'Premier', vendor: 'National Reeds', unit: 'Unit 1', location: 'Rack A-01', available_qty: 2, reserved_qty: 0, running_qty: 0, total_qty: 2, status: 'Available' },
        { reed_no: 'R002', reed_type: 'Heavy', reed_count: '40/1', reed_space: '72.00"', reed_width: '72.00"', reed_dent: '40', dents_per_inch: 40, total_dents: 2880, reed_make: 'LoomCraft', vendor: 'Apex Reeds', unit: 'Unit 1', location: 'Rack A-02', available_qty: 3, reserved_qty: 0, running_qty: 0, total_qty: 3, status: 'Available' },
        { reed_no: 'R003', reed_type: 'Fine', reed_count: '60/1', reed_space: '64.13"', reed_width: '64.13"', reed_dent: '60', dents_per_inch: 60, total_dents: 3840, reed_make: 'Apex', vendor: 'National Reeds', unit: 'Unit 1', location: 'Rack B-01', available_qty: 1, reserved_qty: 0, running_qty: 0, total_qty: 1, status: 'Available' }
      ];
      for (const r of sampleReeds) {
        await prisma.reedStockMaster.create({ data: r });
      }
      console.log("✓ Reed stock initialized in Supabase.");
    } else {
      console.log(`✓ Reeds already exist (${reedCount} records).`);
    }

    // 3. Check Looms Count
    const loomCount = await prisma.loomMaster.count();
    console.log(`✓ Looms currently in Supabase: ${loomCount}`);

    console.log("\n==========================================");
    console.log("🎉 ALL DATA CONNECTED AND VERIFIED IN SUPABASE!");
    console.log("==========================================");

  } catch (err) {
    console.error("Migration Error:", err.message);
  } finally {
    await prisma.$disconnect();
  }
}

migrateData();
