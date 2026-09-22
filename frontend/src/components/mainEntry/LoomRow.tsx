import React from 'react';
import { format, addDays } from 'date-fns';
import { calculateLoomRun, CalculatedLoomRun, isMatchingDesign } from '../../utils/calculations';
import { 
  Building2, Layers, Package, Zap, Activity, ListTodo,
  Lock, Unlock, ChevronDown, ChevronRight, Play, Calendar,
  ShoppingBag, ShieldCheck, CheckCircle2, Clock, AlertTriangle
} from 'lucide-react';

export interface EntryState {
  designNo: string;
  currentBeamNo: string;
  loomStartDate: string;
  warpedMeter: number | '';
  dailyProduction: number | '';
  rpm: number | '';
  efficiency: number | '';
  remarks: string;
}

export interface ProductionLogItem {
  id: number;
  loom_no: number;
  design_no?: string;
  produced_meter: number;
  rpm?: number | null;
  efficiency?: number | null;
  remarks?: string;
  createdAt?: string;
  date?: string;
  _dateStr?: string;
}

export interface LoomRowProps {
  loom: any;
  index: number;
  entry: EntryState;
  isExpanded: boolean;
  designsMap: Map<string, any>;
  ordersMap: Map<string, any>;
  beamsMap: Map<string, any>;
  nextPlans: Record<number, any>;
  rawNextPlans: any[];
  loomNextPlansMap: Record<number, any[]>;
  activeRuns: Record<number, any>;
  logsByLoom: Map<number, (ProductionLogItem & { _dateStr?: string })[]>;
  selectedProductionDate: string;
  isAdmin: boolean;
  activeDesigns: any[];
  reeds: any[];
  orders: any[];
  toggleRowExpand: (loomNo: number) => void;
  handleEntryChange: (loomNo: number, field: keyof EntryState, value: any) => void;
  handlePaste: (e: React.ClipboardEvent<HTMLInputElement | HTMLSelectElement>, startLoomNo: number, startField: keyof EntryState) => void;
  executePlan: (loomNo: number) => void;
  setHistoryModalLoomNo: (loomNo: number) => void;
  setTransitionPromptPlan: (val: any) => void;
  unlockedLoomDates?: Record<number, boolean>;
  handleRequestUnlockStartDate?: (loomNo: number) => void;
}

const getLogDateStr = (l: any): string => {
  if (!l) return '';
  if (l._dateStr) return l._dateStr;
  if (typeof l.date === 'string' && l.date.length >= 10) return l.date.substring(0, 10);
  try {
    return format(new Date(l.date || l.createdAt || new Date()), 'yyyy-MM-dd');
  } catch {
    return '';
  }
};

