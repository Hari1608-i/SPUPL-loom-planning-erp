const { PrismaClient } = require('@prisma/client');
const prisma = global.prisma || global.globalPrisma || new PrismaClient();
const { sendNotification, buildReminderMessage } = require('./notificationService');

/**
 * Standard scheduled reminder times
 */
const DEFAULT_SCHEDULE = [
  '08:00',
  '08:30',
  '09:00',
  '09:30',
  '10:00',
  '10:15',
  '10:30',
  '10:35',
  '10:40',
  '10:45',
  '10:50',
  '10:55',
  '11:00'
];

/**
 * Get current date & time in IST (Asia/Kolkata)
 */
function getISTDateTime(overrideDate = null, overrideTime = null) {
  const now = new Date();
  
  // Format to IST
  const istString = now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
  const istDate = new Date(istString);

  const yyyy = istDate.getFullYear();
  const mm = String(istDate.getMonth() + 1).padStart(2, '0');
  const dd = String(istDate.getDate()).padStart(2, '0');
  const dateStr = overrideDate || `${yyyy}-${mm}-${dd}`;

  const hours = String(istDate.getHours()).padStart(2, '0');
  const minutes = String(istDate.getMinutes()).padStart(2, '0');
  const timeStr = overrideTime || `${hours}:${minutes}`;

  const dayOfWeek = istDate.getDay(); // 0 = Sunday

  return {
    dateStr,
    timeStr,
    dayOfWeek,
    isSunday: dayOfWeek === 0,
    timestamp: now
  };
}

/**
 * Convert 24-hr time 'HH:mm' to 12-hr display 'hh:mm AM/PM'
 */
function format12Hour(timeStr) {
  if (!timeStr || !timeStr.includes(':')) return timeStr;
  const [hStr, mStr] = timeStr.split(':');
  const h = parseInt(hStr, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 === 0 ? 12 : h % 12;
  return `${String(displayH).padStart(2, '0')}:${mStr} ${ampm}`;
}

/**
 * Generate full schedule array for a department config
 */
function getDepartmentSchedule(config) {
  const start = config.start_time || '08:00';
  const rapidStart = config.rapid_start_time || '10:30';
  const rapidInterval = config.rapid_interval_minutes || 5;
  const end = config.end_time || '11:00';

  // If standard defaults match, return DEFAULT_SCHEDULE
  if (start === '08:00' && rapidStart === '10:30' && rapidInterval === 5 && end === '11:00') {
    return DEFAULT_SCHEDULE;
  }

  // Otherwise calculate dynamically
  const times = [];
  // Standard fixed milestones before rapid start
  const baseTimes = ['08:00', '08:30', '09:00', '09:30', '10:00', '10:15', '10:30'];
  baseTimes.forEach(t => {
    if (t >= start && t <= rapidStart && !times.includes(t)) {
      times.push(t);
    }
  });

  // Rapid interval times
  const [rapidH, rapidM] = rapidStart.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);
  let curMins = rapidH * 60 + rapidM + rapidInterval;
  const endMins = endH * 60 + endM;

  while (curMins <= endMins) {
    const hh = String(Math.floor(curMins / 60)).padStart(2, '0');
    const mm = String(curMins % 60).padStart(2, '0');
    const timeStr = `${hh}:${mm}`;
    if (!times.includes(timeStr)) {
      times.push(timeStr);
    }
    curMins += rapidInterval;
  }

  return times.sort();
}

/**
 * Check if a department has completed its daily report for dateStr
 */
async function checkDepartmentCompleted(deptCode, dateStr) {
  const code = String(deptCode).trim().toUpperCase();

  // Handle department codes & potential aliases
  let deptCodesToCheck = [code];
  if (code === 'HRD') {
    deptCodesToCheck.push('HRD_TRANSPORT');
  } else if (code === 'TRANSPORT') {
    deptCodesToCheck.push('HRD_TRANSPORT');
  }

  const entries = await prisma.dailyReportEntry.findMany({
    where: {
      report_date: dateStr,
      department_code: { in: deptCodesToCheck },
      OR: [
        { actual_value: { not: null } },
        { raw_value: { not: null, not: '' } }
      ]
    },
    select: {
      id: true,
      department_code: true,
      metric_code: true,
      actual_value: true,
      raw_value: true,
      createdAt: true,
      updatedAt: true
    },
    take: 10
  });

  if (code === 'TRANSPORT') {
    // Check if specifically transport trips metric exists
    const hasTransport = entries.some(e => e.metric_code === 'TRANSPORT_TRIPS' || e.department_code === 'TRANSPORT');
    return {
      completed: hasTransport,
      entryCount: entries.length,
      lastUpdatedAt: entries[0]?.updatedAt || null
    };
  }

  return {
    completed: entries.length > 0,
    entryCount: entries.length,
    lastUpdatedAt: entries[0]?.updatedAt || null
  };
}

