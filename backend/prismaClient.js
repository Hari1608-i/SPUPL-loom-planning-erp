const { PrismaClient } = require('@prisma/client');

const connectionUrl = process.env.DATABASE_URL;

if (!connectionUrl) {
  throw new Error(
    'DATABASE_URL is not configured. Set DATABASE_URL in the environment before starting the SPUPL backend.'
  );
}

let prisma;

if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient({
    datasources: {
      db: {
        url: connectionUrl,
      },
    },
  });
} else {
  if (!global.globalPrisma) {
    global.globalPrisma = new PrismaClient({
      datasources: {
        db: {
          url: connectionUrl,
        },
      },
    });
  }

  prisma = global.globalPrisma;
}

module.exports = prisma;