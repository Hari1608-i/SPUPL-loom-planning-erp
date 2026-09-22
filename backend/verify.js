const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function test() {
  try {
    console.log("Checking Supabase connection...");
    const userCount = await prisma.user.count();
    console.log("Database connected successfully! Total users:", userCount);
    
    let admin = await prisma.user.findFirst({ where: { username: "ADMIN" } });
    if (!admin) {
      console.log("Admin user missing. Creating default ADMIN user...");
      admin = await prisma.user.create({
        data: {
          employeeId: "EMP001",
          employeeName: "System Administrator",
          username: "ADMIN",
          password_hash: "spupl!@#$%",
          role: "ADMIN",
          status: "ACTIVE"
        }
      });
      console.log("Default ADMIN created successfully!");
    } else {
      console.log("ADMIN user already exists with status:", admin.status);
    }
  } catch (err) {
    console.error("Verification failed:", err.message);
  } finally {
    await prisma.$disconnect();
  }
}

test();