export const LoomRow = React.memo(function LoomRow({
  loom,
  index,
  entry,
  isExpanded,
  designsMap,
  ordersMap,
  beamsMap,
  nextPlans,
  rawNextPlans,
  loomNextPlansMap,
  activeRuns,
  logsByLoom,
  selectedProductionDate,
  isAdmin,
  activeDesigns,
  reeds,
  orders,
  toggleRowExpand,
  handleEntryChange,
  handlePaste,
  executePlan,
  setHistoryModalLoomNo,
  setTransitionPromptPlan,
  unlockedLoomDates = {},
  handleRequestUnlockStartDate
}: LoomRowProps) {
  const cleanDesignNo = (entry.designNo || '').trim().toLowerCase();
                const design = designsMap.get(cleanDesignNo);
                const matchedOrder = ordersMap.get(cleanDesignNo);
                const nextPlan = nextPlans[loom.loomNo];

                // Beam stock & Set No connection via fast indexed map
                let beamInfo: any = null;
                let beamMismatch = false;
                const activeRunObj = activeRuns[loom.loomNo];
                let setNoDisplay = (activeRunObj as any)?.set_no || (activeRunObj as any)?.setNo || (activeRunObj as any)?.set_number || 'N/A';

                if (entry.currentBeamNo && entry.currentBeamNo.trim() !== '') {
                  beamInfo = beamsMap.get(entry.currentBeamNo.trim().toLowerCase());

                  if (beamInfo) {
                    if (setNoDisplay === 'N/A') {
                      setNoDisplay = beamInfo.setNo || beamInfo.set_no || 'N/A';
                    }
                    const bDesign = beamInfo.designNo || beamInfo.design_no || beamInfo.design;
                    if (bDesign && entry.designNo && bDesign.trim().toLowerCase() !== entry.designNo.trim().toLowerCase()) {
                      beamMismatch = true;
                    }
                  } else if (setNoDisplay === 'N/A') {
                    setNoDisplay = entry.currentBeamNo;
                  }
                }

                // Get daily logs for this loom strictly against CURRENT DESIGN and ON OR AFTER LOOM START DATE
                const currentDesignClean = (entry.designNo || '').trim().toLowerCase();
                const startDateStr = entry.loomStartDate ? format(new Date(entry.loomStartDate), 'yyyy-MM-dd') : '';
                const isDateBeforeStart = !!(startDateStr && selectedProductionDate < startDateStr);
                const startDateDisplay = startDateStr ? format(new Date(entry.loomStartDate), 'dd-MMM-yyyy') : '';

                // High-speed single-pass logs processing for this loom
                const loomAllLogs = logsByLoom.get(loom.loomNo) || [];
                let totalCumulativeProducedMtr = 0;
                const loomLogs: number[] = [];
                let hasSavedLogForSelectedDate = false;
                let hasSavedRpmForSelectedDate = false;
                let hasSavedEffForSelectedDate = false;

                // Loom start date strictly from active warp
                const effectiveStartDateStr = startDateStr;

                for (let li = 0; li < loomAllLogs.length; li++) {
                  const l = loomAllLogs[li];
                  const lDesign = (l.design_no || '').trim().toLowerCase();
                  const logDateStr = getLogDateStr(l);

                  // A saved log for the selected date marks production entered (green)
                  if (logDateStr === selectedProductionDate) {
                    if (l.produced_meter !== undefined && l.produced_meter !== null) {
                      hasSavedLogForSelectedDate = true;
                    }
                    if (l.rpm !== undefined && l.rpm !== null) {
                      hasSavedRpmForSelectedDate = true;
                    }
                    if (l.efficiency !== undefined && l.efficiency !== null) {
                      hasSavedEffForSelectedDate = true;
                    }
                  }

                  // Cumulative meters calculation for CURRENT active warp
                  if (currentDesignClean && lDesign && !isMatchingDesign(lDesign, currentDesignClean)) continue;
                  if (effectiveStartDateStr && logDateStr < effectiveStartDateStr) continue;
                  if (selectedProductionDate && logDateStr > selectedProductionDate) continue;

                  const pVal = l.produced_meter || 0;
                  loomLogs.push(pVal);
                  totalCumulativeProducedMtr += pVal;
                }

                // Production status: Positive production (>0 M) is Green; No production (0 M or unentered) is Red
                const isLoomAllocated = !!(entry.designNo && entry.designNo.trim() !== '');
                const hasDraftInput = isLoomAllocated && entry.dailyProduction !== '' && entry.dailyProduction !== undefined && entry.dailyProduction !== null;
                const draftVal = hasDraftInput ? Number(entry.dailyProduction) : null;
                const isProductionPositive = isLoomAllocated && draftVal !== null && draftVal > 0;
                const isNoProduction = isLoomAllocated && (!hasDraftInput || draftVal === 0);
                const isMissingProduction = isNoProduction;

                const hasDraftRpm = isLoomAllocated && entry.rpm !== '' && entry.rpm !== undefined && entry.rpm !== null;
                const isMissingRpm = isLoomAllocated && !hasSavedRpmForSelectedDate && !hasDraftRpm;

                const hasDraftEff = isLoomAllocated && entry.efficiency !== '' && entry.efficiency !== undefined && entry.efficiency !== null;
                const isMissingEff = isLoomAllocated && !hasSavedEffForSelectedDate && !hasDraftEff;

                // Calculate Runout Metrics using cumulative total production up to selected date (+ today's draft if not yet saved)
                const effectiveWarpMtr =
                  typeof entry.warpedMeter === 'number' && entry.warpedMeter > 0
                    ? entry.warpedMeter
                    : (beamInfo?.available_meter || beamInfo?.beamLength || 0);

                const rawDesignCrimp = Number(design?.crimpPercent ?? design?.crimp_percent ?? matchedOrder?.crimp_percent ?? 0);
                const effectiveCrimp = rawDesignCrimp > 0 ? (rawDesignCrimp > 1 ? rawDesignCrimp / 100 : rawDesignCrimp) : 0.05;
                const effectivePick = design?.pick || (matchedOrder?.ppi !== undefined && matchedOrder?.ppi !== null && matchedOrder?.ppi !== '' ? String(matchedOrder.ppi) : '') || matchedOrder?.pick;
                
                const draftTodayMeter = (!hasSavedLogForSelectedDate && hasDraftInput && typeof entry.dailyProduction === 'number')
                  ? entry.dailyProduction
                  : 0;
                const effectiveProducedMtr = totalCumulativeProducedMtr + draftTodayMeter;
                const effectiveHistory = draftTodayMeter > 0 ? [...loomLogs, draftTodayMeter] : loomLogs;

                const actualWarpConsumed = (entry as any).actualWarpConsumed ?? (
                  beamInfo && beamInfo.total_warped_meter > 0 && beamInfo.current_balance_meter !== undefined && beamInfo.current_balance_meter !== null && beamInfo.current_balance_meter > 0 && beamInfo.current_balance_meter < beamInfo.total_warped_meter
                    ? beamInfo.total_warped_meter - beamInfo.current_balance_meter
                    : null
                );

                const calc: CalculatedLoomRun = calculateLoomRun({
                  loomStartDate: effectiveStartDateStr ? new Date(effectiveStartDateStr) : (entry.loomStartDate ? new Date(entry.loomStartDate) : new Date()),
                  warpedMeter: effectiveWarpMtr,
                  dailyProduction: effectiveProducedMtr,
                  crimpPercent: effectiveCrimp,
                  rpm: entry.rpm !== '' && entry.rpm !== null && entry.rpm !== undefined ? Number(entry.rpm) : null,
                  efficiency: entry.efficiency !== '' && entry.efficiency !== null && entry.efficiency !== undefined ? Number(entry.efficiency) : null,
                  pick: effectivePick,
                  actualProductionHistory: effectiveHistory,
                  actualWarpConsumed
                } as any, selectedProductionDate ? new Date(selectedProductionDate) : new Date());

                // Build next-plan list for this loom with cascading expected start/runout dates
                const nextPlansList = loomNextPlansMap[loom.loomNo] || [];
                // Default avg production for forecasting future plans (use actual if available)
                const forecastAvgProd = calc.avgProduction > 0 ? calc.avgProduction : 300;

                // Cascade: compute expected start/runout for each queued plan
                const cascadedPlans = nextPlansList.map((plan, idx) => {
                  // Expected start of this plan = runout of the previous step + 1 day
                  let expectedStart: Date;
                  if (idx === 0) {
                    // Plan 1 starts after current loom's runout
                    expectedStart =
                      calc.balanceDays === 999999
                        ? addDays(new Date(), 1)
                        : addDays(calc.expectedRunoutDate, 1);
                  } else {
                    expectedStart = addDays(cascadedPlans[idx - 1].expectedRunout, 1);
                  }

                  // Find beam for this plan (if allocated)
                  const planBeamNo = plan.reserved_beam_no || '';
                  const planBeamInfo = planBeamNo ? beamsMap.get(planBeamNo.toLowerCase()) : null;

                  // Warp meter for this plan: from allocated beam or planned field
                  const planWarpMtr =
                    Number(planBeamInfo?.available_meter || planBeamInfo?.beamLength || 0) ||
                    Number(plan.planned_warp_meter) ||
                    1800; // safe default

                  // Plan's own design crimp
                  const planDesign = plan.next_design ? designsMap.get((plan.next_design || '').trim().toLowerCase()) : null;
                  const planCrimp = planDesign?.crimpPercent ?? 0;
                  const planAvgProd = Number(plan.planned_avg_daily_production) || forecastAvgProd;

                  // Net balance for this plan
                  const planGrossBal = planWarpMtr; // no production yet
                  const planCrimpLoss = planGrossBal * planCrimp;
                  const planNetBal = Math.max(0, planGrossBal - planCrimpLoss);
                  const planBalanceDays = planAvgProd > 0 ? planNetBal / planAvgProd : 0;
                  const expectedRunout = addDays(expectedStart, Math.ceil(planBalanceDays));

                  // Determine plan status label
                  const rawStatus = (plan.status || '').toUpperCase();
                  let statusLabel = rawStatus || 'PLANNED';
                  if (plan.beam_status === 'BEAM ALLOCATED') statusLabel = 'BEAM ALLOCATED';
                  if (rawStatus === 'CONFIRMED') statusLabel = 'CONFIRMED ✓';
                  if (!planBeamNo) statusLabel = 'BEAM PENDING';

                  return {
                    plan,
                    expectedStart,
                    expectedRunout,
                    planWarpMtr,
                    planBalanceDays,
                    planAvgProd,
                    planBeamNo,
                    statusLabel
                  };
                });

                return (
                  <React.Fragment key={loom.loomNo}>
                    <tr className={`hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors ${beamMismatch ? 'bg-red-50/60 dark:bg-red-950/40' : ''}`}>
                      
                      {/* 1. S.No (#) */}
                      <td className="p-3 text-center sticky left-0 bg-white dark:bg-slate-800 z-10">
                        <div className="flex items-center gap-1 justify-center">
                          <button
                            onClick={() => toggleRowExpand(loom.loomNo)}
                            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                            title="Toggle 9-Dimension Details Drawer"
                          >
                            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          </button>
                          <span className="text-xs text-slate-700 dark:text-slate-300 font-extrabold font-mono">{index + 1}</span>
                        </div>
                      </td>

                      {/* 2. Loom No */}
                      <td className="p-3 font-black text-slate-900 dark:text-white sticky left-8 bg-white dark:bg-slate-800 z-10">
                        <div className="flex items-center gap-1.5">
                          <span className="text-spu-primary font-black text-xs">L-{loom.loomNo}</span>
                          <span title="Loom Master Data (Locked)"><Lock className="w-3.5 h-3.5 text-amber-600 opacity-80" /></span>
                        </div>
                      </td>

                      {/* 3. Unit */}
                      <td className="p-3 border-r border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-slate-100 sticky left-24 bg-white dark:bg-slate-800 z-10">
                        <div>{loom.unit || 'UNIT 1'}</div>
                      </td>

                      {/* 4. Current Running Design */}
                      <td className="p-3">
                        <select
                          value={entry.designNo}
                          onChange={e => handleEntryChange(loom.loomNo, 'designNo', e.target.value)}
                          onPaste={e => handlePaste(e as any, loom.loomNo, 'designNo')}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-black text-slate-950 dark:text-white focus:ring-2 focus:ring-spu-primary/30 focus:border-indigo-600 shadow-sm"
                        >
                          <option value="">-- Select Design --</option>
                          {activeDesigns.map(d => (
                            <option key={d.designNo} value={d.designNo}>{d.designNo}</option>
                          ))}
                        </select>
                      </td>

                      {/* 5. Construction */}
                      <td className="p-3 text-xs font-bold text-slate-950 dark:text-slate-100">
                        <span className="px-2 py-1 bg-slate-100 dark:bg-slate-700/60 rounded-md border border-slate-300 dark:border-slate-600 block truncate max-w-[130px]" title={design?.construction || matchedOrder?.construction || matchedOrder?.designMaster?.construction || 'N/A'}>
                          {design?.construction || matchedOrder?.construction || matchedOrder?.designMaster?.construction || 'Select Design'}
                        </span>
                      </td>

                      {/* 6. Reed Count */}
                      <td className="p-3 text-xs font-bold text-slate-950 dark:text-slate-100">
                        {design?.reedCount || design?.reed_count || matchedOrder?.reed_count || matchedOrder?.reedCount || matchedOrder?.designMaster?.reed_count || '—'}
                      </td>

                      {/* 7. Pick */}
                      <td className="p-3 text-xs font-bold text-slate-950 dark:text-slate-100">
                        {(() => {
                          const constStr = design?.construction || matchedOrder?.construction || matchedOrder?.designMaster?.construction || '';
                          const parsedPick = constStr.match(/\b\d+\s*x\s*(\d+)\b/i)?.[1] || constStr.match(/\bX\s*(\d+)\b/i)?.[1] || '';
                          return design?.pick || (matchedOrder?.ppi !== undefined && matchedOrder?.ppi !== null && matchedOrder?.ppi !== '' ? String(matchedOrder.ppi) : '') || matchedOrder?.pick || matchedOrder?.designMaster?.pick || parsedPick || '—';
                        })()}
                      </td>

                      {/* 8. Greige Width */}
                      <td className="p-3 border-r border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-950 dark:text-slate-100">
                        {design?.greigeWidth || design?.greige_width || matchedOrder?.greige_width || matchedOrder?.width || matchedOrder?.required_reed_space || matchedOrder?.designMaster?.greige_width || design?.reedSpace || '—'}
                      </td>

                      {/* 9. Set No */}
                      <td className="p-3 font-black text-slate-950 dark:text-slate-100 text-xs">
                        {setNoDisplay}
                      </td>

                      {/* 10. Beam No (Read-Only - Allocated via Loom Planning Setup) */}
                      <td className="p-3 border-r border-slate-300 dark:border-slate-700 font-bold text-xs">
                        <div className="flex items-center space-x-1">
                          <span className={`px-2.5 py-1 rounded-md border text-xs font-mono font-extrabold ${
                            entry.currentBeamNo ? 'bg-indigo-100 text-indigo-950 border-indigo-300 dark:bg-indigo-950 dark:text-indigo-200' : 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300'
                          }`} title="Beam No allocated from Loom Planning Setup (Read-Only)">
                            {entry.currentBeamNo || 'Not Allocated'}
                          </span>
                          <span title="Locked from Loom Planning Setup">
                            <Lock className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                          </span>
                        </div>
                      </td>

                      {/* 11. Start Date (Locked by default - Admin Password required to unlock) */}
                      <td className="p-3">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="date"
                            value={entry.loomStartDate}
                            disabled={!unlockedLoomDates[loom.loomNo]}
                            readOnly={!unlockedLoomDates[loom.loomNo]}
                            onChange={e => handleEntryChange(loom.loomNo, 'loomStartDate', e.target.value)}
                            onPaste={e => handlePaste(e as any, loom.loomNo, 'loomStartDate')}
                            className={`px-2 py-1.5 rounded-lg border text-xs font-extrabold shadow-sm ${
                              !unlockedLoomDates[loom.loomNo]
                                ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 cursor-not-allowed'
                                : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-950 dark:text-emerald-200 border-emerald-400 focus:border-emerald-600 ring-2 ring-emerald-200'
                            }`}
                            title={
                              unlockedLoomDates[loom.loomNo]
                                ? 'UNLOCKED: Edit Start Date now. It will auto-relock on Save.'
                                : 'LOCKED: Click the Lock button to enter Admin Password & unlock.'
                            }
                          />
                          {handleRequestUnlockStartDate && (
                            <button
                              type="button"
                              onClick={() => handleRequestUnlockStartDate(loom.loomNo)}
                              className={`p-1.5 rounded-lg border text-xs font-bold transition-all flex items-center justify-center cursor-pointer shadow-xs active:scale-95 ${
                                unlockedLoomDates[loom.loomNo]
                                  ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border-emerald-300'
                                  : 'bg-slate-100 hover:bg-amber-100 text-slate-600 hover:text-amber-800 border-slate-300'
                              }`}
                              title={
                                unlockedLoomDates[loom.loomNo]
                                  ? 'Unlocked: Click to re-lock immediately'
                                  : 'Locked: Click to enter Admin Password & unlock Start Date'
                              }
                            >
                              {unlockedLoomDates[loom.loomNo] ? (
                                <Unlock className="w-3.5 h-3.5 text-emerald-700" />
                              ) : (
                                <Lock className="w-3.5 h-3.5 text-amber-600" />
                              )}
                            </button>
                          )}
                        </div>
                      </td>

                      {/* 12. Warp Meter */}
                      <td className="p-3">
                        <input
                          type="number"
                          value={entry.warpedMeter}
                          placeholder="Warp Mtr"
                          onChange={e => handleEntryChange(loom.loomNo, 'warpedMeter', e.target.value === '' ? '' : Number(e.target.value))}
                          onPaste={e => handlePaste(e as any, loom.loomNo, 'warpedMeter')}
                          className="w-24 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-extrabold text-slate-950 dark:text-white shadow-sm focus:border-indigo-600 placeholder:text-slate-500 placeholder:font-normal"
                        />
                      </td>

                      {/* 13. Daily Production Meter */}
                      <td className="p-3">
                        <div className="flex items-center gap-1.5">
                          {isNoProduction && (
                            <span
                              className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0 inline-block animate-pulse"
                              title={hasDraftInput && draftVal === 0 ? "Zero production (0 M) for selected date" : "Production not entered for selected date"}
                            />
                          )}
                          {isProductionPositive && (
                            <span
                              className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0 inline-block"
                              title={`Production updated: ${draftVal} M`}
                            />
                          )}
                          <input
                            type="number"
                            value={!isLoomAllocated ? '' : entry.dailyProduction}
                            disabled={!isLoomAllocated}
                            placeholder={!isLoomAllocated ? 'Not Allocated' : 'Daily Mtr'}
                            onChange={e => {
                              if (!isLoomAllocated) return;
                              handleEntryChange(loom.loomNo, 'dailyProduction', e.target.value === '' ? '' : Number(e.target.value));
                            }}
                            onPaste={e => {
                              if (!isLoomAllocated) return;
                              handlePaste(e as any, loom.loomNo, 'dailyProduction');
                            }}
                            className={`w-24 px-2.5 py-1.5 rounded-lg border-2 text-xs font-black shadow-sm focus:outline-none placeholder:text-slate-400 placeholder:font-normal ${
                              !isLoomAllocated
                                ? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 cursor-not-allowed opacity-60 text-slate-400'
                                : isNoProduction
                                  ? 'bg-red-50 dark:bg-red-950/30 border-red-500 dark:border-red-500 text-red-900 dark:text-red-200 focus:border-red-600 placeholder:text-red-400 dark:placeholder:text-red-500'
                                  : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500 dark:border-emerald-500 text-slate-950 dark:text-white focus:border-emerald-600'
                            }`}
                            title={
                              !isLoomAllocated
                                ? 'Loom is not allocated. Production entry is disabled.'
                                : isNoProduction
                                  ? (hasDraftInput && draftVal === 0 ? 'Zero production (0 M) for selected date' : 'Production not entered for selected date')
                                  : `Production updated: ${draftVal} M for selected date`
                            }
                          />
                        </div>
                      </td>

                      {/* 14. Crimp % */}
                      <td className="p-3 text-xs font-extrabold text-slate-950 dark:text-slate-100">
                        {(() => {
                          if (!isLoomAllocated) return '—';
                          if (calc?.actualCrimpPercent !== null && calc?.actualCrimpPercent !== undefined) {
                            return (
                              <div title={`Actual Crimp: ${calc.actualCrimpPercent.toFixed(2)}% | Standard: ${(calc.standardCrimpPercent ?? 5).toFixed(1)}%`}>
                                <span>{calc.actualCrimpPercent.toFixed(1)}%</span>
                                <span className="text-[9px] text-emerald-600 dark:text-emerald-400 block font-bold">ACTUAL</span>
                              </div>
                            );
                          }
                          const stdVal = calc?.standardCrimpPercent ?? (effectiveCrimp * 100);
                          return (
                            <div title={`Standard Crimp: ${stdVal.toFixed(1)}%`}>
                              <span>{stdVal.toFixed(1)}%</span>
                            </div>
                          );
                        })()}
                      </td>

                      {/* 15. RPM (Optional - Default 600) */}
                      <td className="p-3">
                        <div className="flex items-center gap-1.5">
                          {isMissingRpm && (
                            <span
                              className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0 inline-block animate-pulse"
                              title="RPM not entered for selected date"
                            />
                          )}
                          <input
                            type="number"
                            value={!isLoomAllocated ? '' : entry.rpm}
                            disabled={!isLoomAllocated}
                            placeholder={!isLoomAllocated ? '—' : '600'}
                            onChange={e => {
                              if (!isLoomAllocated) return;
                              handleEntryChange(loom.loomNo, 'rpm', e.target.value === '' ? '' : Number(e.target.value));
                            }}
                            onPaste={e => {
                              if (!isLoomAllocated) return;
                              handlePaste(e as any, loom.loomNo, 'rpm');
                            }}
                            className={`w-20 px-2.5 py-1.5 rounded-lg border-2 text-xs font-black text-slate-950 dark:text-white shadow-sm focus:border-emerald-600 placeholder:text-slate-400 placeholder:font-normal ${
                              !isLoomAllocated
                                ? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 cursor-not-allowed opacity-60 text-slate-400'
                                : isMissingRpm
                                  ? 'bg-emerald-50/30 dark:bg-emerald-950/20 border-red-400 dark:border-red-600'
                                  : 'bg-emerald-50/30 dark:bg-emerald-950/20 border-emerald-400 dark:border-emerald-600'
                            }`}
                            title={!isLoomAllocated ? 'Loom is not allocated' : 'RPM for selected date'}
                          />
                        </div>
                      </td>

                      {/* 16. Efficiency % (Optional - Default 60%) */}
                      <td className="p-3 border-r border-slate-300 dark:border-slate-700">
                        <div className="flex items-center gap-1.5">
                          {isMissingEff && (
                            <span
                              className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0 inline-block animate-pulse"
                              title="Efficiency not entered for selected date"
                            />
                          )}
                          <input
                            type="number"
                            value={!isLoomAllocated ? '' : entry.efficiency}
                            disabled={!isLoomAllocated}
                            placeholder={!isLoomAllocated ? '—' : '60%'}
                            onChange={e => {
                              if (!isLoomAllocated) return;
                              handleEntryChange(loom.loomNo, 'efficiency', e.target.value === '' ? '' : Number(e.target.value));
                            }}
                            onPaste={e => {
                              if (!isLoomAllocated) return;
                              handlePaste(e as any, loom.loomNo, 'efficiency');
                            }}
                            className={`w-20 px-2.5 py-1.5 rounded-lg border-2 text-xs font-black text-slate-950 dark:text-white shadow-sm focus:border-emerald-600 placeholder:text-slate-400 placeholder:font-normal ${
                              !isLoomAllocated
                                ? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 cursor-not-allowed opacity-60 text-slate-400'
                                : isMissingEff
                                  ? 'bg-emerald-50/30 dark:bg-emerald-950/20 border-red-400 dark:border-red-600'
                                  : 'bg-emerald-50/30 dark:bg-emerald-950/20 border-emerald-400 dark:border-emerald-600'
                            }`}
                            title={!isLoomAllocated ? 'Loom is not allocated' : 'Efficiency % for selected date'}
                          />
                        </div>
                      </td>

                      {/* 17. Produced Meter */}
                      <td className="p-3 font-extrabold text-emerald-700 dark:text-emerald-400 text-xs">
                        {calc.producedMeter > 0 ? `${calc.producedMeter.toFixed(0)} M` : '0 M'}
                      </td>

                      {/* 18. Average Production / Day */}
                      <td className="p-3 font-extrabold text-emerald-700 dark:text-emerald-400 text-xs">
                        {calc.avgProduction > 0 ? `${calc.avgProduction.toFixed(1)} M/d` : '—'}
                      </td>

                      {/* 19. Gross Warp Balance */}
                      <td className="p-3 text-xs font-bold text-slate-950 dark:text-slate-100">
                        {calc.warpBalanceGross.toFixed(0)} M
                      </td>

                      {/* 20. Crimp Loss */}
                      <td className="p-3 text-xs font-semibold text-slate-700 dark:text-slate-300">
                        {calc.crimpLossMeter.toFixed(0)} M
                      </td>

                      {/* 21. Net Warp Balance */}
                      <td className="p-3 font-black text-indigo-950 dark:text-indigo-200 text-xs">
                        <span className="bg-indigo-100/70 dark:bg-indigo-950/60 px-2 py-1 rounded border border-indigo-200 dark:border-indigo-800 inline-block">
                          {calc.netBalanceMeter.toFixed(0)} M
                        </span>
                      </td>

                      {/* 22. Balance Days */}
                      <td className="p-3 font-black text-amber-900 dark:text-amber-200 text-xs">
                        <span className="bg-amber-100/70 dark:bg-amber-950/60 px-2 py-1 rounded border border-amber-200 dark:border-amber-800 inline-block">
                          {calc.balanceDays === 999999 ? '—' : `${calc.balanceDays.toFixed(1)} d`}
                        </span>
                      </td>

                      {/* 23. Expected Runout Date */}
                      <td className="p-3 border-r border-slate-300 dark:border-slate-700 font-extrabold text-slate-950 dark:text-white text-xs">
                        {calc.runoutStatus === 'DATA REQUIRED' || calc.balanceDays === 999999 ? (
                          <span className="text-slate-500 text-xs font-medium">Calculating...</span>
                        ) : (
                          <div>
                            <div className="font-black text-slate-950 dark:text-white">{format(calc.expectedRunoutDate, 'dd-MMM-yyyy')}</div>
                            <div className={`text-[10px] font-bold ${calc.balanceDays <= 2 ? 'text-red-700 font-black' : 'text-slate-500'}`}>
                              {calc.balanceDays.toFixed(1)} Days
                            </div>
                          </div>
                        )}
                      </td>

                      {/* 24-27. Next 1–5 Plans (compact cascading queue) */}
                      <td className="p-2 text-[10px]" colSpan={4}>
                        {cascadedPlans.length === 0 ? (
                          <span className="text-slate-400 italic">No next plans queued</span>
                        ) : (
                          <div className="space-y-1.5">
                            {cascadedPlans.map((cp, idx) => (
                              <div
                                key={cp.plan.id || idx}
                                className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border ${
                                  idx === 0
                                    ? 'bg-teal-50 border-teal-200 dark:bg-teal-950/30 dark:border-teal-800'
                                    : 'bg-slate-50 border-slate-200 dark:bg-slate-800/40 dark:border-slate-700'
                                }`}
                              >
                                {/* Plan badge */}
                                <span className={`shrink-0 font-black text-[9px] px-1.5 py-0.5 rounded-full ${
                                  idx === 0 ? 'bg-teal-600 text-white' : 'bg-slate-400 text-white'
                                }`}>
                                  N{idx + 1}
                                </span>

                                {/* Design */}
                                <span className="font-bold text-slate-900 dark:text-white truncate max-w-[90px]" title={cp.plan.next_design}>
                                  {cp.plan.next_design || '—'}
                                </span>

                                {/* Expected Start */}
                                <span className="text-slate-500 dark:text-slate-400 shrink-0">
                                  {format(cp.expectedStart, 'dd-MMM')}
                                </span>

                                {/* Beam badge */}
                                {cp.planBeamNo ? (
                                  <span className="text-indigo-700 dark:text-indigo-300 font-semibold shrink-0 text-[9px]">
                                    B:{cp.planBeamNo}
                                  </span>
                                ) : (
                                  <span className="text-amber-600 font-semibold shrink-0 text-[9px]">NO BEAM</span>
                                )}

                                {/* Status */}
                                <span className={`shrink-0 text-[9px] font-bold px-1 py-0.5 rounded ${
                                  cp.statusLabel.includes('CONFIRMED') ? 'text-emerald-700 bg-emerald-100' :
                                  cp.statusLabel.includes('BEAM ALLOCATED') ? 'text-indigo-700 bg-indigo-100' :
                                  cp.statusLabel.includes('BEAM PENDING') ? 'text-amber-700 bg-amber-100' :
                                  'text-slate-500 bg-slate-100'
                                }`}>
                                  {cp.statusLabel}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* 28. Runout Status Badge */}
                      <td className="p-3 border-r border-slate-200 dark:border-slate-700">
                        <span className={`px-2.5 py-1 rounded-full font-black text-[9px] block text-center whitespace-nowrap ${
                          calc.runoutStatus === 'RUNOUT <= 2 DAYS' || calc.runoutStatus === 'RUNOUT <= 1 DAY' || calc.runoutStatus === 'RUNOUT OVERDUE'
                            ? 'bg-red-100 text-red-800 border border-red-300 animate-pulse'
                            : calc.runoutStatus === 'RUNOUT <= 5 DAYS'
                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                            : calc.runoutStatus === 'RUNOUT <= 10 DAYS'
                            ? 'bg-yellow-100 text-yellow-800 border border-yellow-300'
                            : calc.runoutStatus === 'DATA REQUIRED'
                            ? 'bg-slate-100 text-slate-500 border border-slate-200'
                            : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        }`}>
                          {calc.runoutStatus}
                        </span>
                      </td>

                      {/* 29. Remarks */}
                      <td className="p-3">
                        <input
                          type="text"
                          value={entry.remarks}
                          placeholder="Remarks"
                          onChange={e => handleEntryChange(loom.loomNo, 'remarks', e.target.value)}
                          className="w-24 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px]"
                        />
                      </td>

                      {/* 30. Actions */}
                      <td className="p-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setHistoryModalLoomNo(loom.loomNo)}
                            className="p-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-bold flex items-center gap-1 border border-blue-200"
                            title="Daily Production History & Edit Modal"
                          >
                            <Calendar className="w-3.5 h-3.5" />
                            <span>Logs</span>
                          </button>
                          <button
                            onClick={() => executePlan(loom.loomNo)}
                            disabled={beamMismatch}
                            className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 transition-colors disabled:opacity-40"
                          >
                            Save
                          </button>
                        </div>
                      </td>

                    </tr>

                    {/* ── Comprehensive 9-Dimension Expanded Operational Drawer ── */}
                    {isExpanded && (
                      <tr className="bg-slate-50/90 dark:bg-slate-900/70">
                        <td colSpan={30} className="p-5">
                          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-lg space-y-6 text-xs">
                            
                            {/* Drawer Header */}
                            <div className="flex flex-wrap items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-4">
                              <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-spu-primary text-white rounded-xl font-black text-sm">
                                  L-{loom.loomNo}
                                </div>
                                <div>
                                  <h3 className="text-base font-black text-slate-900 dark:text-white uppercase tracking-tight">
                                    Loom {loom.loomNo} Complete Operational Record
                                  </h3>
                                  <p className="text-xs text-slate-500">Unit: {loom.unit || 'UNIT 1'} | Type: {loom.loomType} | Status: {loom.status || 'Active'}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className={`px-3 py-1 rounded-full font-bold text-xs ${
                                  calc.confidenceLevel === 'HIGH CONFIDENCE' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                                  calc.confidenceLevel === 'MEDIUM CONFIDENCE' ? 'bg-blue-100 text-blue-800 border border-blue-300' :
                                  'bg-amber-100 text-amber-800 border border-amber-300'
                                }`}>
                                  Source: {calc.runoutSource} ({calc.confidenceLevel})
                                </span>
                              </div>
                            </div>

                            {/* 9-Dimension Section Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                              
                              {/* 1. LOOM MASTER PANEL */}
                              <div className="p-4 bg-slate-50 dark:bg-slate-750 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                                <h4 className="font-black uppercase text-[11px] text-amber-600 flex items-center gap-1.5">
                                  <Building2 className="w-4 h-4" /> 1. Loom Master Details
                                </h4>
                                <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[11px]">
                                  <div>Unit: <span className="font-bold">{loom.unit || 'UNIT 1'}</span></div>
                                  <div>Type: <span className="font-bold">{loom.loomType}</span></div>
                                  <div>Make: <span className="font-bold">{loom.make || 'N/A'}</span></div>
                                  <div>Model: <span className="font-bold">{loom.model || 'N/A'}</span></div>
                                  <div>Colours: <span className="font-bold">{loom.weftColours || 1}</span></div>
                                  <div>Width: <span className="font-bold">{loom.width || '190 CM'}</span></div>
                                  <div>Levers: <span className="font-bold">{loom.installedLever || 0}</span></div>
                                  <div>Beam Dia: <span className="font-bold">{loom.beamDia || 800} MM</span></div>
                                </div>
                              </div>

                              {/* 2. DESIGN MASTER PANEL */}
                              <div className="p-4 bg-slate-50 dark:bg-slate-750 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                                <h4 className="font-black uppercase text-[11px] text-blue-600 flex items-center gap-1.5">
                                  <Layers className="w-4 h-4" /> 2. Design Master Details
                                </h4>
                                {design || matchedOrder ? (
                                   <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[11px]">
                                     <div>Design: <span className="font-bold text-spu-primary">{design?.designNo || matchedOrder?.design_no_sp_no || entry.designNo}</span></div>
                                     <div>Construction: <span className="font-bold">{design?.construction || matchedOrder?.construction || '—'}</span></div>
                                     <div>Weave: <span className="font-bold">{design?.weaveType || matchedOrder?.weave_type || '—'}</span></div>
                                     <div>Frames: <span className="font-bold">{design?.frames || matchedOrder?.frames || '—'}</span></div>
                                     <div>Reed: <span className="font-bold">{design?.reedCount || design?.reed_count || matchedOrder?.reed_count || '—'}</span></div>
                                     <div>Pick: <span className="font-bold">{design?.pick || (matchedOrder?.ppi ? String(matchedOrder.ppi) : '') || matchedOrder?.pick || '—'}</span></div>
                                     <div>Greige W: <span className="font-bold">{design?.greigeWidth || matchedOrder?.greige_width || matchedOrder?.width || matchedOrder?.required_reed_space || '—'}</span></div>
                                     <div>Crimp: <span className="font-bold">{calc?.actualCrimpPercent !== null && calc?.actualCrimpPercent !== undefined ? `${calc.actualCrimpPercent.toFixed(1)}% (Actual)` : `${(calc?.standardCrimpPercent ?? (effectiveCrimp * 100)).toFixed(1)}%`}</span></div>
                                   </div>
                                 ) : (
                                   <p className="text-slate-400 text-[11px]">No design selected.</p>
                                 )}
                              </div>

                              {/* 3. ORDER DETAILS PANEL */}
                              <div className="p-4 bg-slate-50 dark:bg-slate-750 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                                <h4 className="font-black uppercase text-[11px] text-purple-600 flex items-center gap-1.5">
                                  <ShoppingBag className="w-4 h-4" /> 3. Connected Order Details
                                </h4>
                                {matchedOrder ? (
                                  <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[11px]">
                                    <div>Order No: <span className="font-bold text-spu-primary">{matchedOrder.order_no}</span></div>
                                    <div>Customer: <span className="font-bold">{matchedOrder.customer_name}</span></div>
                                    <div>Order Qty: <span className="font-bold">{matchedOrder.order_qty?.toLocaleString()} M</span></div>
                                    <div>Warp Qty: <span className="font-bold">{matchedOrder.warp_qty?.toLocaleString()} M</span></div>
                                    <div>Delivery: <span className="font-bold">{matchedOrder.target_delivery_date ? format(new Date(matchedOrder.target_delivery_date), 'dd-MMM-yyyy') : 'N/A'}</span></div>
                                    <div>Status: <span className="font-bold text-emerald-600">{matchedOrder.status}</span></div>
                                  </div>
                                ) : (
                                  <p className="text-slate-400 text-[11px]">No active order connected to this design.</p>
                                )}
                              </div>

                              {/* 4. BEAM & SET PANEL */}
                              <div className="p-4 bg-slate-50 dark:bg-slate-750 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                                <h4 className="font-black uppercase text-[11px] text-indigo-600 flex items-center gap-1.5">
                                  <Package className="w-4 h-4" /> 4. Beam & Set Stock Details
                                </h4>
                                {beamInfo ? (
                                  <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[11px]">
                                    <div>Beam No: <span className="font-bold">{beamInfo.beamNo || beamInfo.beam_no}</span></div>
                                    <div>Set No: <span className="font-bold text-spu-primary">{setNoDisplay}</span></div>
                                    <div>Vendor DC: <span className="font-bold">{beamInfo.warpingDcNo || beamInfo.warp_dc_no || 'N/A'}</span></div>
                                    <div>Vendor: <span className="font-bold">{beamInfo.vendor_name || beamInfo.warpingVendor || 'SPUPL'}</span></div>
                                    <div>Warp Meter: <span className="font-bold">{(beamInfo.beamLength || beamInfo.available_meter || 0).toLocaleString()} M</span></div>
                                    <div>Sizing Status: <span className="font-bold text-emerald-600">{beamInfo.sizingStatus || 'READY'}</span></div>
                                  </div>
                                ) : (
                                  <div className="text-[11px] space-y-1">
                                    <div>Beam No: <span className="font-bold">{entry.currentBeamNo || 'Not Entered'}</span></div>
                                    <div>Set No: <span className="font-bold">{setNoDisplay}</span></div>
                                  </div>
                                )}
                              </div>

                              {/* 5. REED DETAILS PANEL */}
                              <div className="p-4 bg-slate-50 dark:bg-slate-750 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                                <h4 className="font-black uppercase text-[11px] text-teal-600 flex items-center gap-1.5">
                                  <Activity className="w-4 h-4" /> 5. Reed Stock Details
                                </h4>
                                <div className="space-y-1.5 text-[11px]">
                                  <div>Required Reed Count: <span className="font-bold">{design?.reedCount || 'N/A'}</span></div>
                                  <div>Reed Status: {reeds.some(r => r.reedCount === design?.reedCount || r.reed_count === design?.reedCount) ? (
                                    <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">AVAILABLE IN STOCK</span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">REED CHECK WARNING</span>
                                  )}</div>
                                </div>
                              </div>

                              {/* 6. PRODUCTION & RUNOUT PANEL */}
                              <div className="p-4 bg-slate-50 dark:bg-slate-750 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                                <h4 className="font-black uppercase text-[11px] text-emerald-600 flex items-center gap-1.5">
                                  <Zap className="w-4 h-4" /> 6. Production & Runout Status
                                </h4>
                                <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[11px]">
                                  <div>Start Date: <span className="font-bold">{entry.loomStartDate}</span></div>
                                  <div>Produced: <span className="font-bold text-slate-900 dark:text-white">{calc.producedMeter.toFixed(0)} M</span></div>
                                  <div>Gross Balance: <span className="font-bold text-slate-900 dark:text-white">{calc.warpBalanceGross.toFixed(0)} M</span></div>
                                  <div>Crimp Loss: <span className="font-bold text-slate-900 dark:text-white">{calc.crimpLossMeter.toFixed(0)} M</span></div>
                                  <div>Effective Prod: <span className="font-bold text-emerald-600">{calc.effectiveDailyProduction > 0 ? `${calc.effectiveDailyProduction.toFixed(1)} M/d` : '—'}</span></div>
                                  <div>Net Balance: <span className="font-bold text-spu-primary">{calc.netBalanceMeter.toFixed(0)} M</span></div>
                                  <div>Balance Days: <span className="font-black text-amber-600">{calc.balanceDays === 999999 ? '—' : `${calc.balanceDays.toFixed(1)} Days`}</span></div>
                                  <div>Expected Runout: <span className="font-bold">{calc.runoutStatus === 'DATA REQUIRED' || calc.balanceDays === 999999 ? 'Calculating...' : format(calc.expectedRunoutDate, 'dd-MMM-yyyy')}</span></div>
                                </div>
                              </div>

                            </div>

                            {/* 7. NEXT 1-5 PLANS QUEUE PANEL */}
                            <div className="p-4 bg-teal-50/60 dark:bg-teal-950/40 rounded-xl border border-teal-200 dark:border-teal-800 space-y-3 text-xs">
                              <div className="flex items-center gap-2 text-teal-900 dark:text-teal-200 font-black border-b border-teal-200 dark:border-teal-700 pb-2">
                                <ListTodo className="w-4 h-4 text-teal-600" />
                                <span>NEXT PLANS QUEUE — LOOM {loom.loomNo} (up to 5 designs)</span>
                              </div>
                              {cascadedPlans.length === 0 ? (
                                <p className="text-slate-500 italic text-[11px]">No next plans currently queued for this loom.</p>
                              ) : (
                                <div className="space-y-2">
                                  {cascadedPlans.map((cp, idx) => {
                                    const planOrder = ordersMap?.get((cp.plan.next_design || '').trim().toLowerCase()) || (Array.isArray(orders) ? orders.find(
                                      (o: any) => o.design_no_sp_no === cp.plan.next_design
                                    ) : null);
                                    return (
                                      <div
                                        key={cp.plan.id || idx}
                                        className={`grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 px-3 py-2.5 rounded-lg border ${
                                          idx === 0
                                            ? 'bg-teal-100/60 border-teal-300 dark:bg-teal-900/30 dark:border-teal-700'
                                            : 'bg-white border-slate-200 dark:bg-slate-800 dark:border-slate-700'
                                        }`}
                                      >
                                        {/* Plan badge + Design */}
                                        <div className="col-span-2 md:col-span-1 flex items-center gap-2">
                                          <span className={`font-black text-[10px] px-2 py-0.5 rounded-full shrink-0 ${
                                            idx === 0 ? 'bg-teal-600 text-white' : 'bg-slate-400 text-white'
                                          }`}>
                                            NEXT {idx + 1}
                                          </span>
                                          <span className="font-black text-slate-900 dark:text-white text-[11px]">
                                            {cp.plan.next_design || '—'}
                                          </span>
                                        </div>

                                        {/* Order / IBPO */}
                                        <div>
                                          <div className="text-[9px] text-slate-400 font-bold uppercase">Order/IBPO</div>
                                          <div className="font-bold text-slate-700 dark:text-slate-300">
                                            {cp.plan.order_no || planOrder?.ibpo_no || planOrder?.order_no || '—'}
                                          </div>
                                        </div>

                                        {/* Beam */}
                                        <div>
                                          <div className="text-[9px] text-slate-400 font-bold uppercase">Beam</div>
                                          <div className={`font-bold ${
                                            cp.planBeamNo ? 'text-indigo-700 dark:text-indigo-300' : 'text-amber-600'
                                          }`}>
                                            {cp.planBeamNo || 'Not Allocated'}
                                          </div>
                                        </div>

                                        {/* Expected Start */}
                                        <div>
                                          <div className="text-[9px] text-slate-400 font-bold uppercase">Exp. Start</div>
                                          <div className="font-bold text-slate-700 dark:text-slate-300">
                                            {format(cp.expectedStart, 'dd-MMM-yyyy')}
                                          </div>
                                        </div>

                                        {/* Expected Runout */}
                                        <div>
                                          <div className="text-[9px] text-slate-400 font-bold uppercase">Exp. Runout</div>
                                          <div className="font-bold text-slate-700 dark:text-slate-300">
                                            {format(cp.expectedRunout, 'dd-MMM-yyyy')}
                                          </div>
                                        </div>

                                        {/* Warp Mtr */}
                                        <div>
                                          <div className="text-[9px] text-slate-400 font-bold uppercase">Warp Mtr</div>
                                          <div className="font-bold text-slate-700 dark:text-slate-300">
                                            {cp.planWarpMtr.toLocaleString()} M
                                          </div>
                                        </div>

                                        {/* Avg Prod */}
                                        <div>
                                          <div className="text-[9px] text-slate-400 font-bold uppercase">Avg Prod</div>
                                          <div className="font-bold text-slate-700 dark:text-slate-300">
                                            {cp.planAvgProd.toFixed(0)} M/d
                                            {Number(cp.plan.planned_avg_daily_production) <= 0 && (
                                              <span className="text-amber-500 text-[9px] ml-1">(est.)</span>
                                            )}
                                          </div>
                                        </div>

                                        {/* Status */}
                                        <div>
                                          <div className="text-[9px] text-slate-400 font-bold uppercase">Status</div>
                                          <span className={`inline-block text-[9px] font-black px-2 py-0.5 rounded-full ${
                                            cp.statusLabel.includes('CONFIRMED') ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                                            cp.statusLabel.includes('BEAM ALLOCATED') ? 'bg-indigo-100 text-indigo-800 border border-indigo-300' :
                                            cp.statusLabel.includes('BEAM PENDING') ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                                            'bg-slate-100 text-slate-600 border border-slate-300'
                                          }`}>
                                            {cp.statusLabel}
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
});
export default LoomRow;
