const { PrismaClient } = require('@prisma/client');

let prisma;

// Force connection string to use pooler for serverless stability
const poolerUrl = process.env.DATABASE_URL || "postgresql://postgres.gjuushefiuldsebehlqv:hariph%401608@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1";

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient({
    datasources: {
      db: {
        url: poolerUrl,
      },
    },
  });
} else {
  if (!global.globalPrisma) {
    global.globalPrisma = new PrismaClient({
      datasources: {
        db: {
          url: poolerUrl,
        },
      },
    });
  }
  prisma = global.globalPrisma;
}

module.exports = prisma;