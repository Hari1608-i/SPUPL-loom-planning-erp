import { addDays, format, startOfDay, differenceInDays } from 'date-fns';

export function normalizeIbpo(ibpo?: string | null): string {
  if (!ibpo) return '';
  return ibpo.trim().toUpperCase();
}

export function parseConstructionSpecs(constructionStr?: string | null): { pick: string; greigeWidth: string; reedSpace: string } {
  if (!constructionStr) return { pick: '', greigeWidth: '', reedSpace: '' };
  const str = constructionStr.trim();
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


export interface LoomRunEntryInput {
  loomStartDate: Date;
  warpedMeter: number;
  dailyProduction: number;
  crimpPercent: number;
  rpm?: number | string | null;
  efficiency?: number | string | null;
  pick?: number | string | null;
  actualProductionHistory?: number[];
  productionOverride?: number | string | null;
}

export type RunoutSourceType = 'ACTUAL PRODUCTION' | 'RPM + EFFICIENCY' | 'DAILY PRODUCTION' | 'MANUAL OVERRIDE' | 'DATA REQUIRED';
export type ConfidenceLevelType = 'HIGH CONFIDENCE' | 'MEDIUM CONFIDENCE' | 'LOW CONFIDENCE' | 'DATA REQUIRED';

export interface OrderPlanningInput {
  orderQty: number;
  plannedLoomCount: number;
  plannedAvgProduction: number;
  weavingPlannedDate?: string | Date | null;
  weavingCompletionDate?: string | Date | null;
  actualLoomCount?: number;
  actualWeavingStartDate?: string | Date | null;
  actualAvgProduction?: number;
  producedQty?: number;
  actualCompletionDate?: string | Date | null;
  status?: string;
  orderCompletionStatus?: string;
  compatibleLoomsAvailable?: number;
  beamStockAvailable?: boolean;
  reedStockAvailable?: boolean;
}

export interface OrderPlanningResult {
  orderQty: number;
  plannedLoomCount: number;
  plannedAvgProduction: number;
  plannedDailyProduction: number;
  targetProductionDays: number;
  requiredProductionDays: number;

  weavingPlannedDate: Date | null;
  weavingPlannedDateFormatted: string;

  targetCompletionDate: Date | null;
  targetCompletionDateFormatted: string;

  expectedCompletionDate: Date | null;
  expectedCompletionDateFormatted: string;

  scheduleVarianceDays: number;
  varianceText: string;
  scheduleStatus: 'AHEAD' | 'ON TIME' | 'DELAY RISK' | 'INVALID DATE PLAN';

  actualLoomCount: number;
  actualWeavingStartDate: Date | null;
  actualWeavingStartDateFormatted: string;
  actualAvgProduction: number;
  producedQty: number;
  balanceQty: number;
  actualRunoutDate: Date | null;
  actualRunoutDateFormatted: string;
  actualCompletionDate: Date | null;
  actualCompletionDateFormatted: string;

  normalizedStatus: string;
  isValidPlan: boolean;
  validationMessage: string | null;
  daysRemaining: number;
  targetRemainingDaysText: string;

  // Smart Capacity Suggestions
  availableDays: number;
  optionARequiredLooms: number;
  optionAFeasible: boolean;
  optionAMessage: string;
  optionBRequiredAvgProd: number;
  optionBIncreaseNeeded: number;
  optionBLabel: string;
}

export interface BeamRequirementInput {
  orderQty: number;
  warpQty?: number;
  crimpPercent?: number;
  beamLengthCapacity?: number;
  allocatedBeamQty?: number;
  allocatedBeamMeter?: number;
  availableStockQty?: number;
  availableStockMeter?: number;
}

export interface BeamRequirementResult {
  requiredBeamMeter: number;
  requiredBeamQty: number;
  allocatedBeamMeter: number;
  allocatedBeamQty: number;
  balanceBeamMeter: number;
  balanceBeamQty: number;
  availableStockMeter: number;
  availableStockQty: number;
  shortageBeamMeter: number;
  shortageBeamQty: number;
  beamReadinessStatus: 'READY' | 'PARTIAL' | 'SHORTAGE' | 'NOT READY';
  recommendationMessage: string;
}

export function calculateOrderBeamRequirement(input: BeamRequirementInput): BeamRequirementResult {
  const orderQty = Math.max(0, Number(input.orderQty) || 0);
  const crimp = Number(input.crimpPercent) || 5;
  const warpQty = input.warpQty && input.warpQty > 0 ? Number(input.warpQty) : Math.round(orderQty * (1 + crimp / 100));

  const beamCapacity = Number(input.beamLengthCapacity) || 1800;
  const requiredBeamMeter = warpQty;
  const requiredBeamQty = Math.ceil(requiredBeamMeter / beamCapacity);

  const allocatedBeamMeter = Math.max(0, Number(input.allocatedBeamMeter) || 0);
  const allocatedBeamQty = Math.max(0, Number(input.allocatedBeamQty) || 0);

  const balanceBeamMeter = Math.max(0, requiredBeamMeter - allocatedBeamMeter);
  const balanceBeamQty = Math.ceil(balanceBeamMeter / beamCapacity);

  const availableStockMeter = Math.max(0, Number(input.availableStockMeter) || 0);
  const availableStockQty = Math.max(0, Number(input.availableStockQty) || 0);

  const shortageBeamMeter = Math.max(0, balanceBeamMeter - availableStockMeter);
  const shortageBeamQty = Math.ceil(shortageBeamMeter / beamCapacity);

  let beamReadinessStatus: 'READY' | 'PARTIAL' | 'SHORTAGE' | 'NOT READY' = 'NOT READY';
  let recommendationMessage = '';

  if (balanceBeamMeter <= 0 || (allocatedBeamMeter >= requiredBeamMeter && requiredBeamMeter > 0)) {
    beamReadinessStatus = 'READY';
    recommendationMessage = 'All required beams are fully allocated and ready for weaving.';
  } else if (availableStockMeter < balanceBeamMeter) {
    beamReadinessStatus = 'SHORTAGE';
    recommendationMessage = `Shortage detected (${shortageBeamMeter.toLocaleString()} M pending). Suitable beam stock is not available.`;
  } else if (allocatedBeamMeter > 0) {
    beamReadinessStatus = 'PARTIAL';
    recommendationMessage = `Partially allocated (${allocatedBeamMeter.toLocaleString()} M / ${requiredBeamMeter.toLocaleString()} M). ${balanceBeamMeter.toLocaleString()} M balance pending.`;
  } else {
    beamReadinessStatus = 'NOT READY';
    recommendationMessage = `${balanceBeamMeter.toLocaleString()} M requirement pending. Suitable beam stock is available for allocation.`;
  }

  return {
    requiredBeamMeter,
    requiredBeamQty,
    allocatedBeamMeter,
    allocatedBeamQty,
    balanceBeamMeter,
    balanceBeamQty,
    availableStockMeter,
    availableStockQty,
    shortageBeamMeter,
    shortageBeamQty,
    beamReadinessStatus,
    recommendationMessage
  };
}

export interface ReedRequirementInput {
  orderQty: number;
  plannedLoomCount: number;
  reedCount: string;
  reedSpace?: string | number;
  totalDents?: number;
  availableReeds: Array<{
    reed_count: string;
    available_qty?: number;
    total_qty?: number;
    reserved_qty?: number;
    running_qty?: number;
    balance_qty?: number;
    location?: string;
    vendor?: string;
    make_vendor?: string;
  }>;
}

export interface ReedRequirementResult {
  requiredReedQty: number;
  availableQty: number;
  reservedQty: number;
  runningQty: number;
  usableBalance: number;
  shortageQty: number;
  purchaseQty: number;
  stockStatus: 'STOCK AVAILABLE' | 'STOCK LOW' | 'OUT OF STOCK' | 'EXCESS STOCK';
  purchasePriority: 'URGENT' | 'HIGH' | 'NORMAL' | 'NO PURCHASE';
  recommendationMessage: string;
  suggestedReedCount: string;
}

export function calculateOrderReedRequirement(input: ReedRequirementInput): ReedRequirementResult {
  const requiredReedQty = Math.max(1, Number(input.plannedLoomCount) || 1);
  const targetReedCount = (input.reedCount || '').trim();

  const matchingReeds = (input.availableReeds || []).filter(r => (r.reed_count || '').trim().toLowerCase() === targetReedCount.toLowerCase());

  const availableQty = matchingReeds.reduce((sum, r) => sum + Number(r.available_qty !== undefined ? r.available_qty : (r.total_qty || 1)), 0);
  const reservedQty = matchingReeds.reduce((sum, r) => sum + Number(r.reserved_qty || 0), 0);
  const runningQty = matchingReeds.reduce((sum, r) => sum + Number(r.running_qty || 0), 0);

  const usableBalance = Math.max(0, availableQty - reservedQty - runningQty);
  const shortageQty = Math.max(0, requiredReedQty - usableBalance);
  const purchaseQty = shortageQty;

  let stockStatus: 'STOCK AVAILABLE' | 'STOCK LOW' | 'OUT OF STOCK' | 'EXCESS STOCK' = 'OUT OF STOCK';
  let purchasePriority: 'URGENT' | 'HIGH' | 'NORMAL' | 'NO PURCHASE' = 'NO PURCHASE';
  let recommendationMessage = '';

  if (usableBalance >= requiredReedQty) {
    stockStatus = usableBalance > requiredReedQty * 2 ? 'EXCESS STOCK' : 'STOCK AVAILABLE';
    purchasePriority = 'NO PURCHASE';
    recommendationMessage = `Stock Available (${usableBalance} usable reeds available for ${requiredReedQty} planned looms). No purchase required.`;
  } else if (usableBalance > 0) {
    stockStatus = 'STOCK LOW';
    purchasePriority = 'HIGH';
    recommendationMessage = `Stock Low (${usableBalance} usable reeds for ${requiredReedQty} planned looms). Purchase of ${shortageQty} reeds required.`;
  } else {
    stockStatus = 'OUT OF STOCK';
    purchasePriority = 'URGENT';
    recommendationMessage = `Out of Stock (0 usable reeds available for ${requiredReedQty} planned looms). Purchase of ${purchaseQty} reeds required.`;
  }

  return {
    requiredReedQty,
    availableQty,
    reservedQty,
    runningQty,
    usableBalance,
    shortageQty,
    purchaseQty,
    stockStatus,
    purchasePriority,
    recommendationMessage,
    suggestedReedCount: targetReedCount || '—'
  };
}

export function calculateOrderPlanning(input: OrderPlanningInput): OrderPlanningResult {
  const orderQty = Math.max(0, Number(input.orderQty) || 0);
  const plannedLoomCount = Math.max(0, Number(input.plannedLoomCount) || 0);
  const plannedAvgProduction = Math.max(0, Number(input.plannedAvgProduction) || 0);
  const producedQty = Math.max(0, Number(input.producedQty) || 0);
  const balanceQty = Math.max(0, orderQty - producedQty);

  const plannedDailyProduction = plannedLoomCount * plannedAvgProduction;
  const requiredProductionDays = plannedDailyProduction > 0 ? Math.ceil(orderQty / plannedDailyProduction) : 0;

  let weavingPlannedDate: Date | null = null;
  if (input.weavingPlannedDate) {
    try {
      const d = new Date(input.weavingPlannedDate);
      if (!isNaN(d.getTime())) weavingPlannedDate = startOfDay(d);
    } catch { }
  }

  let targetCompletionDate: Date | null = null;
  if (input.weavingCompletionDate) {
    try {
      const d = new Date(input.weavingCompletionDate);
      if (!isNaN(d.getTime())) targetCompletionDate = startOfDay(d);
    } catch { }
  }

  let actualWeavingStartDate: Date | null = null;
  if (input.actualWeavingStartDate) {
    try {
      const d = new Date(input.actualWeavingStartDate);
      if (!isNaN(d.getTime())) actualWeavingStartDate = startOfDay(d);
    } catch { }
  }

  let actualCompletionDate: Date | null = null;
  if (input.actualCompletionDate) {
    try {
      const d = new Date(input.actualCompletionDate);
      if (!isNaN(d.getTime())) actualCompletionDate = startOfDay(d);
    } catch { }
  }

  // 1. Validation Checks
  let isValidPlan = true;
  let validationMessage: string | null = null;

  if (weavingPlannedDate && targetCompletionDate && targetCompletionDate < weavingPlannedDate) {
    isValidPlan = false;
    validationMessage = 'Target Completion Date cannot be before Weaving Planned Start Date.';
  }

  // 2. Target Production Days (Inclusive Calendar Days from Planned Start through Target Completion)
  let targetProductionDays = 1;
  if (weavingPlannedDate && targetCompletionDate && targetCompletionDate >= weavingPlannedDate) {
    targetProductionDays = Math.max(1, differenceInDays(targetCompletionDate, weavingPlannedDate) + 1);
  }

  // 3. System Expected Completion Date Formula: Planned Start Date + (requiredProductionDays - 1)
  const today = startOfDay(new Date());
  let expectedCompletionDate: Date | null = null;
  if (weavingPlannedDate && requiredProductionDays > 0) {
    expectedCompletionDate = addDays(weavingPlannedDate, requiredProductionDays - 1);
  }

  // 4. Planned Schedule Variance (Expected Completion vs Target Completion)
  let scheduleVarianceDays = 0;
  let varianceText = 'ON SCHEDULE';
  let scheduleStatus: 'AHEAD' | 'ON TIME' | 'DELAY RISK' | 'INVALID DATE PLAN' = 'ON TIME';

  if (!isValidPlan) {
    scheduleStatus = 'INVALID DATE PLAN';
    varianceText = 'INVALID TARGET DATE';
  } else if (expectedCompletionDate && targetCompletionDate) {
    scheduleVarianceDays = differenceInDays(expectedCompletionDate, targetCompletionDate);
    if (scheduleVarianceDays > 0) {
      scheduleStatus = 'DELAY RISK';
      varianceText = `DELAY +${scheduleVarianceDays} DAYS`;
    } else if (scheduleVarianceDays < 0) {
      scheduleStatus = 'AHEAD';
      varianceText = `AHEAD BY ${Math.abs(scheduleVarianceDays)} DAYS`;
    } else {
      scheduleStatus = 'ON TIME';
      varianceText = 'ON SCHEDULE';
    }
  }

  // 5. Strict Normalized Status Progression State Machine:
  // 1. ORDER COMPLETED: Explicitly confirmed completion
  // 2. WEAVING COMPLETED: Produced Qty >= Order Qty (Pending user confirmation)
  // 3. WEAVING RUNNING: ONLY when actualLoomCount > 0
  // 4. DELAYED: Target completion date passed & incomplete
  // 5. LOOM PLANNED: Planned loom count > 0, but actualLoomCount === 0
  // 6. PLANNING PENDING: Planning dates set
  // 7. ORDER RECEIVED: Default initial state
  let normalizedStatus = 'ORDER RECEIVED';
  const rawStatus = (input.status || '').toUpperCase();
  const compStatus = (input.orderCompletionStatus || '').toUpperCase();

  if (rawStatus === 'ORDER COMPLETED' || compStatus === 'COMPLETED') {
    normalizedStatus = 'ORDER COMPLETED';
  } else if (rawStatus === 'WEAVING COMPLETED' || (producedQty >= orderQty && orderQty > 0)) {
    normalizedStatus = 'WEAVING COMPLETED';
  } else if (input.actualLoomCount && input.actualLoomCount > 0) {
    normalizedStatus = 'WEAVING RUNNING';
  } else if (scheduleStatus === 'DELAY RISK' && targetCompletionDate && targetCompletionDate < today && producedQty < orderQty) {
    normalizedStatus = 'DELAYED';
  } else if (plannedLoomCount > 0 || rawStatus.includes('LOOM PLANNED')) {
    normalizedStatus = 'LOOM PLANNED';
  } else if (input.weavingPlannedDate || rawStatus.includes('PLANNING')) {
    normalizedStatus = 'PLANNING PENDING';
  } else {
    normalizedStatus = 'ORDER RECEIVED';
  }

  // 6. Target Remaining Days calculation
  let daysRemaining = 0;
  let targetRemainingDaysText = '—';
  if (targetCompletionDate) {
    daysRemaining = differenceInDays(targetCompletionDate, today);
    if (normalizedStatus === 'ORDER COMPLETED' || normalizedStatus === 'WEAVING COMPLETED') {
      targetRemainingDaysText = 'COMPLETED';
    } else if (daysRemaining >= 0) {
      targetRemainingDaysText = `${daysRemaining} DAYS REMAINING`;
    } else {
      targetRemainingDaysText = `OVERDUE BY ${Math.abs(daysRemaining)} DAYS`;
    }
  }

  // 7. Actual Expected Runout
  let actualRunoutDate: Date | null = null;
  const actualLoomCount = input.actualLoomCount || 0;
  const actualAvgProduction = input.actualAvgProduction || 0;
  const actualDailyProd = actualLoomCount * actualAvgProduction;

  if (balanceQty > 0 && actualDailyProd > 0) {
    const remainingDays = Math.ceil(balanceQty / actualDailyProd);
    actualRunoutDate = addDays(new Date(), Math.max(0, remainingDays - 1));
  }

  // 8. Smart Capacity Suggestions (Evaluated against Target Production Days)
  const availableDays = targetProductionDays;

  const optionARequiredLooms = (availableDays > 0 && plannedAvgProduction > 0)
    ? Math.ceil(orderQty / (availableDays * plannedAvgProduction))
    : 0;

  const availableLooms = Math.max(input.compatibleLoomsAvailable ?? 0, plannedLoomCount);
  const optionAFeasible = optionARequiredLooms > 0 && availableLooms >= optionARequiredLooms;
  const optionAMessage = optionAFeasible
    ? `FEASIBLE: Reallocating ${optionARequiredLooms} compatible looms will meet target completion.`
    : `NOT FEASIBLE: Target date cannot be achieved with available compatible loom capacity (Needs ${optionARequiredLooms} Looms, Available ${availableLooms} Looms).`;

  const optionBRequiredAvgProd = (availableDays > 0 && plannedLoomCount > 0)
    ? Math.ceil(orderQty / (plannedLoomCount * availableDays))
    : 0;

  const optionBIncreaseNeeded = Math.max(0, optionBRequiredAvgProd - plannedAvgProduction);
  const optionBLabel = `${optionBRequiredAvgProd} M/loom/day (${optionBIncreaseNeeded === 0 ? 'No increase required' : `+${optionBIncreaseNeeded} M/loom/day needed`})`;

  return {
    orderQty,
    plannedLoomCount,
    plannedAvgProduction,
    plannedDailyProduction,
    targetProductionDays,
    requiredProductionDays,

    weavingPlannedDate,
    weavingPlannedDateFormatted: weavingPlannedDate ? format(weavingPlannedDate, 'dd-MM-yyyy') : '—',

    targetCompletionDate,
    targetCompletionDateFormatted: targetCompletionDate ? format(targetCompletionDate, 'dd-MM-yyyy') : '—',

    expectedCompletionDate,
    expectedCompletionDateFormatted: expectedCompletionDate ? format(expectedCompletionDate, 'dd-MM-yyyy') : '—',

    scheduleVarianceDays,
    varianceText,
    scheduleStatus,

    actualLoomCount,
    actualWeavingStartDate,
    actualWeavingStartDateFormatted: actualWeavingStartDate ? format(actualWeavingStartDate, 'dd-MM-yyyy') : 'Not Started',
    actualAvgProduction,
    producedQty,
    balanceQty,
    actualRunoutDate,
    actualRunoutDateFormatted: actualRunoutDate ? format(actualRunoutDate, 'dd-MM-yyyy') : '—',
    actualCompletionDate,
    actualCompletionDateFormatted: actualCompletionDate ? format(actualCompletionDate, 'dd-MM-yyyy') : 'Not Completed',

    normalizedStatus,
    isValidPlan,
    validationMessage,
    daysRemaining,
    targetRemainingDaysText,

    availableDays,
    optionARequiredLooms,
    optionAFeasible,
    optionAMessage,
    optionBRequiredAvgProd,
    optionBIncreaseNeeded,
    optionBLabel
  };
}

export function calculateOrderSchedule(
  orderQty: number,
  plannedLoomCount: number,
  avgProductionPerLoom: number,
  weavingPlannedDate?: string | Date | null,
  weavingCompletionDate?: string | Date | null,
  isCompleted: boolean = false
) {
  const result = calculateOrderPlanning({
    orderQty,
    plannedLoomCount,
    plannedAvgProduction: avgProductionPerLoom,
    weavingPlannedDate,
    weavingCompletionDate,
    status: isCompleted ? 'ORDER COMPLETED' : 'ACTIVE'
  });

  return {
    calculatedDailyProd: result.plannedDailyProduction,
    requiredProductionDays: result.requiredProductionDays,
    expectedCompletionDate: result.expectedCompletionDate,
    scheduleVariance: result.scheduleVarianceDays,
    varianceText: result.varianceText,
    scheduleStatus: result.scheduleStatus === 'DELAY RISK' ? 'DELAYED' : result.scheduleStatus === 'AHEAD' ? 'AHEAD' : 'ON TRACK',
    daysText: result.varianceText
  };
}

export function calculateSmartCapacitySuggestions(
  orderQty: number,
  plannedAvgProd: number,
  plannedLooms: number,
  weavingPlannedDate?: string | Date | null,
  weavingCompletionDate?: string | Date | null,
  compatibleLoomsCount: number = 0
) {
  const result = calculateOrderPlanning({
    orderQty,
    plannedLoomCount: plannedLooms,
    plannedAvgProduction: plannedAvgProd,
    weavingPlannedDate,
    weavingCompletionDate,
    compatibleLoomsAvailable: compatibleLoomsCount
  });

  return {
    availableDays: result.availableDays,
    optionARequiredLooms: result.optionARequiredLooms,
    optionAFeasible: result.optionAFeasible,
    optionAMessage: result.optionAMessage,
    optionBRequiredAvgProd: result.optionBRequiredAvgProd,
    optionBIncreaseNeeded: result.optionBIncreaseNeeded,
    optionBLabel: result.optionBLabel
  };
}

export interface CalculatedLoomRun {
  runningDays: number;
  producedMeter: number;
  avgProduction: number;
  effectiveDailyProduction: number;
  runoutSource: RunoutSourceType;
  confidenceLevel: ConfidenceLevelType;
  warpBalanceGross: number;
  crimpLossMeter: number;
  netBalanceMeter: number;
  balanceDays: number;
  expectedRunoutDate: Date;
  runoutStatus: 'RUNOUT OVERDUE' | 'RUNOUT <= 1 DAY' | 'RUNOUT <= 2 DAYS' | 'RUNOUT <= 5 DAYS' | 'RUNOUT <= 7 DAYS' | 'RUNOUT <= 10 DAYS' | 'RUNOUT <= 15 DAYS' | 'NORMAL' | 'DATA REQUIRED';
}

export function calculateLoomRun(input: LoomRunEntryInput, currentDate: Date = new Date()): CalculatedLoomRun {
  const start = startOfDay(input.loomStartDate);
  const current = startOfDay(currentDate);

  let runningDays = differenceInDays(current, start);
  if (runningDays <= 0) runningDays = 1;

  // 1. Total Cumulative Production Meter entered by user (NOT summed day-wise)
  const producedMeter = Math.max(0, typeof input.dailyProduction === 'number' ? input.dailyProduction : parseFloat(String(input.dailyProduction || 0)) || 0);

  // 2. Expected Daily Production Rate (Forecast Rate M/Day)
  let effectiveDailyProduction = 0;
  let runoutSource: RunoutSourceType = 'DATA REQUIRED';
  let confidenceLevel: ConfidenceLevelType = 'DATA REQUIRED';

  const rpmVal = typeof input.rpm === 'number' ? input.rpm : parseFloat(String(input.rpm || ''));
  const effVal = typeof input.efficiency === 'number' ? input.efficiency : parseFloat(String(input.efficiency || ''));
  const pickVal = typeof input.pick === 'number' ? input.pick : parseFloat(String(input.pick || ''));

  if (!isNaN(rpmVal) && rpmVal > 0 && !isNaN(effVal) && effVal > 0) {
    let metersPerDay = 0;
    if (!isNaN(pickVal) && pickVal > 0) {
      metersPerDay = (rpmVal * 60 * 24 * (effVal / 100)) / (pickVal * 39.3701);
    } else {
      metersPerDay = (rpmVal * 60 * 24 * (effVal / 100)) / (50 * 39.3701);
    }
    if (metersPerDay > 0) {
      effectiveDailyProduction = metersPerDay;
      runoutSource = 'RPM + EFFICIENCY';
      confidenceLevel = 'HIGH CONFIDENCE';
    }
  }

  const override = typeof input.productionOverride === 'number' ? input.productionOverride : parseFloat(String(input.productionOverride || ''));
  if (effectiveDailyProduction <= 0 && !isNaN(override) && override > 0) {
    effectiveDailyProduction = override;
    runoutSource = 'MANUAL OVERRIDE';
    confidenceLevel = 'HIGH CONFIDENCE';
  }

  if (effectiveDailyProduction <= 0 && producedMeter > 0 && runningDays > 0) {
    effectiveDailyProduction = producedMeter / runningDays;
    runoutSource = 'ACTUAL PRODUCTION';
    confidenceLevel = 'MEDIUM CONFIDENCE';
  }

  const avgProduction = effectiveDailyProduction;

  // 3. Current Warp Balance = max(0, Original Warp Meter - Current Total Production)
  const warpedMtr = Math.max(0, Number(input.warpedMeter) || 0);
  const warpBalanceGross = Math.max(0, warpedMtr - producedMeter);
  const crimpPercent = input.crimpPercent || 0;
  const crimpLossMeter = warpBalanceGross * crimpPercent;
  const netBalanceMeter = Math.max(0, warpBalanceGross - crimpLossMeter);

  // 4. Balance Days = Net Balance / Expected Daily Production Rate
  const balanceDays = effectiveDailyProduction > 0 ? netBalanceMeter / effectiveDailyProduction : (warpedMtr > 0 && producedMeter >= warpedMtr ? 0 : 999999);

  // 5. Expected Runout Date
  const expectedRunoutDate = new Date(currentDate);
  if (balanceDays !== 999999) {
    expectedRunoutDate.setDate(expectedRunoutDate.getDate() + Math.ceil(balanceDays));
  }

  // 6. Runout Status
  let runoutStatus: CalculatedLoomRun['runoutStatus'] = 'NORMAL';
  if (warpedMtr > 0 && producedMeter >= warpedMtr) {
    runoutStatus = 'RUNOUT OVERDUE';
  } else if (balanceDays === 999999 || effectiveDailyProduction <= 0) {
    runoutStatus = 'DATA REQUIRED';
  } else if (balanceDays <= 0) {
    runoutStatus = 'RUNOUT OVERDUE';
  } else if (balanceDays <= 1) {
    runoutStatus = 'RUNOUT <= 1 DAY';
  } else if (balanceDays <= 2) {
    runoutStatus = 'RUNOUT <= 2 DAYS';
  } else if (balanceDays <= 5) {
    runoutStatus = 'RUNOUT <= 5 DAYS';
  } else if (balanceDays <= 7) {
    runoutStatus = 'RUNOUT <= 7 DAYS';
  } else if (balanceDays <= 10) {
    runoutStatus = 'RUNOUT <= 10 DAYS';
  } else if (balanceDays <= 15) {
    runoutStatus = 'RUNOUT <= 15 DAYS';
  }

  return {
    runningDays,
    producedMeter,
    avgProduction,
    effectiveDailyProduction,
    runoutSource,
    confidenceLevel,
    warpBalanceGross,
    crimpLossMeter,
    netBalanceMeter,
    balanceDays,
    expectedRunoutDate,
    runoutStatus
  };
}

export function formatRunoutDate(dateStr?: string | Date | null): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return format(d, 'dd-MM-yyyy');
  } catch {
    return '—';
  }
}

