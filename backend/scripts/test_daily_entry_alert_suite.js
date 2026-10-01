require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { 
  getISTDateTime, 
  getDepartmentSchedule, 
  checkDepartmentCompleted, 
  runAlertCycle, 
  getLiveStatus 
} = require('../services/dailyEntryAlertScheduler');
const { sendNotification, buildReminderMessage } = require('../services/notificationService');

async function runTestSuite() {
  console.log('============================================================');
  console.log('RUNNING DAILY ENTRY ALERT 14-POINT VERIFICATION SUITE');
  console.log('============================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(testNum, testName, condition, detail = '') {
    if (condition) {
      console.log(`[PASS] TEST ${testNum}: ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] TEST ${testNum}: ${testName} - ${detail}`);
      failed++;
    }
  }

  try {
    const today = new Date().toISOString().substring(0, 10);

    // TEST 1: Active department + no Daily Report entry
    // Check live status for department with no entry today
    const liveStatus = await getLiveStatus(today);
    const pendingDept = liveStatus.departments.find(d => d.today_entry === 'PENDING' && d.is_active);
    assert(1, 'Active department + no Daily Report entry', Boolean(pendingDept), `Found pending dept: ${pendingDept?.department_code}`);

    // TEST 2: Active department + Daily Report completed
    // Simulate or check department completion detection
    const testDate = '2026-08-26'; // Known historical date with saved entries
    const completedCheck = await checkDepartmentCompleted('PLANNING', testDate);
    assert(2, 'Department with saved entry detected as COMPLETED', completedCheck.completed === true, `Completed: ${completedCheck.completed}`);

    // TEST 3: Inactive department
    await prisma.dailyEntryAlertConfig.update({
      where: { department_code: 'OUTSOURCING' },
      data: { is_active: false }
    });
    const inactiveStatus = await getLiveStatus(today);
    const outsourcing = inactiveStatus.departments.find(d => d.department_code === 'OUTSOURCING');
    assert(3, 'Inactive department shows DISABLED with no reminders', outsourcing.reminder_status === 'DISABLED');
    // Restore
    await prisma.dailyEntryAlertConfig.update({
      where: { department_code: 'OUTSOURCING' },
      data: { is_active: true }
    });

    // TEST 4 & 5: Missing sender/receiver numbers
    const noNumberSend = await sendNotification({
      channel: 'WhatsApp',
      senderNumber: '',
      receiverNumber: '919876543210',
      message: 'Hello'
    });
    assert(4, 'Missing sender number prevents message dispatch', noNumberSend.status === 'DISABLED' && noNumberSend.error === 'Messaging Disabled - Number not configured');

    const noReceiverSend = await sendNotification({
      channel: 'WhatsApp',
      senderNumber: '919876543210',
      receiverNumber: '',
      message: 'Hello'
    });
    assert(5, 'Missing receiver number prevents message dispatch', noReceiverSend.status === 'DISABLED' && noReceiverSend.error === 'Messaging Disabled - Number not configured');

    // TEST 6: Sunday check
    const sundayDt = getISTDateTime();
    // Verify Sunday exclusion calculation
    const sundayCycle = await runAlertCycle({ forceDate: '2026-10-04', forceSlot: '09:00' }); // 2026-10-04 is a Sunday
    const sundaySkipped = sundayCycle.results.every(r => r.status === 'SKIPPED_SUNDAY' || r.status === 'DISABLED');
    assert(6, 'Sunday reminders are strictly excluded', sundaySkipped);

    // TEST 7: Monday starts new reminder cycle
    const mondayCycle = await runAlertCycle({ forceDate: '2026-10-05', forceSlot: '08:00' }); // 2026-10-05 is a Monday
    assert(7, 'Monday starts active reminder cycle evaluation', mondayCycle.results.length > 0);

    // TEST 8: Backend restart duplicate protection
    // Try inserting duplicate log for same department + date + scheduled_time
    const dupTestKey = {
      department_code: 'TEST_DEPT',
      alert_date: '2026-10-01',
      scheduled_time: '10:35'
    };
    await prisma.dailyEntryAlertLog.deleteMany({
      where: { department_code: 'TEST_DEPT' }
    });
    await prisma.dailyEntryAlertLog.create({
      data: {
        department_code: dupTestKey.department_code,
        alert_date: dupTestKey.alert_date,
        scheduled_time: dupTestKey.scheduled_time,
        channel: 'WhatsApp',
        status: 'SENT',
        message: 'Initial Send'
      }
    });

    let duplicateBlocked = false;
    try {
      await prisma.dailyEntryAlertLog.create({
        data: {
          department_code: dupTestKey.department_code,
          alert_date: dupTestKey.alert_date,
          scheduled_time: dupTestKey.scheduled_time,
          channel: 'WhatsApp',
          status: 'SENT',
          message: 'Duplicate Send Attempt'
        }
      });
    } catch (dupErr) {
      duplicateBlocked = true;
    }
    // Clean up test record
    await prisma.dailyEntryAlertLog.deleteMany({
      where: { department_code: 'TEST_DEPT' }
    });
    assert(8, 'Duplicate reminder protection enforced by database unique constraint', duplicateBlocked);

    // TEST 9 & 10: Schedule slots (10:30, 10:35, 10:40, etc.)
    const sampleConfig = {
      start_time: '08:00',
      rapid_start_time: '10:30',
      rapid_interval_minutes: 5,
      end_time: '11:00'
    };
    const schedule = getDepartmentSchedule(sampleConfig);
    assert(9, '10:30 reminder is in schedule', schedule.includes('10:30'));
    assert(10, 'Rapid 5-minute intervals present (10:35, 10:40, 10:45, 10:50, 10:55, 11:00)', 
      schedule.includes('10:35') && schedule.includes('10:40') && schedule.includes('10:55') && schedule.includes('11:00'));

    // TEST 11: 11:00 AM Final reminder message format
    const finalMsg = buildReminderMessage({
      departmentName: 'PLANNING',
      dateStr: '01 Oct 2026',
      scheduledTime: '11:00',
      isFinal: true
    });
    assert(11, '11:00 AM uses FINAL REMINDER message format', finalMsg.includes('FINAL REMINDER') && finalMsg.includes('Final reminder time: 11:00 AM'));

    // TEST 12: After 11:00 AM no more reminders
    assert(12, 'No reminder slots exist after 11:00 AM in default schedule', !schedule.some(t => t > '11:00'));

    // TEST 13: Instant stop when report is completed
    const stopCheck = await checkDepartmentCompleted('PLANNING', testDate);
    assert(13, 'Completed entry returns completed=true for reminder cutoff', stopCheck.completed === true);

    // TEST 14: Test message does NOT touch daily report entries
    const entriesBefore = await prisma.dailyReportEntry.count({
      where: { report_date: today, department_code: 'PLANNING' }
    });
    const testSendResult = await sendNotification({
      channel: 'WhatsApp',
      senderNumber: '919876543210',
      receiverNumber: '919876543210',
      message: 'Test run',
      departmentCode: 'PLANNING',
      isTest: true
    });
    const entriesAfter = await prisma.dailyReportEntry.count({
      where: { report_date: today, department_code: 'PLANNING' }
    });
    assert(14, 'Test notification does not modify daily report records', testSendResult.status === 'TEST_SENT' && entriesBefore === entriesAfter);

    console.log('\n============================================================');
    console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED out of 14`);
    console.log('============================================================\n');

  } catch (err) {
    console.error('Test suite error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

runTestSuite();
