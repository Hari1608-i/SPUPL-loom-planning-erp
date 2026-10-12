const { PrismaClient } = require('@prisma/client');

let connectionUrl = process.env.DATABASE_URL;

if (!connectionUrl) {
  throw new Error(
    'DATABASE_URL is not configured. Set DATABASE_URL in the environment before starting the SPUPL backend.'
  );
}

if (connectionUrl.includes('connection_limit=1')) {
  connectionUrl = connectionUrl.replace('connection_limit=1', 'connection_limit=10&pool_timeout=30');
}

if (!global.globalPrisma && !global.prisma) {
  global.globalPrisma = new PrismaClient({
    datasources: {
      db: {
        url: connectionUrl,
      },
    },
  });
  global.prisma = global.globalPrisma;
}

const prisma = global.globalPrisma || global.prisma;

module.exports = prisma;