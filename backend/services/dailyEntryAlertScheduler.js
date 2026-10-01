const { PrismaClient } = require('@prisma/client');
const prisma = global.prisma || global.globalPrisma || new PrismaClient();
const { sendNotification, buildReminderMessage, normalizePhoneE164 } = require('./notificationService');

/**
 * Standard default scheduled reminder times
 */
const DEFAULT_SCHEDULE = [
  { time: '08:00', type: 'NORMAL' },
  { time: '08:30', type: 'NORMAL' },
  { time: '09:00', type: 'NORMAL' },
  { time: '09:30', type: 'NORMAL' },
  { time: '10:00', type: 'NORMAL' },
  { time: '10:15', type: 'NORMAL' },
  { time: '10:30', type: 'RAPID' },
  { time: '10:35', type: 'RAPID' },
  { time: '10:40', type: 'RAPID' },
  { time: '10:45', type: 'RAPID' },
  { time: '10:50', type: 'RAPID' },
  { time: '10:55', type: 'RAPID' },
  { time: '11:00', type: 'FINAL' }
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

  const dayOfWeek = overrideDate 
    ? new Date(`${overrideDate}T12:00:00+05:30`).getDay() 
    : istDate.getDay(); // 0 = Sunday

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
 * Load schedule slots for a department config from DB
 */
async function getDepartmentScheduleSlots(configId) {
  try {
    const slots = await prisma.dailyEntryAlertSchedule.findMany({
      where: {
        alert_config_id: Number(configId),
        is_enabled: true
      },
      orderBy: { slot_time: 'asc' }
    });

    if (slots && slots.length > 0) {
      return slots.map(s => ({
        time: s.slot_time,
        type: s.slot_type || 'NORMAL',
        id: s.id
      }));
    }
  } catch (err) {
    console.error('Failed to load slots from DailyEntryAlertSchedule:', err.message);
  }

  return DEFAULT_SCHEDULE;
}

/**
 * Check if a department has completed its daily report for dateStr
 */
async function checkDepartmentCompleted(deptCode, dateStr) {
  const code = String(deptCode).trim().toUpperCase();

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

    // 2. Sunday check (Sunday disabled)
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

    // 4. Load configured dynamic schedule slots
    const scheduleSlots = await getDepartmentScheduleSlots(config.id);
    const times = scheduleSlots.map(s => s.time);
    const isMatchingSlot = times.includes(currentSlot);

    if (!isMatchingSlot && !forceSlot) {
      results.push({
        department_code: deptCode,
        status: 'SKIPPED_TIME',
        reason: `Current time ${currentSlot} is not an active scheduled slot`
      });
      continue;
    }

    const scheduledTime = forceSlot || currentSlot;
    const currentSlotObj = scheduleSlots.find(s => s.time === scheduledTime);
    const isFinalSlot = currentSlotObj ? (currentSlotObj.type === 'FINAL' || scheduleSlots[scheduleSlots.length - 1].time === scheduledTime) : false;

    // 5. Check if reminders already sent after final slot
    const finalSlotTime = scheduleSlots[scheduleSlots.length - 1]?.time || '11:00';
    if (scheduledTime > finalSlotTime) {
      results.push({
        department_code: deptCode,
        status: 'STOPPED_FINAL_REACHED',
        reason: `Final configured slot (${finalSlotTime}) has already passed`
      });
      continue;
    }

    // 6. Gather Receiver Numbers (Receiver 1 & Receiver 2)
    const rec1 = config.receiver_number_1 || config.receiver_number;
    const rec2 = config.receiver_number_2;

    const receiversToSend = [];
    if (rec1 && String(rec1).trim()) receiversToSend.push(normalizePhoneE164(rec1));
    if (rec2 && String(rec2).trim() && normalizePhoneE164(rec2) !== normalizePhoneE164(rec1)) {
      receiversToSend.push(normalizePhoneE164(rec2));
    }

    // Sender check
    const hasSender = Boolean(config.sender_number && String(config.sender_number).trim());
    const isSenderVerified = config.sender_verification_status === 'VERIFIED';

    if (!hasSender) {
      // Missing sender
      results.push({
        department_code: deptCode,
        status: 'DISABLED - SENDER MISSING',
        reason: 'Sender number not configured'
      });
      continue;
    }

    if (receiversToSend.length === 0) {
      // Missing both receivers
      results.push({
        department_code: deptCode,
        status: 'DISABLED - RECEIVER MISSING',
        reason: 'Neither Receiver 1 nor Receiver 2 configured'
      });
      continue;
    }

    if (!isSenderVerified) {
      // Sender exists but unverified
      results.push({
        department_code: deptCode,
        status: 'DISABLED - SENDER NOT VERIFIED',
        reason: 'Sender number is not yet verified'
      });
      continue;
    }

    // 7. Calculate Next Reminder Time
    const nextSlot = times.find(t => t > scheduledTime);
    const nextReminderDisplay = nextSlot ? format12Hour(nextSlot) : 'Schedule Ended';

    // 8. Build message body
    const messageBody = buildReminderMessage({
      template: isFinalSlot ? (config.final_message_template || config.message_template) : config.message_template,
      departmentName: deptName,
      dateStr,
      scheduledTime: format12Hour(scheduledTime),
      nextReminderTime: nextReminderDisplay,
      isFinal: isFinalSlot
    });

    // 9. Send to each receiver with duplicate protection per receiver
    const deptDispatches = [];
    for (const receiver of receiversToSend) {
      // Check existing log for this department + date + scheduled_time + receiver
      const existingLog = await prisma.dailyEntryAlertLog.findFirst({
        where: {
          department_code: deptCode,
          alert_date: dateStr,
          scheduled_time: scheduledTime,
          receiver_number: receiver,
          is_test: false
        }
      });

      if (existingLog) {
        deptDispatches.push({
          receiver,
          status: 'DUPLICATE_BLOCKED',
          reason: `Reminder already recorded for ${receiver} at ${scheduledTime}`
        });
        continue;
      }

      // Re-verify department not completed right before dispatch (race condition safeguard)
      const recheck = await checkDepartmentCompleted(deptCode, dateStr);
      if (recheck.completed) {
        deptDispatches.push({
          receiver,
          status: 'STOPPED_COMPLETED',
          reason: 'Daily Report was completed immediately prior to dispatch'
        });
        break;
      }

      // Dispatch notification
      const dispatchResult = await sendNotification({
        channel: config.channel || 'WhatsApp',
        senderNumber: config.sender_number,
        receiverNumber: receiver,
        message: messageBody,
        departmentCode: deptCode,
        isTest: false
      });

      // Record log in database
      const savedLog = await prisma.dailyEntryAlertLog.create({
        data: {
          alert_config_id: config.id,
          department_code: deptCode,
          alert_date: dateStr,
          scheduled_time: scheduledTime,
          channel: config.channel || 'WhatsApp',
          sender_number: config.sender_number,
          receiver_number: receiver,
          status: dispatchResult.status,
          message: messageBody,
          provider_message_id: dispatchResult.messageId || null,
          provider_status: dispatchResult.providerStatus || null,
          error_message: dispatchResult.error || null,
          is_test: false
        }
      });

      deptDispatches.push({
        receiver,
        status: dispatchResult.status,
        logId: savedLog.id,
        providerMessageId: dispatchResult.messageId
      });
    }

    results.push({
      department_code: deptCode,
      status: isFinalSlot ? 'FINAL_SENT' : 'ACTIVE_DISPATCHED',
      scheduled_time: scheduledTime,
      dispatches: deptDispatches
    });
  }

  return {
    cycle_time: currentSlot,
    cycle_date: dateStr,
    is_sunday: isSunday,
    processed_count: results.length,
    results
  };
}

