require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Global Prisma instance for serverless connection reuse
const globalForPrisma = global;
const prisma = globalForPrisma.prisma || new PrismaClient({ log: ['error'] });
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

const app = express();

const allowedOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(o => o.trim()) : '*';
app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-role', 'x-user-role', 'x-user']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.text({ limit: '50mb' }));

const JWT_SECRET = process.env.JWT_SECRET || 'spu_loom_erp_super_secret_key_2026';
const DEFAULT_ADMIN_USERNAME = process.env.DEFAULT_ADMIN_USERNAME || 'ADMIN';
const DEFAULT_ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD || 'spupl!@#$%';

app.get('/', (req, res) => {
  res.json({
    status: 'online',
    system: 'SPU Loom ERP Backend API Server',
    port: 3002,
    health: '/api/system-health'
  });
});

app.get('/api', (req, res) => {
  res.json({
    status: 'online',
    system: 'SPU Loom ERP API',
    version: '1.0.0'
  });
});

// In-memory Rate Limiting Middleware
const rateLimitMap = new Map();
app.use('/api/auth/login', (req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress;
  const now = Date.now();
  const limitWindow = 15 * 60 * 1000;
  const maxAttempts = 100;

  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, []);
  }

  const timestamps = rateLimitMap.get(ip);
  const activeTimestamps = timestamps.filter(t => now - t < limitWindow);
  activeTimestamps.push(now);
  rateLimitMap.set(ip, activeTimestamps);

  if (activeTimestamps.length > maxAttempts) {
    return res.status(429).json({ error: 'Too many login attempts. Please try again later.' });
  }
  next();
});

// Response cache
const responseCache = new Map();
let lastInvalidationTime = Date.now();

app.use((req, res, next) => {
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
    responseCache.clear();
    lastInvalidationTime = Date.now();
    return next();
  }

  if (req.method === 'GET' && req.path.startsWith('/api/')) {
    if (req.path.includes('/next-plans') || req.path.includes('/active-runs')) {
      return next();
    }

    const key = req.originalUrl || req.url;
    const cached = responseCache.get(key);
    const now = Date.now();
    if (cached && (now - cached.timestamp < 2000) && cached.timestamp >= lastInvalidationTime) {
      return res.json(cached.data);
    }

    const originalJson = res.json;
    res.json = function (body) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        responseCache.set(key, { timestamp: Date.now(), data: body });
      }
      return originalJson.call(this, body);
    };
  }
  next();
});

// Helper function to safely compare passwords (bcrypt hash or plain text)
async function safeComparePassword(inputPassword, storedHash) {
  if (!inputPassword || !storedHash) return false;
  if (inputPassword === storedHash) return true;
  try {
    return await bcrypt.compare(inputPassword, storedHash);
  } catch (err) {
    return false;
  }
}

