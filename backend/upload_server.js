require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

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
// SYSTEM HEALTH & ROOT
// ----------------------------------------------------
app.get('/', (req, res) => res.json({ status: 'online', system: 'SPU Loom ERP Backend API Server' }));
app.get('/api', (req, res) => res.json({ status: 'online', version: '1.0.0' }));

app.get('/api/system-health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const [looms, designs, runs, orders, beams, reeds] = await Promise.all([
      prisma.loomMaster.count(),
      prisma.designMaster.count(),
      prisma.loomRunEntry.count(),
      prisma.orderMaster.count(),
      prisma.beamStockMaster.count(),
      prisma.reedStockMaster.count()
    ]);
    res.json({
      status: 'Healthy',
      dbConnected: true,
      metrics: { totalLooms: looms, totalDesigns: designs, runningLooms: runs, totalOrders: orders, totalBeams: beams, totalReeds: reeds }
    });
  } catch (e) {
    res.status(500).json({ status: 'Critical', error: e.message });
  }
});

// ----------------------------------------------------
// AUTHENTICATION
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

    const valid = await safeComparePassword(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid Username or Password' });
    }

    const token = jwt.sign({ id: user.id, role: user.role, username: user.username }, JWT_SECRET, { expiresIn: '8h' });
    const { password_hash, ...safeUser } = user;
    return res.json({ token, user: safeUser });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

// ----------------------------------------------------
// DAILY OPERATIONAL REPORTS API (Including History Dates)
// ----------------------------------------------------
function computePerformanceMark(target, actual, pct) {
  if (target === null || target === undefined || target <= 0) return 'N/A';
  if (actual === null || actual === undefined) return 'NOT ENTERED';
  if (actual === 0 && target > 0) return 'CRITICAL';
  if (pct >= 100) return 'EXCELLENT';
  if (pct >= 90) return 'GOOD';
  if (pct >= 80) return 'ON PLAN';
  return 'BELOW TARGET';
}

