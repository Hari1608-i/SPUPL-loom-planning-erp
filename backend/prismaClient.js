const { PrismaClient } = require('@prisma/client');

let prisma;

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });
} else {
  if (!global.globalPrisma) {
    global.globalPrisma = new PrismaClient();
  }
  prisma = global.globalPrisma;
}

module.exports = prisma;