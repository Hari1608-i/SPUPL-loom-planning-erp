const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

async function run() {
  try {
    const existing = await prisma.user.findFirst({ where: { username: "ADMIN" } });
    const hash = await bcrypt.hash("spupl!@#$%", 10);
    
    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { password_hash: hash, status: "ACTIVE" }
      });
      console.log("SUCCESS: Existing ADMIN password updated with valid hash!");
    } else {
      await prisma.user.create({
        data: {
          employeeId: "EMP001",
          employeeName: "System Administrator",
          username: "ADMIN",
          password_hash: hash,
          role: "ADMIN",
          status: "ACTIVE"
        }
      });
      console.log("SUCCESS: Created fresh ADMIN user in Supabase!");
    }
  } catch (err) {
    console.error("ERROR:", err.message);
  } finally {
    await prisma.$disconnect();
  }
}
run();