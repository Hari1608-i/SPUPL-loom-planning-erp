require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const app = express();

app.use(cors());
app.use(express.json());

// =========================================================================
// EXPLICIT ENDPOINT REGISTRATION FOR ALL 25+ ERP PAGES & MODULES
// =========================================================================

// System Health & Root
app.get('/api', (req, res) => {
  res.json({ success: true, message: "SPUPL ERP Backend Server is Live" });
});

app.get('/api/system-health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ success: true, status: "Healthy", database: "Connected" });
  } catch (e) {
    res.status(500).json({ success: false, status: "Unhealthy", error: e.message });
  }
});

// 1. Dashboards & Analytics
app.get('/api/analytics', async (req, res) => {
  try {
    const totalLooms = await prisma.loomMaster.count();
    const activeOrders = await prisma.orderMaster.count({ where: { status: { not: "COMPLETED" } } });
    const totalBeams = await prisma.beamStockMaster.count();
    res.json({ success: true, data: { totalLooms, activeOrders, totalBeams } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// 2. Loom Running & Runout Routes
app.get('/api/active-runs', async (req, res) => {
  try {
    const runs = await prisma.loomRunEntry.findMany({ include: { LoomMaster: true } });
    res.json(runs);
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post(['/api/production/cut-beam', '/api/confirm-plan'], async (req, res) => {
  try {
    const { loom_no, remarks } = req.body;
    const loomNum = Number(loom_no);
    if (loomNum) {
      await prisma.$transaction(async (tx) => {
        await tx.plannedAssignment.updateMany({
          where: { loom_no: loomNum, status: { not: "COMPLETED" } },
          data: { status: "COMPLETED", beam_status: "CUT", updatedAt: new Date() }
        });
        await tx.loomRunEntry.updateMany({
          where: { loom_no: loomNum },
          data: { prep_status: "RUNOUT_COMPLETED", remarks: remarks || "Confirmed via UI" }
        });
      });
    }
    res.json({ success: true, message: "Runout and plan confirmed successfully." });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// 3. Planning & Next Plans Routes
app.get('/api/planning/next-plans', async (req, res) => {
  try {
    const plans = await prisma.plannedAssignment.findMany({ include: { LoomMaster: true } });
    res.json(plans);
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/planning/next-plan/confirm', async (req, res) => {
  try {
    const { loom_no } = req.body;
    if (loom_no) {
      await prisma.plannedAssignment.updateMany({
        where: { loom_no: Number(loom_no) },
        data: { status: "CONFIRMED", confirmation_status: "APPROVED", updatedAt: new Date() }
      });
    }
    res.json({ success: true, message: "Plan confirmed successfully." });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// 4. Order Management & Tracking CRUD Routes
app.get('/api/orders', async (req, res) => {
  try {
    const orders = await prisma.orderMaster.findMany({ include: { designMaster: true } });
    res.json(orders);
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/orders', async (req, res) => {
  try {
    const newOrder = await prisma.orderMaster.create({ data: req.body });
    res.json({ success: true, data: newOrder });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put('/api/orders/:id', async (req, res) => {
  try {
    const updated = await prisma.orderMaster.update({
      where: { id: Number(req.params.id) },
      data: req.body
    });
    res.json({ success: true, data: updated });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.delete('/api/orders/:id', async (req, res) => {
  try {
    await prisma.orderMaster.delete({ where: { id: Number(req.params.id) } });
    res.json({ success: true, message: "Order deleted successfully." });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// 5. Masters & Inventory (Loom, Design, Beam, Reed)
app.get('/api/looms', async (req, res) => {
  try { res.json(await prisma.loomMaster.findMany()); } 
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/designs', async (req, res) => {
  try { res.json(await prisma.designMaster.findMany()); } 
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/beam-stock', async (req, res) => {
  try { res.json(await prisma.beamStockMaster.findMany()); } 
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/reed-stock', async (req, res) => {
  try { res.json(await prisma.reedStockMaster.findMany()); } 
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// 6. Reports & Alerts
app.get('/api/daily-report', async (req, res) => {
  try { res.json(await prisma.dailyReportEntry.findMany()); } 
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/erp-alerts', async (req, res) => {
  try { res.json(await prisma.erpAlert.findMany()); } 
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/users', async (req, res) => {
  try { res.json(await prisma.user.findMany({ select: { id: true, username: true, employeeName: true, role: true, department: true, status: true } })); } 
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// 7. Additional Module Routes
app.get('/api/completed-runs', async (req, res) => {
  try { res.json(await prisma.completedWarpHistory.findMany()); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/sizing/requests', async (req, res) => {
  try { res.json(await prisma.beamPreparationRequest.findMany()); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/reed-requirements', async (req, res) => {
  try { res.json(await prisma.reedRequirement.findMany()); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/reports/design-running', async (req, res) => {
  try { res.json(await prisma.loomRunEntry.findMany({ select: { design_no_sp_no: true, loom_no: true } })); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Start Server for local testing
const PORT = process.env.PORT || 3002;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Backend server running on port ${PORT}`);
  });
}

module.exports = app;