/**
 * Run a full alert evaluation cycle
 */
async function runAlertCycle({ forceDate = null, forceTime = null, forceSlot = null } = {}) {
  const { dateStr, timeStr, isSunday } = getISTDateTime(forceDate, forceTime);
  const currentSlot = forceSlot || timeStr;

  const results = [];

  // Fetch all configs
  const configs = await prisma.dailyEntryAlertConfig.findMany({
    orderBy: { id: 'asc' }
  });

  for (const config of configs) {
    const deptCode = config.department_code;
    const deptName = config.department_name || deptCode;

    // 1. Inactive check
    if (!config.is_active) {
      results.push({
        department_code: deptCode,
        status: 'DISABLED',
        reason: 'Department is configured as INACTIVE'
      });
      continue;
    }

    // 2. Sunday check
    if (isSunday && !config.sunday_enabled) {
      results.push({
        department_code: deptCode,
        status: 'SKIPPED_SUNDAY',
        reason: 'Sunday reminders are disabled'
      });
      continue;
    }

    // 3. Completion check
    const { completed } = await checkDepartmentCompleted(deptCode, dateStr);
    if (completed) {
      results.push({
        department_code: deptCode,
        status: 'STOPPED_COMPLETED',
        reason: 'Daily report entry is already COMPLETED for today'
      });
      continue;
    }

    // 4. Schedule match check
    const schedule = getDepartmentSchedule(config);
    const isMatchingSlot = schedule.includes(currentSlot);

    if (!isMatchingSlot && !forceSlot) {
      results.push({
        department_code: deptCode,
        status: 'SKIPPED_TIME',
        reason: `Current time ${currentSlot} is not a scheduled slot`
      });
      continue;
    }

    const scheduledTime = forceSlot || currentSlot;

    // 5. Duplicate protection check (Mandatory Section 18)
    const existingLog = await prisma.dailyEntryAlertLog.findUnique({
      where: {
        department_code_alert_date_scheduled_time: {
          department_code: deptCode,
          alert_date: dateStr,
          scheduled_time: scheduledTime
        }
      }
    });

    if (existingLog) {
      results.push({
        department_code: deptCode,
        status: 'SKIPPED_DUPLICATE',
        reason: `Reminder for ${scheduledTime} on ${dateStr} has already been recorded`
      });
      continue;
    }

    // 6. Number verification (Mandatory Section 9: NO NUMBER = NO MESSAGE)
    const hasSender = Boolean(config.sender_number && String(config.sender_number).trim());
    const hasReceiver = Boolean(config.receiver_number && String(config.receiver_number).trim());

    if (!hasSender || !hasReceiver) {
      // Record disabled log
      await prisma.dailyEntryAlertLog.create({
        data: {
          alert_config_id: config.id,
          department_code: deptCode,
          alert_date: dateStr,
          scheduled_time: scheduledTime,
          channel: config.channel || 'WhatsApp',
          sender_number: config.sender_number || null,
          receiver_number: config.receiver_number || null,
          status: 'DISABLED',
          message: null,
          error_message: 'Messaging Disabled - Number not configured'
        }
      });

      results.push({
        department_code: deptCode,
        status: 'DISABLED',
        reason: 'Messaging Disabled - Number not configured'
      });
      continue;
    }

    // 7. Calculate next reminder time for template
    const currentIndex = schedule.indexOf(scheduledTime);
    const nextSlot = currentIndex >= 0 && currentIndex < schedule.length - 1 ? schedule[currentIndex + 1] : null;
    const nextReminderDisplay = nextSlot ? format12Hour(nextSlot) : 'None (Final Reminder)';
    const isFinal = scheduledTime === config.end_time || scheduledTime === '11:00';

    // 8. Build message
    const formattedDate = new Date(`${dateStr}T12:00:00Z`).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });

    const messageText = buildReminderMessage({
      template: config.message_template,
      departmentName: deptName,
      dateStr: formattedDate,
      scheduledTime,
      nextReminderTime: nextReminderDisplay,
      isFinal
    });

    // 9. Send Notification via Isolated Service
    const sendResult = await sendNotification({
      channel: config.channel,
      senderNumber: config.sender_number,
      receiverNumber: config.receiver_number,
      message: messageText,
      departmentCode: deptCode,
      isTest: false
    });

    // 10. Persist Log
    await prisma.dailyEntryAlertLog.create({
      data: {
        alert_config_id: config.id,
        department_code: deptCode,
        alert_date: dateStr,
        scheduled_time: scheduledTime,
        channel: config.channel || 'WhatsApp',
        sender_number: config.sender_number,
        receiver_number: config.receiver_number,
        status: sendResult.status || (sendResult.success ? 'SENT' : 'FAILED'),
        message: messageText,
        error_message: sendResult.error || null
      }
    });

    results.push({
      department_code: deptCode,
      status: sendResult.status,
      scheduled_time: scheduledTime,
      success: sendResult.success,
      channel: config.channel
    });
  }

  return {
    evaluated_at: new Date().toISOString(),
    dateStr,
    currentSlot,
    results
  };
}