/**
 * Get live overview status of all departments
 */
async function getLiveStatus(queryDate = null) {
  const { dateStr, timeStr, isSunday } = getISTDateTime(queryDate);

  let configs = await prisma.dailyEntryAlertConfig.findMany({
    include: {
      schedules: {
        orderBy: { slot_time: 'asc' }
      }
    },
    orderBy: { id: 'asc' }
  });

  // Auto-seed if empty
  if (configs.length === 0) {
    const defaultDepts = [
      { code: 'PLANNING', name: '1. PLANNING', r1: '+919789268826' },
      { code: 'SIZING', name: '2. SIZING' },
      { code: 'WEAVING', name: '3. WEAVING' },
      { code: 'GREIGE_INSPECTION', name: '4. GREIGE INSPECTION (GREY WAREHOUSE)' },
      { code: 'FINISHED_INSPECTION', name: '5. FINISHED INSPECTION' },
      { code: 'SAMPLING', name: '6. SAMPLING' },
      { code: 'MENDING', name: '7. MENDING' },
      { code: 'PROCESSING_DYEING', name: '8. PROCESSING & DYEING' },
      { code: 'YARN_DEPARTMENT', name: '9. YARN DEPARTMENT' },
      { code: 'OUTSOURCING', name: '10. OUTSOURCING' },
      { code: 'DISPATCH_PACKING', name: '11. DISPATCH & PACKING' },
      { code: 'SPINNING', name: '12. SPINNING' },
      { code: 'HRD', name: '13. HRD' },
      { code: 'TRANSPORT', name: '14. TRANSPORT' }
    ];

    for (const d of defaultDepts) {
      await prisma.dailyEntryAlertConfig.create({
        data: {
          department_code: d.code,
          department_name: d.name,
          is_active: true,
          channel: 'WhatsApp',
          receiver_number_1: d.r1 || '+919191111111',
          sender_number: '+919677139280',
          sender_verification_status: 'VERIFIED',
          schedules: {
            create: DEFAULT_SCHEDULE.map(s => ({
              slot_time: s.time,
              slot_type: s.type,
              is_enabled: true
            }))
          }
        }
      });
    }

    configs = await prisma.dailyEntryAlertConfig.findMany({
      include: { schedules: { orderBy: { slot_time: 'asc' } } },
      orderBy: { id: 'asc' }
    });
  }

  const departmentStatuses = await Promise.all(configs.map(async (config) => {
    const deptCode = config.department_code;
    const { completed, entryCount, lastUpdatedAt } = await checkDepartmentCompleted(deptCode, dateStr);

    // Dynamic slots
    const slots = (config.schedules && config.schedules.length > 0)
      ? config.schedules.filter(s => s.is_enabled).map(s => s.slot_time)
      : DEFAULT_SCHEDULE.map(s => s.time);

    // Latest log today
    const latestLog = await prisma.dailyEntryAlertLog.findFirst({
      where: {
        department_code: deptCode,
        alert_date: dateStr
      },
      orderBy: { id: 'desc' }
    });

    // Calculate Reminder Status
    let reminderStatus = 'WAITING';
    if (!config.is_active) {
      reminderStatus = 'DISABLED';
    } else if (isSunday && !config.sunday_enabled) {
      reminderStatus = 'SUNDAY_OFF';
    } else if (completed) {
      reminderStatus = 'STOPPED';
    } else {
      const finalSlot = slots[slots.length - 1] || '11:00';
      if (timeStr > finalSlot) {
        reminderStatus = 'FINAL_SENT';
      } else {
        reminderStatus = 'ACTIVE';
      }
    }

    // Determine Next Reminder Slot
    let nextReminder = 'None (Completed)';
    if (!completed && config.is_active && (!isSunday || config.sunday_enabled)) {
      const nextTime = slots.find(t => t > timeStr);
      if (nextTime) {
        nextReminder = format12Hour(nextTime);
      } else {
        nextReminder = 'None (Schedule Ended)';
      }
    }

    // Determine Last Reminder Display
    let lastReminderDisplay = 'None';
    if (latestLog) {
      lastReminderDisplay = `${format12Hour(latestLog.scheduled_time)} (${latestLog.status})`;
    }

    return {
      department_code: deptCode,
      department_name: config.department_name,
      is_active: config.is_active,
      today_entry: completed ? 'COMPLETED' : 'PENDING',
      entry_count: entryCount,
      last_entry_time: lastUpdatedAt,
      reminder_status: reminderStatus,
      last_reminder: lastReminderDisplay,
      next_reminder: nextReminder,
      sender_number: config.sender_number || '',
      sender_verification_status: config.sender_verification_status || 'NOT_VERIFIED',
      receiver_number_1: config.receiver_number_1 || config.receiver_number || '',
      receiver_number_2: config.receiver_number_2 || '',
      channel: config.channel || 'WhatsApp',
      schedules: config.schedules || []
    };
  }));

  // Summary counts
  const total = departmentStatuses.length;
  const completedCount = departmentStatuses.filter(d => d.today_entry === 'COMPLETED').length;
  const pendingCount = total - completedCount;
  const activeReminders = departmentStatuses.filter(d => d.reminder_status === 'ACTIVE').length;

  return {
    current_date: dateStr,
    current_time: format12Hour(timeStr),
    raw_time: timeStr,
    is_sunday: isSunday,
    summary: {
      total,
      completed: completedCount,
      pending: pendingCount,
      reminders_active: activeReminders
    },
    departments: departmentStatuses
  };
}

module.exports = {
  getISTDateTime,
  format12Hour,
  getDepartmentScheduleSlots,
  checkDepartmentCompleted,
  runAlertCycle,
  getLiveStatus
};
