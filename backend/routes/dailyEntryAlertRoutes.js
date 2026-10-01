const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = global.prisma || global.globalPrisma || new PrismaClient();
const { 
  sendNotification, 
  buildReminderMessage, 
  beginSenderVerification, 
  verifySenderOtp,
  normalizePhoneE164 
} = require('../services/notificationService');
const { 
  getLiveStatus, 
  runAlertCycle, 
  getISTDateTime, 
  format12Hour 
} = require('../services/dailyEntryAlertScheduler');

// ==========================================
// 1. DEPARTMENT CONFIGURATION APIs
// ==========================================

// GET /api/daily-entry-alert/config — List all configurations with schedules
router.get('/config', async (req, res) => {
  try {
    const configs = await prisma.dailyEntryAlertConfig.findMany({
      include: {
        schedules: {
          orderBy: { slot_time: 'asc' }
        }
      },
      orderBy: { id: 'asc' }
    });
    res.json({ success: true, configs });
  } catch (error) {
    console.error('Error fetching alert configs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/daily-entry-alert/config — Create or upsert configuration
router.post('/config', async (req, res) => {
  try {
    const {
      department_code,
      department_name,
      is_active,
      sender_number,
      receiver_number,
      receiver_number_1,
      receiver_number_2,
      channel,
      start_time,
      rapid_start_time,
      rapid_interval_minutes,
      end_time,
      sunday_enabled,
      message_template,
      final_message_template
    } = req.body;

    if (!department_code) {
      return res.status(400).json({ success: false, error: 'department_code is required' });
    }

    const code = String(department_code).trim().toUpperCase();
    const name = department_name ? String(department_name).trim() : code;

    const r1 = receiver_number_1 !== undefined ? receiver_number_1 : receiver_number;
    const r2 = receiver_number_2;

    const existing = await prisma.dailyEntryAlertConfig.findUnique({
      where: { department_code: code }
    });

    // Check if sender number changed -> invalidate previous verification status
    let senderStatus = existing?.sender_verification_status || 'NOT_VERIFIED';
    let verifiedAt = existing?.sender_verified_at || null;
    if (sender_number !== undefined && normalizePhoneE164(sender_number) !== normalizePhoneE164(existing?.sender_number)) {
      senderStatus = 'NOT_VERIFIED';
      verifiedAt = null;
    }

    const config = await prisma.dailyEntryAlertConfig.upsert({
      where: { department_code: code },
      update: {
        department_name: name,
        is_active: is_active !== undefined ? Boolean(is_active) : true,
        sender_number: sender_number !== undefined ? (sender_number ? normalizePhoneE164(sender_number) : null) : undefined,
        sender_verification_status: senderStatus,
        sender_verified_at: verifiedAt,
        receiver_number: r1 ? normalizePhoneE164(r1) : null,
        receiver_number_1: r1 ? normalizePhoneE164(r1) : null,
        receiver_number_2: r2 ? normalizePhoneE164(r2) : null,
        channel: channel ? String(channel).trim() : 'WhatsApp',
        start_time: start_time || '08:00',
        rapid_start_time: rapid_start_time || '10:30',
        rapid_interval_minutes: Number(rapid_interval_minutes) || 5,
        end_time: end_time || '11:00',
        sunday_enabled: Boolean(sunday_enabled),
        message_template: message_template || null,
        final_message_template: final_message_template || null,
        updated_at: new Date()
      },
      create: {
        department_code: code,
        department_name: name,
        is_active: is_active !== undefined ? Boolean(is_active) : true,
        sender_number: sender_number ? normalizePhoneE164(sender_number) : null,
        sender_verification_status: 'NOT_VERIFIED',
        receiver_number: r1 ? normalizePhoneE164(r1) : null,
        receiver_number_1: r1 ? normalizePhoneE164(r1) : null,
        receiver_number_2: r2 ? normalizePhoneE164(r2) : null,
        channel: channel ? String(channel).trim() : 'WhatsApp',
        start_time: start_time || '08:00',
        rapid_start_time: rapid_start_time || '10:30',
        rapid_interval_minutes: Number(rapid_interval_minutes) || 5,
        end_time: end_time || '11:00',
        sunday_enabled: Boolean(sunday_enabled),
        message_template: message_template || null,
        final_message_template: final_message_template || null
      }
    });

    res.json({ success: true, message: `Configuration saved for ${code}`, config });
  } catch (error) {
    console.error('Error saving alert config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/daily-entry-alert/config/:id — Update configuration by ID
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
      receiver_number_1,
      receiver_number_2,
      channel,
      start_time,
      rapid_start_time,
      rapid_interval_minutes,
      end_time,
      sunday_enabled,
      message_template,
      final_message_template
    } = req.body;

    const existing = await prisma.dailyEntryAlertConfig.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Configuration record not found' });
    }

    const r1 = receiver_number_1 !== undefined ? receiver_number_1 : receiver_number;
    const r2 = receiver_number_2;

    let senderStatus = existing.sender_verification_status;
    let verifiedAt = existing.sender_verified_at;
    if (sender_number !== undefined && normalizePhoneE164(sender_number) !== normalizePhoneE164(existing.sender_number)) {
      senderStatus = 'NOT_VERIFIED';
      verifiedAt = null;
    }

    const updated = await prisma.dailyEntryAlertConfig.update({
      where: { id },
      data: {
        department_name: department_name !== undefined ? String(department_name).trim() : undefined,
        is_active: is_active !== undefined ? Boolean(is_active) : undefined,
        sender_number: sender_number !== undefined ? (sender_number ? normalizePhoneE164(sender_number) : null) : undefined,
        sender_verification_status: senderStatus,
        sender_verified_at: verifiedAt,
        receiver_number: r1 !== undefined ? (r1 ? normalizePhoneE164(r1) : null) : undefined,
        receiver_number_1: r1 !== undefined ? (r1 ? normalizePhoneE164(r1) : null) : undefined,
        receiver_number_2: r2 !== undefined ? (r2 ? normalizePhoneE164(r2) : null) : undefined,
        channel: channel ? String(channel).trim() : undefined,
        start_time: start_time || undefined,
        rapid_start_time: rapid_start_time || undefined,
        rapid_interval_minutes: rapid_interval_minutes ? Number(rapid_interval_minutes) : undefined,
        end_time: end_time || undefined,
        sunday_enabled: sunday_enabled !== undefined ? Boolean(sunday_enabled) : undefined,
        message_template: message_template !== undefined ? message_template : undefined,
        final_message_template: final_message_template !== undefined ? final_message_template : undefined,
        updated_at: new Date()
      }
    });

    res.json({ success: true, message: `Configuration #${id} updated`, config: updated });
  } catch (error) {
    console.error('Error updating alert config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/daily-entry-alert/config/:id — Soft-deactivate configuration
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

    res.json({ success: true, message: `Configuration for ${deactivated.department_code} deactivated`, config: deactivated });
  } catch (error) {
    console.error('Error deactivating alert config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 2. REMINDER TIME SLOTS (SCHEDULE) APIs
// ==========================================

// GET /api/daily-entry-alert/schedules/:configId — List schedules for a department
router.get('/schedules/:configId', async (req, res) => {
  try {
    const configId = parseInt(req.params.configId, 10);
    if (isNaN(configId)) {
      return res.status(400).json({ success: false, error: 'Valid alert_config_id is required' });
    }

    const schedules = await prisma.dailyEntryAlertSchedule.findMany({
      where: { alert_config_id: configId },
      orderBy: { slot_time: 'asc' }
    });

    res.json({ success: true, schedules });
  } catch (error) {
    console.error('Error fetching schedules:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/daily-entry-alert/schedules — Add a new time slot
router.post('/schedules', async (req, res) => {
  try {
    const { alert_config_id, slot_time, slot_type, is_enabled, display_order } = req.body;
    if (!alert_config_id || !slot_time) {
      return res.status(400).json({ success: false, error: 'alert_config_id and slot_time (HH:mm) are required' });
    }

    let cleanTime = String(slot_time).trim();
    if (/^\d:[0-5]\d(:[0-5]\d)?$/.test(cleanTime)) cleanTime = '0' + cleanTime;
    cleanTime = cleanTime.slice(0, 5);

    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(cleanTime)) {
      return res.status(400).json({ success: false, error: 'Invalid time format. Please use 24-hour HH:mm (e.g., 08:30)' });
    }

    const configId = parseInt(alert_config_id, 10);

    // Check duplicate
    const existing = await prisma.dailyEntryAlertSchedule.findFirst({
      where: { alert_config_id: configId, slot_time: cleanTime }
    });
    if (existing) {
      return res.status(400).json({ success: false, error: `Reminder time ${cleanTime} already configured for this department` });
    }

    const newSlot = await prisma.dailyEntryAlertSchedule.create({
      data: {
        alert_config_id: configId,
        slot_time: cleanTime,
        slot_type: ['NORMAL', 'RAPID', 'FINAL'].includes(slot_type) ? slot_type : 'NORMAL',
        is_enabled: is_enabled !== undefined ? Boolean(is_enabled) : true,
        display_order: display_order !== undefined ? Number(display_order) : 0
      }
    });

    res.json({ success: true, message: `Time slot ${cleanTime} added`, schedule: newSlot });
  } catch (error) {
    console.error('Error adding schedule slot:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/daily-entry-alert/schedules/:id — Update slot time, type, or toggle enabled
router.put('/schedules/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ success: false, error: 'Valid schedule ID is required' });

    const { slot_time, slot_type, is_enabled, display_order } = req.body;

    const data = { updated_at: new Date() };
    if (slot_time !== undefined) {
      let cleanTime = String(slot_time).trim();
      if (/^\d:[0-5]\d(:[0-5]\d)?$/.test(cleanTime)) cleanTime = '0' + cleanTime;
      cleanTime = cleanTime.slice(0, 5);

      const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
      if (!timeRegex.test(cleanTime)) {
        return res.status(400).json({ success: false, error: 'Invalid time format. Use HH:mm (e.g. 08:30)' });
      }

      const current = await prisma.dailyEntryAlertSchedule.findUnique({ where: { id } });
      if (!current) return res.status(404).json({ success: false, error: 'Schedule slot not found' });

      // Check duplicate
      const dup = await prisma.dailyEntryAlertSchedule.findFirst({
        where: { alert_config_id: current.alert_config_id, slot_time: cleanTime, id: { not: id } }
      });
      if (dup) {
        return res.status(400).json({ success: false, error: `Time slot ${cleanTime} already exists for this department` });
      }

      data.slot_time = cleanTime;
    }
    if (slot_type !== undefined) {
      data.slot_type = ['NORMAL', 'RAPID', 'FINAL'].includes(slot_type) ? slot_type : 'NORMAL';
    }
    if (is_enabled !== undefined) data.is_enabled = Boolean(is_enabled);
    if (display_order !== undefined) data.display_order = Number(display_order);

    const updated = await prisma.dailyEntryAlertSchedule.update({
      where: { id },
      data
    });

    res.json({ success: true, message: 'Time slot updated', schedule: updated });
  } catch (error) {
    console.error('Error updating schedule slot:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/daily-entry-alert/schedules/:id — Delete a time slot
router.delete('/schedules/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ success: false, error: 'Valid schedule ID is required' });

    await prisma.dailyEntryAlertSchedule.delete({ where: { id } });
    res.json({ success: true, message: 'Time slot deleted successfully' });
  } catch (error) {
    console.error('Error deleting schedule slot:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/daily-entry-alert/schedules/reset-defaults/:configId — Reset schedules to default slots
router.post('/schedules/reset-defaults/:configId', async (req, res) => {
  try {
    const configId = parseInt(req.params.configId, 10);
    if (isNaN(configId)) return res.status(400).json({ success: false, error: 'Valid alert_config_id is required' });

    const DEFAULT_SLOTS = [
      { time: '08:00', type: 'NORMAL', order: 1 },
      { time: '08:30', type: 'NORMAL', order: 2 },
      { time: '09:00', type: 'NORMAL', order: 3 },
      { time: '09:30', type: 'NORMAL', order: 4 },
      { time: '10:00', type: 'NORMAL', order: 5 },
      { time: '10:15', type: 'NORMAL', order: 6 },
      { time: '10:30', type: 'RAPID', order: 7 },
      { time: '10:35', type: 'RAPID', order: 8 },
      { time: '10:40', type: 'RAPID', order: 9 },
      { time: '10:45', type: 'RAPID', order: 10 },
      { time: '10:50', type: 'RAPID', order: 11 },
      { time: '10:55', type: 'RAPID', order: 12 },
      { time: '11:00', type: 'FINAL', order: 13 }
    ];

    await prisma.dailyEntryAlertSchedule.deleteMany({ where: { alert_config_id: configId } });
    await prisma.dailyEntryAlertSchedule.createMany({
      data: DEFAULT_SLOTS.map(s => ({
        alert_config_id: configId,
        slot_time: s.time,
        slot_type: s.type,
        is_enabled: true,
        display_order: s.order
      }))
    });

    const refreshed = await prisma.dailyEntryAlertSchedule.findMany({
      where: { alert_config_id: configId },
      orderBy: { slot_time: 'asc' }
    });

    res.json({ success: true, message: 'Schedule reset to standard default slots', schedules: refreshed });
  } catch (error) {
    console.error('Error resetting schedules:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 3. SENDER OTP VERIFICATION APIs
// ==========================================

// POST /api/daily-entry-alert/sender/verify/start — Start sender verification with provider
router.post('/sender/verify/start', async (req, res) => {
  try {
    const { phone_number, config_id } = req.body;
    if (!phone_number) {
      return res.status(400).json({ success: false, error: 'phone_number is required' });
    }

    const result = await beginSenderVerification({
      phoneNumber: phone_number,
      configId: config_id
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('Error starting sender verification:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/daily-entry-alert/sender/verify/confirm — Confirm sender OTP
router.post('/sender/verify/confirm', async (req, res) => {
  try {
    const { phone_number, otp_code, config_id } = req.body;
    if (!phone_number || !otp_code) {
      return res.status(400).json({ success: false, error: 'phone_number and otp_code are required' });
    }

    const result = await verifySenderOtp({
      phoneNumber: phone_number,
      otpCode: otp_code,
      configId: config_id
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('Error confirming sender OTP:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/daily-entry-alert/sender/status/:id — Check sender verification status
router.get('/sender/status/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const config = await prisma.dailyEntryAlertConfig.findUnique({
      where: { id },
      select: {
        id: true,
        department_code: true,
        sender_number: true,
        sender_verification_status: true,
        sender_verified_at: true
      }
    });

    if (!config) return res.status(404).json({ success: false, error: 'Config not found' });
    res.json({ success: true, status: config });
  } catch (error) {
    console.error('Error fetching sender status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 4. STATUS & LOGS APIs
// ==========================================

// GET /api/daily-entry-alert/status — Live department status overview
router.get('/status', async (req, res) => {
  try {
    const queryDate = req.query.date ? String(req.query.date).trim() : null;
    const statusData = await getLiveStatus(queryDate);
    res.json({ success: true, ...statusData });
  } catch (error) {
    console.error('Error fetching live alert status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/daily-entry-alert/history — Alert delivery logs
router.get('/history', async (req, res) => {
  try {
    const { department_code, date, status, limit = 100, page = 1 } = req.query;

    const where = {};
    if (department_code && department_code !== 'ALL') {
      where.department_code = String(department_code).trim().toUpperCase();
    }
    if (date) {
      where.alert_date = String(date).trim();
    }
    if (status && status !== 'ALL') {
      where.status = String(status).trim();
    }

    const take = Math.min(parseInt(limit, 10) || 100, 300);
    const skip = ((parseInt(page, 10) || 1) - 1) * take;

    const [logs, totalCount] = await Promise.all([
      prisma.dailyEntryAlertLog.findMany({
        where,
        orderBy: { id: 'desc' },
        take,
        skip,
        include: {
          config: {
            select: { department_name: true }
          }
        }
      }),
      prisma.dailyEntryAlertLog.count({ where })
    ]);

    res.json({
      success: true,
      totalCount,
      page: parseInt(page, 10) || 1,
      logs
    });
  } catch (error) {
    console.error('Error fetching alert logs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 5. TEST MESSAGE DISPATCH
// ==========================================

// POST /api/daily-entry-alert/test — Real test message without altering Daily Report records
router.post('/test', async (req, res) => {
  try {
    const { department_code, receiver_number, receiver_number_1, receiver_number_2, channel, sender_number, message } = req.body;

    if (!department_code) {
      return res.status(400).json({ success: false, error: 'department_code is required' });
    }

    const deptCode = String(department_code).trim().toUpperCase();

    const config = await prisma.dailyEntryAlertConfig.findUnique({
      where: { department_code: deptCode }
    });

    const activeSender = sender_number !== undefined ? String(sender_number).trim() : (config?.sender_number || '');
    const activeChannel = channel || config?.channel || 'WhatsApp';

    const r1 = receiver_number_1 || receiver_number || config?.receiver_number_1 || config?.receiver_number;
    const r2 = receiver_number_2 || config?.receiver_number_2;

    const receivers = [];
    if (r1 && String(r1).trim()) receivers.push(normalizePhoneE164(r1));
    if (r2 && String(r2).trim() && normalizePhoneE164(r2) !== normalizePhoneE164(r1)) {
      receivers.push(normalizePhoneE164(r2));
    }

    if (!activeSender) {
      return res.status(400).json({
        success: false,
        error: 'Messaging Disabled - Sender number not configured',
        status: 'DISABLED'
      });
    }

    if (receivers.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Messaging Disabled - Receiver number not configured',
        status: 'DISABLED'
      });
    }

    const { dateStr, timeStr } = getISTDateTime();
    const testMessage = message || `SPUPL DAILY ENTRY ALERT - TEST MESSAGE

Department: ${config?.department_name || deptCode}

This is a test notification from the SPUPL Loom Planning ERP.`;

    const dispatchResults = [];
    for (const rec of receivers) {
      const result = await sendNotification({
        channel: activeChannel,
        senderNumber: activeSender,
        receiverNumber: rec,
        message: testMessage,
        departmentCode: deptCode,
        isTest: true
      });

      const testLog = await prisma.dailyEntryAlertLog.create({
        data: {
          alert_config_id: config?.id || null,
          department_code: deptCode,
          alert_date: dateStr,
          scheduled_time: `TEST-${timeStr}`,
          channel: activeChannel,
          sender_number: activeSender,
          receiver_number: rec,
          status: result.status || 'TEST_SENT',
          message: testMessage,
          provider_message_id: result.messageId || null,
          provider_status: result.providerStatus || null,
          error_message: result.error || null,
          is_test: true
        }
      });

      dispatchResults.push({
        receiver: rec,
        success: result.success,
        status: result.status,
        logId: testLog.id,
        error: result.error
      });
    }

    const allSuccessful = dispatchResults.every(r => r.success);
    res.json({
      success: allSuccessful,
      message: `Test message dispatched to ${receivers.join(', ')} via ${activeChannel}`,
      results: dispatchResults
    });
  } catch (error) {
    console.error('Error sending test alert:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 6. SCHEDULER DISPATCHER APIs
// ==========================================

// POST /api/daily-entry-alert/run — Idempotent scheduler endpoint
router.post('/run', async (req, res) => {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers['authorization'];
    const passedSecret = req.query.secret || req.body?.secret || (authHeader ? authHeader.replace('Bearer ', '') : null);

    // If CRON_SECRET is configured, enforce security
    if (cronSecret && passedSecret !== cronSecret) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Invalid CRON_SECRET' });
    }

    const { forceDate, forceTime, forceSlot } = req.body || {};
    const runResult = await runAlertCycle({ forceDate, forceTime, forceSlot });
    res.json({ success: true, ...runResult });
  } catch (error) {
    console.error('Error in alert run cycle:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/daily-entry-alert/trigger-check — Manual execution for "Run Check Now" button
router.post('/trigger-check', async (req, res) => {
  try {
    const { forceDate, forceTime, forceSlot } = req.body || {};
    const runResult = await runAlertCycle({ forceDate, forceTime, forceSlot });
    res.json({ success: true, ...runResult });
  } catch (error) {
    console.error('Error triggering alert cycle:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
