const { PrismaClient } = require('@prisma/client');

let prisma;

const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient({
    datasources: {
      db: {
        url: connectionString,
      },
    },
  });
} else {
  if (!global.globalPrisma) {
    global.globalPrisma = new PrismaClient({
      datasources: {
        db: {
          url: connectionString,
        },
      },
    });
  }
  prisma = global.globalPrisma;
}

module.exports = prisma;