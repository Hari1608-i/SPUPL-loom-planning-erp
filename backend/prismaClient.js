const { PrismaClient } = require('@prisma/client');

const connectionUrl = process.env.DATABASE_URL || "postgresql://postgres.gjuushefiuldsebehlqv:hariph%401608@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1";
const directUrl = process.env.DIRECT_URL || "postgresql://postgres:hariph%401608@db.gjuushefiuldsebehlqv.supabase.co:5432/postgres";

let prisma;

if (process.env.NODE_ENV === 'production') {
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