// ----------------------------------------------------
// AUTHENTICATION & USER MANAGEMENT API
// ----------------------------------------------------

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const cleanUsername = username ? username.trim() : '';
    if (!cleanUsername || !password) {
      return res.status(401).json({ error: 'Invalid Username or Password' });
    }

    const capitalizedUsername = cleanUsername.charAt(0).toUpperCase() + cleanUsername.slice(1).toLowerCase();
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: cleanUsername },
          { username: cleanUsername.toUpperCase() },
          { username: cleanUsername.toLowerCase() },
          { username: capitalizedUsername }
        ]
      }
    });

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    // Auto-create default admin if logging in as admin and table is empty
    if (!user && cleanUsername.toUpperCase() === DEFAULT_ADMIN_USERNAME.toUpperCase()) {
      const hash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
      user = await prisma.user.create({
        data: {
          employeeId: 'ADMIN001',
          employeeName: 'System Administrator',
          username: DEFAULT_ADMIN_USERNAME,
          password_hash: hash,
          role: 'ADMINISTRATOR',
          status: 'ACTIVE'
        }
      });
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid Username or Password' });
    }

    if (user.status === 'LOCKED') {
      await prisma.loginHistory.create({ data: { username: cleanUsername, status: 'LOCKED', ipAddress: ip } }).catch(() => {});
      return res.status(403).json({ error: 'Your account has been locked. Please contact Administrator.' });
    }
    if (user.status !== 'ACTIVE') {
      return res.status(403).json({ error: 'Your account is disabled.' });
    }

    const valid = await safeComparePassword(password, user.password_hash);
    if (!valid) {
      const attempts = (user.failedAttempts || 0) + 1;
      const status = attempts >= 5 ? 'LOCKED' : 'ACTIVE';
      await prisma.user.update({
        where: { id: user.id },
        data: { failedAttempts: attempts, status }
      }).catch(() => {});
      await prisma.loginHistory.create({ data: { username: cleanUsername, status: 'FAILED', ipAddress: ip } }).catch(() => {});

      if (status === 'LOCKED') {
        return res.status(403).json({ error: 'Account locked due to 5 failed attempts. Please contact Administrator.' });
      }
      return res.status(401).json({ error: 'Invalid Username or Password' });
    }

    // Success
    await prisma.user.update({
      where: { id: user.id },
      data: { failedAttempts: 0, lastLogin: new Date() }
    }).catch(() => {});

    await prisma.loginHistory.create({ data: { username: cleanUsername, status: 'SUCCESS', ipAddress: ip } }).catch(() => {});

    const token = jwt.sign(
      { id: user.id, role: user.role, username: user.username },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    const { password_hash, ...safeUser } = user;
    return res.json({ token, user: safeUser });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

function authenticateUser(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

app.post('/api/auth/verify-admin-password', async (req, res) => {
  try {
    const { password, username } = req.body;
    if (!password) {
      return res.status(400).json({ success: false, error: 'Password is required' });
    }

    const authUser = authenticateUser(req);
    let targetUser = null;

    if (authUser) {
      targetUser = await prisma.user.findUnique({ where: { id: authUser.id } });
    }
    if (!targetUser && username) {
      const cleanUsername = String(username).trim();
      targetUser = await prisma.user.findFirst({
        where: {
          OR: [
            { username: cleanUsername },
            { username: cleanUsername.toUpperCase() },
            { username: cleanUsername.toLowerCase() }
          ]
        }
      });
    }
    if (!targetUser) {
      targetUser = await prisma.user.findFirst({
        where: {
          OR: [
            { role: 'ADMIN' },
            { role: 'ADMINISTRATOR' },
            { role: 'System Administrator' },
            { username: 'admin' },
            { username: 'ADMIN' }
          ]
        }
      });
    }

    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'Administrator user not found' });
    }

    const valid = await safeComparePassword(password, targetUser.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, error: 'Incorrect Administrator Password' });
    }

    return res.json({ success: true, message: 'Administrator password verified' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// User Management
app.get('/api/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, employeeId: true, employeeName: true, username: true, role: true, department: true, designation: true, email: true, mobile: true, status: true, lastLogin: true, permissions: true, createdAt: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ users, total: users.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Looms
app.get('/api/looms', async (req, res) => {
  try {
    const looms = await prisma.loomMaster.findMany({ orderBy: { loom_no: 'asc' } });
    res.json(looms);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Designs
app.get('/api/designs', async (req, res) => {
  try {
    const designs = await prisma.designMaster.findMany();
    res.json(designs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Orders
app.get('/api/orders', async (req, res) => {
  try {
    const orders = await prisma.orderMaster.findMany({
      include: { designMaster: true },
      orderBy: { id: 'desc' }
    });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Beam Stock
app.get('/api/beam-stock', async (req, res) => {
  try {
    const beams = await prisma.beamStockMaster.findMany({ orderBy: { id: 'desc' } });
    res.json(beams);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reed Stock
app.get('/api/reed-stock', async (req, res) => {
  try {
    const reeds = await prisma.reedStockMaster.findMany({ orderBy: { reed_count: 'asc' } });
    res.json(reeds);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Active Runs
app.get('/api/active-runs', async (req, res) => {
  try {
    const runs = await prisma.loomRunEntry.findMany({ orderBy: { loom_no: 'asc' } });
    res.json(runs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Next Plans
app.get('/api/planning/next-plans', async (req, res) => {
  try {
    const plans = await prisma.plannedAssignment.findMany({ orderBy: { id: 'asc' } });
    res.json(plans);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/next-plans', async (req, res) => {
  try {
    const plans = await prisma.plannedAssignment.findMany({ orderBy: { id: 'asc' } });
    res.json(plans);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// System Health
app.get('/api/system-health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'Healthy', dbConnected: true });
  } catch (e) {
    res.status(500).json({ status: 'Critical', error: e.message });
  }
});

// CRITICAL EXPORT FOR VERCEL SERVERLESS
module.exports = app;

// Local development server listen
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3002;
  app.listen(PORT, () => {
    console.log(`Backend server running locally on port ${PORT}`);
  });
}