export function formatBalanceDays(days?: number | null): string {
  if (days === undefined || days === null || days < 0) return '—';
  return `${Math.ceil(days)} Days`;
}

export interface OrderLoomRequirementInput {
  orderId?: number;
  ibpoNo?: string;
  designNoSpNo?: string;
  plannedLoomCount: number;
  activeRunsMap?: Record<number, any>;
  plannedAssignmentsArray?: any[];
}

export interface OrderLoomRequirementResult {
  requiredLooms: number;
  runningLooms: number;
  runningLoomNos: number[];
  plannedLooms: number;
  plannedLoomNos: number[];
  totalCoveredLooms: number;
  remainingLooms: number;
  overPlannedLooms: number;
  planningStatus: 'LOOM PLANNING PENDING' | 'LOOM REQUIREMENT COMPLETED' | 'OVER PLANNED';
}

export function calculateOrderLoomPlanningSummary(input: OrderLoomRequirementInput): OrderLoomRequirementResult {
  const requiredLooms = Math.max(0, Number(input.plannedLoomCount) || 0);
  const targetIbpo = (input.ibpoNo || '').trim().toLowerCase();
  const targetDesign = (input.designNoSpNo || '').trim().toLowerCase();

  const runningLoomSet = new Set<number>();
  if (input.activeRunsMap) {
    Object.entries(input.activeRunsMap).forEach(([lNoStr, run]) => {
      if (!run) return;
      const lNo = Number(lNoStr);
      const runDesign = (run.designNo || run.design_no || '').trim().toLowerCase();
      const runIbpo = (run.ibpoNo || run.ibpo_no || run.orderNo || '').trim().toLowerCase();

      const matchesIbpo = targetIbpo && runIbpo && (runIbpo === targetIbpo || runIbpo.includes(targetIbpo));
      const matchesDesign = targetDesign && runDesign && (runDesign === targetDesign || runDesign.replace('SP026', 'SP26') === targetDesign.replace('SP026', 'SP26'));

      if (matchesIbpo || matchesDesign) {
        runningLoomSet.add(lNo);
      }
    });
  }

  const plannedLoomSet = new Set<number>();
  if (input.plannedAssignmentsArray) {
    input.plannedAssignmentsArray.forEach(plan => {
      if (!plan) return;
      const status = (plan.status || '').toUpperCase();
      if (status === 'CANCELLED' || status === 'COMPLETED') return;

      const lNo = Number(plan.loom_no);
      if (runningLoomSet.has(lNo)) return;

      const planDesign = (plan.next_design || plan.design_no || '').trim().toLowerCase();
      const planIbpo = (plan.ibpo_no || plan.order_no || '').trim().toLowerCase();

      const matchesIbpo = targetIbpo && planIbpo && (planIbpo === targetIbpo || planIbpo.includes(targetIbpo));
      const matchesDesign = targetDesign && planDesign && (planDesign === targetDesign || planDesign.replace('SP026', 'SP26') === targetDesign.replace('SP026', 'SP26'));

      if (matchesIbpo || matchesDesign) {
        plannedLoomSet.add(lNo);
      }
    });
  }

  const runningLooms = runningLoomSet.size;
  const runningLoomNos = Array.from(runningLoomSet);

  const plannedLooms = plannedLoomSet.size;
  const plannedLoomNos = Array.from(plannedLoomSet);

  const totalCoveredLooms = runningLooms + plannedLooms;
  const remainingLooms = Math.max(0, requiredLooms - totalCoveredLooms);
  const overPlannedLooms = Math.max(0, totalCoveredLooms - requiredLooms);

  let planningStatus: 'LOOM PLANNING PENDING' | 'LOOM REQUIREMENT COMPLETED' | 'OVER PLANNED' = 'LOOM PLANNING PENDING';
  if (totalCoveredLooms > requiredLooms && requiredLooms > 0) {
    planningStatus = 'OVER PLANNED';
  } else if (totalCoveredLooms >= requiredLooms && requiredLooms > 0) {
    planningStatus = 'LOOM REQUIREMENT COMPLETED';
  } else {
    planningStatus = 'LOOM PLANNING PENDING';
  }

  return {
    requiredLooms,
    runningLooms,
    runningLoomNos,
    plannedLooms,
    plannedLoomNos,
    totalCoveredLooms,
    remainingLooms,
    overPlannedLooms,
    planningStatus
  };
}

