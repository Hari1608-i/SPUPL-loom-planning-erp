require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const app = express();

const allowedOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(o => o.trim()) : '*';
app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-role', 'x-user-role', 'x-user']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.text({ limit: '50mb' }));

app.get('/', (req, res) => {
  res.json({
    status: 'online',
    system: 'SPU Loom ERP Backend API Server',
    port: 3002,
    health: 'http://localhost:3002/api/system-health'
  });
});

app.get('/api', (req, res) => {
  res.json({
    status: 'online',
    system: 'SPU Loom ERP API',
    version: '1.0.0'
  });
});

app.use('/api/analytics', require('./routes/analytics'));

// In-memory Rate Limiting Middleware for Authentication API
const rateLimitMap = new Map();
app.use('/api/auth/login', (req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress;
  const now = Date.now();
  const limitWindow = 15 * 60 * 1000; // 15 minutes
  const maxAttempts = 100; // Limit to 100 requests per IP per window

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

// Middleware to prevent error information leakage from database and internal libraries
app.use((req, res, next) => {
  const originalJson = res.json;
  res.json = function (obj) {
    if (res.statusCode === 500 && obj && obj.error) {
      const msg = String(obj.error);
      if (
        msg.includes('Prisma') ||
        msg.includes('database') ||
        msg.includes('sqlite') ||
        msg.includes('SELECT') ||
        msg.includes('ForeignKeyConstraint')
      ) {
        obj.error = 'Internal Server Error';
      }
    }
    return originalJson.call(this, obj);
  };
  next();
});

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'spu_loom_erp_super_secret_key_2026';

const DEFAULT_ADMIN_USERNAME = process.env.DEFAULT_ADMIN_USERNAME || 'ADMIN';
const DEFAULT_ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD || '!@#$%open';

// Initialize Default Admin User & Sample Reed Stock
async function initSeedData() {
  const hash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
  const adminUser = await prisma.user.findFirst({
    where: {
      OR: [
        { username: 'ADMIN' },
        { username: 'Admin' },
        { username: 'admin' },
        { username: DEFAULT_ADMIN_USERNAME },
        { username: 'SANTHIADMIN' },
        { role: 'ADMINISTRATOR' }
      ]
    }
  });

  if (!adminUser) {
    await prisma.user.create({
      data: {
        employeeId: 'ADMIN001',
        employeeName: 'System Administrator',
        username: 'ADMIN',
        password_hash: hash,
        role: 'ADMINISTRATOR',
        status: 'ACTIVE'
      }
    });
    console.log(`Default Admin user created (ADMIN)`);
  } else {
    await prisma.user.update({
      where: { id: adminUser.id },
      data: {
        username: 'ADMIN',
        password_hash: hash,
        role: 'ADMINISTRATOR',
        status: 'ACTIVE',
        failedAttempts: 0
      }
    });
    console.log(`Admin user updated to (ADMIN)`);
  }

  // Seed Reed Stock if empty
  const reedCount = await prisma.reedStockMaster.count();
  if (reedCount === 0) {
    const sampleReeds = [
      { reed_no: 'R001', reed_type: 'Standard', reed_count: '44/2', reed_space: '67.05"', reed_width: '67.05"', reed_dent: '44', dents_per_inch: 44, total_dents: 2950, reed_make: 'Premier', vendor: 'National Reeds', unit: 'Unit 1', location: 'Rack A-01', available_qty: 2, reserved_qty: 0, running_qty: 0, total_qty: 2, status: 'Available' },
      { reed_no: 'R002', reed_type: 'Heavy', reed_count: '40/1', reed_space: '72.00"', reed_width: '72.00"', reed_dent: '40', dents_per_inch: 40, total_dents: 2880, reed_make: 'LoomCraft', vendor: 'Apex Reeds', unit: 'Unit 1', location: 'Rack A-02', available_qty: 3, reserved_qty: 0, running_qty: 0, total_qty: 3, status: 'Available' },
      { reed_no: 'R003', reed_type: 'Fine', reed_count: '60/1', reed_space: '64.13"', reed_width: '64.13"', reed_dent: '60', dents_per_inch: 60, total_dents: 3840, reed_make: 'Apex', vendor: 'National Reeds', unit: 'Unit 1', location: 'Rack B-01', available_qty: 1, reserved_qty: 0, running_qty: 0, total_qty: 1, status: 'Available' },
      { reed_no: 'R004', reed_type: 'Extra Fine', reed_count: '80/2', reed_space: '68.00"', reed_width: '68.00"', reed_dent: '80', dents_per_inch: 80, total_dents: 5440, reed_make: 'Premier', vendor: 'Star Reeds', unit: 'Unit 2', location: 'Rack B-02', available_qty: 2, reserved_qty: 0, running_qty: 0, total_qty: 2, status: 'Available' },
      { reed_no: 'R005', reed_type: 'Standard', reed_count: '50/1', reed_space: '66.00"', reed_width: '66.00"', reed_dent: '50', dents_per_inch: 50, total_dents: 3300, reed_make: 'LoomCraft', vendor: 'Apex Reeds', unit: 'Unit 2', location: 'Rack C-01', available_qty: 2, reserved_qty: 0, running_qty: 0, total_qty: 2, status: 'Available' }
    ];
    for (const r of sampleReeds) {
      await prisma.reedStockMaster.create({ data: r });
    }
    console.log('Sample Reed Stock inventory initialized.');
  }
}
initSeedData().catch(console.error);


// ----------------------------------------------------
// AUTHENTICATION & USER MANAGEMENT API
// ----------------------------------------------------

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const cleanUsername = username ? username.trim() : '';
    const capitalizedUsername = cleanUsername ? cleanUsername.charAt(0).toUpperCase() + cleanUsername.slice(1).toLowerCase() : '';
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: cleanUsername },
          { username: cleanUsername.toUpperCase() },
          { username: cleanUsername.toLowerCase() },
          { username: capitalizedUsername },
          { username: 'ADMIN' },
          { username: 'Admin' }
        ]
      }
    });

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    if (!user) {
      return res.status(401).json({ error: 'Invalid Username or Password' });
    }

    if (user.status === 'LOCKED') {
      await prisma.loginHistory.create({ data: { username, status: 'LOCKED', ipAddress: ip } });
      return res.status(403).json({ error: 'Your account has been locked. Please contact Administrator.' });
    }
    if (user.status !== 'ACTIVE') {
      return res.status(403).json({ error: 'Your account is disabled.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      const attempts = user.failedAttempts + 1;
      let status = 'ACTIVE';
      if (attempts >= 5) {
        status = 'LOCKED';
      }
      await prisma.user.update({
        where: { id: user.id },
        data: { failedAttempts: attempts, status }
      });
      await prisma.loginHistory.create({ data: { username, status: 'FAILED', ipAddress: ip } });

      if (status === 'LOCKED') {
        return res.status(403).json({ error: 'Account locked due to 5 failed attempts. Please contact Administrator.' });
      }
      return res.status(401).json({ error: 'Invalid Username or Password' });
    }

    // Success
    await prisma.user.update({
      where: { id: user.id },
      data: { failedAttempts: 0, lastLogin: new Date() }
    });

    await prisma.loginHistory.create({ data: { username, status: 'SUCCESS', ipAddress: ip } });

    const token = jwt.sign({ id: user.id, role: user.role, username: user.username }, JWT_SECRET, { expiresIn: '8h' });

    // Don't send hash back
    const { password_hash, ...safeUser } = user;
    res.json({ token, user: safeUser });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
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

// Admin ONLY: Get Users (Paginated & Filtered)
app.get('/api/users', async (req, res) => {
  try {
    const authUser = authenticateUser(req);
    if (authUser) {
      const roleUpper = (authUser.role || '').toUpperCase();
      if (!['ADMINISTRATOR', 'ADMIN', 'SYSTEM ADMINISTRATOR'].includes(roleUpper)) {
        // Allow view if user has explicit User Management view permission
        const fullUser = await prisma.user.findUnique({ where: { id: authUser.id } });
        let allowed = false;
        if (fullUser && fullUser.permissions) {
          try {
            const p = JSON.parse(fullUser.permissions);
            if (p['User Management']?.view) allowed = true;
          } catch (e) {}
        }
        if (!allowed) {
          return res.status(403).json({ error: 'You do not have permission to view User Management.' });
        }
      }
    }

    const { page = 1, limit = 50, search = '', role = '', department = '', status = '' } = req.query;

    let pageNum = parseInt(page);
    let limitNum = parseInt(limit);
    if (isNaN(pageNum) || pageNum < 1) pageNum = 1;
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) limitNum = 50;

    const skip = (pageNum - 1) * limitNum;
    const take = limitNum;

    const where = {};
    if (search) {
      where.OR = [
        { employeeName: { contains: search } },
        { username: { contains: search } },
        { employeeId: { contains: search } }
      ];
    }
    if (role) where.role = role;
    if (department) where.department = department;
    if (status) where.status = status;

    const [users, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        skip,
        take,
        select: { id: true, employeeId: true, employeeName: true, username: true, role: true, department: true, designation: true, email: true, mobile: true, status: true, lastLogin: true, permissions: true, createdAt: true },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.user.count({ where })
    ]);

    res.json({ users, total, page: pageNum, limit: limitNum });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin ONLY: Create/Update User
app.post('/api/users', async (req, res) => {
  try {
    const authUser = authenticateUser(req);
    if (authUser) {
      const roleUpper = (authUser.role || '').toUpperCase();
      if (!['ADMINISTRATOR', 'ADMIN', 'SYSTEM ADMINISTRATOR'].includes(roleUpper)) {
        const fullUser = await prisma.user.findUnique({ where: { id: authUser.id } });
        let allowed = false;
        if (fullUser && fullUser.permissions) {
          try {
            const p = JSON.parse(fullUser.permissions);
            const actionKey = req.body.id ? 'edit' : 'create';
            if (p['User Management']?.[actionKey]) allowed = true;
          } catch (e) {}
        }
        if (!allowed) {
          return res.status(403).json({ error: 'You do not have permission to modify User Management profiles.' });
        }
      }
    }

    const { id, username, password, employeeName, employeeId, role, department, designation, email, mobile, status, permissions, adminUser } = req.body;
    let hash;
    if (password) {
      hash = await bcrypt.hash(password, 10);
    }

    if (id) {
      const existing = await prisma.user.findUnique({ where: { id } });
      const data = { employeeName, employeeId, role, department, designation, email, mobile, status, permissions };
      if (hash) data.password_hash = hash;
      if (status === 'ACTIVE') data.failedAttempts = 0; // unlock

      const user = await prisma.user.update({ where: { id }, data });

      // Audit Log
      await prisma.systemAuditLog.create({
        data: {
          username: adminUser || 'System',
          screen: 'User Management',
          action: 'EDIT_USER',
          oldValue: JSON.stringify({ role: existing.role, status: existing.status }),
          newValue: JSON.stringify({ role, status })
        }
      });

      res.json(user);
    } else {
      const user = await prisma.user.create({
        data: {
          username, employeeName, employeeId, role, department, designation, email, mobile, status, permissions,
          password_hash: hash || await bcrypt.hash('Default@123', 10)
        }
      });

      // Audit Log
      await prisma.systemAuditLog.create({
        data: {
          username: adminUser || 'System',
          screen: 'User Management',
          action: 'CREATE_USER',
          newValue: username
        }
      });

      res.json(user);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    const authUser = authenticateUser(req);
    if (authUser) {
      const roleUpper = (authUser.role || '').toUpperCase();
      if (!['ADMINISTRATOR', 'ADMIN', 'SYSTEM ADMINISTRATOR'].includes(roleUpper)) {
        const fullUser = await prisma.user.findUnique({ where: { id: authUser.id } });
        let allowed = false;
        if (fullUser && fullUser.permissions) {
          try {
            const p = JSON.parse(fullUser.permissions);
            if (p['User Management']?.delete) allowed = true;
          } catch (e) {}
        }
        if (!allowed) {
          return res.status(403).json({ error: 'You do not have permission to delete users.' });
        }
      }
    }

    const id = parseInt(req.params.id);
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'User not found' });
    }
    await prisma.user.delete({ where: { id } });

    // Audit Log
    await prisma.systemAuditLog.create({
      data: {
        username: req.query.adminUser || 'System',
        screen: 'User Management',
        action: 'DELETE_USER',
        newValue: existing.username
      }
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Admin ONLY: Bulk Import
app.post('/api/users/bulk', async (req, res) => {
  try {
    const users = Array.isArray(req.body.users) ? req.body.users : [];
    const adminUser = req.body.adminUser || 'System';
    let count = 0;

    const defaultHash = await bcrypt.hash('Welcome@123', 10);

    for (const u of users) {
      if (!u.username) continue;
      await prisma.user.upsert({
        where: { username: u.username },
        update: {
          employeeName: u.employeeName,
          role: u.role,
          department: u.department,
          status: u.status || 'ACTIVE'
        },
        create: {
          username: u.username,
          employeeName: u.employeeName,
          employeeId: u.employeeId || u.username,
          role: u.role || 'VIEWER',
          department: u.department,
          password_hash: defaultHash,
          status: u.status || 'ACTIVE'
        }
      });
      count++;
    }

    await prisma.systemAuditLog.create({
      data: {
        username: adminUser,
        screen: 'User Management',
        action: 'BULK_IMPORT',
        newValue: `${count} users imported`
      }
    });

    res.json({ success: true, count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------
// LOOM MASTER API
// ----------------------------------------------------

// GET all looms
app.get('/api/looms', async (req, res) => {
  try {
    const looms = await prisma.loomMaster.findMany({
      orderBy: { loom_no: 'asc' }
    });
    res.json(looms);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE ALL looms (Clear Database) - MUST BE DEFINED BEFORE /:id
app.delete('/api/looms/clear-all', async (req, res) => {
  try {
    await prisma.loomRunEntry.deleteMany({});
    await prisma.plannedAssignment.deleteMany({});
    await prisma.completedWarpHistory.deleteMany({});
    const result = await prisma.loomMaster.deleteMany({});

    await prisma.systemAuditLog.create({
      data: {
        username: req.headers['x-user'] || 'System',
        screen: 'Loom Master',
        action: 'CLEAR_ALL_LOOMS',
        newValue: `Cleared ${result.count} looms from database`
      }
    });

    res.json({ success: true, count: result.count });
  } catch (error) {
    console.error('Error clearing all looms:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE single loom
app.delete('/api/looms/:id', async (req, res) => {
  try {
    const loomNo = parseInt(req.params.id, 10);
    if (isNaN(loomNo)) {
      return res.status(400).json({ error: 'Invalid Loom Number' });
    }

    // Check if loom is running in Main Entry
    const runEntry = await prisma.loomRunEntry.findUnique({
      where: { loom_no: loomNo }
    });

    if (runEntry) {
      return res.status(400).json({ error: 'This loom is currently in use and cannot be deleted.' });
    }

    // Check if loom has a confirmed next plan
    const planEntry = await prisma.plannedAssignment.findFirst({
      where: { loom_no: loomNo }
    });

    if (planEntry) {
      return res.status(400).json({ error: 'This loom has a next plan and cannot be deleted.' });
    }

    const adminUser = req.headers['x-user'] || 'System';
    const oldLoom = await prisma.loomMaster.findUnique({ where: { loom_no: loomNo } });

    await prisma.loomMaster.delete({
      where: { loom_no: loomNo }
    });

    await prisma.systemAuditLog.create({
      data: {
        username: adminUser,
        screen: 'Loom Master',
        action: 'DELETE_LOOM',
        oldValue: JSON.stringify(oldLoom)
      }
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST single or multiple looms
app.post('/api/looms', async (req, res) => {
  try {
    const looms = Array.isArray(req.body) ? req.body : [req.body];

    let count = 0;
    for (const loom of looms) {
      const loomNoInt = parseInt(loom.loomNo, 10);
      if (isNaN(loomNoInt)) continue;

      const weftColoursInt = parseInt(loom.weftColours !== undefined ? loom.weftColours : loom.weft_colours, 10) || null;
      const beamDiaInt = parseInt(loom.beamDia !== undefined ? loom.beamDia : loom.beam_dia, 10) || null;
      const installedLeverInt = parseInt(loom.installedLever !== undefined ? loom.installedLever : loom.installed_lever, 10) || null;
      const frameCapacityInt = parseInt(loom.frameCapacity !== undefined ? loom.frameCapacity : loom.frame_capacity, 10) || null;
      const maxWeftColoursInt = parseInt(loom.maxWeftColours !== undefined ? loom.maxWeftColours : loom.max_weft_colours, 10) || null;

      // Upsert to handle both create and update
      await prisma.loomMaster.upsert({
        where: { loom_no: loomNoInt },
        update: {
          loom_type: loom.loomType || loom.loom_type,
          weft_colours: weftColoursInt,
          beam_type: loom.beamType || loom.beam_type,
          beam_dia: beamDiaInt,
          installed_lever: installedLeverInt,
          width: loom.width,
          unit: loom.unit,
          make: loom.make,
          model: loom.model,
          weave: loom.weave,
          frame_capacity: frameCapacityInt,
          max_weft_colours: maxWeftColoursInt,
          status: loom.status,
          remarks: loom.remarks,
          modifiedBy: req.headers['x-user'] || 'System',
        },
        create: {
          loom_no: loomNoInt,
          loom_type: loom.loomType || loom.loom_type,
          weft_colours: weftColoursInt,
          beam_type: loom.beamType || loom.beam_type,
          beam_dia: beamDiaInt,
          installed_lever: installedLeverInt,
          width: loom.width,
          unit: loom.unit,
          make: loom.make,
          model: loom.model,
          weave: loom.weave,
          frame_capacity: frameCapacityInt,
          max_weft_colours: maxWeftColoursInt,
          status: loom.status || 'Available',
          remarks: loom.remarks,
          createdBy: req.headers['x-user'] || 'System',
        }
      });
      count++;
    }

    if (count > 0) {
      await prisma.systemAuditLog.create({
        data: {
          username: req.headers['x-user'] || 'System',
          screen: 'Loom Master',
          action: 'UPSERT_LOOMS',
          newValue: `${count} looms updated/created`
        }
      });
    }

    res.json({ success: true, count });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

function parseConstructionSpecsServer(constructionStr) {
  if (!constructionStr) return { pick: '', greigeWidth: '', reedSpace: '' };
  const str = String(constructionStr).trim();
  const match = str.match(/(\d+)\s*[xX]\s*(\d+)\s*(?:\/|\s)+(\d+(?:\.\d+)?)\s*["']?/);
  if (match) {
    const pick = match[2] || '';
    const greigeWidth = match[3] || '';
    const wNum = parseFloat(greigeWidth);
    const reedSpace = !isNaN(wNum) ? (wNum + 1.5).toString() : '';
    return { pick, greigeWidth, reedSpace };
  }
  return { pick: '', greigeWidth: '', reedSpace: '' };
}

// ----------------------------------------------------
// DESIGN MASTER API
// ----------------------------------------------------

// GET all designs
app.get('/api/designs', async (req, res) => {
  try {
    const rawDesigns = await prisma.designMaster.findMany();
    const designs = rawDesigns.map(d => {
      const parsed = parseConstructionSpecsServer(d.construction);
      const pick = d.pick && String(d.pick).trim() !== '' ? String(d.pick) : (d.ppi ? String(d.ppi) : (parsed.pick || ''));
      const greige_width = d.greige_width && String(d.greige_width).trim() !== '' ? String(d.greige_width) : (parsed.greigeWidth || '');
      const reed_space_warp_width = d.reed_space_warp_width && String(d.reed_space_warp_width).trim() !== '' ? String(d.reed_space_warp_width) : (parsed.reedSpace || (greige_width ? String(parseFloat(greige_width) + 1.5) : ''));
      return {
        ...d,
        pick,
        greige_width,
        reed_space_warp_width
      };
    });
    res.json(designs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST single or multiple designs
app.post('/api/designs', async (req, res) => {
  try {
    const designs = Array.isArray(req.body) ? req.body : [req.body];

    let count = 0;
    for (const design of designs) {
      if (!design.designNo) continue;

      const parsed = parseConstructionSpecsServer(design.construction);
      const pickVal = design.pick && String(design.pick).trim() !== '' ? String(design.pick) : (parsed.pick || '');
      const widthVal = design.greigeWidth && String(design.greigeWidth).trim() !== '' ? String(design.greigeWidth) : (parsed.greigeWidth || '');
      const reedSpaceVal = design.reedSpace && String(design.reedSpace).trim() !== '' ? String(design.reedSpace) : (parsed.reedSpace || (widthVal ? String(parseFloat(widthVal) + 1.5) : ''));

      await prisma.designMaster.upsert({
        where: { design_no_sp_no: design.designNo },
        update: {
          construction: design.construction || '',
          weft_colours: design.weftColours,
          weft_colour_details: design.weftColourDetails,
          frames: design.frames,
          reed_count: design.reedCount || '',
          pick: pickVal,
          greige_width: widthVal,
          total_ends: design.totalEnds,
          reed_space_warp_width: reedSpaceVal,
          crimp_percent: design.crimpPercent,
          weave_type: design.weaveType || '',
          beam_type: design.beamType || '',
        },
        create: {
          design_no_sp_no: design.designNo,
          construction: design.construction || '',
          weft_colours: design.weftColours || 0,
          weft_colour_details: design.weftColourDetails,
          frames: design.frames || 0,
          reed_count: design.reedCount || '',
          pick: pickVal,
          greige_width: widthVal,
          total_ends: design.totalEnds,
          reed_space_warp_width: reedSpaceVal,
          crimp_percent: design.crimpPercent || 0,
          weave_type: design.weaveType || '',
          beam_type: design.beamType || '',
        }
      });
      count++;
    }


    res.json({ success: true, count });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE single design with deletion protection (force=true bypasses checks)
app.delete('/api/designs', async (req, res) => {
  try {
    const rawDesignNo = req.query.designNo;
    const force = req.query.force === 'true';

    if (!rawDesignNo) {
      return res.status(400).json({ error: 'Design number is required.' });
    }
    const designNo = decodeURIComponent(rawDesignNo).trim();

    // Check if the design exists
    const design = await prisma.designMaster.findUnique({
      where: { design_no_sp_no: designNo }
    });
    if (!design) {
      return res.json({ success: true, message: 'Design not found or already deleted.' });
    }

    if (!force) {
      // Only check links when NOT forcing
      const [inOrders, inBeams, inRuns, inPlans, inHistory, inSizing] = await Promise.all([
        prisma.orderMaster.findFirst({ where: { design_no_sp_no: designNo } }),
        prisma.beamStockMaster.findFirst({ where: { design_no: designNo } }),
        prisma.loomRunEntry.findFirst({ where: { design_no_sp_no: designNo } }),
        prisma.plannedAssignment.findFirst({ where: { OR: [{ current_design: designNo }, { next_design: designNo }] } }),
        prisma.completedWarpHistory.findFirst({ where: { design_no_sp_no: designNo } }),
        prisma.beamPreparationRequest.findFirst({ where: { design_no: designNo } })
      ]);

      if (inOrders || inBeams || inRuns || inPlans || inHistory || inSizing) {
        return res.status(400).json({
          error: 'This Design is linked to orders or active production. Deletion is not permitted.',
          linked: {
            orders: !!inOrders,
            beams: !!inBeams,
            runs: !!inRuns,
            plans: !!inPlans,
            history: !!inHistory,
            sizing: !!inSizing
          }
        });
      }
    } else {
      // FORCE DELETE: Cascade clean up all referencing records to avoid foreign key constraint violations
      const linkedOrders = await prisma.orderMaster.findMany({
        where: { design_no_sp_no: designNo },
        select: { id: true, order_no: true }
      });

      const orderIds = linkedOrders.map(o => o.id);
      const orderNos = linkedOrders.map(o => o.order_no).filter(Boolean);

      if (orderIds.length > 0) {
        await prisma.beamRequirement.deleteMany({ where: { order_id: { in: orderIds } } }).catch(() => { });
      }
      if (orderNos.length > 0) {
        await prisma.yarnConfirmation.deleteMany({ where: { order_no: { in: orderNos } } }).catch(() => { });
        await prisma.sizingConfirmation.deleteMany({ where: { order_no: { in: orderNos } } }).catch(() => { });
        await prisma.delayRecord.deleteMany({ where: { order_no: { in: orderNos } } }).catch(() => { });
        await prisma.erpAlert.deleteMany({ where: { order_no: { in: orderNos } } }).catch(() => { });
      }

      await prisma.orderMaster.deleteMany({ where: { design_no_sp_no: designNo } }).catch(() => { });
      await prisma.beamStock.deleteMany({ where: { designNo: designNo } }).catch(() => { });
      await prisma.beamStockMaster.deleteMany({ where: { design_no: designNo } }).catch(() => { });
      await prisma.beamPreparationRequest.deleteMany({ where: { design_no: designNo } }).catch(() => { });
      await prisma.loomRunEntry.deleteMany({ where: { design_no_sp_no: designNo } }).catch(() => { });
      await prisma.plannedAssignment.deleteMany({
        where: { OR: [{ current_design: designNo }, { next_design: designNo }] }
      }).catch(() => { });
      await prisma.completedWarpHistory.deleteMany({ where: { design_no_sp_no: designNo } }).catch(() => { });
      await prisma.reedRequirement.deleteMany({ where: { design_no: designNo } }).catch(() => { });
      await prisma.yarnConfirmation.deleteMany({ where: { design_no: designNo } }).catch(() => { });
      await prisma.sizingConfirmation.deleteMany({ where: { design_no: designNo } }).catch(() => { });
      await prisma.erpAlert.deleteMany({ where: { design_no: designNo } }).catch(() => { });
      await prisma.delayRecord.deleteMany({ where: { design_no: designNo } }).catch(() => { });
    }

    await prisma.designMaster.delete({ where: { design_no_sp_no: designNo } });
    res.json({ success: true, message: 'Design deleted successfully' });
  } catch (error) {
    console.error('Delete design error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete design' });
  }
});

function parseColorCountServer(val) {
  if (val === null || val === undefined || val === '') return 1;
  if (typeof val === 'number') return isNaN(val) ? 1 : val;
  const s = String(val).trim();
  if (!s || s === '—') return 1;
  if (!isNaN(Number(s))) return Number(s);
  if (s.includes('+')) {
    const parts = s.split('+').map(p => parseFloat(p.trim())).filter(n => !isNaN(n));
    if (parts.length > 0) {
      const sum = parts.reduce((acc, curr) => acc + curr, 0);
      return sum > 0 ? sum : parts.length;
    }
  }
  const parsed = parseFloat(s);
  return !isNaN(parsed) && parsed > 0 ? parsed : 1;
}

app.post('/api/orders', async (req, res) => {
  try {
    const body = req.body;
    if (!body.design_no_sp_no || !body.order_qty) {
      return res.status(400).json({ error: 'Design Number and Order Quantity are required.' });
    }

    const ibpoNo = body.ibpo_no ? String(body.ibpo_no).trim().toUpperCase() : null;

    // Strict Active IBPO Uniqueness Check
    if (ibpoNo) {
      const existingActive = await prisma.orderMaster.findFirst({
        where: {
          ibpo_no: ibpoNo,
          NOT: {
            OR: [
              { status: 'ORDER COMPLETED' },
              { order_completion_status: 'COMPLETED' }
            ]
          }
        }
      });

      if (existingActive) {
        return res.status(400).json({
          error: `IBPO ${ibpoNo} is already available in the system. Duplicate active order cannot be created.`
        });
      }
    }

    const designNo = String(body.design_no_sp_no).trim();


    // 1. SSOT: Create or Update DesignMaster FIRST
    const parsedSpecs = parseConstructionSpecsServer(body.construction);
    const resolvedPick = body.pick ? String(body.pick) : (body.ppi ? String(body.ppi) : (parsedSpecs.pick || ''));
    const resolvedWidth = body.greige_width ? String(body.greige_width) : (body.width ? String(body.width) : (parsedSpecs.greigeWidth || ''));
    const resolvedReedSpace = body.reed_space || body.reed_space_warp_width ? String(body.reed_space || body.reed_space_warp_width) : (parsedSpecs.reedSpace || (resolvedWidth ? String(parseFloat(resolvedWidth) + 1.5) : ''));
    const clrWarpVal = parseColorCountServer(body.no_of_clr_warp);
    const clrWeftVal = parseColorCountServer(body.no_of_clr_weft || body.weft_colours);

    await prisma.designMaster.upsert({
      where: { design_no_sp_no: designNo },
      update: {
        construction: body.construction || '',
        weft_colours: clrWeftVal,
        weft_colour_details: body.weft_colour_details || '',
        frames: Number(body.frames) || 0,
        reed_count: body.reed_count ? String(body.reed_count) : '',
        pick: resolvedPick,
        greige_width: resolvedWidth,
        total_ends: Number(body.total_ends) || null,
        reed_space_warp_width: resolvedReedSpace,
        crimp_percent: body.crimp_percent ? Number(body.crimp_percent) / 100 : 0,
        weave_type: body.weave_type || '',
        beam_type: body.beam_type || '',
        beam_dia: Number(body.beam_dia) || null,
        no_of_clr_warp: clrWarpVal,
        no_of_clr_weft: clrWeftVal,
        remarks: body.remarks || ''
      },
      create: {
        design_no_sp_no: designNo,
        construction: body.construction || '',
        weft_colours: clrWeftVal,
        weft_colour_details: body.weft_colour_details || '',
        frames: Number(body.frames) || 0,
        reed_count: body.reed_count ? String(body.reed_count) : '',
        pick: resolvedPick,
        greige_width: resolvedWidth,
        total_ends: Number(body.total_ends) || null,
        reed_space_warp_width: resolvedReedSpace,
        crimp_percent: body.crimp_percent ? Number(body.crimp_percent) / 100 : 0,
        weave_type: body.weave_type || '',
        beam_type: body.beam_type || '',
        beam_dia: Number(body.beam_dia) || null,
        no_of_clr_warp: clrWarpVal,
        no_of_clr_weft: clrWeftVal,
        status: 'ACTIVE',
        remarks: body.remarks || ''
      }
    });


    // 2. Generate unique order_no if not provided
    const orderNo = body.order_no || `ORD-${Date.now().toString().slice(-6)}`;

    // 3. Create OrderMaster
    const newOrder = await prisma.orderMaster.create({
      data: {
        order_no: orderNo,
        ibpo_no: ibpoNo,
        customer_name: body.customer_name,
        buyer_name: body.buyer_name || null,
        order_type: body.order_type || 'GREY',
        combo_pattern: body.combo_pattern || null,
        finish: body.finish || null,
        design_no_sp_no: designNo,
        construction: body.construction || null,
        reed_count: body.reed_count ? String(body.reed_count) : null,
        weave_type: body.weave_type || null,
        epi: body.epi ? Number(body.epi) : null,
        ppi: body.ppi ? Number(body.ppi) : null,
        total_ends: body.total_ends ? Number(body.total_ends) : null,
        beam_type: body.beam_type || null,
        frames: body.frames ? Number(body.frames) : null,
        no_of_clr_warp: body.no_of_clr_warp ? Number(body.no_of_clr_warp) : null,
        no_of_clr_weft: body.no_of_clr_weft || body.weft_colours ? Number(body.no_of_clr_weft || body.weft_colours) : null,
        uom: body.uom || 'Meters',
        order_qty: Number(body.order_qty),
        grey_qty: Number(body.grey_qty) || null,
        warp_qty: Number(body.warp_qty) || null,
        beam_capacity: Number(body.beam_capacity) || null,
        required_beams: Number(body.required_beams) || null,
        planned_loom_count: Number(body.planned_loom_count) || null,
        avg_production_per_loom: Number(body.avg_production_per_loom) || null,
        estimated_production_days: Number(body.estimated_production_days) || null,
        expected_completion_date: body.expected_completion_date ? new Date(body.expected_completion_date) : null,
        sizing_planned_date: body.sizing_planned_date ? new Date(body.sizing_planned_date) : null,
        weaving_planned_date: body.weaving_planned_date ? new Date(body.weaving_planned_date) : null,
        weaving_completion_date: body.weaving_completion_date ? new Date(body.weaving_completion_date) : null,
        target_delivery_date: body.target_delivery_date ? new Date(body.target_delivery_date) : null,
        priority: body.priority || 'NORMAL',
        planning_status: body.planning_status || 'Planning Pending',
        status: body.status || 'Order Received',
        remarks: body.remarks || null
      }
    });


    res.json(newOrder);
  } catch (error) {
    console.error('Save Order Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Bulk Orders Creation Endpoint (Multi Orders Entry)
app.post('/api/orders/bulk', async (req, res) => {
  try {
    const { orders } = req.body;
    if (!Array.isArray(orders) || orders.length === 0) {
      return res.status(400).json({ error: 'No orders provided for bulk insertion.' });
    }

    // 1. Check duplicates within payload
    const ibpoMap = new Map();
    for (let i = 0; i < orders.length; i++) {
      const o = orders[i];
      if (o.ibpo_no) {
        const cleanIbpo = String(o.ibpo_no).trim().toUpperCase();
        if (ibpoMap.has(cleanIbpo)) {
          return res.status(400).json({
            error: `Duplicate IBPO ${cleanIbpo} found in pasted rows (Row ${ibpoMap.get(cleanIbpo) + 1} & Row ${i + 1}).`
          });
        }
        ibpoMap.set(cleanIbpo, i);
      }
    }

    // 2. Check duplicates against active orders in DB
    const activeDbOrders = await prisma.orderMaster.findMany({
      where: {
        ibpo_no: { in: Array.from(ibpoMap.keys()) },
        NOT: {
          OR: [
            { status: 'ORDER COMPLETED' },
            { order_completion_status: 'COMPLETED' }
          ]
        }
      },
      select: { ibpo_no: true }
    });

    if (activeDbOrders.length > 0) {
      const dupList = activeDbOrders.map(d => d.ibpo_no).join(', ');
      return res.status(400).json({
        error: `IBPO(s) already exist in active Order Management: ${dupList}. Duplicate active entries are not allowed.`
      });
    }

    const createdOrders = [];
    for (let i = 0; i < orders.length; i++) {
      const body = orders[i];
      const ibpoNo = body.ibpo_no ? String(body.ibpo_no).trim().toUpperCase() : null;
      const designNo = String(body.design_no_sp_no || '').trim();
      if (!designNo || !body.order_qty) {
        return res.status(400).json({ error: `Row ${i + 1}: Design Number and Order Quantity are required.` });
      }

      // Upsert Design Master
      const parsedSpecs = parseConstructionSpecsServer(body.construction);
      const resolvedPick = body.pick ? String(body.pick) : (body.ppi ? String(body.ppi) : (parsedSpecs.pick || ''));
      const resolvedWidth = body.greige_width ? String(body.greige_width) : (body.width ? String(body.width) : (parsedSpecs.greigeWidth || ''));
      const resolvedReedSpace = body.reed_space || body.reed_space_warp_width ? String(body.reed_space || body.reed_space_warp_width) : (parsedSpecs.reedSpace || (resolvedWidth ? String(parseFloat(resolvedWidth) + 1.5) : ''));

      await prisma.designMaster.upsert({
        where: { design_no_sp_no: designNo },
        update: {
          construction: body.construction || '',
          weft_colours: Number(body.weft_colours || body.no_of_clr_weft) || 0,
          frames: Number(body.frames) || 0,
          reed_count: body.reed_count ? String(body.reed_count) : '',
          pick: resolvedPick,
          greige_width: resolvedWidth,
          total_ends: Number(body.total_ends) || null,
          reed_space_warp_width: resolvedReedSpace,
          crimp_percent: body.crimp_percent ? Number(body.crimp_percent) / 100 : 0,
          weave_type: body.weave_type || '',
          beam_type: body.beam_type || '',
          no_of_clr_warp: Number(body.no_of_clr_warp) || null,
          no_of_clr_weft: Number(body.no_of_clr_weft || body.weft_colours) || null
        },
        create: {
          design_no_sp_no: designNo,
          construction: body.construction || '',
          weft_colours: Number(body.weft_colours || body.no_of_clr_weft) || 0,
          frames: Number(body.frames) || 0,
          reed_count: body.reed_count ? String(body.reed_count) : '',
          pick: resolvedPick,
          greige_width: resolvedWidth,
          total_ends: Number(body.total_ends) || null,
          reed_space_warp_width: resolvedReedSpace,
          crimp_percent: body.crimp_percent ? Number(body.crimp_percent) / 100 : 0,
          weave_type: body.weave_type || '',
          beam_type: body.beam_type || '',
          no_of_clr_warp: Number(body.no_of_clr_warp) || null,
          no_of_clr_weft: Number(body.no_of_clr_weft || body.weft_colours) || null,
          status: 'ACTIVE'
        }
      });


      const orderNo = body.order_no || `ORD-${Date.now().toString().slice(-6)}-${i+1}`;
      const newOrder = await prisma.orderMaster.create({
        data: {
          order_no: orderNo,
          ibpo_no: ibpoNo,
          customer_name: body.customer_name || body.ibpo_no || 'STANDARD',
          buyer_name: body.buyer_name || null,
          order_type: body.order_type || 'GREY',
          combo_pattern: body.combo_pattern || null,
          finish: body.finish || null,
          design_no_sp_no: designNo,
          construction: body.construction || null,
          reed_count: body.reed_count ? String(body.reed_count) : null,
          weave_type: body.weave_type || null,
          epi: body.epi ? Number(body.epi) : null,
          ppi: body.ppi ? Number(body.ppi) : null,
          total_ends: body.total_ends ? Number(body.total_ends) : null,
          beam_type: body.beam_type || null,
          frames: body.frames ? Number(body.frames) : null,
          no_of_clr_warp: body.no_of_clr_warp ? Number(body.no_of_clr_warp) : null,
          greige_width: resolvedWidth || null,
          reed_space: resolvedReedSpace || null,
          uom: body.uom || 'Meters',
          order_qty: Number(body.order_qty),
          grey_qty: Number(body.grey_qty) || Number(body.order_qty) || null,
          warp_qty: Number(body.warp_qty) || Number(body.order_qty) || null,
          planned_loom_count: Number(body.planned_loom_count) || null,
          avg_production_per_loom: Number(body.avg_production_per_loom) || null,
          estimated_production_days: Number(body.estimated_production_days) || null,
          expected_completion_date: body.expected_completion_date ? new Date(body.expected_completion_date) : null,
          sizing_planned_date: body.sizing_planned_date ? new Date(body.sizing_planned_date) : null,
          sizing_completed_date: body.sizing_completion_date || body.sizing_completed_date ? new Date(body.sizing_completion_date || body.sizing_completed_date) : null,
          weaving_planned_date: body.weaving_planned_date || body.weaving_start_date ? new Date(body.weaving_planned_date || body.weaving_start_date) : null,
          weaving_start_date: body.weaving_start_date ? new Date(body.weaving_start_date) : null,
          weaving_completion_date: body.weaving_completion_date ? new Date(body.weaving_completion_date) : null,
          target_delivery_date: body.target_delivery_date ? new Date(body.target_delivery_date) : null,
          priority: body.priority || 'NORMAL',
          planning_status: body.planning_status || 'Planning Pending',
          status: body.status || 'ORDER RECEIVED',
          remarks: body.remarks || null
        }
      });
      createdOrders.push(newOrder);
    }

    await prisma.systemAuditLog.create({
      data: {
        username: req.body.adminUser || 'System',
        screen: 'Order Management',
        action: 'MULTI_CREATE_ORDERS',
        newValue: `${createdOrders.length} orders created`
      }
    });

    res.json({ success: true, count: createdOrders.length, orders: createdOrders });
  } catch (error) {
    console.error('Bulk Order Save Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Bulk Orders Edit Endpoint (Multi Edit)
app.put('/api/orders/bulk', async (req, res) => {
  try {
    const { orders } = req.body;
    if (!Array.isArray(orders) || orders.length === 0) {
      return res.status(400).json({ error: 'No orders provided for bulk edit.' });
    }

    const updatedOrders = [];
    for (const body of orders) {
      if (!body.id) continue;
      const updated = await prisma.orderMaster.update({
        where: { id: Number(body.id) },
        data: {
          customer_name: body.customer_name,
          buyer_name: body.buyer_name || null,
          combo_pattern: body.combo_pattern || null,
          finish: body.finish || null,
          construction: body.construction || null,
          reed_count: body.reed_count ? String(body.reed_count) : null,
          weave_type: body.weave_type || null,
          epi: body.epi ? Number(body.epi) : null,
          ppi: body.ppi ? Number(body.ppi) : null,
          total_ends: body.total_ends ? Number(body.total_ends) : null,
          beam_type: body.beam_type || null,
          frames: body.frames ? Number(body.frames) : null,
          no_of_clr_warp: body.no_of_clr_warp ? Number(body.no_of_clr_warp) : null,
          no_of_clr_weft: body.no_of_clr_weft || body.weft_colours ? Number(body.no_of_clr_weft || body.weft_colours) : null,
          uom: body.uom || 'Meters',
          order_qty: Number(body.order_qty),
          grey_qty: Number(body.grey_qty) || Number(body.order_qty) || null,
          warp_qty: Number(body.warp_qty) || Number(body.order_qty) || null,
          planned_loom_count: Number(body.planned_loom_count) || null,
          avg_production_per_loom: Number(body.avg_production_per_loom) || null,
          estimated_production_days: Number(body.estimated_production_days) || null,
          expected_completion_date: body.expected_completion_date ? new Date(body.expected_completion_date) : null,
          sizing_planned_date: body.sizing_planned_date ? new Date(body.sizing_planned_date) : null,
          sizing_completed_date: body.sizing_completion_date || body.sizing_completed_date ? new Date(body.sizing_completion_date || body.sizing_completed_date) : null,
          weaving_planned_date: body.weaving_planned_date || body.weaving_start_date ? new Date(body.weaving_planned_date || body.weaving_start_date) : null,
          weaving_start_date: body.weaving_start_date ? new Date(body.weaving_start_date) : null,
          weaving_completion_date: body.weaving_completion_date ? new Date(body.weaving_completion_date) : null,
          target_delivery_date: body.target_delivery_date ? new Date(body.target_delivery_date) : null,
          priority: body.priority || 'NORMAL',
          status: body.status || 'ORDER RECEIVED',
          remarks: body.remarks || null
        }
      });
      updatedOrders.push(updated);
    }

    await prisma.systemAuditLog.create({
      data: {
        username: req.body.adminUser || 'System',
        screen: 'Order Management',
        action: 'MULTI_EDIT_ORDERS',
        newValue: `${updatedOrders.length} orders updated`
      }
    });

    res.json({ success: true, count: updatedOrders.length, orders: updatedOrders });
  } catch (error) {
    console.error('Bulk Order Edit Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Bulk Orders Delete Endpoint (Multi Delete)
app.post('/api/orders/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'No order IDs provided for bulk delete.' });
    }

    const numericIds = ids.map(id => Number(id));

    // Check operational status protection
    const activeOrders = await prisma.orderMaster.findMany({
      where: {
        id: { in: numericIds },
        OR: [
          { status: 'WEAVING RUNNING' },
          { status: 'WEAVING COMPLETED' },
          { status: 'ORDER COMPLETED' },
          { produced_qty: { gt: 0 } }
        ]
      }
    });

    if (activeOrders.length > 0) {
      const blocked = activeOrders.map(o => o.ibpo_no || o.order_no).join(', ');
      return res.status(400).json({
        error: `Order(s) ${blocked} cannot be deleted because operational processing has already started.`
      });
    }

    await prisma.beamRequirement.deleteMany({ where: { order_id: { in: numericIds } } });
    await prisma.plannedAssignment.deleteMany({ where: { order_id: { in: numericIds } } });
    const deleteResult = await prisma.orderMaster.deleteMany({ where: { id: { in: numericIds } } });

    await prisma.systemAuditLog.create({
      data: {
        username: req.body.adminUser || 'System',
        screen: 'Order Management',
        action: 'MULTI_DELETE_ORDERS',
        newValue: `${deleteResult.count} orders deleted`
      }
    });

    res.json({ success: true, count: deleteResult.count });
  } catch (error) {
    console.error('Bulk Order Delete Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Order Approval Route
app.put('/api/orders/:id/approve', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const order = await prisma.orderMaster.findUnique({ where: { id } });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const updated = await prisma.orderMaster.update({
      where: { id },
      data: {
        approval_status: 'APPROVED',
        approved_by: req.body.approved_by || 'Planning Manager',
        approval_date: new Date(),
        status: 'APPROVED'
      }
    });

    res.json({ success: true, order: updated });
  } catch (error) {
    console.error('Approve order error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/orders/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const userRole = String(req.headers['x-role'] || req.headers['x-user-role'] || '').toUpperCase();
    const username = String(req.headers['x-user'] || '').toLowerCase();

    const targetOrder = await prisma.orderMaster.findUnique({ where: { id } });
    if (!targetOrder) return res.status(404).json({ error: 'Order not found' });

    // Check if order is specifically linked with active running looms or planned assignments
    const [inRuns, inPlans] = await Promise.all([
      targetOrder.order_no ? prisma.loomRunEntry.findFirst({ where: { order_no: targetOrder.order_no } }) : null,
      prisma.plannedAssignment.findFirst({ where: { order_id: id } })
    ]);

    const isLinked = !!(inRuns || inPlans);
    const isAdmin = userRole.includes('ADMIN') || userRole.includes('ADMINISTRATOR') || username.includes('admin') || username === 'santhiadmin' || !userRole;

    if (isLinked && !isAdmin) {
      return res.status(400).json({ error: 'This Order is currently assigned to active running/planned looms. Deletion is not permitted.' });
    }

    // Clean up associated child records safely before deleting order
    await prisma.beamRequirement.deleteMany({ where: { order_id: id } }).catch(() => { });
    await prisma.plannedAssignment.deleteMany({
      where: {
        OR: [
          { order_id: id },
          ...(targetOrder.order_no ? [{ order_no: targetOrder.order_no }] : []),
          ...(targetOrder.ibpo_no ? [{ order_no: targetOrder.ibpo_no }] : [])
        ]
      }
    }).catch(() => { });

    if (targetOrder.order_no) {
      await prisma.yarnConfirmation.deleteMany({ where: { order_no: targetOrder.order_no } }).catch(() => { });
      await prisma.sizingConfirmation.deleteMany({ where: { order_no: targetOrder.order_no } }).catch(() => { });
      await prisma.delayRecord.deleteMany({ where: { order_no: targetOrder.order_no } }).catch(() => { });
      await prisma.erpAlert.deleteMany({ where: { order_no: targetOrder.order_no } }).catch(() => { });
    }

    await prisma.orderMaster.delete({ where: { id } });
    res.json({ success: true, message: 'Order deleted successfully' });
  } catch (error) {
    console.error('Delete order error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete order' });
  }
});

app.get('/api/capacity/planning', async (req, res) => {
  try {
    const looms = await prisma.loomMaster.findMany();
    const orders = await prisma.orderMaster.findMany();

    const runningLooms = looms.filter(l => l.status === 'RUNNING' || l.status === 'Running').length;
    const totalRequiredLooms = orders.reduce((sum, o) => sum + (o.planned_loom_count || 0), 0);

    const capacity = {
      looms: {
        total: looms.length,
        available: Math.max(0, looms.length - runningLooms),
        running: runningLooms,
        required: totalRequiredLooms,
        utilizationPct: looms.length > 0 ? Math.round((runningLooms / looms.length) * 100) : 0
      },
      beams: {
        totalRequired: orders.reduce((sum, o) => sum + (o.required_beams || 0), 0),
        pending: orders.reduce((sum, o) => sum + (o.required_beams || 0) - (o.beam_prepared || 0), 0),
        reserved: orders.reduce((sum, o) => sum + (o.current_beam_planned || 0), 0),
        availableStock: 0
      },
      production: {
        totalOrderQty: orders.reduce((sum, o) => sum + (o.order_qty || 0), 0),
        avgDailyProduction: orders.reduce((sum, o) => sum + ((o.avg_production_per_loom || 0) * (o.planned_loom_count || 1)), 0)
      },
      orders: orders.map(o => ({
        order_no: o.order_no,
        customer_name: o.customer_name,
        order_qty: o.order_qty,
        planned_looms: o.planned_loom_count || 0,
        risk_score: 0,
        delay_status: 'Green'
      }))
    };

    res.json({ success: true, capacity });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------
// BEAM STOCK MASTER API
// ----------------------------------------------------

app.get('/api/beam-stock', async (req, res) => {
  try {
    const beams = await prisma.beamStockMaster.findMany({
      orderBy: { id: 'desc' }
    });
    res.json(beams);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/beams/available', async (req, res) => {
  try {
    const beams = await prisma.beamStockMaster.findMany({
      where: {
        status: { in: ['Available', 'AVAILABLE', 'Ready', 'READY'] },
        OR: [
          { loom_no_assigned: null },
          { loom_no_assigned: 0 }
        ]
      },
      orderBy: { id: 'desc' }
    });
    res.json(beams);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/beam-stock', async (req, res) => {
  try {
    const beamList = Array.isArray(req.body) ? req.body : [req.body];
    let count = 0;

    for (const b of beamList) {
      if (!b.beam_no || !String(b.beam_no).trim()) continue;

      let dateVal = new Date();
      if (b.date) {
        try {
          const d = new Date(b.date);
          if (!isNaN(d.getTime())) dateVal = d;
        } catch (e) { }
      }

      const beamNoStr = String(b.beam_no).trim();

      const existing = await prisma.beamStockMaster.findFirst({
        where: { beam_no: beamNoStr }
      });

      const payloadData = {
        date: dateVal,
        design_no: b.design_no || '',
        vendor_name: b.vendor_name || b.party || '',
        party_beam_no: b.party_beam_no || b.vendor_beam_no || '',
        set_no: b.set_no || '',
        beam_no: beamNoStr,
        beam_type: b.beam_type || '',
        beam_dia: Number(b.beam_dia) || null,
        beam_width: Number(b.beam_width) || null,
        ends: Number(b.total_ends) || Number(b.ends) || null,
        total_warped_meter: Number(b.warp_meter) || Number(b.total_warped_meter) || null,
        available_meter: Number(b.balance_meter) || Number(b.warp_meter) || Number(b.available_meter) || 0,
        location: b.location || '',
        status: b.beam_status || b.status || 'Available',
        remarks: b.remarks || ''
      };

      if (existing) {
        await prisma.beamStockMaster.update({
          where: { id: existing.id },
          data: payloadData
        });
      } else {
        await prisma.beamStockMaster.create({
          data: payloadData
        });
      }
      count++;
    }

    res.json({ success: true, count });
  } catch (error) {
    console.error('Beam Stock Save Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/beam-stock/clear-all', async (req, res) => {
  try {
    const result = await prisma.beamStockMaster.deleteMany({});
    res.json({ success: true, count: result.count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/beam-stock/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    await prisma.beamStockMaster.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/beam-stock/clean-empty', async (req, res) => {
  try {
    const result = await prisma.beamStockMaster.deleteMany({
      where: {
        OR: [
          { status: '' },
          { status: null }
        ]
      }
    });
    res.json({ success: true, deleted: result.count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/active-runs', async (req, res) => {
  try {
    const [runs, beamStocks, completedOrders] = await Promise.all([
      prisma.loomRunEntry.findMany(),
      prisma.beamStockMaster.findMany(),
      prisma.orderMaster.findMany({
        where: {
          OR: [
            { status: 'ORDER COMPLETED' },
            { status: 'Completed' },
            { order_completion_status: 'COMPLETED' }
          ]
        }
      })
    ]);

    const completedDesignNos = new Set();
    const completedOrderNos = new Set();

    completedOrders.forEach(o => {
      if (o.design_no_sp_no) completedDesignNos.add(o.design_no_sp_no.trim().toLowerCase());
      if (o.ibpo_no) completedOrderNos.add(o.ibpo_no.trim().toLowerCase());
      if (o.order_no) completedOrderNos.add(o.order_no.trim().toLowerCase());
    });

    const staleIds = [];
    const validRuns = [];

    runs.forEach(r => {
      const runDesign = (r.design_no_sp_no || '').trim().toLowerCase();
      const runOrder = (r.order_no || '').trim().toLowerCase();

      if (completedDesignNos.has(runDesign) || (runOrder && completedOrderNos.has(runOrder))) {
        staleIds.push(r.id);
      } else {
        validRuns.push(r);
      }
    });

    if (staleIds.length > 0) {
      prisma.loomRunEntry.deleteMany({
        where: { id: { in: staleIds } }
      }).catch(e => console.error('Error cleaning up stale run entries:', e));
    }

    const beamMap = new Map();
    beamStocks.forEach(b => {
      if (b.beam_no) beamMap.set(b.beam_no.toString().toLowerCase(), b);
    });

    const enrichedRuns = validRuns.map(r => {
      let setNo = r.set_no;
      let beamId = r.beam_id;

      if (r.current_beam_no) {
        const b = beamMap.get(r.current_beam_no.toString().toLowerCase());
        if (b) {
          if (!setNo) setNo = b.set_no;
          if (!beamId) beamId = b.id;
        }
      }

      return {
        ...r,
        set_no: setNo || '',
        beam_id: beamId || null
      };
    });

    res.json(enrichedRuns);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------
// DESIGN-WISE LOOM RUNNING REPORT API
// ----------------------------------------------------
app.get('/api/reports/design-running', async (req, res) => {
  try {
    const [activeRuns, loomMasters, designMasters, orderMasters] = await Promise.all([
      prisma.loomRunEntry.findMany(),
      prisma.loomMaster.findMany(),
      prisma.designMaster.findMany(),
      prisma.orderMaster.findMany()
    ]);

    const loomMap = new Map();
    loomMasters.forEach(l => loomMap.set(l.loom_no, l));

    const designMap = new Map();
    designMasters.forEach(d => designMap.set(d.design_no_sp_no, d));

    const validationWarnings = {
      unmappedLooms: [],
      unmappedDesigns: []
    };

    const runningLoomsList = [];

    activeRuns.forEach(run => {
      if (!run.design_no_sp_no || !run.design_no_sp_no.trim()) return;

      const loomInfo = loomMap.get(run.loom_no);
      const designInfo = designMap.get(run.design_no_sp_no);

      if (!loomInfo) {
        validationWarnings.unmappedLooms.push(run.loom_no);
      }
      if (!designInfo) {
        validationWarnings.unmappedDesigns.push(run.design_no_sp_no);
      }

      let rawUnit = (loomInfo && (loomInfo.unit || loomInfo.shed_name)) ? (loomInfo.unit || loomInfo.shed_name) : 'UNIT 1';
      let formattedUnit = String(rawUnit).trim().toUpperCase();
      if (!formattedUnit.startsWith('UNIT')) {
        formattedUnit = `UNIT ${formattedUnit}`;
      }

      runningLoomsList.push({
        loomNo: run.loom_no,
        designNo: run.design_no_sp_no,
        loomStartDate: run.loom_start_date,
        warpedMeter: run.warped_meter || 0,
        dailyProduction: run.daily_production || 0,
        rpm: run.rpm !== undefined ? run.rpm : (loomInfo?.rpm || null),
        efficiency: run.efficiency || null,
        shiftHours: run.shift_hours || null,
        workingHours: run.working_hours || null,
        machineUtilization: run.machine_utilization || null,
        productionOverride: run.production_override || null,
        overrideReason: run.override_reason || '',
        currentReedNo: run.current_reed_no || '',
        currentBeamNo: run.current_beam_no || '',
        unit: formattedUnit,
        loomType: loomInfo?.loom_type || 'AIRJET',
        make: loomInfo?.make || '',
        model: loomInfo?.model || '',
        status: loomInfo?.status || 'Running',
        construction: designInfo?.construction || 'N/A',
        weave: designInfo?.weave_type || 'N/A',
        frames: designInfo?.frames || 0,
        weftColours: designInfo?.weft_colours || 1,
        reedCount: designInfo?.reed_count || 'N/A',
        pick: designInfo?.pick || 'N/A',
        greigeWidth: designInfo?.greige_width || 'N/A',
        crimpPercent: designInfo?.crimp_percent || 0.05,
        loomExistsInMaster: !!loomInfo,
        designExistsInMaster: !!designInfo
      });
    });

    res.json({
      success: true,
      data: runningLoomsList,
      validationWarnings,
      orders: orderMasters,
      meta: {
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error in /api/reports/design-running:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/active-runs', async (req, res) => {
  try {
    const runs = Array.isArray(req.body) ? req.body : [req.body];

    for (const run of runs) {
      const updateData = {
        design_no_sp_no: run.designNo,
        loom_start_date: new Date(run.loomStartDate),
        warped_meter: parseFloat(run.warpedMeter) || 0,
        daily_production: parseFloat(run.dailyProduction) || 0,
        remarks: run.remarks || ''
      };

      if (run.rpm !== undefined && run.rpm !== null && run.rpm !== '') {
        updateData.rpm = parseInt(run.rpm, 10);
      }
      if (run.efficiency !== undefined && run.efficiency !== null && run.efficiency !== '') {
        updateData.efficiency = parseFloat(run.efficiency);
      }
      if (run.shiftHours !== undefined) updateData.shift_hours = parseFloat(run.shiftHours) || null;
      if (run.workingHours !== undefined) updateData.working_hours = parseFloat(run.workingHours) || null;
      if (run.machineUtilization !== undefined) updateData.machine_utilization = parseFloat(run.machineUtilization) || null;
      if (run.productionOverride !== undefined) updateData.production_override = parseFloat(run.productionOverride) || null;
      if (run.currentBeamNo !== undefined) updateData.current_beam_no = run.currentBeamNo;
      if (run.setNo !== undefined || run.currentSetNo !== undefined) updateData.set_no = run.setNo || run.currentSetNo;
      if (run.beamId !== undefined) updateData.beam_id = run.beamId ? parseInt(run.beamId, 10) : null;

      await prisma.loomRunEntry.upsert({
        where: { loom_no: parseInt(run.loomNo, 10) },
        update: updateData,
        create: {
          loom_no: parseInt(run.loomNo, 10),
          ...updateData
        }
      });

      // Update matching beam in BeamStockMaster to Running only if beam_no or beamId is explicitly given
      const loomNoNum = parseInt(run.loomNo, 10);
      let beam = null;
      if (run.beamId) {
        beam = await prisma.beamStockMaster.findUnique({
          where: { id: parseInt(run.beamId, 10) }
        });
      } else if (run.currentBeamNo && run.currentBeamNo.trim()) {
        beam = await prisma.beamStockMaster.findFirst({
          where: { beam_no: run.currentBeamNo.trim() }
        });
      }

      if (beam) {
        await prisma.beamStockMaster.update({
          where: { id: beam.id },
          data: {
            status: 'Running',
            loom_no_assigned: loomNoNum,
            reserved_for: `Loom ${loomNoNum}`
          }
        });
      }
    }
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// Production Logs API
app.get('/api/production-logs', async (req, res) => {
  try {
    const logs = await prisma.dailyProductionLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 500
    });
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/production-logs', async (req, res) => {
  try {
    const logData = req.body;
    const loomNo = parseInt(logData.loomNo, 10);
    const prodMeter = parseFloat(logData.producedMeter) || 0;
    const logDate = logData.date ? new Date(logData.date) : new Date();

    const startOfDay = new Date(logDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(logDate);
    endOfDay.setHours(23, 59, 59, 999);

    const existingLog = await prisma.dailyProductionLog.findFirst({
      where: {
        loom_no: loomNo,
        date: {
          gte: startOfDay,
          lte: endOfDay
        }
      }
    });

    let newLog;
    if (existingLog) {
      newLog = await prisma.dailyProductionLog.update({
        where: { id: existingLog.id },
        data: {
          produced_meter: prodMeter,
          rpm: logData.rpm ? parseInt(logData.rpm, 10) : null,
          efficiency: logData.efficiency ? parseFloat(logData.efficiency) : null,
          remarks: logData.remarks || ''
        }
      });
    } else {
      newLog = await prisma.dailyProductionLog.create({
        data: {
          loom_no: loomNo,
          design_no: logData.designNo,
          produced_meter: prodMeter,
          rpm: logData.rpm ? parseInt(logData.rpm, 10) : null,
          efficiency: logData.efficiency ? parseFloat(logData.efficiency) : null,
          remarks: logData.remarks || '',
          date: logDate
        }
      });
    }

    // Update active LoomRunEntry, BeamStockMaster balance and OrderMaster
    const runEntry = await prisma.loomRunEntry.findUnique({ where: { loom_no: loomNo } });
    if (runEntry) {
      // Sum total production for this loom
      const allLogs = await prisma.dailyProductionLog.findMany({ where: { loom_no: loomNo } });
      const totalLoomProd = allLogs.reduce((sum, l) => sum + (l.produced_meter || 0), 0);

      // 1. Sync BeamStockMaster balance if beam assigned
      if (runEntry.current_beam_no) {
        const beam = await prisma.beamStockMaster.findFirst({
          where: {
            OR: [
              { beam_no: runEntry.current_beam_no },
              { loom_no_assigned: loomNo }
            ]
          }
        });
        if (beam) {
          const initialLen = beam.beam_length || beam.available_meter || 5000;
          const newBal = Math.max(0, initialLen - totalLoomProd);
          const isFinished = newBal <= 0 || totalLoomProd >= (runEntry.warped_meter || initialLen);
          await prisma.beamStockMaster.update({
            where: { id: beam.id },
            data: {
              current_balance_meter: newBal,
              available_meter: newBal,
              status: isFinished ? 'Completed' : 'Running'
            }
          });
        }
      }

      // 2. Sync OrderMaster status and produced_qty
      if (runEntry.order_no) {
        const order = await prisma.orderMaster.findFirst({
          where: {
            OR: [
              { order_no: runEntry.order_no },
              { ibpo_no: runEntry.order_no }
            ]
          }
        });
        if (order) {
          const isOrderDone = totalLoomProd >= order.order_qty;
          await prisma.orderMaster.update({
            where: { id: order.id },
            data: {
              produced_qty: totalLoomProd,
              status: isOrderDone ? 'Weaving Completed' : 'Weaving Running'
            }
          });
        }
      }
    }

    res.json({ success: true, data: newLog });
  } catch (error) {
    console.error('Production log error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/production-logs/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { produced_meter, rpm, efficiency, remarks, date } = req.body;
    const updated = await prisma.dailyProductionLog.update({
      where: { id },
      data: {
        produced_meter: parseFloat(produced_meter) || 0,
        rpm: rpm ? parseInt(rpm, 10) : null,
        efficiency: efficiency ? parseFloat(efficiency) : null,
        remarks: remarks || '',
        ...(date ? { date: new Date(date) } : {})
      }
    });
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/production-logs/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await prisma.dailyProductionLog.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------
// NEXT PLANS API
// ----------------------------------------------------

app.get('/api/next-plans', async (req, res) => {
  try {
    const [plans, validDesigns] = await Promise.all([
      prisma.plannedAssignment.findMany(),
      prisma.designMaster.findMany({ select: { design_no_sp_no: true } })
    ]);
    const validDesignSet = new Set(validDesigns.map(d => (d.design_no_sp_no || '').trim().toLowerCase()));
    const filteredPlans = plans.filter(p => p.next_design && p.next_design.trim() && validDesignSet.has(p.next_design.trim().toLowerCase()));
    res.json(filteredPlans);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/next-plans', async (req, res) => {
  try {
    const plans = Array.isArray(req.body) ? req.body : [req.body];

    for (const plan of plans) {
      // Find existing plan for this loom to upsert or create new
      let assignment = await prisma.plannedAssignment.findFirst({
        where: { loom_no: plan.loomNo }
      });

      const planData = {
        loom_no: plan.loomNo,
        current_design: '',
        next_design: plan.designNo,
        planned_start_date: new Date(plan.startDate || new Date()),
        planned_warp_meter: Number(plan.warpMeter) || 0,
        planned_avg_daily_production: Number(plan.dailyProduction) || 0,
        status: 'PLANNED',
        confirmation_status: 'BEAM REQUESTED'
      };

      if (assignment) {
        assignment = await prisma.plannedAssignment.update({
          where: { id: assignment.id },
          data: planData
        });
      } else {
        assignment = await prisma.plannedAssignment.create({
          data: planData
        });
      }

      // Automatically check for available ready beams in Beam Stock
      const readyBeam = await prisma.beamStockMaster.findFirst({
        where: {
          design_no: plan.designNo,
          status: 'Available'
        },
        orderBy: { date: 'asc' } // oldest first
      });

      if (readyBeam) {
        // Reserve that beam. No sizing job required.
        await prisma.beamStockMaster.update({
          where: { id: readyBeam.id },
          data: {
            status: 'Reserved',
            reserved_for: `Loom ${plan.loomNo} - ${plan.designNo}`,
            loom_no_assigned: plan.loomNo
          }
        });

        // Update assignment
        await prisma.plannedAssignment.update({
          where: { id: assignment.id },
          data: {
            confirmation_status: 'BEAM READY',
            reserved_beam_id: readyBeam.id
          }
        });
      } else {
        // Automatically create a new Beam Requirement
        // Status defaults to WAITING FOR WARPING (as updated in schema)
        await prisma.beamPreparationRequest.create({
          data: {
            loom_no: plan.loomNo,
            design_no: plan.designNo,
            target_date: new Date(plan.startDate || new Date()),
            required_meter: Number(plan.warpMeter) || 0
          }
        });
      }
    }
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------
// LOOM MASTER API
// ----------------------------------------------------

app.post('/api/upload-looms', async (req, res) => {
  try {
    const text = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ success: false, error: 'Empty or invalid payload' });
    }

    const parsedLooms = [];
    const blocks = text.split(/={10,}/);

    for (const block of blocks) {
      if (!block.trim()) continue;

      const loom = {};
      const lines = block.split('\n').map(l => l.trim());

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('LOOM NO :')) loom.loomNo = parseInt(line.split(':')[1].trim());
        else if (line.startsWith('Loom Type:')) loom.loomType = line.split(':')[1].trim();
        else if (line.startsWith('Weft Colours:')) loom.weftColours = parseInt(line.split(':')[1].trim());
        else if (line.startsWith('Beam Type:')) loom.beamType = line.split(':')[1].trim();
        else if (line.startsWith('Beam Dia:')) loom.beamDia = parseInt(line.split(':')[1].trim());
        else if (line.startsWith('Installed Lever:')) loom.installedLever = parseInt(line.split(':')[1].trim());
        else if (line.startsWith('Width:')) loom.width = line.split(':')[1].trim();
        else if (line.startsWith('Unit:')) loom.unit = line.split(':')[1].trim();
        else if (line.startsWith('Make:')) loom.make = line.split(':')[1].trim();
        else if (line.startsWith('Model:')) loom.model = line.split(':')[1].trim();
        else if (line.startsWith('WEAVE:')) loom.weave = line.substring(6).trim();
      }

      if (loom.loomNo) parsedLooms.push(loom);
    }

    if (parsedLooms.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid looms found in text.' });
    }

    // Perform cleanup and insertion within a transaction for safety
    await prisma.$transaction(async (tx) => {
      await tx.loomRunEntry.deleteMany({});
      await tx.plannedAssignment.deleteMany({});
      await tx.loomMaster.deleteMany({});

      for (const loom of parsedLooms) {
        await tx.loomMaster.create({
          data: {
            loom_no: loom.loomNo,
            loom_type: loom.loomType || 'CAM',
            weft_colours: loom.weftColours || 2,
            beam_type: loom.beamType || 'SINGLE BEAM',
            beam_dia: loom.beamDia || 800,
            installed_lever: loom.installedLever || 4,
            width: loom.width || '190CM',
            unit: loom.unit || 'I',
            make: loom.make || 'TOYOTA',
            model: loom.model || '710',
            weave: loom.weave || 'PLAIN',
            status: 'Available',
            remarks: 'Imported from text requirement file',
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: 'SANTHIADMIN'
          }
        });
      }
    });

    res.json({ success: true, count: parsedLooms.length });
  } catch (error) {
    console.error('Error importing looms:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ----------------------------------------------------
// COMPLETED WARP HISTORY API
// ----------------------------------------------------

app.post('/api/confirm-plan', async (req, res) => {
  try {
    const { loomNo, nextDesign, startDate, warpMeter, dailyProduction, beamNo, setNo, beamId } = req.body;

    // Helper: derive unit from loom number ranges (matches mockData.ts layout)
    const getLoomUnit = (no) => {
      if (no <= 56) return 'I';
      if (no <= 112) return 'II';
      if (no <= 168) return 'III';
      return 'IV';
    };

    // 1. Fetch current run and loom unit
    const currentRun = await prisma.loomRunEntry.findUnique({ where: { loom_no: loomNo } });
    const loom = await prisma.loomMaster.findUnique({ where: { loom_no: loomNo } });

    // Use DB loom unit first, then fallback to range-based lookup
    const loomUnit = (loom && loom.unit && loom.unit !== 'Unknown') ? loom.unit : getLoomUnit(loomNo);

    // Fetch planned assignment details if any
    const planEntry = await prisma.plannedAssignment.findFirst({
      where: { loom_no: loomNo, status: { not: 'CANCELLED' } }
    });

    // 2. Archive to CompletedWarpHistory if a current run exists
    if (currentRun && currentRun.design_no_sp_no) {
      const start = new Date(currentRun.loom_start_date);
      const end = new Date(startDate || new Date());

      const diffTime = Math.abs(end.getTime() - start.getTime());
      let runningDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (runningDays <= 0) runningDays = 1;

      // Sum actual logs for current design run
      const logs = await prisma.dailyProductionLog.findMany({
        where: {
          loom_no: loomNo,
          design_no: currentRun.design_no_sp_no
        }
      });
      const totalProductionFromLogs = logs.reduce((sum, l) => sum + (l.produced_meter || 0), 0);
      const totalProduction = totalProductionFromLogs > 0 ? totalProductionFromLogs : (runningDays * (currentRun.daily_production || 0));

      const avgDailyProd = runningDays > 0 ? totalProduction / runningDays : (currentRun.daily_production || 300);
      const efficiency = currentRun.daily_production > 0
        ? (avgDailyProd / currentRun.daily_production) * 100
        : 100.0;

      await prisma.completedWarpHistory.create({
        data: {
          loom_no: loomNo,
          design_no_sp_no: currentRun.design_no_sp_no,
          start_date: start,
          end_date: end,
          warp_meter: currentRun.warped_meter,
          total_production_meter: totalProduction,
          running_days: runningDays,
          avg_daily_production: Math.round(avgDailyProd),
          efficiency_pct: Math.min(100, Math.round(efficiency)),
          unit: loomUnit
        }
      });
    }

    const finalNextDesign = (nextDesign && nextDesign !== '—') ? nextDesign : '';
    const finalBeamNo = finalNextDesign ? (beamNo || planEntry?.reserved_beam_no || null) : null;
    const finalSetNo = finalNextDesign ? (setNo || planEntry?.reserved_set_no || null) : null;
    const finalBeamId = finalNextDesign ? (beamId ? parseInt(beamId, 10) : (planEntry?.reserved_beam_id || null)) : null;
    const finalWarpMeter = finalNextDesign ? (Number(warpMeter) || Number(planEntry?.planned_warp_meter) || 1800) : 0;

    // 3. Promote new run to Active or clear design if no next design exists
    await prisma.loomRunEntry.upsert({
      where: { loom_no: loomNo },
      update: {
        design_no_sp_no: finalNextDesign,
        loom_start_date: new Date(startDate || new Date()),
        warped_meter: finalWarpMeter,
        daily_production: 0,
        current_beam_no: finalBeamNo,
        set_no: finalSetNo,
        beam_id: finalBeamId,
        remarks: finalNextDesign ? 'Promoted from Next Plan' : 'Runout completed - Awaiting Next Plan'
      },
      create: {
        loom_no: loomNo,
        design_no_sp_no: finalNextDesign,
        loom_start_date: new Date(startDate || new Date()),
        warped_meter: finalWarpMeter,
        daily_production: 0,
        current_beam_no: finalBeamNo,
        set_no: finalSetNo,
        beam_id: finalBeamId,
        remarks: finalNextDesign ? 'Promoted from Next Plan' : 'Runout completed - Awaiting Next Plan'
      }
    });

    // Update Beam Stock status to Running if reserved_beam_id exists
    if (finalBeamId) {
      await prisma.beamStockMaster.update({
        where: { id: finalBeamId },
        data: {
          status: 'Running',
          loom_no_assigned: loomNo,
          reserved_for: `Loom ${loomNo} - Running`
        }
      });
    }

    // 4. Delete the planned assignment
    await prisma.plannedAssignment.deleteMany({
      where: { loom_no: loomNo }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error confirming plan:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/completed-runs', async (req, res) => {
  try {
    const [history, orders] = await Promise.all([
      prisma.completedWarpHistory.findMany({ orderBy: { end_date: 'desc' } }),
      prisma.orderMaster.findMany()
    ]);

    const completedOrders = orders.filter(o => {
      const s = (o.status || '').toUpperCase();
      const compStatus = (o.order_completion_status || '').toUpperCase();
      return s.includes('COMPLETED') || compStatus === 'COMPLETED';
    });

    const combined = [...history];
    completedOrders.forEach(co => {
      const dNo = co.design_no_sp_no || '';
      if (!combined.some(h => (h.design_no_sp_no || '').trim().toLowerCase() === dNo.trim().toLowerCase())) {
        combined.push({
          id: co.id,
          loom_no: co.planned_loom_count || 1,
          design_no_sp_no: dNo,
          start_date: co.weaving_start_date || co.order_received_date || new Date(),
          end_date: co.actual_completion_date || co.updatedAt || new Date(),
          warp_meter: Number(co.warp_qty || co.order_qty || 1000),
          total_production_meter: Number(co.produced_qty || co.order_qty || 1000),
          running_days: Number(co.estimated_production_days || 1),
          avg_daily_production: Number(co.avg_production_per_loom || 200),
          efficiency_pct: 95.0,
          unit: 'Unit 1'
        });
      }
    });

    res.json(combined);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/completed-runs', async (req, res) => {
  try {
    const runs = Array.isArray(req.body) ? req.body : [req.body];

    for (const run of runs) {
      await prisma.completedWarpHistory.create({
        data: {
          loom_no: run.loom_no,
          design_no_sp_no: run.design_no_sp_no,
          start_date: new Date(run.start_date),
          end_date: new Date(run.end_date),
          warp_meter: run.warp_meter,
          total_production_meter: run.total_production_meter,
          running_days: run.running_days,
          avg_daily_production: run.avg_daily_production,
          efficiency_pct: run.efficiency_pct,
          unit: run.unit || 'Unit I' // Fallback if missing
        }
      });
    }
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------
// ----------------------------------------------------
// REED STOCK API (SSOT: AVAILABLE QTY = TOTAL PHYSICAL STOCK)
// ----------------------------------------------------

async function getCalculatedReedStock() {
  const [reeds, plans, activeRuns, designs] = await Promise.all([
    prisma.reedStockMaster.findMany({ orderBy: { reed_count: 'asc' } }),
    prisma.plannedAssignment.findMany({ where: { status: 'CONFIRMED' } }),
    prisma.loomRunEntry.findMany(),
    prisma.designMaster.findMany()
  ]);

  const designMap = {};
  designs.forEach(d => {
    designMap[d.design_no_sp_no] = d.reed_count || '';
  });

  const runningCountMap = {};
  for (const run of activeRuns) {
    const rCount = designMap[run.design_no_sp_no] || run.current_reed_no || '';
    if (rCount) {
      runningCountMap[rCount] = (runningCountMap[rCount] || 0) + 1;
    }
  }

  const reservedCountMap = {};
  for (const plan of plans) {
    const rCount = plan.required_reed_count || designMap[plan.next_design] || '';
    if (rCount) {
      reservedCountMap[rCount] = (reservedCountMap[rCount] || 0) + 1;
    }
  }

  return reeds.map(r => {
    const countKey = r.reed_count || '';
    const availableQty = Number(r.available_qty !== undefined ? r.available_qty : (r.total_qty || 1)); // Available Qty = Total Physical Stock
    const runningQty = runningCountMap[countKey] || r.running_qty || 0;
    const reservedQty = reservedCountMap[countKey] || r.reserved_qty || 0;
    const balanceQty = availableQty - reservedQty - runningQty;

    let status = 'AVAILABLE';
    if (balanceQty < 0) {
      status = 'DATA MISMATCH';
    } else if (balanceQty === 0 && runningQty === 0 && reservedQty === 0) {
      status = 'OUT OF STOCK';
    } else if (balanceQty === 0) {
      status = runningQty > 0 ? 'RUNNING' : 'RESERVED';
    } else if (balanceQty <= 2) {
      status = 'LOW STOCK';
    } else if (runningQty > 0) {
      status = 'RUNNING';
    } else if (reservedQty > 0) {
      status = 'RESERVED';
    }

    return {
      ...r,
      dents_per_inch: Number(r.dents_per_inch || parseInt(r.reed_dent || r.reed_count || '44', 10) || 44),
      total_dents: Number(r.total_dents || 2950),
      make_vendor: r.reed_make || r.vendor || 'In-House',
      vendor: r.vendor || r.reed_make || 'In-House',
      location: r.location || 'Rack A-01',
      available_qty: availableQty, // Total Physical Stock
      total_qty: availableQty,
      reserved_qty: reservedQty,
      running_qty: runningQty,
      balance_qty: balanceQty, // Balance = Available Qty - Reserved Qty - Running Qty
      status
    };
  });
}

app.get('/api/reed-stock', async (req, res) => {
  try {
    const calculated = await getCalculatedReedStock();
    res.json(calculated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/reed-stock', async (req, res) => {
  try {
    const items = Array.isArray(req.body) ? req.body : [req.body];
    let count = 0;
    for (const r of items) {
      if (!r.reed_count) continue;
      const reedCount = String(r.reed_count).trim();
      const dentsPerInch = Number(r.dents_per_inch || r.reed_dent || parseInt(reedCount, 10) || 44);
      const totalDents = Number(r.total_dents || 2950);
      const makeVendor = r.make_vendor || r.reed_make || r.vendor || 'In-House';
      const location = r.location || 'Rack A-01';
      const inputAvailableQty = Number(r.available_qty !== undefined ? r.available_qty : (r.total_qty || r.total_physical_qty || 1));

      // Check if matching Reed Count stock record exists
      const existing = await prisma.reedStockMaster.findFirst({
        where: {
          reed_count: reedCount,
          location: location
        }
      });

      if (existing) {
        await prisma.reedStockMaster.update({
          where: { id: existing.id },
          data: {
            available_qty: (existing.available_qty || 1) + inputAvailableQty,
            total_qty: (existing.available_qty || 1) + inputAvailableQty,
            dents_per_inch: dentsPerInch || existing.dents_per_inch,
            total_dents: totalDents || existing.total_dents,
            vendor: makeVendor,
            reed_make: makeVendor,
            remarks: r.remarks || existing.remarks
          }
        });
      } else {
        await prisma.reedStockMaster.create({
          data: {
            reed_count: reedCount,
            dents_per_inch: dentsPerInch,
            total_dents: totalDents,
            reed_make: makeVendor,
            vendor: makeVendor,
            location: location,
            available_qty: inputAvailableQty,
            total_qty: inputAvailableQty,
            reserved_qty: 0,
            running_qty: 0,
            status: 'AVAILABLE',
            remarks: r.remarks || ''
          }
        });
      }
      count++;
    }
    res.json({ success: true, count });
  } catch (error) {
    console.error('Reed stock POST error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/reed-stock/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const r = req.body;
    const existing = await prisma.reedStockMaster.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Reed stock record not found' });

    const reedCount = String(r.reed_count || existing.reed_count).trim();
    const dentsPerInch = Number(r.dents_per_inch || existing.dents_per_inch || 44);
    const totalDents = Number(r.total_dents || existing.total_dents || 2950);
    const makeVendor = r.make_vendor || r.reed_make || r.vendor || existing.vendor || 'In-House';
    const location = r.location || existing.location || 'Rack A-01';
    const newAvailableQty = Number(r.available_qty !== undefined ? r.available_qty : (r.total_qty !== undefined ? r.total_qty : existing.available_qty));

    // Get current live reserved & running quantities
    const calculatedList = await getCalculatedReedStock();
    const liveRecord = calculatedList.find(item => item.id === id);
    const currentCommitted = (liveRecord ? (liveRecord.reserved_qty + liveRecord.running_qty) : (existing.reserved_qty + existing.running_qty));

    if (newAvailableQty < currentCommitted) {
      return res.status(400).json({
        error: `Cannot reduce physical stock (${newAvailableQty}) below currently reserved and running quantity (${currentCommitted}).`
      });
    }

    const updated = await prisma.reedStockMaster.update({
      where: { id },
      data: {
        reed_count: reedCount,
        dents_per_inch: dentsPerInch,
        total_dents: totalDents,
        reed_make: makeVendor,
        vendor: makeVendor,
        location: location,
        available_qty: newAvailableQty,
        total_qty: newAvailableQty,
        remarks: r.remarks !== undefined ? r.remarks : existing.remarks
      }
    });

    res.json({ success: true, reed: updated });
  } catch (error) {
    console.error('Reed stock PUT error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/reed-stock/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const calculatedList = await getCalculatedReedStock();
    const item = calculatedList.find(r => r.id === id);

    if (item && (item.reserved_qty > 0 || item.running_qty > 0)) {
      return res.status(400).json({
        error: 'This Reed Count is currently committed to loom planning/production and cannot be deleted.'
      });
    }

    await prisma.reedStockMaster.delete({ where: { id } });
    res.json({ success: true });
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

app.post('/api/reed-requirements', async (req, res) => {
  try {
    const { order_no, design_no, loom_no, required_reed_count, required_reed_space, required_width, qty, required_date, priority, remarks } = req.body;
    const reqRecord = await prisma.reedRequirement.create({
      data: {
        order_no,
        design_no,
        loom_no: loom_no ? Number(loom_no) : null,
        required_reed_count: required_reed_count || '',
        required_reed_space: required_reed_space || '',
        required_width: required_width || '',
        qty: Number(qty) || 1,
        required_date: required_date ? new Date(required_date) : new Date(),
        priority: priority || 'URGENT',
        status: 'REQUIRED',
        remarks: remarks || 'Generated automatically by Next Plan'
      }
    });
    res.json({ success: true, reedRequirement: reqRecord });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

function parseLoomWeaveCapabilityBackend(loomWeaveType) {
  if (!loomWeaveType || typeof loomWeaveType !== 'string') {
    return {
      weaveTypes: [],
      machineTypes: [],
      maxFrames: null,
      rawCapabilities: []
    };
  }

  const rawUpper = loomWeaveType.toUpperCase().trim();
  const weaveTypesSet = new Set();
  const machineTypesSet = new Set();
  const rawCapabilitiesSet = new Set();
  let maxFrames = null;

  const frameMatches = rawUpper.match(/(\d+)\s*FRAMES?/gi);
  if (frameMatches) {
    frameMatches.forEach(fm => {
      const numMatch = fm.match(/(\d+)/);
      if (numMatch) {
        const num = parseInt(numMatch[1], 10);
        if (!isNaN(num) && (maxFrames === null || num > maxFrames)) {
          maxFrames = num;
        }
      }
    });
  }

  let cleaned = rawUpper
    .replace(/[()\[\]]/g, ' ')
    .replace(/\s+/g, ' ');

  const KNOWN_MACHINE_TYPES = [
    'DOBBY', 'SEER', 'JACQUARD', 'CAM', 'AIRJET', 'RAPIER', 'WATERJET', 'SHUTTLE', 'SULZER', 'PROJECTILE'
  ];

  const KNOWN_WEAVE_TYPES = [
    'PLAIN', 'TWILL', '2/2 TWILL', '3/1 TWILL', '1/1 PLAIN', '2/1 TWILL', '4/1 SATIN',
    'SATIN', 'OXFORD', 'MATT', 'DRILL', 'POPLIN', 'TUSSORE', 'CORD', 'RIPSTOP', 'HERRINGBONE', 'BASKET', 'LENO', 'GAUZE'
  ];

  KNOWN_MACHINE_TYPES.forEach(mt => {
    if (cleaned.includes(mt)) {
      machineTypesSet.add(mt);
      rawCapabilitiesSet.add(mt);
    }
  });

  KNOWN_WEAVE_TYPES.forEach(wt => {
    if (cleaned.includes(wt)) {
      weaveTypesSet.add(wt);
      rawCapabilitiesSet.add(wt);
      if (wt.includes('TWILL')) {
        weaveTypesSet.add('TWILL');
      }
    }
  });

  const parts = cleaned.split(/(?<!\d)\/(?!\d)|[,;&+]|\bAND\b/i);
  parts.forEach(part => {
    let pClean = part.trim();
    if (!pClean) return;

    pClean = pClean.replace(/(\d+)\s*FRAMES?\s*[-–—]?/gi, '').trim();
    pClean = pClean.replace(/^[-–—\s]+|[-–—\s]+$/g, '').trim();

    if (pClean) {
      rawCapabilitiesSet.add(pClean);
      KNOWN_MACHINE_TYPES.forEach(mt => {
        if (pClean.includes(mt)) machineTypesSet.add(mt);
      });
      KNOWN_WEAVE_TYPES.forEach(wt => {
        if (pClean.includes(wt)) weaveTypesSet.add(wt);
      });
      if (!KNOWN_MACHINE_TYPES.some(mt => pClean === mt) && !/^\d+\s*FRAMES?$/.test(pClean)) {
        weaveTypesSet.add(pClean);
      }
    }
  });

  return {
    weaveTypes: Array.from(weaveTypesSet),
    machineTypes: Array.from(machineTypesSet),
    maxFrames,
    rawCapabilities: Array.from(rawCapabilitiesSet)
  };
}

function parseOrderWeaveRequirementBackend(orderWeaveType, requiredFramesParam) {
  const rawWeaveType = (orderWeaveType || '').toString().trim();
  const rawUpper = rawWeaveType.toUpperCase();

  let frameFromStr = 0;
  const frameMatch = rawUpper.match(/(\d+)\s*FRAMES?/i);
  if (frameMatch) {
    frameFromStr = parseInt(frameMatch[1], 10) || 0;
  }

  const paramFrames = Number(requiredFramesParam) || 0;
  const requiredFrames = paramFrames > 0 ? paramFrames : frameFromStr;

  let cleaned = rawUpper
    .replace(/[()\[\]]/g, ' ')
    .replace(/(\d+)\s*FRAMES?\s*[-–—]?/gi, '')
    .replace(/^[-–—\s]+|[-–—\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    rawWeaveType,
    weaveType: cleaned,
    requiredFrames
  };
}

function normalizeWeaveCapabilitiesBackend(rawValue) {
  const cap = parseLoomWeaveCapabilityBackend(rawValue);
  return Array.from(new Set([
    ...cap.rawCapabilities,
    ...cap.weaveTypes,
    ...cap.machineTypes
  ]));
}

function checkLoomCompatibilityBackend(design, loom) {
  const reqWeaveRaw = (design?.weave_type || design?.weaveType || design?.weave || '').toString().trim();
  const reqFramesRaw = Number(design?.frames || design?.no_of_frames || design?.frame_capacity || 0);

  const orderReq = parseOrderWeaveRequirementBackend(reqWeaveRaw, reqFramesRaw);

  const loomWeaveRaw = (loom?.weave || loom?.weave_details || loom?.weaveDetails || loom?.capabilities || '').toString();
  const loomCap = parseLoomWeaveCapabilityBackend(loomWeaveRaw);

  const loomInstalledLever = Number(loom?.installed_lever || loom?.installedLever || loom?.frame_capacity || loom?.frameCapacity || 0);

  let maxSupportedFrames = null;
  if (loomCap.maxFrames !== null && loomCap.maxFrames > 0) {
    maxSupportedFrames = loomCap.maxFrames;
  } else if (loomInstalledLever > 0) {
    maxSupportedFrames = loomInstalledLever;
  }

  let frameMatch = true;
  if (orderReq.requiredFrames > 0) {
    if (maxSupportedFrames !== null && maxSupportedFrames > 0) {
      frameMatch = orderReq.requiredFrames <= maxSupportedFrames;
    }
  }

  const reqWeave = orderReq.weaveType;
  let weaveMatch = false;
  let matchedCapability = null;

  if (!reqWeave || reqWeave === '—' || reqWeave === 'DEFAULT' || reqWeave === 'NONE') {
    weaveMatch = true;
    matchedCapability = 'DEFAULT / ANY WEAVE';
  } else {
    const wMatch = loomCap.weaveTypes.find(wt => wt === reqWeave || reqWeave === wt || reqWeave.includes(wt) || wt.includes(reqWeave));
    if (wMatch) {
      weaveMatch = true;
      matchedCapability = wMatch;
    } else {
      const mMatch = loomCap.machineTypes.find(mt => mt === reqWeave || reqWeave === mt || reqWeave.includes(mt) || mt.includes(reqWeave));
      if (mMatch) {
        weaveMatch = true;
        matchedCapability = mMatch;
      } else {
        const rMatch = loomCap.rawCapabilities.find(rc => rc === reqWeave || rc.includes(reqWeave) || reqWeave.includes(rc));
        if (rMatch) {
          weaveMatch = true;
          matchedCapability = rMatch;
        }
      }
    }
  }

  const reqColours = Number(design?.weft_colours || design?.weftColours || 0);
  const loomColours = Number(loom?.weft_colours || loom?.weftColours || loom?.max_weft_colours || 0);
  let colourMatch = true;
  if (reqColours > 0 && loomColours > 0) {
    colourMatch = loomColours >= reqColours;
  }

  const reqWidth = parseFloat(design?.reed_space_warp_width || design?.greige_width || design?.reed_space || '0') || 0;
  const loomWidth = parseFloat(loom?.width || '0') || 0;
  let widthMatch = true;
  if (reqWidth > 0 && loomWidth > 0) {
    widthMatch = loomWidth >= reqWidth;
  }

  const isTechCompatible = weaveMatch && frameMatch && colourMatch && widthMatch;

  const normalizedLoomCapabilities = Array.from(new Set([
    ...loomCap.rawCapabilities,
    ...loomCap.weaveTypes,
    ...loomCap.machineTypes
  ]));

  return {
    isTechCompatible,
    weaveMatch,
    frameMatch,
    colourMatch,
    widthMatch,
    normalizedLoomCapabilities,
    loomCapability: loomCap,
    orderRequirement: orderReq,
    maxFramesSupported,
    requiredFrames: orderReq.requiredFrames,
    matchedCapability
  };
}

// ----------------------------------------------------
// SMART RECOMMENDATION & TECHNICAL ELIGIBILITY API
// ----------------------------------------------------

async function evaluateSuitability(designNo, orderNo) {
  let order = null;
  if (orderNo) {
    order = await prisma.orderMaster.findFirst({ where: { order_no: orderNo } });
  }
  const targetDesignNo = designNo || (order ? order.design_no_sp_no : '');
  const design = targetDesignNo ? await prisma.designMaster.findUnique({ where: { design_no_sp_no: targetDesignNo } }) : null;

  if (!design) return { error: 'Design specification not found' };

  const looms = await prisma.loomMaster.findMany({ orderBy: { loom_no: 'asc' } });
  const activeRuns = await prisma.loomRunEntry.findMany();
  const runMap = {};
  activeRuns.forEach(r => { runMap[r.loom_no] = r; });

  const plans = await prisma.plannedAssignment.findMany();
  const planMap = {};
  plans.forEach(p => { planMap[p.loom_no] = p; });

  const beams = await prisma.beamStockMaster.findMany();
  const reeds = await prisma.reedStockMaster.findMany();
  const prepRequests = await prisma.beamPreparationRequest.findMany();

  const recommendations = [];

  for (const loom of looms) {
    // Technical checks using central engine logic
    const comp = checkLoomCompatibilityBackend(design, loom);
    const { isTechCompatible, weaveMatch, frameMatch, colourMatch, widthMatch } = comp;

    const loomBeamType = (loom.beam_type || '').toLowerCase().trim();
    const designBeamType = (design.beam_type || '').toLowerCase().trim();
    const beamTypeMatch = !designBeamType || !loomBeamType || loomBeamType === designBeamType;

    let techScore = 0;
    if (weaveMatch) techScore += 20;
    if (frameMatch) techScore += 10;
    if (colourMatch) techScore += 8;
    if (widthMatch) techScore += 7;
    if (beamTypeMatch) techScore += 5;

    // Reed Search
    const reqReedCount = (design.reed_count || '').toString().trim();
    const reqReedSpace = (design.reed_space_warp_width || '').toString().trim();

    const matchingReed = reeds.find(r =>
      (r.status === 'Available' || r.available_qty > 0) &&
      r.reed_count.trim() === reqReedCount
    );

    const reedStatus = matchingReed ? 'REED AVAILABLE' : 'REED REQUIRED';
    const reedScore = matchingReed ? 20 : 0;

    // Beam Search
    const matchingBeam = beams.find(b =>
      b.design_no === design.design_no_sp_no &&
      (b.status === 'Available' || (b.available_meter && b.available_meter > 0))
    );

    const beamStatus = matchingBeam ? 'BEAM AVAILABLE' : 'BEAM REQUIRED';
    const beamScore = matchingBeam ? 20 : 0;

    // Sizing Readiness
    const prep = prepRequests.find(p => p.loom_no === loom.loom_no && p.design_no === design.design_no_sp_no);
    let sizingStatus = 'COMPLETED';
    if (prep) {
      sizingStatus = (prep.status === 'BEAM READY' || prep.status === 'SIZING COMPLETED') ? 'COMPLETED' : 'RUNNING';
    } else if (order && order.sizing_completed_date) {
      sizingStatus = 'COMPLETED';
    } else if (!matchingBeam) {
      sizingStatus = 'RUNNING';
    }
    const sizingScore = (sizingStatus === 'COMPLETED' || sizingStatus === 'READY') ? 5 : 2;

    // Runout calculation
    const run = runMap[loom.loom_no];
    let balanceDays = 0;
    let runoutDate = new Date();
    let dailyProd = loom.act_rpm ? Math.round(loom.act_rpm * 0.4) : 200;

    if (run) {
      const startDate = new Date(run.loom_start_date);
      dailyProd = run.daily_production || dailyProd;
      const totalRunDays = (run.warped_meter || 10000) / (dailyProd || 200);
      runoutDate = new Date(startDate.getTime() + totalRunDays * 24 * 60 * 60 * 1000);
      const today = new Date();
      balanceDays = Math.max(0, Math.ceil((runoutDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
    } else {
      balanceDays = 0;
    }

    let waitingScore = 10;
    if (balanceDays > 15) waitingScore = 2;
    else if (balanceDays > 7) waitingScore = 5;
    else if (balanceDays > 2) waitingScore = 8;

    const efficiencyScore = 8 + (loom.loom_no % 3);
    const changeoverScore = 5;

    const totalScore = Math.min(100, Math.round(techScore + reedScore + beamScore + waitingScore + efficiencyScore + sizingScore + changeoverScore));

    let readinessStatus = 'READY TO START';
    let blockerReason = 'None';
    let recommendedAction = 'Confirm plan for this loom';

    if (!isTechCompatible) {
      readinessStatus = 'LOOM CHANGE REQUIRED';
      blockerReason = 'Loom technical capacity insufficient for frames/width';
      recommendedAction = 'Select a loom with required frame/width capacity';
    } else if (!matchingReed) {
      readinessStatus = 'WAITING FOR REED';
      blockerReason = `Required reed (${reqReedCount}) unavailable in stock`;
      recommendedAction = 'Procure or release required reed';
    } else if (!matchingBeam) {
      readinessStatus = 'WAITING FOR BEAM';
      blockerReason = 'Required beam unavailable in stock';
      recommendedAction = 'Prioritize sizing for next beam';
    } else if (sizingStatus !== 'COMPLETED' && sizingStatus !== 'READY') {
      readinessStatus = 'WAITING FOR SIZING';
      blockerReason = 'Sizing process under progress';
      recommendedAction = 'Expedite sizing readiness';
    }

    const expectedStart = new Date(runoutDate);
    const orderQty = order ? order.order_qty : 10000;
    const plannedLooms = order ? (order.planned_loom_count || 1) : 1;
    const daysToComplete = Math.ceil(orderQty / (plannedLooms * (dailyProd || 200)));
    const expectedFinish = new Date(expectedStart.getTime() + daysToComplete * 24 * 60 * 60 * 1000);

    let delayDays = 0;
    let delayStatus = 'ON TIME';
    if (order && order.target_delivery_date) {
      const delivDate = new Date(order.target_delivery_date);
      const diffMs = expectedFinish.getTime() - delivDate.getTime();
      delayDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      if (delayDays > 0) {
        delayStatus = 'DELAY EXPECTED';
      } else if (delayDays === 0) {
        delayStatus = 'DUE TODAY';
      }
    }

    recommendations.push({
      loomNo: loom.loom_no,
      loomType: loom.loom_type,
      isTechCompatible,
      designNo: design.design_no_sp_no,
      orderNo: order ? order.order_no : 'SPUPL-ORD-NEW',
      customerName: order ? order.customer_name : 'Default Customer',
      orderQty,
      dailyProduction: dailyProd,
      currentRunoutDate: runoutDate,
      balanceDays,
      requiredReedCount: reqReedCount,
      requiredReedSpace: reqReedSpace,
      matchingReed: matchingReed ? {
        id: matchingReed.id,
        reedNo: matchingReed.reed_no,
        location: matchingReed.location,
        status: matchingReed.status,
        availableQty: matchingReed.available_qty
      } : null,
      reedStatus,
      matchingBeam: matchingBeam ? {
        id: matchingBeam.id,
        beamNo: matchingBeam.beam_no,
        balanceMeter: matchingBeam.available_meter,
        status: matchingBeam.status
      } : null,
      beamStatus,
      sizingStatus,
      readinessStatus,
      planningScore: totalScore,
      expectedStart,
      expectedFinish,
      delayDays,
      delayStatus,
      blockerReason,
      recommendedAction,
      existingPlan: planMap[loom.loom_no] || null
    });
  }

  recommendations.sort((a, b) => {
    if (a.isTechCompatible !== b.isTechCompatible) return a.isTechCompatible ? -1 : 1;
    return b.planningScore - a.planningScore;
  });

  return { design, order, recommendations };
}

app.get('/api/recommendations/eligibility', async (req, res) => {
  try {
    const { designNo, orderNo } = req.query;
    const data = await evaluateSuitability(designNo, orderNo);
    if (data.error) return res.status(404).json({ error: data.error });
    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/recommendations/:design_no', async (req, res) => {
  try {
    const { design_no } = req.params;
    const data = await evaluateSuitability(design_no, null);
    if (data.error) return res.status(404).json({ error: data.error });
    res.json(data.recommendations || []);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------
// CONFIRM PLAN & DOUBLE ALLOCATION PREVENTION API
// ----------------------------------------------------

app.post('/api/planning/next-plan/save', async (req, res) => {
  try {
    const { loomNo, nextDesign, orderNo, ibpoNo, expectedStartDate, targetRunoutDate, remarks, allowOverplan } = req.body;
    const loomNum = Number(loomNo);

    if (!loomNum || (!nextDesign && !orderNo && !ibpoNo)) {
      return res.status(400).json({ error: 'Loom Number and Order/Design information are required.' });
    }

    const cleanIbpo = (ibpoNo || orderNo || '').toString().trim();
    const cleanDesign = (nextDesign || cleanIbpo).toString().trim();

    // Check if loom is currently running another design
    const currentRun = await prisma.loomRunEntry.findUnique({
      where: { loom_no: loomNum }
    });
    const isLoomRunning = currentRun && currentRun.design_no_sp_no && currentRun.design_no_sp_no.trim() !== '';

    // Check existing plan conflict
    const existingOtherPlan = await prisma.plannedAssignment.findFirst({
      where: {
        loom_no: loomNum,
        status: { in: ['PLANNED', 'CONFIRMED', 'ACTIVE', 'BEAM ALLOCATED'] },
        NOT: {
          AND: [
            { next_design: cleanDesign },
            { order_no: cleanIbpo }
          ]
        }
      }
    });

    if (existingOtherPlan && !allowOverplan) {
      return res.status(400).json({
        error: `Loom ${loomNum} is already assigned/planned for Order/Design "${existingOtherPlan.order_no || existingOtherPlan.next_design}".`
      });
    }

    // Check beam stock availability (for informative status)
    const beam = await prisma.beamStockMaster.findFirst({
      where: { design_no: cleanDesign, status: 'Available' }
    });

    const design = await prisma.designMaster.findUnique({ where: { design_no_sp_no: cleanDesign } });
    const reqReedCount = design ? (design.reed_count || '').toString().trim() : '';
    const reed = await prisma.reedStockMaster.findFirst({
      where: { reed_count: reqReedCount, status: 'Available', available_qty: { gt: 0 } }
    });

    const assignmentData = {
      loom_no: loomNum,
      current_design: isLoomRunning ? currentRun.design_no_sp_no : 'AVAILABLE',
      next_design: cleanDesign,
      order_no: cleanIbpo || 'SPUPL-ORD-NEXT',
      planned_start_date: new Date(expectedStartDate || targetRunoutDate || new Date()),
      planned_warp_meter: 10000,
      planned_avg_daily_production: 200,
      status: 'PLANNED',
      reserved_beam_id: null,
      reserved_beam_no: null,
      reserved_reed_id: reed ? reed.id : null,
      reserved_reed_no: reed ? reed.reed_no : null,
      reed_status: reed ? 'REED AVAILABLE' : 'REED REQUIRED',
      beam_status: 'BEAM PENDING',
      sizing_status: beam ? 'COMPLETED' : 'RUNNING',
      readiness_status: 'BEAM PENDING',
      planning_score: 75,
      remarks: remarks || 'Saved as Loom Plan',
      confirmation_status: 'PLAN CREATED'
    };

    let assignment = await prisma.plannedAssignment.findFirst({ where: { loom_no: loomNum } });
    if (assignment) {
      assignment = await prisma.plannedAssignment.update({ where: { id: assignment.id }, data: assignmentData });
    } else {
      assignment = await prisma.plannedAssignment.create({ data: assignmentData });
    }

    res.json({
      success: true,
      assignment,
      beamAvailable: !!beam,
      reedAvailable: !!reed,
      message: `Loom ${loomNum} plan saved successfully! Status: PLANNED (Beam Allocation Pending).`
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/planning/next-plan/allocate-beam', async (req, res) => {
  try {
    const { planId, loomNo, beamId } = req.body;
    if (!beamId) {
      return res.status(400).json({ error: 'Please select a Beam to allocate.' });
    }

    let plan = null;
    if (planId) {
      plan = await prisma.plannedAssignment.findUnique({ where: { id: Number(planId) } });
    } else if (loomNo) {
      plan = await prisma.plannedAssignment.findFirst({
        where: { loom_no: Number(loomNo), status: { in: ['PLANNED', 'NOT PLANNED', 'PENDING', 'BEAM ALLOCATED'] } }
      });
    }

    if (!plan) {
      return res.status(404).json({ error: 'Planned assignment not found for this loom.' });
    }

    const beam = await prisma.beamStockMaster.findUnique({ where: { id: Number(beamId) } });
    if (!beam) {
      return res.status(404).json({ error: 'Selected Beam not found in Beam Stock.' });
    }

    const beamSt = (beam.status || '').toUpperCase();
    if (beamSt !== 'AVAILABLE' && beamSt !== 'READY') {
      return res.status(400).json({ error: `Beam ${beam.beam_no} is currently ${beam.status} and cannot be allocated.` });
    }

    const targetDesign = (plan.next_design || '').trim().toLowerCase();
    const beamDesign = (beam.design_no || '').trim().toLowerCase();
    if (targetDesign && beamDesign && beamDesign !== targetDesign && !beamDesign.includes(targetDesign) && !targetDesign.includes(beamDesign)) {
      return res.status(400).json({
        error: `Incompatible Beam: Selected Beam (${beam.beam_no}) belongs to Design "${beam.design_no}" which does not match planned Design "${plan.next_design}".`
      });
    }

    const conflict = await prisma.plannedAssignment.findFirst({
      where: {
        reserved_beam_id: beam.id,
        id: { not: plan.id },
        status: { in: ['PLANNED', 'CONFIRMED', 'RUNNING', 'ACTIVE'] }
      }
    });

    if (conflict) {
      return res.status(400).json({
        error: `Beam ${beam.beam_no} is already allocated to Loom ${conflict.loom_no} (Plan #${conflict.id}).`
      });
    }

    if (plan.reserved_beam_id && plan.reserved_beam_id !== beam.id) {
      await prisma.beamStockMaster.update({
        where: { id: plan.reserved_beam_id },
        data: { status: 'Available', reserved_for: null, loom_no_assigned: null }
      }).catch(() => {});
    }

    await prisma.beamStockMaster.update({
      where: { id: beam.id },
      data: {
        status: 'Reserved',
        reserved_for: `Order ${plan.order_no || 'NEXT'} - Loom ${plan.loom_no}`,
        loom_no_assigned: plan.loom_no
      }
    });

    const updatedPlan = await prisma.plannedAssignment.update({
      where: { id: plan.id },
      data: {
        reserved_beam_id: beam.id,
        reserved_beam_no: beam.beam_no,
        reserved_set_no: beam.set_no,
        beam_status: 'BEAM ALLOCATED',
        readiness_status: 'BEAM ALLOCATED - READY FOR LOOM CONFIRMATION',
        planning_score: 95
      }
    });

    res.json({
      success: true,
      plan: updatedPlan,
      beam,
      message: `Beam #${beam.beam_no} successfully allocated to Loom ${plan.loom_no}. Loom confirmation is now enabled.`
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/planning/next-plan/change-beam', async (req, res) => {
  try {
    const { planId, loomNo } = req.body;
    let plan = null;
    if (planId) {
      plan = await prisma.plannedAssignment.findUnique({ where: { id: Number(planId) } });
    } else if (loomNo) {
      plan = await prisma.plannedAssignment.findFirst({ where: { loom_no: Number(loomNo) } });
    }

    if (!plan) {
      return res.status(404).json({ error: 'Plan not found.' });
    }

    if (plan.reserved_beam_id) {
      await prisma.beamStockMaster.update({
        where: { id: plan.reserved_beam_id },
        data: { status: 'Available', reserved_for: null, loom_no_assigned: null }
      }).catch(() => {});
    }

    const updatedPlan = await prisma.plannedAssignment.update({
      where: { id: plan.id },
      data: {
        reserved_beam_id: null,
        reserved_beam_no: null,
        reserved_set_no: null,
        beam_status: 'BEAM PENDING',
        readiness_status: 'CONFIRMATION PENDING'
      }
    });

    res.json({
      success: true,
      plan: updatedPlan,
      message: `Previous beam allocation released for Loom ${plan.loom_no}. You can now allocate another Beam.`
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/planning/next-plan/confirm', async (req, res) => {
  try {
    const { loomNo, nextDesign, orderNo, reedId, beamId, startDate, remarks, plannerName } = req.body;
    const loomNum = Number(loomNo);

    // Strict validation: Must have a Beam allocated before confirming Loom!
    const existingPlan = await prisma.plannedAssignment.findFirst({
      where: { loom_no: loomNum, status: { in: ['PLANNED', 'NOT PLANNED', 'PENDING', 'BEAM ALLOCATED'] } }
    });

    const activeBeamId = beamId ? Number(beamId) : (existingPlan ? existingPlan.reserved_beam_id : null);

    if (!activeBeamId && (!existingPlan || !existingPlan.reserved_beam_no)) {
      return res.status(400).json({
        error: `BEAM ALLOCATION REQUIRED: A compatible Beam from Beam Stock must be allocated to Loom ${loomNum} before confirming Loom.`
      });
    }

    if (reedId) {
      const activeReedConflict = await prisma.plannedAssignment.findFirst({
        where: {
          reserved_reed_id: Number(reedId),
          loom_no: { not: loomNum },
          status: { in: ['CONFIRMED', 'RUNNING', 'ACTIVE'] }
        }
      });
      if (activeReedConflict) {
        return res.status(400).json({
          error: 'RESOURCE ALREADY ALLOCATED',
          conflict: {
            resourceType: 'Reed',
            resourceId: reedId,
            currentLoom: activeReedConflict.loom_no,
            currentDesign: activeReedConflict.next_design,
            planningNo: activeReedConflict.id
          }
        });
      }
    }

    if (beamId) {
      const beamRec = await prisma.beamStockMaster.findUnique({ where: { id: Number(beamId) } });
      if (beamRec && beamRec.design_no && beamRec.design_no.trim().toLowerCase() !== nextDesign.trim().toLowerCase()) {
        return res.status(400).json({
          error: `Selected Beam (${beamRec.beam_no}) belongs to Design "${beamRec.design_no}" which does not match planned Design "${nextDesign}".`
        });
      }

      const activeBeamConflict = await prisma.plannedAssignment.findFirst({
        where: {
          reserved_beam_id: Number(beamId),
          loom_no: { not: loomNum },
          status: { in: ['CONFIRMED', 'RUNNING', 'ACTIVE'] }
        }
      });
      if (activeBeamConflict) {
        return res.status(400).json({
          error: 'RESOURCE ALREADY ALLOCATED',
          conflict: {
            resourceType: 'Beam',
            resourceId: beamId,
            currentLoom: activeBeamConflict.loom_no,
            currentDesign: activeBeamConflict.next_design,
            planningNo: activeBeamConflict.id
          }
        });
      }
    }

    // Check if loom is currently running another design
    const currentRun = await prisma.loomRunEntry.findUnique({
      where: { loom_no: loomNum }
    });
    const isLoomRunning = currentRun && currentRun.design_no_sp_no && currentRun.design_no_sp_no.trim() !== '';

    // Lock Beam in BeamStockMaster as Allocated/Reserved
    let beamNo = existingPlan?.reserved_beam_no || null;
    let setNo = existingPlan?.reserved_set_no || null;
    let allocatedBeamObj = null;

    if (activeBeamId) {
      allocatedBeamObj = await prisma.beamStockMaster.findUnique({ where: { id: Number(activeBeamId) } });
      if (allocatedBeamObj) {
        beamNo = allocatedBeamObj.beam_no;
        setNo = allocatedBeamObj.set_no;
      }
    }

    let reedNo = existingPlan?.reserved_reed_no || null;
    if (reedId) {
      const r = await prisma.reedStockMaster.findUnique({ where: { id: Number(reedId) } });
      if (r) {
        reedNo = r.reed_no;
        await prisma.reedStockMaster.update({
          where: { id: r.id },
          data: {
            status: 'Reserved',
            available_qty: Math.max(0, r.available_qty - 1),
            reserved_qty: r.reserved_qty + 1,
            reserved_for_loom: loomNum,
            reserved_for_order: orderNo || '',
            reserved_for_design: nextDesign
          }
        });
      }
    }

    const orderObj = orderNo ? await prisma.orderMaster.findFirst({
      where: { OR: [{ order_no: orderNo }, { ibpo_no: orderNo }] }
    }) : null;

    const startingWarpMeter = allocatedBeamObj?.available_meter || (orderObj ? orderObj.warp_qty : 10000);
    const dailyProdRate = orderObj ? (orderObj.avg_production_per_loom || 300) : 300;
    const customerName = orderObj ? orderObj.customer_name : 'STANDARD';

    if (!isLoomRunning) {
      // CASE A: EMPTY / FREE LOOM -> Confirmation transfers the plan directly into Main Entry as CURRENT RUNNING DESIGN!
      if (activeBeamId) {
        await prisma.beamStockMaster.update({
          where: { id: Number(activeBeamId) },
          data: {
            status: 'Running',
            reserved_for: `Loom ${loomNum} - Running`,
            loom_no_assigned: loomNum
          }
        });
      }

      const activeRun = await prisma.loomRunEntry.upsert({
        where: { loom_no: loomNum },
        create: {
          loom_no: loomNum,
          design_no_sp_no: nextDesign,
          current_beam_no: beamNo || `BM-2026-${String(loomNum).padStart(3, '0')}`,
          set_no: setNo || `SET-101`,
          current_reed_no: reedNo || `RD-${String(500 + loomNum).padStart(3, '0')}`,
          order_no: orderNo || (orderObj ? orderObj.order_no : `ORD-${100000 + loomNum}`),
          customer_name: customerName,
          loom_start_date: startDate ? new Date(startDate) : new Date(),
          warped_meter: startingWarpMeter,
          daily_production: dailyProdRate,
          rpm: 720,
          efficiency: 92,
          shift_hours: 24,
          working_hours: 24,
          machine_utilization: 92,
          remarks: remarks || 'Confirmed & Started in Main Entry'
        },
        update: {
          design_no_sp_no: nextDesign,
          current_beam_no: beamNo || `BM-2026-${String(loomNum).padStart(3, '0')}`,
          set_no: setNo || `SET-101`,
          current_reed_no: reedNo || `RD-${String(500 + loomNum).padStart(3, '0')}`,
          order_no: orderNo || (orderObj ? orderObj.order_no : `ORD-${100000 + loomNum}`),
          customer_name: customerName,
          loom_start_date: startDate ? new Date(startDate) : new Date(),
          warped_meter: startingWarpMeter,
          daily_production: dailyProdRate,
          rpm: 720,
          efficiency: 92,
          remarks: remarks || 'Confirmed & Started in Main Entry'
        }
      });

      await prisma.loomMaster.update({
        where: { loom_no: loomNum },
        data: { status: 'Running' }
      });

      if (orderObj) {
        await prisma.orderMaster.update({
          where: { id: orderObj.id },
          data: { status: 'WEAVING RUNNING' }
        });
      }

      let assignment = await prisma.plannedAssignment.findFirst({ where: { loom_no: loomNum } });
      const payload = {
        loom_no: loomNum,
        current_design: nextDesign,
        next_design: nextDesign,
        order_no: orderNo || 'SPUPL-ORD-CONFIRMED',
        planned_start_date: startDate ? new Date(startDate) : new Date(),
        planned_warp_meter: startingWarpMeter,
        planned_avg_daily_production: dailyProdRate,
        status: 'CONFIRMED',
        confirmation_status: 'CONFIRMED',
        confirmed_by: plannerName || 'Confirmation User',
        confirmed_date: new Date(),
        reserved_reed_id: reedId ? Number(reedId) : (existingPlan?.reserved_reed_id || null),
        reserved_reed_no: reedNo,
        reed_status: reedNo ? 'REED AVAILABLE' : 'REED REQUIRED',
        reserved_beam_id: activeBeamId,
        reserved_beam_no: beamNo,
        reserved_set_no: setNo,
        beam_status: 'BEAM ALLOCATED',
        sizing_status: 'COMPLETED',
        readiness_status: 'RUNNING IN MAIN ENTRY',
        planning_score: 98,
        remarks: remarks || 'Plan Confirmed & Activated as Current Running Design in Main Entry',
        planner_name: plannerName || 'Planner'
      };

      if (assignment) {
        assignment = await prisma.plannedAssignment.update({ where: { id: assignment.id }, data: payload });
      } else {
        assignment = await prisma.plannedAssignment.create({ data: payload });
      }

      await prisma.systemAuditLog.create({
        data: {
          username: plannerName || 'Confirmation User',
          screen: 'Next Planned Looms',
          action: 'CONFIRM_ALLOCATION',
          oldValue: 'AVAILABLE',
          newValue: `WEAVING RUNNING (${nextDesign} on Loom ${loomNum})`
        }
      });

      return res.json({
        success: true,
        directAllocated: true,
        activeRun,
        assignment,
        message: `Loom ${loomNum} plan confirmed! Transferred to Main Entry as active running design "${nextDesign}".`
      });
    }

    // CASE B: ALREADY RUNNING LOOM -> Confirmation attaches plan as CONFIRMED Next Plan without displacing current running design!
    if (activeBeamId) {
      await prisma.beamStockMaster.update({
        where: { id: Number(activeBeamId) },
        data: {
          status: 'Allocated',
          reserved_for: `Order ${orderNo || 'NEXT'} - Loom ${loomNum}`,
          loom_no_assigned: loomNum
        }
      });
    }

    let assignment = await prisma.plannedAssignment.findFirst({ where: { loom_no: loomNum } });
    const payload = {
      loom_no: loomNum,
      current_design: currentRun.design_no_sp_no,
      next_design: nextDesign,
      order_no: orderNo || 'SPUPL-ORD-CONFIRMED',
      planned_start_date: startDate ? new Date(startDate) : new Date(),
      planned_warp_meter: startingWarpMeter,
      planned_avg_daily_production: dailyProdRate,
      status: 'CONFIRMED',
      confirmation_status: 'CONFIRMED',
      confirmed_by: plannerName || 'Confirmation User',
      confirmed_date: new Date(),
      reserved_reed_id: reedId ? Number(reedId) : (existingPlan?.reserved_reed_id || null),
      reserved_reed_no: reedNo,
      reed_status: reedNo ? 'REED AVAILABLE' : 'REED REQUIRED',
      reserved_beam_id: activeBeamId,
      reserved_beam_no: beamNo,
      reserved_set_no: setNo,
      beam_status: 'BEAM ALLOCATED',
      sizing_status: 'COMPLETED',
      readiness_status: 'CONFIRMED - WAITING FOR CURRENT RUNOUT',
      planning_score: 98,
      remarks: remarks || 'Plan Confirmed after Beam Allocation (Waiting for Current Runout)',
      planner_name: plannerName || 'Planner'
    };

    if (assignment) {
      assignment = await prisma.plannedAssignment.update({ where: { id: assignment.id }, data: payload });
    } else {
      assignment = await prisma.plannedAssignment.create({ data: payload });
    }

    if (orderNo) {
      const order = await prisma.orderMaster.findFirst({
        where: { OR: [{ order_no: orderNo }, { ibpo_no: orderNo }] }
      });
      if (order && order.status !== 'WEAVING RUNNING') {
        await prisma.orderMaster.update({
          where: { id: order.id },
          data: { status: 'Loom Plan Confirmed' }
        });
      }
    }

    await prisma.systemAuditLog.create({
      data: {
        username: plannerName || 'Confirmation User',
        screen: 'Next Planned Looms',
        action: 'CONFIRM_ALLOCATION',
        oldValue: 'RUNNING',
        newValue: `CONFIRMED_NEXT_PLAN (Loom ${loomNum}, Beam ${beamNo || activeBeamId})`
      }
    });

    return res.json({
      success: true,
      assignment,
      message: `Loom ${loomNum} is currently running "${currentRun.design_no_sp_no}". Plan for "${nextDesign}" confirmed as Next Plan!`
    });

    res.json({ success: true, assignment, message: `Loom ${loomNum} is currently running "${currentRun.design_no_sp_no}". Added as Next Plan for Loom ${loomNum}.` });
  } catch (error) {
    console.error('Confirm Plan Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// DECLINE / REQUEST LOOM CHANGE
app.post('/api/planning/next-plan/decline', async (req, res) => {
  try {
    const { id, remark, user } = req.body;
    if (!remark || !remark.trim()) {
      return res.status(400).json({ error: 'Mandatory remark is required for declining/requesting loom change.' });
    }

    const assignment = await prisma.plannedAssignment.findUnique({ where: { id: Number(id) } });
    if (!assignment) {
      return res.status(404).json({ error: 'Planned assignment not found' });
    }

    // Release reserved Beam
    if (assignment.reserved_beam_id) {
      await prisma.beamStockMaster.update({
        where: { id: assignment.reserved_beam_id },
        data: { status: 'Available', reserved_for: null, loom_no_assigned: null }
      });
    }

    // Release reserved Reed
    if (assignment.reserved_reed_id) {
      const r = await prisma.reedStockMaster.findUnique({ where: { id: assignment.reserved_reed_id } });
      if (r) {
        await prisma.reedStockMaster.update({
          where: { id: r.id },
          data: {
            status: 'Available',
            reserved_qty: Math.max(0, r.reserved_qty - 1),
            available_qty: r.available_qty + 1
          }
        });
      }
    }

    const updated = await prisma.plannedAssignment.update({
      where: { id: Number(id) },
      data: {
        status: 'CHANGE_REQUESTED',
        confirmation_status: 'CHANGE_REQUESTED',
        change_request_remark: remark.trim(),
        change_requested_by: user || 'Confirmation User',
        change_requested_date: new Date()
      }
    });

    await prisma.systemAuditLog.create({
      data: {
        username: user || 'Confirmation User',
        screen: 'Next Planned Looms',
        action: 'DECLINE_LOOM_PLAN',
        oldValue: 'SUGGESTED',
        newValue: `CHANGE_REQUESTED (${remark.trim()})`
      }
    });

    res.json({ success: true, assignment: updated });
  } catch (error) {
    console.error('Decline Plan Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// RESOLVE CHANGE REQUEST (Original Planner)
app.post('/api/planning/next-plan/resolve-change', async (req, res) => {
  try {
    const { id, newLoomNo, newBeamId, newDesign, remarks, plannerName } = req.body;
    const assignment = await prisma.plannedAssignment.findUnique({ where: { id: Number(id) } });
    if (!assignment) {
      return res.status(404).json({ error: 'Plan assignment not found' });
    }

    const loomNum = Number(newLoomNo || assignment.loom_no);
    const designNo = newDesign || assignment.next_design;

    // Release old beam if changed
    if (assignment.reserved_beam_id && Number(newBeamId) !== assignment.reserved_beam_id) {
      await prisma.beamStockMaster.update({
        where: { id: assignment.reserved_beam_id },
        data: { status: 'Available', reserved_for: null, loom_no_assigned: null }
      });
    }

    // Reserve new beam
    let beamNo = assignment.reserved_beam_no;
    let setNo = assignment.reserved_set_no;
    if (newBeamId) {
      const b = await prisma.beamStockMaster.findUnique({ where: { id: Number(newBeamId) } });
      if (b) {
        beamNo = b.beam_no;
        setNo = b.set_no;
        await prisma.beamStockMaster.update({
          where: { id: b.id },
          data: {
            status: 'Reserved',
            reserved_for: `Order ${assignment.order_no || 'NEXT'} - Loom ${loomNum}`,
            loom_no_assigned: loomNum
          }
        });
      }
    }

    const updated = await prisma.plannedAssignment.update({
      where: { id: Number(id) },
      data: {
        loom_no: loomNum,
        next_design: designNo,
        reserved_beam_id: newBeamId ? Number(newBeamId) : assignment.reserved_beam_id,
        reserved_beam_no: beamNo,
        reserved_set_no: setNo,
        status: 'SUGGESTED',
        confirmation_status: 'PENDING',
        remarks: remarks || `Resubmitted after change request: ${assignment.change_request_remark || ''}`,
        change_request_remark: null,
        change_requested_by: null
      }
    });

    res.json({ success: true, assignment: updated });
  } catch (error) {
    console.error('Resolve Change Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/planning/next-plan/start', async (req, res) => {
  try {
    const { loomNo } = req.body;
    const loomNum = Number(loomNo);

    const assignment = await prisma.plannedAssignment.findFirst({ where: { loom_no: loomNum } });
    if (!assignment) {
      return res.status(404).json({ error: 'No planned assignment found for this loom' });
    }

    const nextDesign = assignment.next_design;
    const now = new Date();

    // 1. Transition reserved Reed to Running
    if (assignment.reserved_reed_id) {
      const r = await prisma.reedStockMaster.findUnique({ where: { id: assignment.reserved_reed_id } });
      if (r) {
        await prisma.reedStockMaster.update({
          where: { id: r.id },
          data: {
            status: 'Running',
            reserved_qty: Math.max(0, r.reserved_qty - 1),
            running_qty: r.running_qty + 1
          }
        });
      }
    }

    // 2. Transition reserved Beam to Running
    if (assignment.reserved_beam_id) {
      await prisma.beamStockMaster.update({
        where: { id: assignment.reserved_beam_id },
        data: { status: 'Running' }
      });
    }

    // 3. Update LoomRunEntry to active production
    await prisma.loomRunEntry.upsert({
      where: { loom_no: loomNum },
      create: {
        loom_no: loomNum,
        design_no_sp_no: nextDesign,
        current_reed_no: assignment.reserved_reed_no,
        current_beam_no: assignment.reserved_beam_no,
        order_no: assignment.order_no,
        loom_start_date: now,
        warped_meter: assignment.planned_warp_meter || 10000,
        daily_production: assignment.planned_avg_daily_production || 200,
        next_plan_design: ''
      },
      update: {
        design_no_sp_no: nextDesign,
        current_reed_no: assignment.reserved_reed_no,
        current_beam_no: assignment.reserved_beam_no,
        order_no: assignment.order_no,
        loom_start_date: now,
        next_plan_design: ''
      }
    });

    // 4. Update PlannedAssignment to ACTIVE
    await prisma.plannedAssignment.update({
      where: { id: assignment.id },
      data: { status: 'ACTIVE', confirmation_status: 'RUNNING' }
    });

    // 5. Audit Log
    await prisma.systemAuditLog.create({
      data: {
        username: 'Planner',
        screen: 'Main Entry / Next Plan',
        action: 'START_PRODUCTION',
        oldValue: assignment.current_design,
        newValue: `RUNNING (${nextDesign})`
      }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Start Production Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/planning/next-plan/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const assignment = await prisma.plannedAssignment.findUnique({ where: { id } });

    if (assignment) {
      // Release Reed if reserved
      if (assignment.reserved_reed_id) {
        const r = await prisma.reedStockMaster.findUnique({ where: { id: assignment.reserved_reed_id } });
        if (r) {
          await prisma.reedStockMaster.update({
            where: { id: r.id },
            data: {
              status: 'Available',
              reserved_qty: Math.max(0, r.reserved_qty - 1),
              available_qty: r.available_qty + 1,
              reserved_for_loom: null,
              reserved_for_order: null,
              reserved_for_design: null
            }
          });
        }
      }

      // Release Beam if reserved
      if (assignment.reserved_beam_id) {
        await prisma.beamStockMaster.update({
          where: { id: assignment.reserved_beam_id },
          data: { status: 'Available', reserved_for: null, loom_no_assigned: null }
        });
      }

      await prisma.plannedAssignment.update({
        where: { id },
        data: { status: 'CANCELLED', confirmation_status: 'CANCELLED' }
      });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/planning/next-plans', async (req, res) => {
  try {
    const [assignments, validDesigns, activeOrders] = await Promise.all([
      prisma.plannedAssignment.findMany({
        where: { status: { in: ['PLANNED', 'CONFIRMED', 'ACTIVE'] } }
      }),
      prisma.designMaster.findMany({ select: { design_no_sp_no: true } }),
      prisma.orderMaster.findMany({ select: { order_no: true, ibpo_no: true } })
    ]);

    const validDesignSet = new Set(validDesigns.map(d => (d.design_no_sp_no || '').trim().toLowerCase()));
    const validOrderSet = new Set(
      activeOrders.flatMap(o => [o.order_no, o.ibpo_no]).filter(Boolean).map(s => s.trim().toLowerCase())
    );

    const validAssignments = assignments.filter(a => {
      if (!a.next_design || !a.next_design.trim()) return false;
      const dNo = a.next_design.trim().toLowerCase();
      const hasValidDesign = validDesignSet.has(dNo);
      const hasValidOrder = !a.order_no || validOrderSet.has(a.order_no.trim().toLowerCase());
      return hasValidDesign || hasValidOrder;
    });

    res.json(validAssignments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/dashboard/planning-kpis', async (req, res) => {
  try {
    const beams = await prisma.beamStockMaster.findMany();
    const reeds = await prisma.reedStockMaster.findMany();
    const preparation = await prisma.beamPreparationRequest.findMany();
    const assignments = await prisma.plannedAssignment.findMany();
    const activeRuns = await prisma.loomRunEntry.findMany();

    const kpis = {
      totalBeams: beams.length,
      availableBeams: beams.filter(b => b.status === 'Available').length,
      reservedBeams: beams.filter(b => b.status === 'Reserved').length,
      runningBeams: beams.filter(b => b.status === 'Running').length,

      totalReeds: reeds.reduce((acc, r) => acc + (r.total_qty || 1), 0),
      availableReeds: reeds.reduce((acc, r) => acc + (r.available_qty || 0), 0),
      reservedReeds: reeds.reduce((acc, r) => acc + (r.reserved_qty || 0), 0),
      runningReeds: reeds.reduce((acc, r) => acc + (r.running_qty || 0), 0),

      loomsRunning: activeRuns.length,
      nextPlans: assignments.filter(a => a.status === 'PLANNED' || a.status === 'CONFIRMED').length,
      readyPlans: assignments.filter(a => a.readiness_status === 'READY TO START').length,
      waitingForReed: assignments.filter(a => a.readiness_status === 'WAITING FOR REED').length,
      waitingForBeam: assignments.filter(a => a.readiness_status === 'WAITING FOR BEAM').length,
      waitingForSizing: assignments.filter(a => a.readiness_status === 'WAITING FOR SIZING').length,
      delayedPlans: assignments.filter(a => a.delay_status === 'DELAY EXPECTED').length,
      onTimePlans: assignments.filter(a => a.delay_status === 'ON TIME').length
    };

    const beamStatusData = [
      { name: 'Available', value: kpis.availableBeams },
      { name: 'Reserved', value: kpis.reservedBeams },
      { name: 'Running', value: kpis.runningBeams }
    ];

    const reedStatusData = [
      { name: 'Available', value: kpis.availableReeds },
      { name: 'Reserved', value: kpis.reservedReeds },
      { name: 'Running', value: kpis.runningReeds }
    ];

    res.json({
      success: true,
      kpis,
      charts: {
        beamStatus: beamStatusData,
        reedStatus: reedStatusData
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------
// OBSOLETE YARN & SIZING CONFIRMATION ENDPOINTS (REMOVED)
// ----------------------------------------------------
app.get('/api/yarn-confirmations', (req, res) => res.json([]));
app.post('/api/yarn-confirmations', (req, res) => res.json({ success: true, message: 'Yarn Confirmation is deprecated.' }));
app.get('/api/sizing-confirmations', (req, res) => res.json([]));
app.post('/api/sizing-confirmations/receive', (req, res) => res.json({ success: true, message: 'Sizing Confirmation is deprecated.' }));

// ----------------------------------------------------
// ORDER COMPLETION & HISTORY API
// ----------------------------------------------------
app.get('/api/order-completion/history', async (req, res) => {
  try {
    const orders = await prisma.orderMaster.findMany({
      include: { designMaster: true },
      orderBy: { id: 'desc' }
    });

    const completedOrders = orders.filter(o => {
      const s = (o.status || '').toUpperCase();
      const compStatus = (o.order_completion_status || '').toUpperCase();
      return s.includes('COMPLETED') || compStatus === 'COMPLETED';
    });

    const formatted = completedOrders.map(o => ({
      id: o.id,
      order_no: o.order_no || o.ibpo_no || `ORD-${o.id}`,
      ibpo_no: o.ibpo_no,
      customer_name: o.customer_name,
      buyer_name: o.buyer_name,
      design_no_sp_no: o.design_no_sp_no,
      construction: o.construction || o.designMaster?.construction || '',
      order_qty: o.order_qty,
      grey_qty: o.grey_qty,
      warp_qty: o.warp_qty,
      uom: o.uom || 'Meters',
      order_received_date: o.order_received_date,
      weaving_completion_date: o.weaving_completion_date || o.expected_completion_date,
      actual_completion_date: o.actual_completion_date || o.updatedAt,
      produced_qty: o.produced_qty || o.order_qty,
      final_status: o.status || 'ORDER COMPLETED',
      completed_by: o.completed_by || 'Planning Manager',
      planner_remarks: o.completion_remarks || o.remarks || 'Completed',
      createdAt: o.createdAt
    }));

    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/order-completion/complete', async (req, res) => {
  try {
    const { order_no, final_status, produced_qty, actual_completion_date, completed_by, delay_reason, corrective_action, planner_remarks } = req.body;
    const order = await prisma.orderMaster.findUnique({ where: { order_no } });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const yarn = await prisma.yarnConfirmation.findUnique({ where: { order_no } });
    const sizing = await prisma.sizingConfirmation.findUnique({ where: { order_no } });

    // Fetch beam & loom details
    const beams = await prisma.beamStockMaster.findMany({ where: { order_no } });
    const plans = await prisma.plannedAssignment.findMany({ where: { order_no } });

    const prodQty = Number(produced_qty || order.order_qty || 0);
    const shortExcess = prodQty - (order.order_qty || 0);
    const compStatus = final_status || (prodQty >= order.order_qty ? 'COMPLETED' : 'SHORT CLOSED');

    let delayDays = 0;
    const targetDateStr = order.weaving_completion_date || order.target_delivery_date;
    if (targetDateStr) {
      const compD = actual_completion_date ? new Date(actual_completion_date) : new Date();
      const targetD = new Date(targetDateStr);
      compD.setHours(0,0,0,0);
      targetD.setHours(0,0,0,0);
      const diffMs = compD.getTime() - targetD.getTime();
      delayDays = Math.ceil(diffMs / (1000 * 3600 * 24));
    }

    const transactionResult = await prisma.$transaction(async (tx) => {
      // 1. Upsert OrderCompletionHistory
      const history = await tx.orderCompletionHistory.upsert({
        where: { order_no },
        update: {
          final_status: compStatus,
          produced_qty: prodQty,
          short_excess_qty: shortExcess,
          actual_completion_date: actual_completion_date ? new Date(actual_completion_date) : new Date(),
          delay_days: delayDays,
          delay_reason: delayReason || null,
          corrective_action: correctiveAction || null,
          planner_remarks: plannerRemarks || null,
          completed_by: completedBy || 'Production Head'
        },
        create: {
          order_no,
          ibpo_no: order.ibpo_no,
          customer_name: order.customer_name,
          buyer_name: order.buyer_name,
          design_no_sp_no: order.design_no_sp_no,
          construction: order.construction,
          order_qty: order.order_qty,
          grey_qty: order.grey_qty,
          warp_qty: order.warp_qty,
          uom: order.uom,
          order_received_date: order.order_received_date,
          target_delivery_date: order.target_delivery_date,
          required_yarn_qty: yarn ? yarn.required_warp_qty : order.warp_qty,
          confirmed_yarn_qty: yarn ? yarn.confirmed_warp_qty : 0,
          balance_yarn_qty: yarn ? yarn.balance_warp_qty : 0,
          yarn_confirmation_date: yarn ? yarn.confirmation_date : null,
          sizing_required_qty: sizing ? sizing.sizing_required_qty : 0,
          sizing_confirmed_qty: sizing ? sizing.warp_received_qty : 0,
          sizing_date: sizing ? sizing.actual_receipt_date : null,
          beams_used: JSON.stringify(beams.map(b => ({ beam_no: b.beam_no, set_no: b.set_no, warp_meter: b.available_meter }))),
          looms_used: JSON.stringify(plans.map(p => ({ loom_no: p.loom_no, design_no: p.next_design }))),
          final_status: compStatus,
          produced_qty: prodQty,
          short_excess_qty: shortExcess,
          actual_completion_date: actual_completion_date ? new Date(actual_completion_date) : new Date(),
          delay_days: delayDays,
          delay_reason: delayReason || null,
          corrective_action: correctiveAction || null,
          planner_remarks: plannerRemarks || null,
          completed_by: completedBy || 'Production Head'
        }
      });

      // 2. Update OrderMaster status
      await tx.orderMaster.update({
        where: { order_no },
        data: {
          status: 'ORDER COMPLETED',
          order_completion_status: compStatus,
          produced_qty: prodQty,
          short_excess_qty: shortExcess,
          actual_completion_date: actual_completion_date ? new Date(actual_completion_date) : new Date(),
          completion_remarks: plannerRemarks || null,
          completed_by: completedBy || 'Production Head'
        }
      });

      // 3. Audit Log
      await tx.systemAuditLog.create({
        data: {
          username: completedBy || 'Production Head',
          screen: 'Order Completion',
          action: 'COMPLETE_ORDER',
          oldValue: order.status,
          newValue: `ORDER COMPLETED (${compStatus})`
        }
      });

      return history;
    });

    res.json({ success: true, record: transactionResult });
  } catch (err) {
    console.error('Order completion error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// DELAY MANAGEMENT API
// ----------------------------------------------------
app.get('/api/delays', async (req, res) => {
  try {
    const delays = await prisma.delayRecord.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(delays);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/delays', async (req, res) => {
  try {
    const { order_no, design_no, loom_no, module_type, planned_date, actual_date, delay_reason, responsible_dept, suggested_action, recovery_date, planner_decision } = req.body;

    const pDate = new Date(planned_date);
    const aDate = actual_date ? new Date(actual_date) : new Date();
    const diffDays = Math.max(0, Math.ceil((aDate.getTime() - pDate.getTime()) / (1000 * 60 * 60 * 24)));

    const delay = await prisma.delayRecord.create({
      data: {
        order_no: order_no || null,
        design_no: design_no || null,
        loom_no: loom_no ? Number(loom_no) : null,
        module_type: module_type || 'Sizing',
        planned_date: pDate,
        actual_date: aDate,
        delay_days: diffDays,
        delay_reason: delay_reason || 'Production/Material Delay',
        responsible_dept: responsible_dept || 'Sizing',
        suggested_action: suggested_action || 'Prioritize job & allocate ready stock',
        recovery_date: recovery_date ? new Date(recovery_date) : null,
        planner_decision: planner_decision || 'ACKNOWLEDGED',
        status: 'OPEN'
      }
    });

    // Trigger ErpAlert
    await prisma.erpAlert.create({
      data: {
        alert_code: `DELAY-${delay.id}`,
        department: responsible_dept || 'Planning',
        order_no: order_no || null,
        design_no: design_no || null,
        loom_no: loom_no ? Number(loom_no) : null,
        priority: diffDays > 3 ? 'CRITICAL' : 'HIGH PRIORITY',
        message: `${module_type} delayed by ${diffDays} days for Design ${design_no || order_no}`,
        reason: delay_reason || 'Planning delay',
        suggested_action: suggested_action || 'Prioritize preparation and allocate available beam stock',
        status: 'OPEN'
      }
    });

    res.json({ success: true, delay });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/delays/:id/action', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status, planner_decision, recovery_date } = req.body;
    const updated = await prisma.delayRecord.update({
      where: { id },
      data: {
        status: status || 'ACTION TAKEN',
        planner_decision: planner_decision || 'ACTION TAKEN',
        recovery_date: recovery_date ? new Date(recovery_date) : undefined
      }
    });
    res.json({ success: true, delay: updated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Dynamic Real-Time ERP Alert Evaluator Engine
async function evaluateErpAlerts() {
  try {
    const [orders, looms, designs, beams, reeds, plans, activeRuns, logs, existingAlerts] = await Promise.all([
      prisma.orderMaster.findMany(),
      prisma.loomMaster.findMany(),
      prisma.designMaster.findMany(),
      prisma.beamStockMaster.findMany(),
      prisma.reedStockMaster.findMany(),
      prisma.plannedAssignment.findMany(),
      prisma.loomRunEntry.findMany(),
      prisma.dailyProductionLog.findMany(),
      prisma.erpAlert.findMany()
    ]);

    const completedOrderNos = new Set();
    orders.forEach(o => {
      if (o.status === 'ORDER COMPLETED' || o.status === 'Completed' || o.order_completion_status === 'COMPLETED') {
        if (o.order_no) completedOrderNos.add(o.order_no.trim().toLowerCase());
        if (o.ibpo_no) completedOrderNos.add(o.ibpo_no.trim().toLowerCase());
      }
    });

    const activeGeneratedKeys = new Set();
    const alertUpserts = [];

    // Helper to register alert
    const registerAlert = (code, dept, priority, orderNo, designNo, loomNo, beamNo, message, reason, action, remarks) => {
      const oKey = (orderNo || '').trim().toLowerCase();
      if (oKey && completedOrderNos.has(oKey)) return; // Skip completed orders

      const uniqueKey = `${code}_${orderNo || 'NOORD'}_${designNo || 'NODES'}_${loomNo || 0}_${beamNo || 'NOBM'}`;
      activeGeneratedKeys.add(uniqueKey);

      const existing = existingAlerts.find(a => 
        a.alert_code === code &&
        (a.order_no || '') === (orderNo || '') &&
        (a.design_no || '') === (designNo || '') &&
        (a.loom_no || null) === (loomNo ? Number(loomNo) : null) &&
        (a.beam_no || '') === (beamNo || '') &&
        a.status !== 'RESOLVED' && a.status !== 'DISMISSED'
      );

      if (!existing) {
        alertUpserts.push(
          prisma.erpAlert.create({
            data: {
              alert_code: code,
              department: dept,
              priority: priority,
              order_no: orderNo || null,
              design_no: designNo || null,
              loom_no: loomNo ? Number(loomNo) : null,
              beam_no: beamNo || null,
              message: message,
              reason: reason,
              suggested_action: action,
              status: 'OPEN',
              remarks: remarks || ''
            }
          })
        );
      }
    };

    // 1. ORDER & PLANNING ALERTS (PLN-001 .. PLN-005, ORD-001 .. ORD-005)
    for (const o of orders) {
      const oNo = o.ibpo_no || o.order_no;
      const isDone = completedOrderNos.has((oNo || '').trim().toLowerCase());
      if (isDone) continue;

      const hasPlan = plans.some(p => p.order_no === oNo || p.order_no === o.order_no || p.next_design === o.design_no_sp_no);

      // PLN-001: Order Planning Pending
      if (!hasPlan && (o.status === 'Order Received' || o.status === 'Planning Pending' || o.status === 'Loom Planning')) {
        registerAlert(
          'PLN-001', 'PLANNING', 'HIGH PRIORITY', oNo, o.design_no_sp_no, null, null,
          'Order is received but loom planning is pending.',
          `Order ${oNo} created on ${o.order_received_date ? new Date(o.order_received_date).toLocaleDateString() : 'today'} requires loom planning setup.`,
          'Create loom plan.'
        );
      }

      // ORD-004: Delivery Date Risk
      if (o.target_delivery_date && o.expected_completion_date) {
        const targetD = new Date(o.target_delivery_date);
        const expD = new Date(o.expected_completion_date);
        if (expD > targetD) {
          registerAlert(
            'ORD-004', 'DELIVERY', 'CRITICAL', oNo, o.design_no_sp_no, null, null,
            'Expected weaving completion is later than the required completion date.',
            `Target delivery date is ${targetD.toLocaleDateString()} but estimated completion is ${expD.toLocaleDateString()}.`,
            'Review loom allocation, production rate and alternate planning.'
          );
        }
      }

      // ORD-006: ORDER COMPLETION DELAY
      if (o.expected_completion_date && o.weaving_completion_date) {
        const expD = new Date(o.expected_completion_date);
        const targetD = new Date(o.weaving_completion_date);
        if (expD > targetD) {
          const delayDays = Math.ceil((expD - targetD) / 86400000);
          registerAlert(
            'ORD-006', 'PLANNING', 'CRITICAL', oNo, o.design_no_sp_no, null, null,
            `ORDER COMPLETION DELAY: ${delayDays} DAYS`,
            `Expected completion date (${expD.toLocaleDateString()}) is delayed by ${delayDays} days beyond the target completion date (${targetD.toLocaleDateString()}).`,
            'Increase required loom count or production efficiency, or move start date earlier.'
          );
        }
      }

      // WVG-007: WEAVING START DELAY
      if (o.weaving_start_date && o.weaving_planned_date) {
        const actStart = new Date(o.weaving_start_date);
        const planStart = new Date(o.weaving_planned_date);
        if (actStart > planStart) {
          const startDelayDays = Math.ceil((actStart - planStart) / 86400000);
          registerAlert(
            'WVG-007', 'WEAVING', 'HIGH PRIORITY', oNo, o.design_no_sp_no, null, null,
            `WEAVING START DELAY: ${startDelayDays} DAYS`,
            `Weaving actually started on ${actStart.toLocaleDateString()} which is ${startDelayDays} days after the planned start date ${planStart.toLocaleDateString()}.`,
            'Verify loom startup reasons.'
          );
        }
      }

      // PLN-008: LOOM CAPACITY SHORTAGE
      if (o.planned_loom_count && o.design_no_sp_no) {
        const designObj = designs.find(d => d.design_no_sp_no === o.design_no_sp_no);
        if (designObj) {
          const suitableLoomsCount = looms.filter(l => 
            (l.installed_lever || 0) >= (designObj.frames || 0) &&
            (l.weft_colours || 1) >= (designObj.weft_colours || 0) &&
            l.status === 'Available'
          ).length;
          
          if (o.planned_loom_count > suitableLoomsCount) {
            registerAlert(
              'PLN-008', 'PLANNING', 'HIGH PRIORITY', oNo, o.design_no_sp_no, null, null,
              'LOOM CAPACITY SHORTAGE',
              `Order requires ${o.planned_loom_count} loom(s), but only ${suitableLoomsCount} suitable available loom(s) match the design specifications (Frames: ${designObj.frames || 0}, Colors: ${designObj.weft_colours || 0}).`,
              'Check Loom Master or modify loom allocation.'
            );
          }
        }
      }

      // BMS-005: BEAM AVAILABILITY SHORTAGE
      if (o.design_no_sp_no) {
        const designBeams = beams.filter(b => 
          (b.design_no || '').trim().toLowerCase() === o.design_no_sp_no.trim().toLowerCase() &&
          (b.status === 'Available' || b.status === 'AVAILABLE')
        );
        if (designBeams.length === 0) {
          registerAlert(
            'BMS-005', 'BEAM STOCK', 'CRITICAL', oNo, o.design_no_sp_no, null, null,
            'BEAM AVAILABILITY SHORTAGE',
            `No available beam found in Beam Stock for design ${o.design_no_sp_no}. This will block loom startup.`,
            'Prepare and size beams in Beam Stock.'
          );
        }
      }

      // RED-005: REED AVAILABILITY SHORTAGE
      if (o.design_no_sp_no) {
        const designObj = designs.find(d => d.design_no_sp_no === o.design_no_sp_no);
        if (designObj && designObj.reed_count) {
          const matchingReeds = reeds.filter(r => 
            r.reed_count === designObj.reed_count && 
            (r.available_qty > 0 || r.status === 'Available')
          );
          if (matchingReeds.length === 0) {
            registerAlert(
              'RED-005', 'REED', 'CRITICAL', oNo, o.design_no_sp_no, null, null,
              'REED AVAILABILITY SHORTAGE',
              `Required Reed Count ${designObj.reed_count} is unavailable in stock for design ${o.design_no_sp_no}.`,
              'Check Reed Stock and procure if needed.'
            );
          }
        }
      }
    }

    // 2. PLANNED ASSIGNMENT ALERTS (PLN-003, PLN-004, BMS-001, BMS-002, RED-001)
    for (const p of plans) {
      if (p.status === 'CANCELLED' || p.status === 'COMPLETED') continue;

      // PLN-004: Loom Change Requested
      if (p.status === 'CHANGE_REQUESTED') {
        registerAlert(
          'PLN-004', 'PLANNING', 'HIGH PRIORITY', p.order_no, p.next_design, p.loom_no, p.reserved_beam_no,
          'Loom change requested for the planned order.',
          p.change_request_remark || 'Confirmation user requested a loom/beam change.',
          'Review change request in Loom Planning Setup.',
          p.change_request_remark
        );
      }

      // PLN-003: Plan Waiting Confirmation
      if (p.status === 'SUGGESTED' || p.status === 'PROPOSED' || p.status === 'PLANNED') {
        registerAlert(
          'PLN-003', 'PLANNING', 'HIGH PRIORITY', p.order_no, p.next_design, p.loom_no, p.reserved_beam_no,
          'Loom plan is waiting for confirmation.',
          `Loom ${p.loom_no} assigned design ${p.next_design} requires confirmation review.`,
          'Review and confirm the planned loom.'
        );
      }

      // BMS-001 / BMS-003: Beam Stock Check
      const availBeam = beams.find(b => (b.design_no || b.designNo || '').trim().toLowerCase() === (p.next_design || '').trim().toLowerCase() && (b.status === 'Available' || b.status === 'AVAILABLE'));
      if (!p.reserved_beam_id && !availBeam) {
        registerAlert(
          'BMS-001', 'BEAM STOCK', 'CRITICAL', p.order_no, p.next_design, p.loom_no, null,
          'No available beam found for the planned design.',
          `Design ${p.next_design} requires beam but zero matching beams are in Available status in Beam Stock.`,
          'Check Central Beam Stock.'
        );
      } else if (!p.reserved_beam_id && availBeam) {
        registerAlert(
          'BMS-003', 'BEAM STOCK', 'HIGH PRIORITY', p.order_no, p.next_design, p.loom_no, availBeam.beam_no,
          'Loom plan exists but beam allocation is pending.',
          `Available Beam ${availBeam.beam_no} found for Design ${p.next_design} but not allocated yet.`,
          'Select an available beam.'
        );
      }

      // RED-001: Reed Check
      const designObj = designs.find(d => d.design_no_sp_no === p.next_design);
      if (designObj && designObj.reed_count) {
        const availReed = reeds.find(r => r.reed_count === designObj.reed_count && (r.available_qty > 0 || r.status === 'Available'));
        if (!availReed) {
          registerAlert(
            'RED-001', 'REED', 'CRITICAL', p.order_no, p.next_design, p.loom_no, null,
            'Required reed specification unavailable in stock.',
            `Design ${p.next_design} requires reed count ${designObj.reed_count} which is unavailable.`,
            'Check Reed Stock.'
          );
        }
      }
    }

    // 3. WEAVING & RUNOUT ALERTS (WVG-001..006, RUN-001..003)
    const todayStr = new Date().toISOString().split('T')[0];

    for (const run of activeRuns) {
      const loomNo = run.loom_no;
      const designNo = run.design_no_sp_no;
      const orderNo = run.order_no;

      if (orderNo && completedOrderNos.has(orderNo.trim().toLowerCase())) continue;

      const loomLogs = logs.filter(l => l.loom_no === loomNo);
      const totalProd = loomLogs.reduce((sum, l) => sum + (l.produced_meter || 0), 0);
      const warpedMeter = run.warped_meter || 10000;
      const netBal = Math.max(0, warpedMeter - totalProd);
      const avgProd = run.daily_production || 200;
      const balanceDays = avgProd > 0 ? Math.ceil(netBal / avgProd) : 99;

      // WVG-001 / RUN-001: Runout <= 2 Days
      if (balanceDays <= 2) {
        registerAlert(
          'WVG-001', 'WEAVING', 'CRITICAL', orderNo, designNo, loomNo, run.current_beam_no,
          'Loom is expected to run out within 2 days.',
          `Loom ${loomNo} running design ${designNo} has ${balanceDays} balance days remaining (${netBal}M).`,
          'Confirm the next loom plan and beam immediately.'
        );

        // RUN-003: Critical Runout & No Next Plan
        const hasNextPlan = plans.some(p => p.loom_no === loomNo && p.status !== 'CANCELLED' && p.status !== 'COMPLETED');
        if (!hasNextPlan) {
          registerAlert(
            'RUN-003', 'RUNOUT', 'CRITICAL', orderNo, designNo, loomNo, run.current_beam_no,
            'Loom runout is approaching within 2 days but no next plan is available.',
            `Loom ${loomNo} has ${balanceDays} days remaining but zero future plan assignments exist in Loom Planning Setup.`,
            'Create next loom plan.'
          );
        }
      } else if (balanceDays <= 5) {
        // WVG-002 / RUN-002: Runout 3-5 Days
        registerAlert(
          'WVG-002', 'WEAVING', 'HIGH PRIORITY', orderNo, designNo, loomNo, run.current_beam_no,
          'Loom runout approaching within 3-5 days.',
          `Loom ${loomNo} has ${balanceDays} balance days remaining.`,
          'Prepare next loom plan.'
        );
      }

      // WVG-006: No Daily Production Log Today
      const loggedToday = loomLogs.some(l => l.date && new Date(l.date).toISOString().split('T')[0] === todayStr);
      if (!loggedToday) {
        registerAlert(
          'WVG-006', 'WEAVING', 'HIGH PRIORITY', orderNo, designNo, loomNo, run.current_beam_no,
          'No daily production entry logged for today.',
          `Loom ${loomNo} is running but no daily production record has been saved for date ${todayStr}.`,
          'Update today\'s production in Main Entry.'
        );
      }
    }

    // 4. INDEPENDENT STOCK LEVEL ALERTS (RED-002, RED-003, BMS-004)
    // These fire regardless of active orders/plans — based purely on stock levels

    for (const reed of reeds) {
      const qty = reed.available_qty || 0;
      const reedSpec = reed.reed_count || reed.reed_spec || 'Unknown';
      const status = (reed.status || '').toUpperCase();

      // RED-002: Reed Stock Critical Low (qty = 0 or status CRITICAL)
      if (qty === 0 || status === 'OUT OF STOCK' || status === 'CRITICAL') {
        registerAlert(
          'RED-002', 'REED', 'CRITICAL', null, reedSpec, null, `REED-${reedSpec}`,
          `Reed ${reedSpec} is completely out of stock.`,
          `Reed specification ${reedSpec} has ${qty} units in stock. This will block any new loom startup for designs using this reed.`,
          'Urgently procure reed stock. Contact supplier immediately.',
          `Reed Count: ${reedSpec}, Available Qty: ${qty}`
        );
      } else if (qty <= 2 || status === 'LOW STOCK') {
        // RED-003: Reed Stock Low Warning
        registerAlert(
          'RED-003', 'REED', 'HIGH PRIORITY', null, reedSpec, null, `REED-${reedSpec}`,
          `Reed ${reedSpec} stock is critically low.`,
          `Reed specification ${reedSpec} has only ${qty} units remaining. Risk of stockout if multiple looms start simultaneously.`,
          'Initiate reed procurement. Verify upcoming loom plans requiring this reed count.',
          `Reed Count: ${reedSpec}, Available Qty: ${qty}`
        );
      }
    }

    // BMS-004: Beam Stock Empty / No Available Beams
    const availableBeamsCount = beams.filter(b => {
      const s = (b.status || '').toLowerCase();
      return s === 'available' || s === 'ready';
    }).length;
    if (beams.length === 0) {
      registerAlert(
        'BMS-004', 'BEAM STOCK', 'CRITICAL', null, null, null, null,
        'No beams found in the Beam Stock register.',
        'Central Beam Stock is empty. No beams have been entered into the system. Looms cannot be planned without beam data.',
        'Add beam records in Beam Stock. Enter beam numbers, set numbers, design, and sizing details.',
        'Total Beams in System: 0'
      );
    } else if (availableBeamsCount === 0 && beams.length > 0) {
      registerAlert(
        'BMS-004', 'BEAM STOCK', 'CRITICAL', null, null, null, null,
        'No available beams in stock. All beams are either reserved or consumed.',
        `${beams.length} beam(s) exist in the register but none have Available status. Cannot allocate beam for new loom plans.`,
        'Check beam sizing status. Mark sized beams as READY/Available in Beam Stock.',
        `Total Beams: ${beams.length}, Available: ${availableBeamsCount}`
      );
    }

    // ORD-005: No Active Orders in System
    const activeOrders = orders.filter(o => {
      const s = (o.status || '').toLowerCase();
      return s !== 'order completed' && s !== 'completed' && o.order_completion_status !== 'COMPLETED';
    });
    if (activeOrders.length === 0 && orders.length === 0) {
      // Only create this informational alert if there are no orders at all, and no existing PLN alert
      const hasInfoAlert = existingAlerts.some(a => a.alert_code === 'ORD-005' && a.status !== 'RESOLVED' && a.status !== 'DISMISSED');
      if (!hasInfoAlert) {
        alertUpserts.push(
          prisma.erpAlert.create({
            data: {
              alert_code: 'ORD-005',
              department: 'PLANNING',
              priority: 'MEDIUM PRIORITY',
              order_no: null,
              design_no: null,
              loom_no: null,
              beam_no: null,
              message: 'No active orders found in the ERP system.',
              reason: 'The Order Management module has no orders entered. Production planning cannot begin without orders.',
              suggested_action: 'Open Order Management and create the first production order with design, quantity, and delivery date.',
              status: 'OPEN',
              remarks: 'System startup informational alert'
            }
          })
        );
        activeGeneratedKeys.add('ORD-005_NOORD_NODES_0_NOBM');
      } else {
        activeGeneratedKeys.add('ORD-005_NOORD_NODES_0_NOBM');
      }
    }


    // Execute pending new alerts
    if (alertUpserts.length > 0) {
      await Promise.all(alertUpserts);
    }


    // Auto-resolve non-matching / resolved alerts
    for (const a of existingAlerts) {
      if (a.status === 'RESOLVED' || a.status === 'DISMISSED') continue;

      const oKey = (a.order_no || '').trim().toLowerCase();
      const isCompletedOrder = oKey && completedOrderNos.has(oKey);

      const uniqueKey = `${a.alert_code}_${a.order_no || 'NOORD'}_${a.design_no || 'NODES'}_${a.loom_no || 0}_${a.beam_no || 'NOBM'}`;
      const isStillActive = activeGeneratedKeys.has(uniqueKey);

      if (isCompletedOrder || !isStillActive) {
        await prisma.erpAlert.update({
          where: { id: a.id },
          data: {
            status: 'RESOLVED',
            acknowledged_by: 'System Auto-Resolution Engine',
            acknowledged_date: new Date(),
            remarks: isCompletedOrder ? 'Auto-resolved: Associated order completed' : 'Auto-resolved: Underlying condition resolved'
          }
        });
      }
    }
  } catch (err) {
    console.error('Error evaluating ERP alerts:', err);
  }
}

app.get('/api/erp-alerts', async (req, res) => {
  try {
    // 1. Run dynamic real-time evaluation
    await evaluateErpAlerts();

    // 2. Query alerts
    const alerts = await prisma.erpAlert.findMany({
      orderBy: { createdAt: 'desc' },
      take: 500
    });

    res.json(alerts);
  } catch (error) {
    console.error('Fetch alerts error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/erp-alerts', async (req, res) => {
  try {
    const { department, order_no, design_no, loom_no, beam_no, priority, message, reason, suggested_action, remarks } = req.body;
    const alert = await prisma.erpAlert.create({
      data: {
        alert_code: `ALT-${Date.now().toString().slice(-6)}`,
        department: department || 'Planning',
        order_no: order_no || null,
        design_no: design_no || null,
        loom_no: loom_no ? Number(loom_no) : null,
        beam_no: beam_no || null,
        priority: priority || 'HIGH PRIORITY',
        message: message || 'Production Alert',
        reason: reason || '',
        suggested_action: suggested_action || '',
        status: 'OPEN',
        remarks: remarks || ''
      }
    });
    res.json({ success: true, alert });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/erp-alerts/:id/acknowledge', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { user_name, remarks } = req.body;
    const updated = await prisma.erpAlert.update({
      where: { id },
      data: {
        status: 'ACKNOWLEDGED',
        acknowledged_by: user_name || 'Senior Planner',
        acknowledged_date: new Date(),
        remarks: remarks || 'Acknowledged by Planner'
      }
    });
    res.json({ success: true, alert: updated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/erp-alerts/:id/resolve', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { user_name, remarks } = req.body;
    const updated = await prisma.erpAlert.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        acknowledged_by: user_name || 'Senior Planner',
        acknowledged_date: new Date(),
        remarks: remarks || 'Manually resolved by user'
      }
    });
    res.json({ success: true, alert: updated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/erp-alerts/:id/dismiss', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const updated = await prisma.erpAlert.update({
      where: { id },
      data: { status: 'DISMISSED' }
    });
    res.json({ success: true, alert: updated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------
// SYSTEM HEALTH & VALIDATION API
// ----------------------------------------------------


app.get('/api/system-health', async (req, res) => {
  try {
    const startTime = Date.now();
    let isDbConnected = false;
    let errors = [];
    let warnings = [];

    // 1. Check Database Connection
    try {
      await prisma.$queryRaw`SELECT 1`;
      isDbConnected = true;
    } catch (e) {
      return res.status(500).json({ status: 'Critical', error: 'Database connection failed' });
    }

    // 2. Fetch Master Counts
    const loomsCount = await prisma.loomMaster.count();
    const designsCount = await prisma.designMaster.count();
    const beamsCount = await prisma.beamStockMaster.count();

    // 3. Fetch Transaction Counts
    const runningLooms = await prisma.loomRunEntry.count();
    const plannedLooms = await prisma.plannedAssignment.count();
    const historyCount = await prisma.completedWarpHistory.count();

    // 4. Data Integrity Checks (Orphans & Duplicates)
    // - Orphaned Runs
    const allLoomNos = (await prisma.loomMaster.findMany({ select: { loom_no: true } })).map(l => l.loom_no);
    const runLoomNos = (await prisma.loomRunEntry.findMany({ select: { loom_no: true } })).map(r => r.loom_no);

    let orphanRunsCount = runLoomNos.filter(no => !allLoomNos.includes(no)).length;
    if (orphanRunsCount > 0) {
      errors.push(`${orphanRunsCount} Active Runs found without a matching Loom in LoomMaster.`);
    }

    // - Orphaned Plans
    const planLoomNos = (await prisma.plannedAssignment.findMany({ select: { loom_no: true } })).map(p => p.loom_no);
    let orphanPlansCount = planLoomNos.filter(no => !allLoomNos.includes(no)).length;

    if (orphanPlansCount > 0) {
      errors.push(`${orphanPlansCount} Planned Assignments found without a matching Loom in LoomMaster.`);
    }

    // - Beams with negative balance
    const negativeBeams = await prisma.beamStockMaster.findMany({
      where: { available_meter: { lt: 0 } }
    });
    if (negativeBeams.length > 0) {
      warnings.push(`${negativeBeams.length} Beams have negative available meters.`);
    }

    // 5. Workflow Health
    // Ensure all running looms have valid designs
    const allDesignNos = (await prisma.designMaster.findMany({ select: { design_no_sp_no: true } })).map(d => d.design_no_sp_no);
    const runDesignNos = (await prisma.loomRunEntry.findMany({ select: { design_no_sp_no: true } })).map(r => r.design_no_sp_no).filter(Boolean);

    let invalidDesignRunsCount = runDesignNos.filter(no => !allDesignNos.includes(no)).length;

    if (invalidDesignRunsCount > 0) {
      errors.push(`${invalidDesignRunsCount} Active Runs reference a missing Design.`);
    }

    // 6. Calculate Overall Health Score
    let healthScore = 100;
    healthScore -= (errors.length * 15);
    healthScore -= (warnings.length * 5);
    if (healthScore < 0) healthScore = 0;

    let overallStatus = 'Excellent';
    if (healthScore < 100 && healthScore >= 80) overallStatus = 'Good';
    else if (healthScore < 80 && healthScore >= 50) overallStatus = 'Needs Attention';
    else if (healthScore < 50) overallStatus = 'Critical';

    const responseTime = Date.now() - startTime;

    res.json({
      success: true,
      data: {
        dbConnected: isDbConnected,
        metrics: {
          totalLooms: loomsCount,
          totalDesigns: designsCount,
          totalBeams: beamsCount,
          runningLooms,
          plannedLooms,
          historyCount
        },
        health: {
          score: healthScore,
          status: overallStatus,
          errors,
          warnings,
          responseTimeMs: responseTime,
          lastSync: new Date().toISOString()
        }
      }
    });

  } catch (error) {
    console.error('System health check error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ----------------------------------------------------
// ORDER MANAGEMENT & PLANNING CONTROL CENTER
// ----------------------------------------------------

// Real-time IBPO Validation Endpoint
app.get('/api/orders/check-ibpo', async (req, res) => {
  try {
    const { ibpo, excludeId } = req.query;
    if (!ibpo || !String(ibpo).trim()) {
      return res.json({ isAvailable: true, message: 'Valid IBPO' });
    }
    const normalized = String(ibpo).trim().toUpperCase();
    const existing = await prisma.orderMaster.findFirst({
      where: {
        ibpo_no: normalized,
        NOT: {
          OR: [
            { status: 'ORDER COMPLETED' },
            { order_completion_status: 'COMPLETED' }
          ]
        },
        ...(excludeId ? { id: { not: parseInt(excludeId) } } : {})
      }
    });

    if (existing) {
      return res.json({
        isAvailable: false,
        message: `IBPO ${normalized} is already available in the system. Duplicate active order cannot be created.`
      });
    }
    return res.json({ isAvailable: true, message: 'IBPO available' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/orders', async (req, res) => {
  try {
    const [orders, activeRuns, completedHistory, dailyLogs, orderCompletions] = await Promise.all([
      prisma.orderMaster.findMany({
        include: { designMaster: true },
        orderBy: { id: 'desc' }
      }),
      prisma.loomRunEntry.findMany({
        include: { LoomMaster: true }
      }),
      prisma.completedWarpHistory.findMany(),
      prisma.dailyProductionLog.findMany(),
      prisma.orderCompletionHistory.findMany()
    ]);

    const enrichedOrders = orders.map(order => {
      const designNo = (order.design_no_sp_no || '').trim().toLowerCase();
      const ibpoNo = (order.ibpo_no || '').trim().toUpperCase();
      const orderNo = (order.order_no || '').trim().toLowerCase();

      // Find all active running looms for this order/design (strict IBPO/Order priority)
      const orderActiveRuns = activeRuns.filter(run => {
        const runDesign = (run.design_no_sp_no || '').trim().toLowerCase();
        const runOrder = (run.order_no || '').trim().toUpperCase();

        if (ibpoNo && runOrder) {
          return runOrder === ibpoNo;
        }
        if (orderNo && runOrder) {
          return runOrder.toLowerCase() === orderNo;
        }
        return runDesign === designNo;
      });

      // 1. Sum completed warp production meters matching Design / IBPO
      let historyMeters = 0;
      completedHistory.forEach(h => {
        const hDesign = (h.design_no_sp_no || '').trim().toLowerCase();
        const hOrder = (h.order_no || h.ibpo_no || '').trim().toUpperCase();
        if ((ibpoNo && hOrder === ibpoNo) || (!hOrder && hDesign === designNo)) {
          historyMeters += (Number(h.total_production_meter) || Number(h.warp_meter) || 0);
        }
      });

      // 2. Sum daily production logs matching Design / IBPO
      let dailyLogMeters = 0;
      dailyLogs.forEach(dl => {
        const dlDesign = (dl.design_no || '').trim().toLowerCase();
        const dlOrder = (dl.order_no || dl.ibpo_no || '').trim().toUpperCase();
        if ((ibpoNo && dlOrder === ibpoNo) || (!dlOrder && dlDesign === designNo)) {
          dailyLogMeters += (Number(dl.produced_meter) || 0);
        }
      });

      // 3. Sum active running looms production meters matching Design / IBPO / Order No
      let activeMeters = 0;
      const today = new Date();

      orderActiveRuns.forEach(run => {
        if (run.production_override && Number(run.production_override) > 0) {
          activeMeters += Number(run.production_override);
        } else {
          const dailyProd = Number(run.daily_production) || 0;
          let daysRunning = 0;
          if (run.loom_start_date) {
            const startDate = new Date(run.loom_start_date);
            const diffMs = Math.max(0, today.getTime() - startDate.getTime());
            daysRunning = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
          }
          const calculatedMeters = dailyProd * daysRunning;
          const warpedMeter = Number(run.warped_meter) || 0;
          const loomMeters = warpedMeter > 0 ? Math.min(calculatedMeters, warpedMeter) : calculatedMeters;
          activeMeters += loomMeters;
        }
      });

      // Total Scanned Production Quantity from all looms
      const scannedProducedQty = Math.round(historyMeters + dailyLogMeters + activeMeters);
      const finalProducedQty = Math.max(Number(order.produced_qty || 0), scannedProducedQty);

      // Calculate operational actuals
      const actualLoomCount = orderActiveRuns.length;

      let actualWeavingStartDate = null;
      if (orderActiveRuns.length > 0) {
        const startDates = orderActiveRuns.map(r => r.loom_start_date).filter(Boolean);
        if (startDates.length > 0) {
          actualWeavingStartDate = new Date(Math.min(...startDates.map(d => new Date(d).getTime())));
        }
      }

      let actualAvgProduction = null;
      if (orderActiveRuns.length > 0) {
        const prods = orderActiveRuns.map(r => Number(r.daily_production) || 0);
        const sum = prods.reduce((a, b) => a + b, 0);
        actualAvgProduction = Math.round(sum / orderActiveRuns.length);
      }

      let actualRunoutDate = null;
      if (orderActiveRuns.length > 0) {
        const runoutDates = orderActiveRuns.map(run => {
          const design = order.designMaster;
          const crimp = design ? Number(design.crimp_percent) || 0 : 0;
          const dailyProd = Number(run.daily_production) || 0;
          if (dailyProd <= 0) return null;
          
          let runningDays = Math.ceil(Math.max(0, today.getTime() - new Date(run.loom_start_date).getTime()) / 86400000);
          if (runningDays <= 0) runningDays = 1;
          const produced = run.production_override && Number(run.production_override) > 0
            ? Number(run.production_override)
            : dailyProd * runningDays;
          const warpBal = Math.max(0, (Number(run.warped_meter) || 0) - produced);
          const netBal = warpBal * (1 - crimp);
          const daysLeft = dailyProd > 0 ? netBal / dailyProd : 0;
          
          const rDate = new Date();
          rDate.setDate(rDate.getDate() + Math.ceil(daysLeft));
          return rDate;
        }).filter(Boolean);
        
        if (runoutDates.length > 0) {
          actualRunoutDate = new Date(Math.max(...runoutDates.map(d => d.getTime())));
        }
      }

      // Production Drop Alert (15% threshold below expected)
      const expectedAvgProd = Number(order.avg_production_per_loom) || 0;
      let isProductionAlert = false;
      let dropPercent = 0;

      if (actualLoomCount > 0 && expectedAvgProd > 0 && actualAvgProduction !== null && actualAvgProduction < expectedAvgProd) {
        dropPercent = Math.round(((expectedAvgProd - actualAvgProduction) / expectedAvgProd) * 100);
        if (dropPercent >= 15) {
          isProductionAlert = true;
        }
      }

      const orderCompletionRecord = orderCompletions.find(c => 
        (c.order_no && c.order_no.trim().toLowerCase() === orderNo) ||
        (c.ibpo_no && c.ibpo_no.trim().toUpperCase() === ibpoNo)
      );
      const actualCompletionDate = orderCompletionRecord ? orderCompletionRecord.actual_completion_date : null;

      // Loom-wise details list
      const loomWiseProduction = orderActiveRuns.map(run => {
        const design = order.designMaster;
        const loom = run.LoomMaster;
        return {
          loom_no: run.loom_no,
          unit: loom ? loom.unit : '—',
          design_no_sp_no: run.design_no_sp_no,
          construction: order.construction || design?.construction || '—',
          reed: design?.reed_count || '—',
          pick: design?.pick || '—',
          width: design?.greige_width || '—',
          set_no: run.set_no || '—',
          beam_no: run.current_beam_no || '—',
          loom_start_date: run.loom_start_date,
          warp_meter: run.warped_meter,
          daily_production: run.daily_production,
          crimp_percent: design?.crimp_percent || 0,
          rpm: run.rpm || loom?.rpm || '—',
          efficiency: run.efficiency || '—'
        };
      });

      // Strict Order Status Progression State Machine:
      // 1. ORDER COMPLETED (confirmed completion record)
      // 2. WEAVING COMPLETED (produced >= order_qty, pending user confirmation)
      // 3. WEAVING RUNNING (ONLY when actualLoomCount > 0)
      // 4. DELAYED (overdue & incomplete)
      // 5. LOOM PLANNED (planned_loom_count > 0, but actualLoomCount === 0)
      // 6. PLANNING PENDING
      // 7. ORDER RECEIVED
      let cleanStatus = order.status;
      const targetDate = order.weaving_completion_date ? new Date(order.weaving_completion_date) : (order.target_delivery_date ? new Date(order.target_delivery_date) : null);
      const isOverdue = targetDate && targetDate < today;

      if (orderCompletionRecord || order.order_completion_status === 'COMPLETED' || order.status === 'ORDER COMPLETED') {
        cleanStatus = 'ORDER COMPLETED';
      } else if (finalProducedQty >= order.order_qty && order.order_qty > 0) {
        cleanStatus = 'WEAVING COMPLETED';
      } else if (actualLoomCount > 0) {
        cleanStatus = 'WEAVING RUNNING';
      } else if (isOverdue && finalProducedQty < order.order_qty) {
        cleanStatus = 'DELAYED';
      } else if (order.planned_loom_count && order.planned_loom_count > 0) {
        cleanStatus = 'LOOM PLANNED';
      } else if (order.weaving_planned_date || order.sizing_planned_date) {
        cleanStatus = 'PLANNING PENDING';
      } else {
        cleanStatus = 'ORDER RECEIVED';
      }

      if (cleanStatus !== order.status) {
        prisma.orderMaster.update({
          where: { id: order.id },
          data: { status: cleanStatus }
        }).catch(() => { });
      }

      const ai = computeOrderAI(order);

      return {
        ...order,
        ibpo_no: ibpoNo || order.ibpo_no,
        status: cleanStatus,
        produced_qty: finalProducedQty,
        scanned_produced_qty: scannedProducedQty,
        actual_loom_count: actualLoomCount,
        actual_weaving_start_date: actualWeavingStartDate,
        actual_avg_production: actualAvgProduction,
        actual_runout_date: actualRunoutDate,
        actual_completion_date: actualCompletionDate,
        production_drop_alert: isProductionAlert,
        production_drop_pct: dropPercent,
        expected_avg_production: expectedAvgProd,
        loomWiseProduction,
        ai
      };
    });

    res.json(enrichedOrders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.put('/api/orders/:id', async (req, res) => {
  try {
    const data = req.body;
    const orderId = parseInt(req.params.id);

    const ibpoNo = data.ibpo_no ? String(data.ibpo_no).trim().toUpperCase() : null;

    // Strict IBPO Uniqueness Check on update
    if (ibpoNo) {
      const existingActive = await prisma.orderMaster.findFirst({
        where: {
          ibpo_no: ibpoNo,
          id: { not: orderId },
          NOT: {
            OR: [
              { status: 'ORDER COMPLETED' },
              { order_completion_status: 'COMPLETED' }
            ]
          }
        }
      });

      if (existingActive) {
        return res.status(400).json({
          error: `IBPO ${ibpoNo} is already available in the system. Duplicate active order cannot be created.`
        });
      }
    }

    const looms = Number(data.planned_loom_count) || 0;
    const avgProd = Number(data.avg_production_per_loom) || 0;
    const orderQty = Number(data.order_qty) || 0;
    const dailyProd = looms * avgProd;
    const estimatedDays = dailyProd > 0 ? Math.ceil(orderQty / dailyProd) : 0;
    data.estimated_production_days = estimatedDays;

    let weavingStart = data.weaving_start_date ? new Date(data.weaving_start_date) : null;
    let weavingPlanned = data.weaving_planned_date ? new Date(data.weaving_planned_date) : null;
    let weavingComp = data.weaving_completion_date ? new Date(data.weaving_completion_date) : null;

    // System Forecast Calculation
    let expectedComp = null;
    if (estimatedDays > 0) {
      const baseDate = weavingPlanned ? new Date(weavingPlanned) : (weavingStart ? new Date(weavingStart) : null);
      if (baseDate) {
        expectedComp = new Date(baseDate);
        expectedComp.setDate(expectedComp.getDate() + estimatedDays - 1);
      }
    }

    if (data.expected_completion_date) {
      expectedComp = new Date(data.expected_completion_date);
    }
    data.expected_completion_date = expectedComp;
    data.ibpo_no = ibpoNo;

    // Central Design Master Update (SSOT)
    if (data.design_no_sp_no) {
      const designPayload = {
        construction: data.construction || '',
        weave_type: data.weave_type || 'Plain',
        frames: Number(data.frames || 4),
        weft_colours: Number(data.weft_colours || 1),
        weft_colour_details: data.weft_colour_details || '',
        reed_count: String(data.reed_count || ''),
        pick: String(data.pick || data.ppi || ''),
        greige_width: data.greige_width || data.width || data.required_reed_space || '',
        total_ends: Number(data.total_ends || 0),
        reed_space_warp_width: data.reed_space || data.reed_space_warp_width || '',
        beam_type: data.beam_type || 'Standard',
        crimp_percent: Number(data.crimp_percent || 0),
        status: 'ACTIVE',
        remarks: data.remarks || ''
      };

      await prisma.designMaster.upsert({
        where: { design_no_sp_no: data.design_no_sp_no },
        update: designPayload,
        create: { design_no_sp_no: data.design_no_sp_no, ...designPayload }
      });
    }

    // Build clean payload with only valid OrderMaster schema fields
    const validOrderMasterFields = new Set([
      'order_no', 'ibpo_no', 'customer_name', 'buyer_name', 'order_type',
      'combo_pattern', 'finish', 'design_no_sp_no', 'construction', 'reed_count',
      'weave_type', 'epi', 'ppi', 'total_ends', 'beam_type', 'frames',
      'no_of_clr_warp', 'no_of_clr_weft', 'uom', 'order_qty', 'grey_qty',
      'warp_qty', 'beam_capacity', 'required_beams', 'planned_warp_beams',
      'current_beam_planned', 'beam_prepared', 'planned_loom_count',
      'avg_production_per_loom', 'estimated_production_days', 'expected_completion_date',
      'sizing_planned_date', 'sizing_completed_date', 'weaving_planned_date',
      'weaving_start_date', 'weaving_completion_date', 'expected_dispatch_date',
      'actual_dispatch_date', 'priority', 'planning_status', 'approval_status',
      'yarn_status', 'sizing_status', 'beam_status', 'produced_qty', 'short_excess_qty',
      'order_completion_status', 'actual_completion_date', 'completion_remarks',
      'completed_by', 'approved_by', 'approval_date', 'warp_confirmed_qty',
      'warp_balance_qty', 'delay_status', 'order_received_date', 'target_delivery_date',
      'status', 'remarks', 'createdBy'
    ]);

    const updatePayload = {};
    Object.keys(data).forEach(key => {
      if (validOrderMasterFields.has(key)) {
        updatePayload[key] = data[key];
      }
    });

    // Format number fields
    ['epi', 'ppi', 'total_ends', 'frames', 'no_of_clr_warp', 'no_of_clr_weft',
      'order_qty', 'grey_qty', 'warp_qty', 'planned_loom_count', 'avg_production_per_loom', 'estimated_production_days'].forEach(numField => {
      if (updatePayload[numField] !== undefined && updatePayload[numField] !== null && updatePayload[numField] !== '') {
        updatePayload[numField] = Number(updatePayload[numField]);
      } else if (updatePayload[numField] === '') {
        updatePayload[numField] = null;
      }
    });

    // Convert date strings
    const dateFields = ['sizing_planned_date', 'sizing_completed_date',
      'weaving_planned_date', 'weaving_start_date', 'weaving_completion_date', 'expected_completion_date', 'order_received_date', 'actual_dispatch_date'];
    dateFields.forEach(f => {
      if (updatePayload[f]) updatePayload[f] = new Date(updatePayload[f]);
      else if (updatePayload[f] === '') updatePayload[f] = null;
    });

    // Handle designMaster relation foreign key
    if (updatePayload.design_no_sp_no) {
      updatePayload.designMaster = {
        connect: { design_no_sp_no: updatePayload.design_no_sp_no }
      };
      delete updatePayload.design_no_sp_no;
    }

    const order = await prisma.orderMaster.update({
      where: { id: orderId },
      data: updatePayload
    });
    res.json(order);
  } catch (error) {
    console.error('Order update error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/order-completion/history', async (req, res) => {
  try {
    const orders = await prisma.orderMaster.findMany({
      include: { designMaster: true },
      orderBy: { id: 'desc' }
    });

    const completedOrders = orders.filter(o => {
      const s = (o.status || '').toUpperCase();
      const compStatus = (o.order_completion_status || '').toUpperCase();
      return s.includes('COMPLETED') || compStatus === 'COMPLETED';
    });

    const formatted = completedOrders.map(o => ({
      id: o.id,
      order_no: o.order_no || o.ibpo_no || `ORD-${o.id}`,
      ibpo_no: o.ibpo_no,
      customer_name: o.customer_name,
      buyer_name: o.buyer_name,
      design_no_sp_no: o.design_no_sp_no,
      construction: o.construction || o.designMaster?.construction || '',
      order_qty: o.order_qty,
      grey_qty: o.grey_qty,
      warp_qty: o.warp_qty,
      uom: o.uom || 'Meters',
      order_received_date: o.order_received_date,
      weaving_completion_date: o.weaving_completion_date || o.expected_completion_date,
      actual_completion_date: o.actual_completion_date || o.updatedAt,
      produced_qty: o.produced_qty || o.order_qty,
      final_status: o.status || 'ORDER COMPLETED',
      completed_by: o.completed_by || 'Planning Manager',
      planner_remarks: o.completion_remarks || o.remarks || 'Completed',
      createdAt: o.createdAt
    }));

    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/orders/:id/complete', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { remarks, final_status, completed_by } = req.body;
    const order = await prisma.orderMaster.findUnique({
      where: { id },
      include: { designMaster: true }
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (order.order_completion_status === 'COMPLETED' || order.status === 'ORDER COMPLETED') {
      return res.json({ success: true, message: 'Order is already completed.', order });
    }

    const completionDate = new Date();
    const completedByUser = completed_by || 'Planning Manager';

    // 1. Update OrderMaster status
    const updatedOrder = await prisma.orderMaster.update({
      where: { id },
      data: {
        status: final_status || 'ORDER COMPLETED',
        order_completion_status: 'COMPLETED',
        actual_completion_date: completionDate,
        completion_remarks: remarks || 'Completed by User',
        completed_by: completedByUser
      }
    });

    // 2. Find active runs or planned assignments for this order/design
    const designNo = order.design_no_sp_no;
    const ibpoNo = order.ibpo_no;

    const [activeRuns, plannedAssignments] = await Promise.all([
      prisma.loomRunEntry.findMany({
        where: {
          OR: [
            { design_no_sp_no: designNo },
            { order_no: ibpoNo || '' }
          ]
        }
      }),
      prisma.plannedAssignment.findMany({
        where: {
          OR: [
            { current_design: designNo },
            { next_design: designNo },
            { order_no: ibpoNo || '' }
          ]
        }
      })
    ]);

    // 3. Create CompletedWarpHistory for each running loom (if not already logged)
    for (const run of activeRuns) {
      const existingHistory = await prisma.completedWarpHistory.findFirst({
        where: {
          loom_no: run.loom_no,
          design_no_sp_no: designNo
        }
      });

      if (!existingHistory) {
        const startDate = run.loom_start_date ? new Date(run.loom_start_date) : new Date();
        const diffMs = Math.max(86400000, completionDate.getTime() - startDate.getTime());
        const runningDays = Math.max(1, Math.ceil(diffMs / 86400000));
        const dailyProd = Number(run.daily_production || order.avg_production_per_loom || 100);
        const totalProd = Math.max(Number(order.produced_qty || 0), dailyProd * runningDays);

        await prisma.completedWarpHistory.create({
          data: {
            loom_no: run.loom_no,
            design_no_sp_no: designNo,
            start_date: startDate,
            end_date: completionDate,
            warp_meter: Number(run.warped_meter || order.warp_qty || order.order_qty || 1000),
            total_production_meter: totalProd,
            running_days: runningDays,
            avg_daily_production: Math.round(totalProd / runningDays),
            efficiency_pct: Number(run.efficiency || 85.0),
            unit: 'Meters'
          }
        });
      }
    }

    // 4. Clear Active Loom Runs for this completed order / design so looms are freed
    await prisma.loomRunEntry.deleteMany({
      where: {
        OR: [
          { design_no_sp_no: designNo },
          { order_no: ibpoNo || '' },
          { order_no: order.order_no || '' }
        ]
      }
    });

    // 5. Update PlannedAssignments status to COMPLETED
    if (plannedAssignments.length > 0) {
      await prisma.plannedAssignment.updateMany({
        where: {
          OR: [
            { current_design: designNo },
            { next_design: designNo },
            { order_no: ibpoNo || '' }
          ]
        },
        data: {
          status: 'COMPLETED',
          confirmation_status: 'COMPLETED',
          delay_status: 'COMPLETED'
        }
      });
    }

    // 5. Release Reed Reservations & Mark Assigned/Running Beams as Completed
    const orderRef = ibpoNo || order.order_no;

    await prisma.reedStockMaster.updateMany({
      where: {
        OR: [
          { reserved_for_order: orderRef },
          { reserved_for_order: ibpoNo || '' },
          { reserved_for_order: order.order_no || '' }
        ]
      },
      data: {
        reserved_qty: 0,
        reserved_for_order: null,
        reserved_for_loom: null,
        status: 'Available'
      }
    });

    // Beams assigned or running on completed order/design move to Completed (removed from active stock)
    await prisma.beamStockMaster.updateMany({
      where: {
        OR: [
          { order_no: orderRef },
          { order_no: ibpoNo || '' },
          { order_no: order.order_no || '' },
          { design_no: designNo || '' }
        ]
      },
      data: {
        status: 'Completed',
        reserved_for: null
      }
    });

    res.json({ success: true, order: updatedOrder });
  } catch (error) {
    console.error('Order completion error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/order-completion/complete', async (req, res) => {
  try {
    const { order_no, final_status, produced_qty, actual_completion_date, completed_by, delay_reason, corrective_action, planner_remarks } = req.body;
    const order = await prisma.orderMaster.findFirst({
      where: {
        OR: [
          { order_no: order_no },
          { ibpo_no: order_no }
        ]
      }
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    
    const completionDate = actual_completion_date ? new Date(actual_completion_date) : new Date();
    const completedByUser = completed_by || 'Planning Manager';

    // 1. Update OrderMaster status
    const updatedOrder = await prisma.orderMaster.update({
      where: { id: order.id },
      data: {
        status: final_status || 'ORDER COMPLETED',
        order_completion_status: 'COMPLETED',
        actual_completion_date: completionDate,
        completion_remarks: planner_remarks || 'Completed by User',
        completed_by: completedByUser,
        produced_qty: produced_qty !== undefined ? parseFloat(produced_qty) : order.produced_qty
      }
    });

    const designNo = order.design_no_sp_no;
    const ibpoNo = order.ibpo_no;

    const [activeRuns, plannedAssignments] = await Promise.all([
      prisma.loomRunEntry.findMany({
        where: {
          OR: [
            { design_no_sp_no: designNo },
            { order_no: ibpoNo || '' }
          ]
        }
      }),
      prisma.plannedAssignment.findMany({
        where: {
          OR: [
            { current_design: designNo },
            { next_design: designNo },
            { order_no: ibpoNo || '' }
          ]
        }
      })
    ]);

    for (const run of activeRuns) {
      const existingHistory = await prisma.completedWarpHistory.findFirst({
        where: {
          loom_no: run.loom_no,
          design_no_sp_no: designNo
        }
      });

      if (!existingHistory) {
        const startDate = run.loom_start_date ? new Date(run.loom_start_date) : new Date();
        const diffMs = Math.max(86400000, completionDate.getTime() - startDate.getTime());
        const runningDays = Math.max(1, Math.ceil(diffMs / 86400000));
        const dailyProd = Number(run.daily_production || order.avg_production_per_loom || 100);
        const totalProd = Math.max(Number(produced_qty || order.produced_qty || 0), dailyProd * runningDays);

        await prisma.completedWarpHistory.create({
          data: {
            loom_no: run.loom_no,
            design_no_sp_no: designNo,
            start_date: startDate,
            end_date: completionDate,
            warp_meter: Number(run.warped_meter || order.warp_qty || order.order_qty || 1000),
            total_production_meter: totalProd,
            running_days: runningDays,
            avg_daily_production: Math.round(totalProd / runningDays),
            efficiency_pct: Number(run.efficiency || 85.0),
            unit: 'Meters'
          }
        });
      }
    }

    await prisma.loomRunEntry.deleteMany({
      where: {
        OR: [
          { design_no_sp_no: designNo },
          { order_no: ibpoNo || '' },
          { order_no: order.order_no || '' }
        ]
      }
    });

    if (plannedAssignments.length > 0) {
      await prisma.plannedAssignment.updateMany({
        where: {
          OR: [
            { current_design: designNo },
            { next_design: designNo },
            { order_no: ibpoNo || '' }
          ]
        },
        data: {
          status: 'COMPLETED',
          confirmation_status: 'COMPLETED',
          delay_status: 'COMPLETED'
        }
      });
    }

    const orderRef = ibpoNo || order.order_no;

    await prisma.reedStockMaster.updateMany({
      where: {
        OR: [
          { reserved_for_order: orderRef },
          { reserved_for_order: ibpoNo || '' },
          { reserved_for_order: order.order_no || '' }
        ]
      },
      data: {
        reserved_qty: 0,
        reserved_for_order: null,
        reserved_for_loom: null,
        status: 'Available'
      }
    });

    await prisma.beamStockMaster.updateMany({
      where: {
        OR: [
          { order_no: orderRef },
          { order_no: ibpoNo || '' },
          { order_no: order.order_no || '' },
          { design_no: designNo || '' }
        ]
      },
      data: {
        status: 'Completed',
        reserved_for: null
      }
    });

    res.json({ success: true, order: updatedOrder });
  } catch (error) {
    console.error('Order completion wrapper error:', error);
    res.status(500).json({ error: error.message });
  }
});




// ============================================================
// ENHANCED ORDER MANAGEMENT & CAPACITY PLANNING ENDPOINTS
// ============================================================

// AI Engine helper
function computeOrderAI(order) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const weavingStart = order.weaving_start_date ? new Date(order.weaving_start_date) : null;
  const weavingPlanned = order.weaving_planned_date ? new Date(order.weaving_planned_date) : null;
  const baseDate = weavingStart || weavingPlanned;
  
  const deliveryDate = order.target_delivery_date ? new Date(order.target_delivery_date) : null;
  const weavingDate = weavingPlanned;
  const sizingDate = order.sizing_planned_date ? new Date(order.sizing_planned_date) : null;

  // Calculate daily production & expected completion
  const dailyProd = (order.planned_loom_count || 1) * (order.avg_production_per_loom || 0);
  const estimatedDays = dailyProd > 0 ? Math.ceil(order.order_qty / dailyProd) : 0;

  let expectedCompletion = null;
  if (baseDate && estimatedDays > 0) {
    expectedCompletion = new Date(baseDate);
    // Day 1 = start date itself
    expectedCompletion.setDate(expectedCompletion.getDate() + estimatedDays - 1);
  }

  // Delay detection
  let delayDays = 0;
  let delayStatus = 'Green';
  let delayReason = null;
  let aiRecommendation = null;
  let deliveryRiskScore = 0;
  let planningStatus = order.planning_status || 'Planning Pending';

  // Sizing delay
  if (sizingDate && sizingDate < today && !order.sizing_completed_date) {
    const daysPast = Math.floor((today - sizingDate) / 86400000);
    delayDays = Math.max(delayDays, daysPast);
    delayReason = 'Sizing Date Crossed — Beam not yet ready';
    aiRecommendation = 'Contact sizing vendor immediately. Consider using available beam stock to avoid further delay.';
    planningStatus = 'Sizing Delayed';
  }

  // Weaving delay
  if (weavingDate && weavingDate < today && !order.actual_dispatch_date) {
    const daysPast = Math.floor((today - weavingDate) / 86400000);
    if (daysPast > delayDays) {
      delayDays = daysPast;
      delayReason = 'Weaving Planned Date Crossed — Production not started';
      aiRecommendation = 'Allocate loom immediately. Check sizing status and escalate beam preparation.';
      planningStatus = 'Weaving Delayed';
    }
  }

  // Delivery risk
  if (deliveryDate && expectedCompletion) {
    const gapDays = Math.floor((deliveryDate - expectedCompletion) / 86400000);
    if (gapDays < 0) {
      delayDays = Math.max(delayDays, Math.abs(gapDays));
      if (!delayReason) {
        delayReason = 'Expected completion exceeds delivery date';
        aiRecommendation = order.order_qty < 1000
          ? 'Small order: Use available beam stock, avoid new beam preparation. Merge with similar order if possible.'
          : order.order_qty > 10000
            ? 'Large order: Add parallel sizing, increase planned looms to 2+ units, advance weaving start date.'
            : 'Increase average production per loom or add 1-2 more looms to recover schedule.';
      }
    }
    // Risk score 0-100
    if (gapDays >= 7) deliveryRiskScore = 10;
    else if (gapDays >= 3) deliveryRiskScore = 30;
    else if (gapDays >= 0) deliveryRiskScore = 50;
    else if (gapDays >= -3) deliveryRiskScore = 70;
    else deliveryRiskScore = 90;
  }

  // Delay status
  if (delayDays === 0 && deliveryRiskScore <= 30) delayStatus = 'Green';
  else if (delayDays <= 2 || deliveryRiskScore <= 50) delayStatus = 'Yellow';
  else if (delayDays <= 7 || deliveryRiskScore <= 70) delayStatus = 'Orange';
  else delayStatus = 'Red';

  // Small order check
  if (!aiRecommendation) {
    if (order.order_qty < 1000) aiRecommendation = 'Small order: Use existing beam stock. Merge with similar orders to reduce setup cost.';
    else if (order.order_qty > 10000) aiRecommendation = 'Large order: Plan multiple beams in parallel. Reserve beam stock now to avoid delays.';
    else aiRecommendation = 'Order on track. Monitor sizing date and ensure beam is ready before weaving start.';
  }

  return {
    dailyProduction: dailyProd,
    estimatedDays,
    expectedCompletion: expectedCompletion ? expectedCompletion.toISOString() : null,
    delayDays,
    delayStatus,
    delayReason,
    aiRecommendation,
    deliveryRiskScore,
    planningStatus
  };
}

// Note: DELETE /api/orders/:id is defined above with cascade deletion and authorization check

// GET beam requirements for an order
app.get('/api/orders/:id/beam-requirements', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const beams = await prisma.beamRequirement.findMany({
      where: { order_id: id },
      orderBy: { beam_no: 'asc' }
    });

    // Enrich with beam stock suggestion
    const enriched = await Promise.all(beams.map(async (b) => {
      const stockSuggestion = await prisma.beamStockMaster.findFirst({
        where: {
          design_no: b.design_no,
          status: 'Available',
          available_meter: { gte: b.required_meter }
        }
      });
      return { ...b, stockSuggestion };
    }));

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST generate beam requirements for an order
app.post('/api/orders/:id/generate-beams', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const order = await prisma.orderMaster.findUnique({ where: { id } });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const warpQty = order.warp_qty || order.order_qty;
    const beamCapacity = order.beam_capacity || 5000;
    const requiredBeams = Math.ceil(warpQty / beamCapacity);
    const meterPerBeam = warpQty / requiredBeams;

    // Get design info
    const design = await prisma.designMaster.findUnique({
      where: { design_no_sp_no: order.design_no_sp_no }
    });

    // Delete existing
    await prisma.beamRequirement.deleteMany({ where: { order_id: id } });

    // Create new beam records
    const beamRecords = [];
    for (let i = 1; i <= requiredBeams; i++) {
      const beam = await prisma.beamRequirement.create({
        data: {
          order_id: id,
          order_no: order.order_no,
          design_no: order.design_no_sp_no,
          beam_no: i,
          beam_type: design?.beam_type || null,
          beam_dia: design?.beam_dia || null,
          required_meter: Math.round(meterPerBeam),
          required_ends: design?.total_ends || null,
          beam_width: design?.reed_space_warp_width || null,
          status: 'Pending'
        }
      });
      beamRecords.push(beam);
    }

    // Update order with required beams count
    await prisma.orderMaster.update({
      where: { id },
      data: { required_beams: requiredBeams }
    });

    res.json({ success: true, beams: beamRecords });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reserve a beam stock item for an order
app.put('/api/orders/:id/reserve-beam', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { beam_requirement_id, beam_stock_id } = req.body;

    await prisma.beamRequirement.update({
      where: { id: beam_requirement_id },
      data: { beam_stock_id, status: 'Reserved' }
    });

    await prisma.beamStockMaster.update({
      where: { id: beam_stock_id },
      data: { status: 'Reserved' }
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET Full Dashboard Analytics
app.get('/api/analytics', async (req, res) => {
  try {
    const [orders, looms, activeRuns, completedHistory, beams] = await Promise.all([
      prisma.orderMaster.findMany(),
      prisma.loomMaster.findMany(),
      prisma.loomRunEntry.findMany(),
      prisma.completedWarpHistory.findMany(),
      prisma.beamStockMaster.findMany()
    ]);

    const totalOrders = orders.length;
    const completedOrders = orders.filter(o => o.status === 'ORDER COMPLETED' || o.status === 'Completed' || o.order_completion_status === 'COMPLETED').length;
    const activeOrders = totalOrders - completedOrders;

    const availableBeams = beams.filter(b => b.status === 'Available' || b.status === 'AVAILABLE').length;
    const reservedBeams = beams.filter(b => b.status === 'Reserved' || b.status === 'RESERVED').length;
    const runningBeams = beams.filter(b => b.status === 'Running' || b.status === 'RUNNING').length;

    const ordersProgress = orders.map(o => {
      const prod = Number(o.produced_qty || 0);
      const target = Number(o.order_qty || 1000);
      return {
        orderNo: o.ibpo_no || o.order_no,
        customer: o.customer_name,
        designNo: o.design_no_sp_no,
        orderQty: target,
        completedQty: prod,
        balanceQty: Math.max(0, target - prod),
        completionPct: Math.min(100, Math.round((prod / target) * 100)),
        status: o.status
      };
    });

    res.json({
      success: true,
      kpis: {
        totalOrders,
        activeOrders,
        completedOrders,
        totalLooms: looms.length,
        runningLooms: activeRuns.length,
        availableBeams,
        reservedBeams,
        runningBeams,
        completedWarpsCount: completedHistory.length
      },
      ordersProgress
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET Order Management KPIs
app.get('/api/orders/kpis', async (req, res) => {
  try {
    const orders = await prisma.orderMaster.findMany();
    const today = new Date();

    const total = orders.length;
    const running = orders.filter(o => o.status === 'Weaving Running' || o.status === 'Sizing Running').length;
    const completed = orders.filter(o => o.status === 'Completed').length;

    let delayed = 0, critical = 0;
    let todaySizing = 0, todayWeaving = 0;

    for (const o of orders) {
      const ai = computeOrderAI(o);
      if (ai.delayDays > 0) delayed++;
      if (ai.delayStatus === 'Red') critical++;
      const tStr = today.toISOString().split('T')[0];
      if (o.sizing_planned_date && o.sizing_planned_date.toISOString().split('T')[0] === tStr) todaySizing++;
      if (o.weaving_planned_date && o.weaving_planned_date.toISOString().split('T')[0] === tStr) todayWeaving++;
    }

    res.json({ success: true, kpis: { total, running, completed, delayed, critical, todaySizing, todayWeaving } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET Production Capacity Planning
app.get('/api/capacity/planning', async (req, res) => {
  try {
    const [orders, looms, beamRequirements, beamStock] = await Promise.all([
      prisma.orderMaster.findMany({ where: { status: { not: 'Completed' } } }),
      prisma.loomMaster.findMany(),
      prisma.beamRequirement.findMany({ where: { status: { not: 'Completed' } } }),
      prisma.beamStockMaster.findMany({ where: { status: 'Available' } })
    ]);

    const totalLooms = looms.length;
    const availableLooms = looms.filter(l => l.status === 'Available').length;
    const runningLooms = looms.filter(l => l.status === 'Running').length;

    const totalRequiredLooms = orders.reduce((sum, o) => sum + (o.planned_loom_count || 0), 0);
    const loomUtilizationPct = totalLooms > 0 ? Math.round((totalRequiredLooms / totalLooms) * 100) : 0;

    const totalBeamRequired = beamRequirements.length;
    const pendingBeams = beamRequirements.filter(b => b.status === 'Pending').length;
    const reservedBeams = beamRequirements.filter(b => b.status === 'Reserved').length;
    const availableBeamStock = beamStock.length;

    const totalOrderQty = orders.reduce((sum, o) => sum + o.order_qty, 0);
    const avgDailyProd = orders.reduce((sum, o) => sum + ((o.planned_loom_count || 0) * (o.avg_production_per_loom || 0)), 0);

    // Risk assessment per order
    const orderRisks = orders.map(o => {
      const ai = computeOrderAI(o);
      return {
        order_no: o.order_no,
        customer_name: o.customer_name,
        order_qty: o.order_qty,
        planned_looms: o.planned_loom_count || 0,
        delivery_date: o.target_delivery_date,
        risk_score: ai.deliveryRiskScore,
        delay_status: ai.delayStatus,
        expected_completion: ai.expectedCompletion
      };
    });

    res.json({
      success: true,
      capacity: {
        looms: { total: totalLooms, available: availableLooms, running: runningLooms, required: totalRequiredLooms, utilizationPct: loomUtilizationPct },
        beams: { totalRequired: totalBeamRequired, pending: pendingBeams, reserved: reservedBeams, availableStock: availableBeamStock },
        production: { totalOrderQty, avgDailyProduction: avgDailyProd },
        orders: orderRisks
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------
// DEDICATED DELETE & CRUD ENDPOINTS FOR FULL PERSISTENCE
// ----------------------------------------------------

// DELETE Active Run Entry (Main Entry Clear)
app.delete('/api/active-runs/:loomNo', async (req, res) => {
  try {
    const loomNo = parseInt(req.params.loomNo, 10);
    await prisma.loomRunEntry.deleteMany({ where: { loom_no: loomNo } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE Next Plan Assignment
app.delete('/api/next-plans/:loomNo', async (req, res) => {
  try {
    const loomNo = parseInt(req.params.loomNo, 10);
    await prisma.plannedAssignment.deleteMany({ where: { loom_no: loomNo } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE Beam Stock Item
app.delete('/api/beam-stock/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await prisma.beamStockMaster.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Note: DELETE /api/orders/:id is defined above with full cascade deletion (beam requirements, next plans, yarn/sizing records)

// DELETE Sizing Beam Preparation Request
app.delete('/api/sizing/requests/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await prisma.beamPreparationRequest.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// ----------------------------------------------------
// SIZING DASHBOARD API
// ----------------------------------------------------

app.get('/api/sizing/requests', async (req, res) => {
  try {
    const requests = await prisma.beamPreparationRequest.findMany({
      orderBy: { target_date: 'asc' }
    });
    
    // dynamically calc priority
    for (const req of requests) {
      if (req.status !== 'BEAM READY') {
        const today = new Date();
        const target = new Date(req.target_date);
        const diffDays = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
        let priority = 'Low';
        if (diffDays <= 2) priority = 'Critical';
        else if (diffDays <= 5) priority = 'High';
        else if (diffDays <= 10) priority = 'Medium';
        
        if (req.priority !== priority) {
           await prisma.beamPreparationRequest.update({
             where: { id: req.id },
             data: { priority }
           });
           req.priority = priority;
        }
      }
    }
    
    res.json(requests);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/sizing/requests/:id/progress', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, vendor_name, set_no, beam_no, actual_meter, warping_vendor, warping_dc_no, warping_batch, sizing_vendor, sizing_dc_no, sizing_machine, warping_remarks, sizing_remarks } = req.body;
    
    const updateData = { status };
    if (vendor_name) updateData.vendor_name = vendor_name;
    if (set_no) updateData.set_no = set_no;
    if (beam_no) updateData.beam_no = beam_no;
    if (actual_meter !== undefined) updateData.actual_meter = actual_meter;
    if (warping_vendor) updateData.warping_vendor = warping_vendor;
    if (warping_dc_no) updateData.warping_dc_no = warping_dc_no;
    if (warping_batch) updateData.warping_batch = warping_batch;
    if (sizing_vendor) updateData.sizing_vendor = sizing_vendor;
    if (sizing_dc_no) updateData.sizing_dc_no = sizing_dc_no;
    if (sizing_machine) updateData.sizing_machine = sizing_machine;
    if (warping_remarks) updateData.warping_remarks = warping_remarks;
    if (sizing_remarks) updateData.sizing_remarks = sizing_remarks;
    
    if (status === 'WARPING RUNNING') updateData.warping_start_date = new Date();
    if (status === 'WARPING COMPLETED') updateData.warping_completion_date = new Date();
    if (status === 'SIZING RUNNING') updateData.sizing_start_date = new Date();
    if (status === 'SIZING COMPLETED') updateData.sizing_completion_date = new Date();
    
    const updated = await prisma.beamPreparationRequest.update({
      where: { id: Number(id) },
      data: updateData
    });
    
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/sizing/requests/:id/ready', async (req, res) => {
  try {
    const { id } = req.params;
    const request = await prisma.beamPreparationRequest.findUnique({ where: { id: Number(id) } });
    if (!request) return res.status(404).json({ error: 'Request not found' });
    
    // Update request to BEAM READY
    await prisma.beamPreparationRequest.update({
      where: { id: Number(id) },
      data: { status: 'BEAM READY', beam_ready_date: new Date() }
    });
    
    // Create Beam Stock
    const newBeam = await prisma.beamStockMaster.create({
      data: {
        design_no: request.design_no,
        beam_no: request.beam_no || `B-${Date.now()}`,
        set_no: request.set_no,
        party: request.vendor_name || request.sizing_vendor,
        available_meter: request.actual_meter || request.required_meter || 0,
        total_warped_meter: request.actual_meter || request.required_meter || 0,
        status: 'Available'
      }
    });
    
    // Auto-reserve for this plan
    await prisma.plannedAssignment.updateMany({
      where: { loom_no: request.loom_no, next_design: request.design_no, confirmation_status: 'BEAM REQUESTED' },
      data: { confirmation_status: 'BEAM READY', reserved_beam_id: newBeam.id }
    });
    
    // Mark stock as Reserved
    await prisma.beamStockMaster.update({
      where: { id: newBeam.id },
      data: { status: 'Reserved', reserved_for: `Loom ${request.loom_no} - ${request.design_no}`, loom_no_assigned: request.loom_no }
    });
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3002;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;

module.exports = app;