app.get('/api/daily-report', async (req, res) => {
  try {
    const { date, department, startDate, endDate } = req.query;
    let where = {};

    if (startDate && endDate) {
      where.report_date = startDate === endDate ? String(startDate) : { gte: String(startDate), lte: String(endDate) };
    } else if (date) {
      where.report_date = String(date);
    }

    if (department) {
      where.department_code = String(department).toUpperCase();
    }

    const [entries, masters] = await Promise.all([
      prisma.dailyReportEntry.findMany({ where, orderBy: [{ department_code: 'asc' }, { id: 'asc' }] }),
      prisma.departmentMasterInfo.findMany()
    ]);

    res.json({ entries, count: entries.length, departmentMasters: masters });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/daily-report/history-dates', async (req, res) => {
  try {
    const rawDates = await prisma.dailyReportEntry.groupBy({
      by: ['report_date', 'department_code'],
      _count: { id: true }
    });

    const dateMap = new Map();
    rawDates.forEach(r => {
      if (!dateMap.has(r.report_date)) {
        dateMap.set(r.report_date, new Set());
      }
      dateMap.get(r.report_date).add(r.department_code);
    });

    const dates = Array.from(dateMap.entries())
      .map(([date, depts]) => ({
        date,
        enteredDepartmentsCount: depts.size,
        departments: Array.from(depts)
      }))
      .sort((a, b) => b.date.localeCompare(a.date));

    res.json({ dates, count: dates.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/daily-report', async (req, res) => {
  try {
    const { report_date, department_code, department_head, mentor, entries, metrics, remarks, entered_by } = req.body;
    const items = Array.isArray(entries) ? entries : (Array.isArray(metrics) ? metrics : []);
    const dateStr = String(report_date).trim();
    const deptCode = String(department_code).trim().toUpperCase();

    const results = [];
    for (const item of items) {
      const metricCode = String(item.metric_code || '').trim();
      if (!metricCode) continue;

      const numVal = item.actual_value !== undefined && item.actual_value !== null ? Number(item.actual_value) : null;
      const targetVal = item.target_value !== undefined && item.target_value !== null ? Number(item.target_value) : null;
      let diffVal = targetVal !== null && numVal !== null ? Number((numVal - targetVal).toFixed(2)) : null;
      let pctVal = targetVal !== null && targetVal > 0 && numVal !== null ? Number(((numVal / targetVal) * 100).toFixed(2)) : null;

      const upserted = await prisma.dailyReportEntry.upsert({
        where: {
          report_date_department_code_metric_code: {
            report_date: dateStr,
            department_code: deptCode,
            metric_code: metricCode
          }
        },
        update: {
          metric_name: item.metric_name || metricCode,
          raw_value: item.raw_value ? String(item.raw_value) : null,
          actual_value: numVal,
          target_value: targetVal,
          diff_value: diffVal,
          pct_value: pctVal,
          department_head: department_head || null,
          mentor: mentor || null,
          performance_mark: computePerformanceMark(targetVal, numVal, pctVal || 0),
          remarks: item.remarks || remarks || '',
          entered_by: entered_by || 'ADMIN'
        },
        create: {
          report_date: dateStr,
          department_code: deptCode,
          metric_code: metricCode,
          metric_name: item.metric_name || metricCode,
          raw_value: item.raw_value ? String(item.raw_value) : null,
          actual_value: numVal,
          target_value: targetVal,
          diff_value: diffVal,
          pct_value: pctVal,
          department_head: department_head || null,
          mentor: mentor || null,
          performance_mark: computePerformanceMark(targetVal, numVal, pctVal || 0),
          remarks: item.remarks || remarks || '',
          entered_by: entered_by || 'ADMIN'
        }
      });
      results.push(upserted);
    }
    res.json({ success: true, count: results.length, entries: results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------
// LOOMS, RUNS, DESIGNS & HISTORY API
// ----------------------------------------------------
app.get('/api/looms', async (req, res) => {
  try {
    const looms = await prisma.loomMaster.findMany({ orderBy: { loom_no: 'asc' } });
    res.json(looms);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/designs', async (req, res) => {
  try {
    const designs = await prisma.designMaster.findMany();
    res.json(designs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/active-runs', async (req, res) => {
  try {
    const runs = await prisma.loomRunEntry.findMany({ orderBy: { loom_no: 'asc' } });
    res.json(runs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/completed-runs', async (req, res) => {
  try {
    const history = await prisma.completedWarpHistory.findMany({ orderBy: { end_date: 'desc' } });
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/reports/design-running', async (req, res) => {
  try {
    const [activeRuns, loomMasters, designMasters, orderMasters] = await Promise.all([
      prisma.loomRunEntry.findMany(),
      prisma.loomMaster.findMany(),
      prisma.designMaster.findMany(),
      prisma.orderMaster.findMany()
    ]);

    const loomMap = new Map(loomMasters.map(l => [l.loom_no, l]));
    const designMap = new Map(designMasters.map(d => [d.design_no_sp_no, d]));

    const runningLoomsList = activeRuns.map(run => {
      const loomInfo = loomMap.get(run.loom_no);
      const designInfo = designMap.get(run.design_no_sp_no);

      return {
        loomNo: run.loom_no,
        designNo: run.design_no_sp_no,
        loomStartDate: run.loom_start_date,
        warpedMeter: run.warped_meter || 0,
        dailyProduction: run.daily_production || 0,
        producedMeter: 0,
        rpm: run.rpm || loomInfo?.rpm || 650,
        efficiency: run.efficiency || 90,
        currentReedNo: run.current_reed_no || '',
        currentBeamNo: run.current_beam_no || '',
        setNo: run.set_no || '',
        orderNo: run.order_no || '',
        unit: loomInfo?.unit || 'UNIT 1',
        loomType: loomInfo?.loom_type || 'AIRJET',
        status: loomInfo?.status || 'Running'
      };
    });

    res.json({ success: true, data: runningLoomsList, orders: orderMasters });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------
// ORDERS, STOCKS & PLANNING API
// ----------------------------------------------------
app.get('/api/orders', async (req, res) => {
  try {
    const orders = await prisma.orderMaster.findMany({ include: { designMaster: true }, orderBy: { id: 'desc' } });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/beam-stock', async (req, res) => {
  try {
    const beams = await prisma.beamStockMaster.findMany({ orderBy: { id: 'desc' } });
    res.json(beams);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/reed-stock', async (req, res) => {
  try {
    const reeds = await prisma.reedStockMaster.findMany({ orderBy: { reed_count: 'asc' } });
    res.json(reeds);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/reed-requirements', async (req, res) => {
  try {
    const reqs = await prisma.reedRequirement.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(reqs);
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

app.get('/api/planning/next-plans', async (req, res) => {
  try {
    const plans = await prisma.plannedAssignment.findMany({ orderBy: { id: 'asc' } });
    res.json(plans);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/erp-alerts', async (req, res) => {
  try {
    const alerts = await prisma.erpAlert.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
    res.json(alerts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/production-logs', async (req, res) => {
  try {
    const logs = await prisma.dailyProductionLog.findMany({ orderBy: { date: 'desc' }, take: 2000 });
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, employeeId: true, employeeName: true, username: true, role: true, department: true, status: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ users, total: users.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CRITICAL FOR VERCEL SERVERLESS EXPORT
module.exports = app;

if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3002;
  app.listen(PORT, () => console.log(`Backend server running locally on port ${PORT}`));
}