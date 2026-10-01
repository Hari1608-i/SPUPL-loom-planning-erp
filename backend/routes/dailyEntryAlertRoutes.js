const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = global.prisma || global.globalPrisma || new PrismaClient();
const { sendNotification, buildReminderMessage } = require('../services/notificationService');
const { 
  getLiveStatus, 
  runAlertCycle, 
  getISTDateTime, 
  format12Hour 
} = require('../services/dailyEntryAlertScheduler');

// GET /api/daily-entry-alert/config — List all department reminder configurations
router.get('/config', async (req, res) => {
  try {
    const configs = await prisma.dailyEntryAlertConfig.findMany({
      orderBy: { id: 'asc' }
    });
    res.json({ success: true, configs });
  } catch (error) {
    console.error('Error fetching alert configs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/daily-entry-alert/config — Create or upsert a department configuration
router.post('/config', async (req, res) => {
  try {
    const {
      department_code,
      department_name,
      is_active,
      sender_number,
      receiver_number,
      channel,
      start_time,
      rapid_start_time,
      rapid_interval_minutes,
      end_time,
      sunday_enabled,
      message_template
    } = req.body;

    if (!department_code) {
      return res.status(400).json({ success: false, error: 'department_code is required' });
    }

    const code = String(department_code).trim().toUpperCase();
    const name = department_name ? String(department_name).trim() : code;

    const config = await prisma.dailyEntryAlertConfig.upsert({
      where: { department_code: code },
      update: {
        department_name: name,
        is_active: is_active !== undefined ? Boolean(is_active) : true,
        sender_number: sender_number !== undefined ? String(sender_number || '').trim() : null,
        receiver_number: receiver_number !== undefined ? String(receiver_number || '').trim() : null,
        channel: channel ? String(channel).trim() : 'WhatsApp',
        start_time: start_time || '08:00',
        rapid_start_time: rapid_start_time || '10:30',
        rapid_interval_minutes: Number(rapid_interval_minutes) || 5,
        end_time: end_time || '11:00',
        sunday_enabled: Boolean(sunday_enabled),
        message_template: message_template || null,
        updated_at: new Date()
      },
      create: {
        department_code: code,
        department_name: name,
        is_active: is_active !== undefined ? Boolean(is_active) : true,
        sender_number: sender_number ? String(sender_number).trim() : null,
        receiver_number: receiver_number ? String(receiver_number).trim() : null,
        channel: channel ? String(channel).trim() : 'WhatsApp',
        start_time: start_time || '08:00',
        rapid_start_time: rapid_start_time || '10:30',
        rapid_interval_minutes: Number(rapid_interval_minutes) || 5,
        end_time: end_time || '11:00',
        sunday_enabled: Boolean(sunday_enabled),
        message_template: message_template || null
      }
    });

    res.json({ success: true, message: `Configuration saved for ${code}`, config });
  } catch (error) {
    console.error('Error saving alert config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/daily-entry-alert/config/:id — Update a department configuration by ID
router.put('/config/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Valid config ID is required' });
    }

    const {
      department_name,
      is_active,
      sender_number,
      receiver_number,
      channel,
      start_time,
      rapid_start_time,
      rapid_interval_minutes,
      end_time,
      sunday_enabled,
      message_template
    } = req.body;

    const updated = await prisma.dailyEntryAlertConfig.update({
      where: { id },
      data: {
        ...(department_name !== undefined && { department_name: String(department_name).trim() }),
        ...(is_active !== undefined && { is_active: Boolean(is_active) }),
        ...(sender_number !== undefined && { sender_number: String(sender_number || '').trim() || null }),
        ...(receiver_number !== undefined && { receiver_number: String(receiver_number || '').trim() || null }),
        ...(channel !== undefined && { channel: String(channel).trim() }),
        ...(start_time !== undefined && { start_time: String(start_time).trim() }),
        ...(rapid_start_time !== undefined && { rapid_start_time: String(rapid_start_time).trim() }),
        ...(rapid_interval_minutes !== undefined && { rapid_interval_minutes: Number(rapid_interval_minutes) || 5 }),
        ...(end_time !== undefined && { end_time: String(end_time).trim() }),
        ...(sunday_enabled !== undefined && { sunday_enabled: Boolean(sunday_enabled) }),
        ...(message_template !== undefined && { message_template: message_template || null }),
        updated_at: new Date()
      }
    });

    res.json({ success: true, message: `Configuration updated for ${updated.department_code}`, config: updated });
  } catch (error) {
    console.error('Error updating alert config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/daily-entry-alert/config/:id — Deactivate department configuration
router.delete('/config/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Valid config ID is required' });
    }

    const deactivated = await prisma.dailyEntryAlertConfig.update({
      where: { id },
      data: { is_active: false, updated_at: new Date() }
    });

    res.json({ success: true, message: `Deactivated configuration for ${deactivated.department_code}`, config: deactivated });
  } catch (error) {
    console.error('Error deactivating alert config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/daily-entry-alert/status — Live department-wise status screen
router.get('/status', async (req, res) => {
  try {
    const dateQuery = req.query.date || null;
    const statusData = await getLiveStatus(dateQuery);
    res.json({ success: true, ...statusData });
  } catch (error) {
    console.error('Error fetching alert status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/daily-entry-alert/history — Filterable alert execution log history
router.get('/history', async (req, res) => {
  try {
    const { date, department_code, status, limit = 100 } = req.query;

    const where = {};
    if (date) where.alert_date = String(date).trim();
    if (department_code) where.department_code = String(department_code).trim().toUpperCase();
    if (status) where.status = String(status).trim().toUpperCase();

    const logs = await prisma.dailyEntryAlertLog.findMany({
      where,
      orderBy: { sent_at: 'desc' },
      take: parseInt(limit, 10) || 100
    });

    res.json({ success: true, count: logs.length, logs });
  } catch (error) {
    console.error('Error fetching alert history:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/daily-entry-alert/test — Send test message (Section 20)
// Does NOT touch Daily Report data. Does NOT complete today's entry.
router.post('/test', async (req, res) => {
  try {
    const { department_code, channel, sender_number, receiver_number, message } = req.body;

    if (!department_code) {
      return res.status(400).json({ success: false, error: 'department_code is required' });
    }

    const deptCode = String(department_code).trim().toUpperCase();

    // Fetch department config
    const config = await prisma.dailyEntryAlertConfig.findUnique({
      where: { department_code: deptCode }
    });

    const activeSender = sender_number !== undefined ? String(sender_number).trim() : (config?.sender_number || '');
    const activeReceiver = receiver_number !== undefined ? String(receiver_number).trim() : (config?.receiver_number || '');
    const activeChannel = channel || config?.channel || 'WhatsApp';

    // Section 9: If sender or receiver missing -> return "Messaging Disabled - Number not configured"
    if (!activeSender || !activeReceiver) {
      return res.status(400).json({
        success: false,
        error: 'Messaging Disabled - Number not configured',
        status: 'DISABLED'
      });
    }

    const { dateStr, timeStr } = getISTDateTime();
    const formattedDate = new Date(`${dateStr}T12:00:00Z`).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });

    const testMessage = message || buildReminderMessage({
      template: config?.message_template,
      departmentName: config?.department_name || deptCode,
      dateStr: formattedDate,
      scheduledTime: timeStr,
      nextReminderTime: 'TEST CYCLE',
      isFinal: false
    });

    // Send isolated notification
    const result = await sendNotification({
      channel: activeChannel,
      senderNumber: activeSender,
      receiverNumber: activeReceiver,
      message: `[TEST NOTIFICATION]\n${testMessage}`,
      departmentCode: deptCode,
      isTest: true
    });

    // Save test log separately for transparency
    const testLog = await prisma.dailyEntryAlertLog.create({
      data: {
        alert_config_id: config?.id || null,
        department_code: deptCode,
        alert_date: dateStr,
        scheduled_time: `TEST-${timeStr}`,
        channel: activeChannel,
        sender_number: activeSender,
        receiver_number: activeReceiver,
        status: result.status || 'TEST_SENT',
        message: testMessage,
        error_message: result.error || null
      }
    });

    res.json({
      success: result.success,
      message: result.success ? `Test message sent to ${activeReceiver} via ${activeChannel}` : `Failed to send test message: ${result.error}`,
      status: result.status,
      log: testLog
    });
  } catch (error) {
    console.error('Error sending test alert:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/daily-entry-alert/trigger-check — Manual execution of scheduler cycle
router.post('/trigger-check', async (req, res) => {
  try {
    const { forceDate, forceTime, forceSlot } = req.body;
    const runResult = await runAlertCycle({ forceDate, forceTime, forceSlot });
    res.json({ success: true, ...runResult });
  } catch (error) {
    console.error('Error triggering alert cycle:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
