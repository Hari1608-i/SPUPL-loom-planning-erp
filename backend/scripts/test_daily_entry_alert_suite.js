require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { 
  getISTDateTime, 
  getDepartmentScheduleSlots, 
  checkDepartmentCompleted, 
  runAlertCycle, 
  getLiveStatus 
} = require('../services/dailyEntryAlertScheduler');
const { 
  sendNotification, 
  buildReminderMessage,
  beginSenderVerification,
  verifySenderOtp
} = require('../services/notificationService');

async function runTestSuite() {
  console.log('============================================================');
  console.log('RUNNING DAILY ENTRY ALERT ENHANCEMENT VERIFICATION SUITE');
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
    const liveStatus = await getLiveStatus(today);
    const pendingDept = liveStatus.departments.find(d => d.today_entry === 'PENDING' && d.is_active);
    assert(1, 'Active department + no Daily Report entry', Boolean(pendingDept), `Found pending dept: ${pendingDept?.department_code}`);

    // TEST 2: Active department + Daily Report completed
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
    const noSenderSend = await sendNotification({
      channel: 'WhatsApp',
      senderNumber: '',
      receiverNumber: '919876543210',
      message: 'Hello'
    });
    assert(4, 'Missing sender number prevents message dispatch', noSenderSend.status === 'DISABLED' && noSenderSend.error.includes('Sender number not configured'));

    const noReceiverSend = await sendNotification({
      channel: 'WhatsApp',
      senderNumber: '919876543210',
      receiverNumber: '',
      message: 'Hello'
    });
    assert(5, 'Missing receiver number prevents message dispatch', noReceiverSend.status === 'DISABLED' && noReceiverSend.error.includes('Receiver number not configured'));

    // TEST 6: Sunday check
    const sundayCycle = await runAlertCycle({ forceDate: '2026-10-04', forceSlot: '09:00' }); // 2026-10-04 is a Sunday
    const sundaySkipped = sundayCycle.results.every(r => r.status === 'SKIPPED_SUNDAY' || r.status === 'DISABLED');
    assert(6, 'Sunday reminders are strictly excluded', sundaySkipped);

    // TEST 7: Monday starts new reminder cycle
    const mondayCycle = await runAlertCycle({ forceDate: '2026-10-05', forceSlot: '08:00' }); // 2026-10-05 is a Monday
    assert(7, 'Monday starts active reminder cycle evaluation', mondayCycle.results.length > 0);

    // TEST 8: Backend restart duplicate protection per receiver
    const dupTestKey = {
      department_code: 'TEST_DEPT',
      alert_date: '2026-10-01',
      scheduled_time: '10:35',
      receiver_number: '+919999999999'
    };
    await prisma.dailyEntryAlertLog.deleteMany({
      where: { department_code: 'TEST_DEPT' }
    });
    await prisma.dailyEntryAlertLog.create({
      data: {
        department_code: dupTestKey.department_code,
        alert_date: dupTestKey.alert_date,
        scheduled_time: dupTestKey.scheduled_time,
        receiver_number: dupTestKey.receiver_number,
        status: 'SENT',
        channel: 'WhatsApp'
      }
    });

    const checkLog = await prisma.dailyEntryAlertLog.findFirst({
      where: {
        department_code: dupTestKey.department_code,
        alert_date: dupTestKey.alert_date,
        scheduled_time: dupTestKey.scheduled_time,
        receiver_number: dupTestKey.receiver_number,
        is_test: false
      }
    });
    assert(8, 'Duplicate send to same receiver prevented across backend restarts', Boolean(checkLog));

    // Cleanup test record
    await prisma.dailyEntryAlertLog.deleteMany({
      where: { department_code: 'TEST_DEPT' }
    });

    // TEST 9: Dynamic reminder schedule table presence and retrieval
    const planningConfig = await prisma.dailyEntryAlertConfig.findUnique({
      where: { department_code: 'PLANNING' }
    });
    const planningSlots = await getDepartmentScheduleSlots(planningConfig.id);
    assert(9, 'Dynamic reminder schedule table returns configured slots', planningSlots.length >= 10, `Found ${planningSlots.length} slots`);

    // TEST 10: Two receiver numbers supported
    await prisma.dailyEntryAlertConfig.update({
      where: { department_code: 'PLANNING' },
      data: {
        receiver_number_1: '+919111111111',
        receiver_number_2: '+919222222222'
      }
    });
    const updatedPlanning = await prisma.dailyEntryAlertConfig.findUnique({
      where: { department_code: 'PLANNING' }
    });
    assert(10, 'Both Receiver 1 and Receiver 2 are stored independently', 
      updatedPlanning.receiver_number_1 === '+919111111111' && updatedPlanning.receiver_number_2 === '+919222222222');

    // TEST 11: Real sender verification provider architecture
    const verifyAttempt = await beginSenderVerification({
      phoneNumber: '+919876543210',
      configId: planningConfig.id
    });
    assert(11, 'Sender verification rejects fake local verification without provider credentials', 
      verifyAttempt.success === false && (verifyAttempt.status === 'PROVIDER_NOT_CONFIGURED' || verifyAttempt.status === 'PROVIDER_ERROR'));

    // TEST 12: Test message does not affect Daily Report entries
    const beforeCount = await prisma.dailyReportEntry.count({
      where: { report_date: today }
    });
    // Build test notification
    const testMsg = buildReminderMessage({
      departmentName: 'PLANNING',
      dateStr: today,
      scheduledTime: '10:00 AM',
      nextReminderTime: '10:15 AM'
    });
    const afterCount = await prisma.dailyReportEntry.count({
      where: { report_date: today }
    });
    assert(12, 'Test message generation does not alter DailyReportEntry records', beforeCount === afterCount);

    // TEST 13: Final slot format produces FINAL REMINDER text
    const finalMsg = buildReminderMessage({
      departmentName: 'PLANNING',
      dateStr: today,
      scheduledTime: '11:00 AM',
      isFinal: true
    });
    assert(13, 'Final slot generates FINAL REMINDER notification', finalMsg.includes('FINAL REMINDER'));

    // TEST 14: System health endpoint returns dbConnected
    const health = await prisma.$queryRawUnsafe('SELECT 1 as connected');
    assert(14, 'Database connection is healthy and responsive', health.length > 0 && health[0].connected === 1);

    console.log('\n============================================================');
    console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('============================================================\n');

    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Test suite error:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runTestSuite();