/**
 * Get comprehensive live status for all departments on dateStr
 */
async function getLiveStatus(queryDate = null) {
  const { dateStr, timeStr, isSunday } = getISTDateTime(queryDate);

  const configs = await prisma.dailyEntryAlertConfig.findMany({
    orderBy: { id: 'asc' }
  });

  // Fetch today's logs for all departments
  const logs = await prisma.dailyEntryAlertLog.findMany({
    where: { alert_date: dateStr },
    orderBy: { sent_at: 'desc' }
  });

  const departmentStatuses = [];

  for (const config of configs) {
    const deptCode = config.department_code;
    const { completed, lastUpdatedAt } = await checkDepartmentCompleted(deptCode, dateStr);

    // Find logs for this department
    const deptLogs = logs.filter(l => l.department_code === deptCode);
    const sentLogs = deptLogs.filter(l => l.status === 'SENT' || l.status === 'TEST_SENT');
    const lastReminderLog = sentLogs[0] || deptLogs[0] || null;

    // Determine reminder status
    let reminderStatus = 'ACTIVE';
    if (!config.is_active) {
      reminderStatus = 'DISABLED';
    } else if (isSunday && !config.sunday_enabled) {
      reminderStatus = 'SUNDAY_OFF';
    } else if (completed) {
      reminderStatus = 'STOPPED';
    } else if (timeStr > (config.end_time || '11:00')) {
      reminderStatus = 'COMPLETED_FOR_DAY';
    }

    // Determine next scheduled reminder
    const schedule = getDepartmentSchedule(config);
    let nextReminder = null;

    if (reminderStatus === 'ACTIVE') {
      const remainingSlots = schedule.filter(slot => slot >= timeStr);
      if (remainingSlots.length > 0) {
        nextReminder = format12Hour(remainingSlots[0]);
      } else {
        nextReminder = 'Past Final Reminder (11:00 AM)';
      }
    } else if (reminderStatus === 'STOPPED') {
      nextReminder = 'None (Entry Completed)';
    } else if (reminderStatus === 'DISABLED') {
      nextReminder = 'None (Department Inactive)';
    } else if (reminderStatus === 'SUNDAY_OFF') {
      nextReminder = 'None (Sunday)';
    } else {
      nextReminder = 'None (Schedule Ended)';
    }

    const hasSender = Boolean(config.sender_number && String(config.sender_number).trim());
    const hasReceiver = Boolean(config.receiver_number && String(config.receiver_number).trim());

    departmentStatuses.push({
      id: config.id,
      department_code: deptCode,
      department_name: config.department_name,
      is_active: config.is_active,
      channel: config.channel,
      sender_number: config.sender_number,
      receiver_number: config.receiver_number,
      messaging_ready: hasSender && hasReceiver,
      messaging_status: (hasSender && hasReceiver) ? 'Ready' : 'Messaging Disabled - Number not configured',
      today_entry: completed ? 'COMPLETED' : 'PENDING',
      reminder_status: reminderStatus,
      last_reminder: lastReminderLog ? `${format12Hour(lastReminderLog.scheduled_time)} (${lastReminderLog.status})` : 'None',
      last_reminder_time: lastReminderLog ? lastReminderLog.sent_at : null,
      next_reminder: nextReminder,
      completed_at: completed ? lastUpdatedAt : null,
      config: {
        start_time: config.start_time,
        rapid_start_time: config.rapid_start_time,
        rapid_interval_minutes: config.rapid_interval_minutes,
        end_time: config.end_time,
        sunday_enabled: config.sunday_enabled,
        message_template: config.message_template
      }
    });
  }

  return {
    date: dateStr,
    current_time: timeStr,
    is_sunday: isSunday,
    departments: departmentStatuses
  };
}

/**
 * Background Scheduler Runner (Checks once every minute)
 */
let schedulerInterval = null;

function startScheduler() {
  if (schedulerInterval) return;

  console.log('[DAILY_ENTRY_ALERT] Scheduler started. Checking every 60 seconds.');

  // Run initial check after 5 seconds to catch up
  setTimeout(() => {
    runAlertCycle().catch(err => console.error('[DAILY_ENTRY_ALERT_RUN_ERROR]:', err.message));
  }, 5000);

  schedulerInterval = setInterval(() => {
    runAlertCycle().catch(err => console.error('[DAILY_ENTRY_ALERT_RUN_ERROR]:', err.message));
  }, 60000);
}

function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('[DAILY_ENTRY_ALERT] Scheduler stopped.');
  }
}

module.exports = {
  getISTDateTime,
  format12Hour,
  getDepartmentSchedule,
  checkDepartmentCompleted,
  runAlertCycle,
  getLiveStatus,
  startScheduler,
  stopScheduler
};