export interface LoomWeaveCapability {
  weaveTypes: string[];
  machineTypes: string[];
  maxFrames: number | null;
  rawCapabilities: string[];
}

export interface OrderWeaveRequirement {
  rawWeaveType: string;
  weaveType: string;
  requiredFrames: number;
}

export function parseLoomWeaveCapability(loomWeaveType: string | null | undefined): LoomWeaveCapability {
  if (!loomWeaveType || typeof loomWeaveType !== 'string') {
    return {
      weaveTypes: [],
      machineTypes: [],
      maxFrames: null,
      rawCapabilities: []
    };
  }

  const rawUpper = loomWeaveType.toUpperCase().trim();
  const weaveTypesSet = new Set<string>();
  const machineTypesSet = new Set<string>();
  const rawCapabilitiesSet = new Set<string>();
  let maxFrames: number | null = null;

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

export function parseOrderWeaveRequirement(
  orderWeaveType: string | null | undefined,
  requiredFramesParam?: number | null
): OrderWeaveRequirement {
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

export function normalizeWeaveCapabilities(rawValue: string | null | undefined): string[] {
  const cap = parseLoomWeaveCapability(rawValue);
  return Array.from(new Set([
    ...cap.rawCapabilities,
    ...cap.weaveTypes,
    ...cap.machineTypes
  ]));
}

export interface LoomCompatibilityResult {
  compatible: boolean;
  score: number;
  weaveCompatible: boolean;
  frameCompatible: boolean;
  colourCompatible: boolean;
  beamTypeCompatible: boolean;
  widthCompatible: boolean;
  loomTypeCompatible: boolean;
  warnings: string[];
  failedChecks: string[];
  reason: string;
  normalizedLoomCapabilities: string[];
  normalizedRequiredWeave: string;
  loomCapability: LoomWeaveCapability;
  orderRequirement: OrderWeaveRequirement;
  maxFramesSupported: number | null;
  requiredFrames: number;
  matchedCapability: string | null;
}

export function checkLoomCompatibility(orderOrDesign: any, loom: any): LoomCompatibilityResult {
  const reqWeaveRaw = (
    orderOrDesign?.weave_type ||
    orderOrDesign?.weaveType ||
    orderOrDesign?.weave ||
    orderOrDesign?.designMaster?.weave_type ||
    orderOrDesign?.designMaster?.weave ||
    ''
  ).toString().trim();

  const reqFramesRaw = Number(
    orderOrDesign?.frames ||
    orderOrDesign?.no_of_frames ||
    orderOrDesign?.frame_capacity ||
    orderOrDesign?.designMaster?.frames ||
    orderOrDesign?.designMaster?.frame_capacity ||
    0
  );

  const orderReq = parseOrderWeaveRequirement(reqWeaveRaw, reqFramesRaw);

  const loomWeaveRaw = (
    loom?.weave ||
    loom?.weave_details ||
    loom?.weaveDetails ||
    loom?.capabilities ||
    ''
  ).toString();

  const loomCap = parseLoomWeaveCapability(loomWeaveRaw);

  const loomInstalledLever = Number(
    loom?.installed_lever ||
    loom?.installedLever ||
    loom?.frame_capacity ||
    loom?.frameCapacity ||
    0
  );

  let maxSupportedFrames: number | null = null;
  if (loomCap.maxFrames !== null && loomCap.maxFrames > 0) {
    maxSupportedFrames = loomCap.maxFrames;
  } else if (loomInstalledLever > 0) {
    maxSupportedFrames = loomInstalledLever;
  }

  // 1. Frame Compatibility Check (REQUIRED FRAMES <= LOOM SUPPORTED MAX FRAMES)
  let frameCompatible = true;
  if (orderReq.requiredFrames > 0) {
    if (maxSupportedFrames !== null && maxSupportedFrames > 0) {
      frameCompatible = orderReq.requiredFrames <= maxSupportedFrames;
    }
  }

  // 2. Weave / Machine Type Compatibility Check
  const reqWeave = orderReq.weaveType;
  let weaveCompatible = false;
  let matchedCapability: string | null = null;

  if (!reqWeave || reqWeave === '—' || reqWeave === 'DEFAULT' || reqWeave === 'NONE') {
    weaveCompatible = true;
    matchedCapability = 'DEFAULT / ANY WEAVE';
  } else {
    const wMatch = loomCap.weaveTypes.find(wt => wt === reqWeave || reqWeave === wt || reqWeave.includes(wt) || wt.includes(reqWeave));
    if (wMatch) {
      weaveCompatible = true;
      matchedCapability = wMatch;
    } else {
      const mMatch = loomCap.machineTypes.find(mt => mt === reqWeave || reqWeave === mt || reqWeave.includes(mt) || mt.includes(reqWeave));
      if (mMatch) {
        weaveCompatible = true;
        matchedCapability = mMatch;
      } else {
        const rMatch = loomCap.rawCapabilities.find(rc => rc === reqWeave || rc.includes(reqWeave) || reqWeave.includes(rc));
        if (rMatch) {
          weaveCompatible = true;
          matchedCapability = rMatch;
        }
      }
    }
  }

  // 3. Weft Colour Compatibility Check
  const reqColours = Number(
    orderOrDesign?.no_of_clr_weft ||
    orderOrDesign?.weft_colours ||
    orderOrDesign?.weftColours ||
    orderOrDesign?.designMaster?.weft_colours ||
    0
  );
  const loomColours = Number(loom?.max_weft_colours || loom?.weft_colours || loom?.weftColours || 0);
  let colourCompatible = true;
  if (reqColours > 0 && loomColours > 0) {
    colourCompatible = loomColours >= reqColours;
  }

  // 4. Beam Type Compatibility Check
  const reqBeamType = (
    orderOrDesign?.beam_type ||
    orderOrDesign?.beamType ||
    orderOrDesign?.designMaster?.beam_type ||
    ''
  ).toString().trim().toUpperCase();
  const loomBeamType = (loom?.beam_type || loom?.beamType || '').toString().trim().toUpperCase();
  let beamTypeCompatible = true;
  if (reqBeamType && loomBeamType && reqBeamType !== '—') {
    if (reqBeamType.includes('DOUBLE') && !loomBeamType.includes('DOUBLE')) {
      beamTypeCompatible = false;
    }
  }

  // 5. Width / Reed Space Compatibility Check
  const reqWidth = parseFloat(
    orderOrDesign?.reed_space ||
    orderOrDesign?.reed_space_warp_width ||
    orderOrDesign?.greige_width ||
    orderOrDesign?.greigeWidth ||
    orderOrDesign?.designMaster?.reed_space_warp_width ||
    '0'
  ) || 0;
  const loomWidth = parseFloat(loom?.width || '0') || 0;
  let widthCompatible = true;
  if (reqWidth > 0 && loomWidth > 0) {
    widthCompatible = loomWidth >= reqWidth;
  }

  const failedChecks: string[] = [];
  if (!weaveCompatible) {
    failedChecks.push(`Required weave/machine '${reqWeave}' not supported on loom (Capabilities: ${[...loomCap.weaveTypes, ...loomCap.machineTypes].join(', ') || 'N/A'})`);
  }
  if (!frameCompatible) {
    failedChecks.push(`Order requires ${orderReq.requiredFrames} frames, but loom supports maximum ${maxSupportedFrames ?? 'N/A'} frames`);
  }
  if (!colourCompatible) {
    failedChecks.push(`Loom supports max ${loomColours} weft colors (Order requires: ${reqColours} colors)`);
  }
  if (!beamTypeCompatible) {
    failedChecks.push(`Loom beam type (${loomBeamType || 'Single Beam'}) incompatible with order (${reqBeamType})`);
  }
  if (!widthCompatible) {
    failedChecks.push(`Loom width ${loomWidth}" < Required width ${reqWidth}"`);
  }

  const compatible = weaveCompatible && frameCompatible && colourCompatible && beamTypeCompatible && widthCompatible;

  let score = 100;
  if (!weaveCompatible) score -= 35;
  if (!frameCompatible) score -= 25;
  if (!colourCompatible) score -= 15;
  if (!beamTypeCompatible) score -= 15;
  if (!widthCompatible) score -= 10;
  score = Math.max(0, score);

  let reason = '';
  if (compatible) {
    reason = `✓ COMPATIBLE — Weave/Machine (${matchedCapability || reqWeave || 'ANY'}), ${orderReq.requiredFrames ? orderReq.requiredFrames + ' frames (Loom max ' + (maxSupportedFrames ?? 'N/A') + '), ' : ''}${reqBeamType ? reqBeamType + ', ' : ''}Width OK`;
  } else {
    reason = `✕ NOT COMPATIBLE — ${failedChecks.join('; ')}`;
  }

  const normalizedLoomCapabilities = Array.from(new Set([
    ...loomCap.rawCapabilities,
    ...loomCap.weaveTypes,
    ...loomCap.machineTypes
  ]));

  return {
    compatible,
    score,
    weaveCompatible,
    frameCompatible,
    colourCompatible,
    beamTypeCompatible,
    widthCompatible,
    loomTypeCompatible: true,
    warnings: [],
    failedChecks,
    reason,
    normalizedLoomCapabilities,
    normalizedRequiredWeave: reqWeave,
    loomCapability: loomCap,
    orderRequirement: orderReq,
    maxFramesSupported: maxSupportedFrames,
    requiredFrames: orderReq.requiredFrames,
    matchedCapability
  };
}

export interface NextPlanItemInput {
  sequence?: number;
  planned_sequence?: number | string;
  id?: number | string;
  designNo?: string;
  next_design?: string;
  current_design?: string;
  warpMeter?: number | string;
  planned_warp_meter?: number | string;
  crimpPercent?: number | string;
  beamNo?: string;
  reserved_beam_no?: string;
  status?: string;
  manualStartDate?: Date | string | null;
  order_no?: string;
  dailyProduction?: number | string;
}

export interface CalculatedNextPlan {
  sequence: number;
  designNo: string;
  startDate: Date;
  startDateFormatted: string;
  expectedRunoutDate: Date;
  expectedRunoutDateFormatted: string;
  warpMeter: number;
  netWarpMeter: number;
  productionDays: number;
  beamNo: string;
  status: string;
}

export function calculateNextPlanRunouts(
  currentRunoutDate: Date | null,
  dailyProduction: number,
  plans: NextPlanItemInput[],
  orders: any[] = [],
  designs: any[] = []
): CalculatedNextPlan[] {
  const result: CalculatedNextPlan[] = [];
  const baseDailyProd = dailyProduction > 0 ? dailyProduction : 300;

  // Base date from current runout or today
  let prevRunout = currentRunoutDate ? startOfDay(currentRunoutDate) : startOfDay(new Date());

  // Filter out cancelled/completed
  const activePlans = (plans || []).filter(p => {
    const st = (p.status || '').toUpperCase();
    return st !== 'CANCELLED' && st !== 'COMPLETED';
  });

  // Sort by planned_sequence or id
  activePlans.sort(
    (a, b) =>
      (Number(a.planned_sequence || a.sequence) || Number(a.id) || 0) -
      (Number(b.planned_sequence || b.sequence) || Number(b.id) || 0)
  );

  // Take up to 5 plans
  const top5Plans = activePlans.slice(0, 5);

  top5Plans.forEach((plan, idx) => {
    const seq = idx + 1;
    const designNo = plan.designNo || plan.next_design || plan.current_design || 'PLANNED DESIGN';
    const beamNo = plan.beamNo || plan.reserved_beam_no || '—';
    const status = plan.status || 'PLANNED';

    // Start Date: next day after previous runout (or manual start date if explicitly provided and > prevRunout)
    let startDate = addDays(prevRunout, 1);
    if (plan.manualStartDate) {
      try {
        const manual = startOfDay(new Date(plan.manualStartDate));
        if (!isNaN(manual.getTime()) && manual > prevRunout) {
          startDate = manual;
        }
      } catch (e) {}
    }

    // Determine Warp Meter for this plan
    let rawWarpMeter = Number(plan.warpMeter || plan.planned_warp_meter) || 0;
    if (rawWarpMeter <= 0) {
      const matchedOrder = orders.find(o => 
        (o.ibpo_no && (o.ibpo_no === plan.order_no || o.ibpo_no === designNo)) ||
        (o.order_no && (o.order_no === plan.order_no || o.order_no === designNo)) ||
        (o.design_no_sp_no && o.design_no_sp_no === designNo)
      );
      if (matchedOrder) {
        rawWarpMeter = Number(matchedOrder.warp_qty) || Number(matchedOrder.order_qty) || 0;
      }
    }
    if (rawWarpMeter <= 0) rawWarpMeter = 3000;

    // Crimp %
    const matchedDesign = designs.find(d => (d.design_no_sp_no || d.designNo) === designNo);
    const crimp = Number(plan.crimpPercent) || Number(matchedDesign?.crimp) || 0;
    const netWarpMeter = Math.max(0, rawWarpMeter * (1 - crimp / 100));

    // Plan daily production
    const planDaily = Number(plan.dailyProduction) || baseDailyProd;

    // Production Days & Expected Runout Date
    const prodDays = Math.ceil(netWarpMeter / planDaily);
    const expectedRunoutDate = addDays(startDate, Math.max(0, prodDays - 1));

    // Update prevRunout for the next cascade step
    prevRunout = expectedRunoutDate;

    result.push({
      sequence: seq,
      designNo,
      startDate,
      startDateFormatted: format(startDate, 'dd-MMM-yyyy'),
      expectedRunoutDate,
      expectedRunoutDateFormatted: format(expectedRunoutDate, 'dd-MMM-yyyy'),
      warpMeter: rawWarpMeter,
      netWarpMeter: Math.round(netWarpMeter),
      productionDays: prodDays,
      beamNo,
      status
    });
  });

  return result;
}
