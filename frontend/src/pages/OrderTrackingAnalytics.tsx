import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import {
  Search, RefreshCw, Printer, AlertTriangle, CheckCircle2, Clock, Calendar,
  ArrowRight, ArrowUpRight, Cpu, Layers, Package, ShieldCheck, Zap, Info,
  TrendingUp, Sliders, ChevronRight, X, ExternalLink, Activity, Box, Filter,
  Check, AlertCircle, PlayCircle, BarChart3, Scissors, Sparkles, Building2,
  HelpCircle, ArrowDownCircle, CheckSquare, ListOrdered
} from 'lucide-react';
import { format, addDays, startOfDay, differenceInDays, isValid, isPast } from 'date-fns';
import { useAppContext } from '../context/AppProvider';
import { PrintTableHeaderRow } from '../components/common/CompanyPrintHeader';
import { triggerPrint } from '../utils/printManager';
import {
  checkLoomCompatibility,
  getMainEntryLoomRun,
  calculateOrderPlanning,
  calculateOrderBeamRequirement,
  calculateOrderReedRequirement,
  calculateNextPlanRunouts,
  formatRunoutDate,
  formatBalanceDays,
  normalizeIbpo,
  isMatchingDesign
} from '../utils/calculations';

export default function OrderTrackingAnalytics() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    orders = [],
    designs = [],
    looms = [],
    activeRuns = {},
    productionLogs = [],
    beams = [],
    reeds = [],
    rawNextPlans = [],
    refreshData
  } = useAppContext();

  // Selected Order & Search State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [loomFilterTab, setLoomFilterTab] = useState<'COMPATIBLE' | 'RUNNING' | 'AVAILABLE' | 'NEXT_PLANNED' | 'ALL'>('COMPATIBLE');
  const [whatIfLoomCount, setWhatIfLoomCount] = useState<number>(6);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());

  // Current operational date reference (today)
  const today = useMemo(() => startOfDay(new Date()), []);

  // Auto-select order based on query param or first running/active order
  useEffect(() => {
    const urlOrderNo = searchParams.get('orderNo');
    const urlIbpo = searchParams.get('ibpo');
    const urlId = searchParams.get('id');

    if (orders.length === 0) return;

    if (urlId) {
      const match = orders.find(o => String(o.id) === urlId);
      if (match) {
        setSelectedOrderId(match.id);
        return;
      }
    }

    if (urlOrderNo) {
      const match = orders.find(o => (o.order_no || '').toLowerCase() === urlOrderNo.toLowerCase());
      if (match) {
        setSelectedOrderId(match.id);
        return;
      }
    }

    if (urlIbpo) {
      const match = orders.find(o => normalizeIbpo(o.ibpo_no) === normalizeIbpo(urlIbpo));
      if (match) {
        setSelectedOrderId(match.id);
        return;
      }
    }

    // Default to first RUNNING or PLANNED order, or first in list
    if (selectedOrderId === null && orders.length > 0) {
      const defaultOrder = orders.find(o => (o.status || '').toUpperCase() === 'RUNNING') ||
                           orders.find(o => (o.status || '').toUpperCase() === 'PLANNED') ||
                           orders[0];
      if (defaultOrder) {
        setSelectedOrderId(defaultOrder.id);
      }
    }
  }, [orders, searchParams]);

  const selectedOrder = useMemo(() => {
    if (!selectedOrderId) return null;
    return orders.find(o => o.id === selectedOrderId) || null;
  }, [orders, selectedOrderId]);

  // Handle manual refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      if (refreshData) await refreshData();
      setLastRefreshedAt(new Date());
    } finally {
      setIsRefreshing(false);
    }
  };

  // Matched Design for the selected order
  const matchedDesign = useMemo(() => {
    if (!selectedOrder) return null;
    const orderDesignStr = (selectedOrder.design_no_sp_no || selectedOrder.design_no || '').trim().toLowerCase();
    if (!orderDesignStr) return null;
    return designs.find(d => {
      const dStr = (d.design_no || d.design_no_sp_no || '').trim().toLowerCase();
      return isMatchingDesign(dStr, orderDesignStr);
    }) || null;
  }, [selectedOrder, designs]);

  // Filtered orders for autocomplete / search dropdown
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();
    return orders.filter(o =>
      (o.order_no || '').toLowerCase().includes(q) ||
      (o.ibpo_no || '').toLowerCase().includes(q) ||
      (o.design_no_sp_no || '').toLowerCase().includes(q) ||
      (o.buyer || o.customer_name || '').toLowerCase().includes(q)
    ).slice(0, 10);
  }, [orders, searchQuery]);

  // Top active orders for quick chips
  const activeOrderChips = useMemo(() => {
    return orders.filter(o => {
      const st = (o.status || '').toUpperCase();
      return st === 'RUNNING' || st === 'PLANNED';
    }).slice(0, 6);
  }, [orders]);

  // Combined order/design spec
  const orderSpec = useMemo(() => {
    if (!selectedOrder) return null;
    const orderQty = Math.max(0, Number(selectedOrder.order_qty || selectedOrder.grey_qty) || 0);
    const crimp = Number(matchedDesign?.crimp_percent ?? selectedOrder.crimp_percent ?? 5);
    const warpQty = selectedOrder.warp_qty && Number(selectedOrder.warp_qty) > 0
      ? Number(selectedOrder.warp_qty)
      : Math.round(orderQty * (1 + crimp / 100));

    const weave = matchedDesign?.weave || matchedDesign?.weave_type || selectedOrder.weave_type || selectedOrder.weave || 'PLAIN';
    const frames = Number(matchedDesign?.frames || matchedDesign?.no_of_frames || selectedOrder.frames || selectedOrder.no_of_frames || 4);
    const reedCount = matchedDesign?.reed_count || selectedOrder.reed_count || '—';
    const pick = matchedDesign?.pick || selectedOrder.ppi || selectedOrder.pick || '—';
    const greigeWidth = matchedDesign?.greige_width || selectedOrder.greige_width || '—';
    const totalEnds = matchedDesign?.total_ends || selectedOrder.total_ends || '—';
    const construction = matchedDesign?.construction || selectedOrder.construction || '—';
    const buyer = selectedOrder.buyer || selectedOrder.customer_name || 'Standard Buyer';

    return {
      orderQty,
      crimp,
      warpQty,
      weave,
      frames,
      reedCount,
      pick,
      greigeWidth,
      totalEnds,
      construction,
      buyer
    };
  }, [selectedOrder, matchedDesign]);

  // All 224 looms compatibility & current state evaluation
  const loomEvaluationList = useMemo(() => {
    if (!selectedOrder) return [];

    const orderDesignClean = (selectedOrder.design_no_sp_no || selectedOrder.design_no || '').trim().toLowerCase();
    const orderObjForCompat = {
      ...selectedOrder,
      weave_type: orderSpec?.weave,
      frames: orderSpec?.frames,
      greige_width: orderSpec?.greigeWidth,
      designMaster: matchedDesign
    };

    return looms.map(loom => {
      const loomNo = Number(loom.loom_no || loom.loomNo);
      const compat = checkLoomCompatibility(orderObjForCompat, loom);

      // Find active run for this loom
      const activeRun = activeRuns[loomNo] || (Array.isArray(activeRuns) ? activeRuns.find((r: any) => Number(r.loomNo || r.loom_no) === loomNo) : null);
      const activeRunAny = activeRun as any;
      const isRunning = Boolean(activeRun && (activeRun.designNo || activeRunAny?.design_no_sp_no));
      const runningDesignClean = (activeRun?.designNo || activeRunAny?.design_no_sp_no || '').trim().toLowerCase();
      const isRunningThisOrder = isRunning && (
        (activeRunAny?.orderNo && activeRunAny.orderNo.toLowerCase() === (selectedOrder.order_no || '').toLowerCase()) ||
        (activeRunAny?.order_no && activeRunAny.order_no.toLowerCase() === (selectedOrder.order_no || '').toLowerCase()) ||
        isMatchingDesign(runningDesignClean, orderDesignClean)
      );

      // Matched beam & design for active run
      const runningBeam = beams.find(b => b.beam_no === activeRunAny?.beamNo || b.beam_no === activeRun?.currentBeamNo);
      const runningDesignObj = designs.find(d => isMatchingDesign(d.design_no, runningDesignClean));

      // Main Entry operational calculation
      const mainEntryRun = getMainEntryLoomRun({
        loomNo,
        activeRun,
        design: runningDesignObj || matchedDesign,
        order: selectedOrder,
        beam: runningBeam,
        productionLogs
      });

      // Next plans for this loom
      const loomNextPlans = (rawNextPlans || []).filter(p => Number(p.loom_no || p.loomNo) === loomNo);
      const calculatedPlans = calculateNextPlanRunouts(
        mainEntryRun.expectedRunoutDate,
        mainEntryRun.effectiveDailyProduction || 300,
        loomNextPlans,
        orders,
        designs
      );

      // Truly Available Now means: Idle / empty AND no queued next plan blocking it
      const isTrulyAvailableNow = compat.compatible && !isRunning && calculatedPlans.length === 0;

      // Determine Earliest Available Date for this loom to take the selected order
      let earliestAvailableDate = new Date();
      let availabilityReason = 'Available Immediately';

      if (isRunningThisOrder) {
        earliestAvailableDate = new Date();
        availabilityReason = 'Running This Order';
      } else if (isRunning) {
        if (calculatedPlans.length > 0) {
          const lastPlan = calculatedPlans[calculatedPlans.length - 1];
          earliestAvailableDate = lastPlan.expectedRunoutDate ? addDays(lastPlan.expectedRunoutDate, 1) : addDays(new Date(), 14);
          availabilityReason = `Runs out ${formatRunoutDate(mainEntryRun.expectedRunoutDate)}, plus ${calculatedPlans.length} plan(s)`;
        } else {
          earliestAvailableDate = addDays(mainEntryRun.expectedRunoutDate, 1);
          availabilityReason = `Runs out ${formatRunoutDate(mainEntryRun.expectedRunoutDate)}`;
        }
      } else if (calculatedPlans.length > 0) {
        const lastPlan = calculatedPlans[calculatedPlans.length - 1];
        earliestAvailableDate = lastPlan.expectedRunoutDate ? addDays(lastPlan.expectedRunoutDate, 1) : addDays(new Date(), 7);
        availabilityReason = `Idle now, but ${calculatedPlans.length} plan(s) queued`;
      } else {
        earliestAvailableDate = new Date();
        availabilityReason = 'Idle & Ready Now';
      }

      return {
        loomNo,
        loom,
        compat,
        activeRun,
        isRunning,
        isRunningThisOrder,
        isTrulyAvailableNow,
        mainEntryRun,
        calculatedPlans,
        earliestAvailableDate,
        availabilityReason
      };
    });
  }, [selectedOrder, orderSpec, matchedDesign, looms, activeRuns, beams, designs, productionLogs, rawNextPlans, orders]);

  // Running Looms for this Order
  const currentlyRunningLooms = useMemo(() => {
    return loomEvaluationList.filter(l => l.isRunningThisOrder);
  }, [loomEvaluationList]);

  // Order Balance & Live Production Summary
  const productionSummary = useMemo(() => {
    if (!selectedOrder || !orderSpec) {
      return { totalProduced: 0, balanceQty: 0, progressPercent: 0, dailyRunRate: 0, daysToComplete: 0, hasDiscrepancy: false };
    }

    // Produced quantity from Order Management
    const orderManagementProduced = Number(selectedOrder.produced_qty || selectedOrder.producedQty || 0);

    // Sum cumulative live produced from currently running looms in Main Entry
    let liveLoomProduced = 0;
    let dailyRunRate = 0;

    currentlyRunningLooms.forEach(l => {
      liveLoomProduced += Math.max(0, l.mainEntryRun.producedMeter || 0);
      dailyRunRate += Math.max(0, l.mainEntryRun.effectiveDailyProduction || 0);
    });

    // Use Order Management produced as primary if greater, or live loom produced
    const totalProduced = Math.max(orderManagementProduced, liveLoomProduced);
    const totalOrderQty = orderSpec.orderQty;
    const balanceQty = Math.max(0, totalOrderQty - totalProduced);
    const progressPercent = totalOrderQty > 0 ? Math.min(100, Math.round((totalProduced / totalOrderQty) * 100)) : 0;
    const daysToComplete = dailyRunRate > 0 ? Math.ceil(balanceQty / dailyRunRate) : 0;

    // Consistency check between Order Management recorded balance and calculated balance
    const expectedBalance = Math.max(0, totalOrderQty - totalProduced);
    const recordedBalance = selectedOrder.balance_qty !== undefined && selectedOrder.balance_qty !== null
      ? Number(selectedOrder.balance_qty)
      : expectedBalance;
    const hasDiscrepancy = Math.abs(recordedBalance - expectedBalance) > 50;

    return {
      totalProduced,
      balanceQty,
      progressPercent,
      dailyRunRate,
      daysToComplete,
      hasDiscrepancy
    };
  }, [selectedOrder, orderSpec, currentlyRunningLooms]);

  // Resource Readiness: Sizing
  const sizingReadiness = useMemo(() => {
    if (!selectedOrder) {
      return {
        approvalStatus: 'NOT SPECIFIED',
        productionStatus: 'PENDING',
        isApproved: false,
        isCompleted: false,
        displayStatus: 'PENDING SIZING',
        statusColor: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
        dateText: '—',
        explanation: 'Sizing details are not recorded for this order.'
      };
    }

    const rawStatus = (selectedOrder.sizing_status || '').toUpperCase().trim();
    const yarnStatus = (selectedOrder.yarn_status || '').toUpperCase().trim();
    const sizingDate = selectedOrder.sizing_date || selectedOrder.sizing_completion_date;

    const isCompleted = rawStatus === 'COMPLETED' || rawStatus === 'SIZED';
    const isApproved = rawStatus === 'APPROVED' || selectedOrder.sizing_approved === true || rawStatus.includes('APPROV');
    const isInProcess = rawStatus === 'IN PROCESS' || rawStatus === 'RUNNING';

    let displayStatus = 'SIZING PENDING';
    let statusColor = 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300';
    let explanation = 'Order cannot start weaving until warp sizing is completed.';

    if (isCompleted) {
      displayStatus = 'SIZING COMPLETED';
      statusColor = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300';
      explanation = 'Warp yarn is fully sized and ready for beaming/weaving.';
    } else if (isInProcess) {
      displayStatus = 'SIZING IN PROCESS';
      statusColor = 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300';
      explanation = 'Sizing process is actively underway in sizing department.';
    } else if (isApproved) {
      displayStatus = 'APPROVED BUT NOT COMPLETED';
      statusColor = 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300';
      explanation = 'Sizing plan is approved, but physical yarn sizing has not completed yet.';
    }

    return {
      approvalStatus: isApproved ? 'APPROVED' : 'PENDING APPROVAL',
      productionStatus: isCompleted ? 'COMPLETED' : isInProcess ? 'IN PROCESS' : 'PENDING',
      yarnStatus: yarnStatus || 'YARN READY',
      isApproved,
      isCompleted,
      displayStatus,
      statusColor,
      dateText: sizingDate ? formatRunoutDate(sizingDate) : '—',
      explanation
    };
  }, [selectedOrder]);

  // Resource Readiness: Reed Stock (Strict logic: available >= required -> READY, else SHORTAGE)
  const reedReadiness = useMemo(() => {
    if (!selectedOrder || !orderSpec) return null;
    const requiredReedQty = Math.max(1, currentlyRunningLooms.length || selectedOrder.planned_loom_count || 3);
    const targetReedCount = (orderSpec.reedCount || '').trim();

    // Match in actual reed stock
    const matchingReeds = reeds.filter(r => (r.reed_count || '').trim().toLowerCase() === targetReedCount.toLowerCase());
    const availableTotal = matchingReeds.reduce((sum, r) => sum + Number(r.available_qty !== undefined ? r.available_qty : (r.total_qty || 1)), 0);
    const reservedTotal = matchingReeds.reduce((sum, r) => sum + Number(r.reserved_qty || 0), 0);
    const runningTotal = matchingReeds.reduce((sum, r) => sum + Number(r.running_qty || 0), 0);

    const usableBalance = Math.max(0, availableTotal - reservedTotal - runningTotal);
    const shortageQty = Math.max(0, requiredReedQty - usableBalance);

    const isReady = usableBalance >= requiredReedQty;
    const statusLabel = isReady ? 'READY' : 'SHORTAGE';
    const statusColor = isReady
      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
      : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300';

    const message = isReady
      ? `${usableBalance} usable reeds available in stock for ${requiredReedQty} planned loom(s). No shortage.`
      : `Shortage of ${shortageQty} reed(s). Only ${usableBalance} usable reed(s) available for ${requiredReedQty} planned loom(s).`;

    return {
      requiredReedQty,
      usableBalance,
      availableTotal,
      reservedTotal,
      runningTotal,
      shortageQty,
      isReady,
      statusLabel,
      statusColor,
      message
    };
  }, [selectedOrder, orderSpec, currentlyRunningLooms, reeds]);

  // Resource Readiness: Beam Stock (Separating Beam Count from Warp Meters, physically free stock only)
  const beamReadiness = useMemo(() => {
    if (!selectedOrder || !orderSpec) return null;

    const orderDesignStr = (selectedOrder.design_no_sp_no || selectedOrder.design_no || '').trim().toLowerCase();
    const orderNoClean = (selectedOrder.order_no || '').trim().toLowerCase();
    const beamCap = Number(matchedDesign?.beam_length_capacity) || 1800;

    const requiredWarpMeters = orderSpec.warpQty;
    const requiredBeamCount = Math.max(1, Math.ceil(requiredWarpMeters / beamCap));

    // Allocated beams for this specific order/design
    const allocatedBeams = beams.filter(b => {
      const bOrder = (b.order_no || '').trim().toLowerCase();
      const bDesign = (b.design_no || '').trim().toLowerCase();
      return (bOrder && bOrder === orderNoClean) || (bDesign && isMatchingDesign(bDesign, orderDesignStr));
    });

    const allocatedWarpMeters = allocatedBeams.reduce((sum, b) => sum + (Number(b.available_meter || b.beamLength) || 0), 0);
    const allocatedBeamCount = allocatedBeams.length;

    // Beams currently running on looms (must NOT be counted as free physical stock)
    const runningBeams = beams.filter(b => (b.status || '').toUpperCase() === 'RUNNING');
    const runningBeamCount = runningBeams.length;

    // Available unallocated beams (free in physical stock only)
    const freeAvailableBeams = beams.filter(b => {
      const st = (b.status || '').toUpperCase();
      const isUnallocated = !b.order_no && !b.reserved_order_no;
      const isEligibleDesign = !b.design_no || isMatchingDesign(b.design_no, orderDesignStr);
      return (st === 'AVAILABLE' || st === 'IN STOCK') && isUnallocated && isEligibleDesign;
    });

    const freeAvailableWarpMeters = freeAvailableBeams.reduce((sum, b) => sum + (Number(b.available_meter || b.beamLength) || 0), 0);
    const freeAvailableBeamCount = freeAvailableBeams.length;

    // Remaining warp and beams to prepare
    const remainingWarpMeters = Math.max(0, requiredWarpMeters - allocatedWarpMeters);
    const remainingBeamCount = Math.max(0, requiredBeamCount - allocatedBeamCount);

    // Strict Status Logic
    let statusLabel: 'READY' | 'PARTIAL' | 'SHORTAGE' | 'BEAM DATA CHECK REQUIRED' = 'SHORTAGE';
    let statusColor = 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300';
    let message = '';

    if (requiredWarpMeters <= 0) {
      statusLabel = 'BEAM DATA CHECK REQUIRED';
      statusColor = 'bg-amber-100 text-amber-800';
      message = 'Warp meter calculation is 0. Check design crimp and order quantity.';
    } else if (remainingWarpMeters === 0 || allocatedWarpMeters >= requiredWarpMeters) {
      statusLabel = 'READY';
      statusColor = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300';
      message = `All ${requiredWarpMeters.toLocaleString()} M warp required is fully allocated and ready.`;
    } else if (freeAvailableWarpMeters >= remainingWarpMeters) {
      statusLabel = 'PARTIAL';
      statusColor = 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300';
      message = `Allocated: ${allocatedWarpMeters.toLocaleString()} M. Unallocated stock (${freeAvailableWarpMeters.toLocaleString()} M) is sufficient to cover remaining ${remainingWarpMeters.toLocaleString()} M.`;
    } else {
      statusLabel = 'SHORTAGE';
      statusColor = 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300';
      message = `Shortage detected. ${remainingWarpMeters.toLocaleString()} M warp must be prepared in sizing/warping department.`;
    }

    return {
      requiredWarpMeters,
      allocatedWarpMeters,
      freeAvailableWarpMeters,
      remainingWarpMeters,
      requiredBeamCount,
      allocatedBeamCount,
      freeAvailableBeamCount,
      runningBeamCount,
      remainingBeamCount,
      statusLabel,
      statusColor,
      message
    };
  }, [selectedOrder, orderSpec, matchedDesign, beams]);

  // Loom Capacity Categorization (Clear separation between Compatible, Running, Available Now)
  const loomCapacity = useMemo(() => {
    const totalLooms = loomEvaluationList.length;
    const compatibleLooms = loomEvaluationList.filter(l => l.compat.compatible);
    const runningThisOrderLooms = loomEvaluationList.filter(l => l.isRunningThisOrder);
    const runningOtherOrderLooms = loomEvaluationList.filter(l => l.isRunning && !l.isRunningThisOrder && l.compat.compatible);
    const availableNowLooms = loomEvaluationList.filter(l => l.isTrulyAvailableNow);
    const queuedNextPlanLooms = loomEvaluationList.filter(l => l.compat.compatible && l.calculatedPlans.length > 0);
    const incompatibleLooms = loomEvaluationList.filter(l => !l.compat.compatible);

    return {
      totalLooms,
      compatibleCount: compatibleLooms.length,
      runningThisOrderCount: runningThisOrderLooms.length,
      runningOtherOrderCount: runningOtherOrderLooms.length,
      availableNowCount: availableNowLooms.length,
      queuedNextPlanCount: queuedNextPlanLooms.length,
      incompatibleCount: incompatibleLooms.length
    };
  }, [loomEvaluationList]);

  // Filtered Looms for the Table
  const filteredLooms = useMemo(() => {
    return loomEvaluationList.filter(l => {
      if (loomFilterTab === 'COMPATIBLE') return l.compat.compatible;
      if (loomFilterTab === 'RUNNING') return l.isRunningThisOrder;
      if (loomFilterTab === 'AVAILABLE') return l.isTrulyAvailableNow;
      if (loomFilterTab === 'NEXT_PLANNED') return l.calculatedPlans.length > 0;
      return true;
    });
  }, [loomEvaluationList, loomFilterTab]);

  // Rigorous Target Feasibility Calculation (Preventing ANY Contradiction!)
  const targetFeasibility = useMemo(() => {
    if (!selectedOrder || !orderSpec) return null;

    const targetDateStr = selectedOrder.target_delivery_date || selectedOrder.weaving_completion_date || selectedOrder.delivery_date;
    if (!targetDateStr) {
      return {
        status: 'NO TARGET SET',
        badgeColor: 'bg-slate-100 text-slate-700',
        varianceDays: 0,
        varianceText: 'No target delivery date specified',
        targetDate: null,
        expectedFinishDate: null,
        isFeasible: false,
        explanation: 'Please set a target completion date in Order Management.'
      };
    }

    const targetDate = startOfDay(new Date(targetDateStr));
    if (!isValid(targetDate)) {
      return {
        status: 'INVALID TARGET DATE',
        badgeColor: 'bg-rose-100 text-rose-800',
        varianceDays: 0,
        varianceText: 'Target date format invalid',
        targetDate: null,
        expectedFinishDate: null,
        isFeasible: false,
        explanation: 'Target completion date is not a valid calendar date.'
      };
    }

    const isOrderCompleted = (selectedOrder.status || '').toUpperCase() === 'COMPLETED' ||
                             (selectedOrder.status || '').toUpperCase() === 'ORDER COMPLETED' ||
                             productionSummary.balanceQty <= 0;

    // 1. Check if Target Date is already in the past
    const isTargetInPast = targetDate < today;

    if (isOrderCompleted) {
      return {
        status: 'ORDER COMPLETED',
        badgeColor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
        varianceDays: 0,
        varianceText: 'Completed',
        targetDate,
        expectedFinishDate: targetDate,
        isFeasible: true,
        explanation: 'Order has already completed production.'
      };
    }

    if (isTargetInPast) {
      const daysOverdue = differenceInDays(today, targetDate);
      return {
        status: 'OVERDUE / TARGET MISSED',
        badgeColor: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300',
        varianceDays: -daysOverdue,
        varianceText: `OVERDUE BY ${daysOverdue} DAY${daysOverdue === 1 ? '' : 'S'}`,
        targetDate,
        expectedFinishDate: null,
        isFeasible: false,
        explanation: `Target date (${formatRunoutDate(targetDate)}) passed. Order has ${productionSummary.balanceQty.toLocaleString()} M pending.`
      };
    }

    // 2. Target Date is in the future: evaluate expected finish date based on daily production
    const plannedLooms = Math.max(1, currentlyRunningLooms.length || selectedOrder.planned_loom_count || 3);
    const avgPerLoom = productionSummary.dailyRunRate > 0 && currentlyRunningLooms.length > 0
      ? Math.round(productionSummary.dailyRunRate / currentlyRunningLooms.length)
      : (Number(selectedOrder.planned_avg_production) || 300);

    const effectiveDailyProd = plannedLooms * avgPerLoom;
    const daysRequired = effectiveDailyProd > 0 ? Math.ceil(productionSummary.balanceQty / effectiveDailyProd) : 0;

    // Earliest start date among compatible looms
    const compLooms = loomEvaluationList.filter(l => l.compat.compatible);
    let earliestPossibleStart = today;
    if (currentlyRunningLooms.length > 0) {
      earliestPossibleStart = today;
    } else if (compLooms.length > 0) {
      const sorted = [...compLooms].sort((a, b) => a.earliestAvailableDate.getTime() - b.earliestAvailableDate.getTime());
      earliestPossibleStart = sorted[0].earliestAvailableDate < today ? today : sorted[0].earliestAvailableDate;
    }

    const expectedFinishDate = addDays(earliestPossibleStart, Math.max(0, daysRequired - 1));

    // Variance = Target Date - Expected Finish Date
    // > 0 means finishing before target (Ahead)
    // = 0 means finishing exactly on target
    // < 0 means finishing after target (Delayed)
    const varianceDays = differenceInDays(targetDate, expectedFinishDate);

    let status = 'ON TARGET';
    let badgeColor = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300';
    let varianceText = 'ON TARGET';
    let isFeasible = true;

    if (varianceDays > 0) {
      status = `AHEAD BY ${varianceDays} DAY${varianceDays === 1 ? '' : 'S'}`;
      badgeColor = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300';
      varianceText = `Ahead by ${varianceDays} day${varianceDays === 1 ? '' : 's'}`;
      isFeasible = true;
    } else if (varianceDays === 0) {
      status = 'ON TARGET';
      badgeColor = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300';
      varianceText = 'Finishes on target date';
      isFeasible = true;
    } else {
      const delayDays = Math.abs(varianceDays);
      status = `DELAYED BY ${delayDays} DAY${delayDays === 1 ? '' : 'S'}`;
      badgeColor = 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300';
      varianceText = `Delayed by ${delayDays} day${delayDays === 1 ? '' : 's'}`;
      isFeasible = false;
    }

    return {
      status,
      badgeColor,
      varianceDays,
      varianceText,
      targetDate,
      expectedFinishDate,
      earliestPossibleStart,
      daysRequired,
      isFeasible,
      explanation: `Expected finish (${formatRunoutDate(expectedFinishDate)}) vs target completion (${formatRunoutDate(targetDate)}).`
    };
  }, [selectedOrder, orderSpec, today, productionSummary, currentlyRunningLooms, loomEvaluationList]);

  // Recommended Loom Combinations (Validated, No double allocation, strictly compatible)
  const loomCombinations = useMemo(() => {
    if (!selectedOrder || !orderSpec || !targetFeasibility) return null;

    const compatibleLooms = loomEvaluationList
      .filter(l => l.compat.compatible)
      .sort((a, b) => a.earliestAvailableDate.getTime() - b.earliestAvailableDate.getTime());

    if (compatibleLooms.length === 0) return null;

    const balance = productionSummary.balanceQty;
    const avgPerLoom = 300;

    // Helper to evaluate a unique combination of looms
    const evaluateOption = (selectedLoomItems: typeof compatibleLooms, label: string) => {
      // Ensure unique loom numbers
      const uniqueItems = Array.from(new Set(selectedLoomItems.map(l => l.loomNo)))
        .map(no => selectedLoomItems.find(l => l.loomNo === no)!)
        .filter(Boolean);

      const loomCount = uniqueItems.length;
      const loomNos = uniqueItems.map(l => l.loomNo);
      const start = uniqueItems.reduce((max, l) => l.earliestAvailableDate > max ? l.earliestAvailableDate : max, today);
      const daily = loomCount * avgPerLoom;
      const days = daily > 0 ? Math.ceil(balance / daily) : 0;
      const finish = addDays(start, Math.max(0, days - 1));

      let status = 'ON TARGET';
      let badgeColor = 'bg-emerald-100 text-emerald-800';
      let variance = 0;

      if (targetFeasibility.targetDate) {
        variance = differenceInDays(targetFeasibility.targetDate, finish);
        if (variance > 0) {
          status = `AHEAD BY ${variance}D`;
          badgeColor = 'bg-emerald-100 text-emerald-800';
        } else if (variance === 0) {
          status = 'ON TARGET';
          badgeColor = 'bg-emerald-100 text-emerald-800';
        } else {
          status = `DELAYED BY ${Math.abs(variance)}D`;
          badgeColor = 'bg-rose-100 text-rose-800';
        }
      }

      return { label, loomNos, loomCount, startDate: start, finishDate: finish, daily, days, status, badgeColor, variance };
    };

    // Option A: Recommended Best Alignment (balanced 4 looms)
    const optALooms = compatibleLooms.slice(0, Math.min(4, compatibleLooms.length));
    const optionA = evaluateOption(optALooms, 'Option A: Best Target Alignment');

    // Option B: Fastest Completion (Take up to 8 compatible looms)
    const optBLooms = compatibleLooms.slice(0, Math.min(8, compatibleLooms.length));
    const optionB = evaluateOption(optBLooms, 'Option B: Fastest Completion');

    // Option C: Earliest Start (Immediate free / idle looms)
    const immediateLooms = compatibleLooms.filter(l => l.isTrulyAvailableNow);
    const optCLooms = (immediateLooms.length > 0 ? immediateLooms : compatibleLooms).slice(0, Math.min(4, compatibleLooms.length));
    const optionC = evaluateOption(optCLooms, 'Option C: Earliest Start');

    return { optionA, optionB, optionC };
  }, [selectedOrder, orderSpec, targetFeasibility, loomEvaluationList, productionSummary.balanceQty, today]);

  // What-If Simulator (Temporary In-Memory Simulation Only)
  const whatIfResult = useMemo(() => {
    if (!orderSpec || !targetFeasibility) return null;
    const balance = productionSummary.balanceQty;
    const avgPerLoom = 300;
    const projectedDailyRate = whatIfLoomCount * avgPerLoom;
    const daysRequired = projectedDailyRate > 0 ? Math.ceil(balance / projectedDailyRate) : 0;

    const compLooms = loomEvaluationList.filter(l => l.compat.compatible);
    const earliestStart = compLooms.length > 0
      ? compLooms.sort((a, b) => a.earliestAvailableDate.getTime() - b.earliestAvailableDate.getTime())[0].earliestAvailableDate
      : today;

    const projectedCompletion = addDays(earliestStart, Math.max(0, daysRequired - 1));

    let varianceDays = 0;
    let targetStatus = 'ON TARGET';
    let badgeColor = 'bg-emerald-100 text-emerald-800';

    if (targetFeasibility.targetDate) {
      if (targetFeasibility.targetDate < today) {
        varianceDays = differenceInDays(targetFeasibility.targetDate, today);
        targetStatus = 'OVERDUE';
        badgeColor = 'bg-rose-100 text-rose-800';
      } else {
        varianceDays = differenceInDays(targetFeasibility.targetDate, projectedCompletion);
        if (varianceDays > 0) {
          targetStatus = `AHEAD BY ${varianceDays} DAY${varianceDays === 1 ? '' : 'S'}`;
          badgeColor = 'bg-emerald-100 text-emerald-800';
        } else if (varianceDays === 0) {
          targetStatus = 'ON TARGET';
          badgeColor = 'bg-emerald-100 text-emerald-800';
        } else {
          targetStatus = `DELAYED BY ${Math.abs(varianceDays)} DAY${Math.abs(varianceDays) === 1 ? '' : 'S'}`;
          badgeColor = 'bg-rose-100 text-rose-800';
        }
      }
    }

    return {
      whatIfLoomCount,
      projectedDailyRate,
      daysRequired,
      projectedCompletion,
      varianceDays,
      targetStatus,
      badgeColor
    };
  }, [whatIfLoomCount, orderSpec, productionSummary, targetFeasibility, loomEvaluationList, today]);

  // Blocker Analysis: "Why Can't This Order Start Now?" (Actual blockers only!)
  const blockersChecklist = useMemo(() => {
    if (!selectedOrder || !orderSpec) return [];

    const checks = [
      {
        id: 'design',
        title: 'Design Master Technical Specs',
        description: `Weave: ${orderSpec.weave} • Frames: ${orderSpec.frames} • Reed: ${orderSpec.reedCount} • PPI: ${orderSpec.pick}`,
        passed: Boolean(matchedDesign && orderSpec.weave && orderSpec.frames > 0),
        statusText: matchedDesign ? 'READY' : 'MISSING SPECS',
        isBlocker: !matchedDesign
      },
      {
        id: 'sizing',
        title: 'Warp Sizing Completion',
        description: sizingReadiness.explanation,
        passed: sizingReadiness.isCompleted,
        statusText: sizingReadiness.isCompleted ? 'READY' : sizingReadiness.displayStatus,
        isBlocker: !sizingReadiness.isCompleted
      },
      {
        id: 'reed',
        title: 'Reed Stock Availability',
        description: reedReadiness?.message || '',
        passed: reedReadiness?.isReady || false,
        statusText: reedReadiness?.statusLabel || 'SHORTAGE',
        isBlocker: !(reedReadiness?.isReady)
      },
      {
        id: 'beam',
        title: 'Beam Stock Availability',
        description: beamReadiness?.message || '',
        passed: beamReadiness?.statusLabel === 'READY' || (beamReadiness?.allocatedWarpMeters || 0) > 0,
        statusText: beamReadiness?.statusLabel || 'SHORTAGE',
        isBlocker: beamReadiness?.statusLabel === 'SHORTAGE'
      },
      {
        id: 'loom',
        title: 'Loom Capacity & Availability',
        description: `${loomCapacity.compatibleCount} compatible looms (${loomCapacity.availableNowCount} currently idle & ready, ${loomCapacity.runningThisOrderCount} running now)`,
        passed: loomCapacity.compatibleCount > 0 && (loomCapacity.availableNowCount > 0 || loomCapacity.runningThisOrderCount > 0),
        statusText: (loomCapacity.availableNowCount > 0 || loomCapacity.runningThisOrderCount > 0) ? 'AVAILABLE' : 'LOOMS BUSY',
        isBlocker: loomCapacity.compatibleCount === 0
      },
      {
        id: 'target',
        title: 'Delivery Schedule Feasibility',
        description: targetFeasibility?.explanation || '',
        passed: targetFeasibility?.isFeasible || false,
        statusText: targetFeasibility?.status || 'FEASIBLE',
        isBlocker: targetFeasibility?.status?.includes('OVERDUE') || targetFeasibility?.status?.includes('DELAYED')
      }
    ];

    return checks;
  }, [selectedOrder, orderSpec, matchedDesign, sizingReadiness, reedReadiness, beamReadiness, loomCapacity, targetFeasibility]);

  // Overall Readiness Verdict & Next Best Action
  const { overallVerdict, nextBestActions } = useMemo(() => {
    const activeBlockers = blockersChecklist.filter(c => c.isBlocker);
    const actions: string[] = [];

    if (sizingReadiness && !sizingReadiness.isCompleted) {
      actions.push('Complete and confirm warp sizing process in Sizing department before loom mounting.');
    }
    if (beamReadiness && beamReadiness.remainingWarpMeters > 0) {
      actions.push(`Prepare and allocate remaining ${beamReadiness.remainingWarpMeters.toLocaleString()} M warp in Beaming section.`);
    }
    if (reedReadiness && !reedReadiness.isReady) {
      actions.push(`Procure or free up ${reedReadiness.shortageQty} reed(s) of count ${orderSpec?.reedCount} in Reed Stock.`);
    }
    if (loomCapacity.availableNowCount === 0 && loomCapacity.runningThisOrderCount === 0) {
      actions.push('Review Loom Planning Setup to schedule looms becoming free within the next 48 hours.');
    }
    if (targetFeasibility && !targetFeasibility.isFeasible) {
      actions.push(`Allocate additional compatible looms (recommended 6–8 looms) or adjust target delivery date.`);
    }
    if (actions.length === 0) {
      actions.push('All prerequisites satisfied. Proceed to Loom Planning Setup to confirm and start weaving.');
    }

    let verdict = 'READY TO WEAVE';
    let verdictColor = 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300';
    let verdictIcon = CheckCircle2;

    if (activeBlockers.length > 0) {
      if (activeBlockers.some(b => b.id === 'sizing' || b.id === 'beam' || b.id === 'loom')) {
        verdict = `BLOCKED (${activeBlockers.length} Active Blocker${activeBlockers.length === 1 ? '' : 's'})`;
        verdictColor = 'bg-rose-50 text-rose-800 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300';
        verdictIcon = AlertCircle;
      } else {
        verdict = `PARTIALLY READY (${activeBlockers.length} Action Items)`;
        verdictColor = 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300';
        verdictIcon = AlertTriangle;
      }
    }

    return { overallVerdict: { verdict, verdictColor, verdictIcon }, nextBestActions: actions };
  }, [blockersChecklist, sizingReadiness, beamReadiness, reedReadiness, loomCapacity, targetFeasibility, orderSpec]);

  // Order Lifecycle Timeline Steps
  const lifecycleSteps = useMemo(() => {
    if (!selectedOrder || !orderSpec) return [];

    return [
      { id: '1', title: 'Order Received', status: 'COMPLETED', date: formatRunoutDate(selectedOrder.order_date || selectedOrder.received_date) },
      { id: '2', title: 'Design Ready', status: matchedDesign ? 'COMPLETED' : 'PENDING', date: matchedDesign ? 'Verified' : 'Pending' },
      { id: '3', title: 'Sizing', status: sizingReadiness.isCompleted ? 'COMPLETED' : sizingReadiness.isApproved ? 'IN PROCESS' : 'PENDING', date: sizingReadiness.dateText },
      { id: '4', title: 'Reed Ready', status: reedReadiness?.isReady ? 'COMPLETED' : 'PENDING', date: `${reedReadiness?.usableBalance || 0} Avail` },
      { id: '5', title: 'Beam Ready', status: beamReadiness?.statusLabel === 'READY' ? 'COMPLETED' : beamReadiness?.allocatedWarpMeters ? 'PARTIAL' : 'PENDING', date: `${((beamReadiness?.allocatedWarpMeters || 0)).toLocaleString()} M` },
      { id: '6', title: 'Loom Available', status: (loomCapacity.availableNowCount > 0 || loomCapacity.runningThisOrderCount > 0) ? 'COMPLETED' : 'PENDING', date: `${loomCapacity.availableNowCount} Idle` },
      { id: '7', title: 'Weaving Start', status: currentlyRunningLooms.length > 0 ? 'COMPLETED' : 'PENDING', date: currentlyRunningLooms[0]?.activeRun?.loomStartDate ? formatRunoutDate(currentlyRunningLooms[0].activeRun.loomStartDate) : 'Awaiting' },
      { id: '8', title: 'Production', status: productionSummary.totalProduced > 0 ? 'RUNNING' : 'PENDING', date: `${productionSummary.progressPercent}%` },
      { id: '9', title: 'Completion', status: productionSummary.balanceQty === 0 && productionSummary.totalProduced > 0 ? 'COMPLETED' : 'PENDING', date: targetFeasibility?.expectedFinishDate ? formatRunoutDate(targetFeasibility.expectedFinishDate) : '—' }
    ];
  }, [selectedOrder, orderSpec, matchedDesign, sizingReadiness, reedReadiness, beamReadiness, loomCapacity, currentlyRunningLooms, productionSummary, targetFeasibility]);

  const handlePrint = () => {
    triggerPrint({ orientation: 'landscape', title: 'Order Tracking & Planning Analytics' });
  };

  return (
    <div className="p-4 md:p-6 space-y-8 max-w-[1600px] mx-auto pb-24 print-landscape">

      {/* ── Top Header & Order Selector ── */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-300 dark:border-slate-700 shadow-md print:hidden space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="p-3 bg-spu-primary/10 text-spu-primary rounded-2xl font-black">
              <Activity className="w-6 h-6" />
            </span>
            <div>
              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight uppercase">
                ORDER TRACKING & PLANNING ANALYTICS
              </h1>
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mt-0.5">
                Single Source of Truth: Lifecycle, Resource Readiness, 224-Loom Capacity, & Feasibility
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 dark:bg-slate-700/60 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span>Refreshed: {format(lastRefreshedAt, 'HH:mm:ss')}</span>
            </div>

            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-2 px-4 py-2 bg-white text-slate-800 dark:bg-slate-700 dark:text-slate-100 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 rounded-xl text-xs font-black transition-all shadow-xs disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-spu-primary ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>REFRESH ANALYSIS</span>
            </button>

            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-5 py-2 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 hover:bg-slate-800 rounded-xl text-xs font-black transition-all shadow-md active:scale-95"
            >
              <Printer className="w-4 h-4" />
              <span>PRINT ANALYTICS REPORT</span>
            </button>
          </div>
        </div>

        {/* ── Search Bar: IBPO / Order No / Design No ── */}
        <div className="pt-3 border-t border-slate-200 dark:border-slate-700 flex flex-col md:flex-row items-stretch md:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="SEARCH ORDER NO / IBPO NO / DESIGN NO..."
              className="w-full pl-10 pr-8 py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-bold uppercase focus:outline-none focus:ring-2 focus:ring-spu-primary"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            {/* Dropdown Results */}
            {searchResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 shadow-2xl z-50 overflow-hidden max-h-64 overflow-y-auto">
                {searchResults.map(o => (
                  <button
                    key={o.id}
                    onClick={() => {
                      setSelectedOrderId(o.id);
                      setSearchQuery('');
                    }}
                    className={`w-full text-left px-4 py-3 flex items-center justify-between text-xs hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors border-b border-slate-100 dark:border-slate-700 last:border-0 ${
                      selectedOrderId === o.id ? 'bg-indigo-50 dark:bg-indigo-950/40' : ''
                    }`}
                  >
                    <div>
                      <span className="font-black text-slate-900 dark:text-white mr-2">{o.order_no}</span>
                      {o.ibpo_no && <span className="text-slate-500 mr-2 font-medium">(IBPO: {o.ibpo_no})</span>}
                      <span className="text-spu-primary font-bold">[{o.design_no_sp_no}]</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-600 dark:text-slate-300">{Number(o.order_qty || o.grey_qty || 0).toLocaleString()} M</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                        (o.status || '').toUpperCase() === 'RUNNING' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {o.status || 'PLANNED'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quick Order Selection Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            <span className="text-xs font-black text-slate-500 uppercase whitespace-nowrap">Active Orders:</span>
            {activeOrderChips.map(o => (
              <button
                key={o.id}
                onClick={() => setSelectedOrderId(o.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-black whitespace-nowrap transition-all border ${
                  selectedOrderId === o.id
                    ? 'bg-spu-primary text-white border-spu-primary shadow-sm'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600 hover:bg-slate-100'
                }`}
              >
                {o.order_no}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Empty State if no order selected ── */}
      {!selectedOrder ? (
        <div className="bg-white dark:bg-slate-800 p-16 rounded-2xl border border-slate-300 dark:border-slate-700 shadow-md text-center space-y-4">
          <HelpCircle className="w-16 h-16 text-slate-300 dark:text-slate-600 mx-auto" />
          <h2 className="text-xl font-black text-slate-800 dark:text-slate-200 uppercase">NO ORDER SELECTED</h2>
          <p className="text-xs font-semibold text-slate-500 max-w-md mx-auto">
            Please search for an IBPO, Order Number, or Design Number using the search box above to load complete analytical decision metrics.
          </p>
        </div>
      ) : (
        <>
          {/* ════════════════════════════════════════════════════════════════════════
              SECTION 1: TOP SUMMARY DASHBOARD CARDS (STRONG VISUAL HIERARCHY)
             ════════════════════════════════════════════════════════════════════════ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3.5">

            {/* Card 1: ORDER STATUS */}
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border-2 border-slate-300 dark:border-slate-700 shadow-xs flex flex-col justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                ORDER STATUS
              </span>
              <div className="mt-2.5">
                <span className={`inline-block px-2.5 py-1 rounded-md text-xs font-black ${
                  (selectedOrder.status || '').toUpperCase() === 'RUNNING'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                }`}>
                  {selectedOrder.status || 'ORDER RECEIVED'}
                </span>
                <p className="text-xs font-black text-slate-900 dark:text-white mt-1.5 truncate">
                  {selectedOrder.order_no}
                </p>
              </div>
            </div>

            {/* Card 2: ORDER BALANCE */}
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border-2 border-slate-300 dark:border-slate-700 shadow-xs flex flex-col justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                ORDER BALANCE
              </span>
              <div className="mt-2.5">
                <div className="text-lg font-black text-slate-900 dark:text-white">
                  {productionSummary.balanceQty.toLocaleString()} <span className="text-xs font-normal text-slate-400">M</span>
                </div>
                <p className="text-[11px] font-bold text-slate-500 mt-1">
                  {productionSummary.progressPercent}% Produced
                </p>
              </div>
            </div>

            {/* Card 3: SIZING STATUS */}
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border-2 border-slate-300 dark:border-slate-700 shadow-xs flex flex-col justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                SIZING STATUS
              </span>
              <div className="mt-2.5">
                <span className={`inline-block px-2.5 py-1 rounded-md text-[11px] font-black ${sizingReadiness.statusColor}`}>
                  {sizingReadiness.displayStatus}
                </span>
                <p className="text-[11px] font-bold text-slate-500 mt-1 truncate">
                  {sizingReadiness.isCompleted ? 'Process Completed' : 'Pending Sizing'}
                </p>
              </div>
            </div>

            {/* Card 4: REED READINESS */}
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border-2 border-slate-300 dark:border-slate-700 shadow-xs flex flex-col justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                REED READINESS
              </span>
              <div className="mt-2.5">
                <span className={`inline-block px-2.5 py-1 rounded-md text-[11px] font-black ${reedReadiness?.statusColor}`}>
                  {reedReadiness?.statusLabel || 'READY'}
                </span>
                <p className="text-[11px] font-bold text-slate-500 mt-1 truncate">
                  {reedReadiness?.usableBalance || 0} Usable Reeds
                </p>
              </div>
            </div>

            {/* Card 5: BEAM READINESS */}
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border-2 border-slate-300 dark:border-slate-700 shadow-xs flex flex-col justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                BEAM READINESS
              </span>
              <div className="mt-2.5">
                <span className={`inline-block px-2.5 py-1 rounded-md text-[11px] font-black ${beamReadiness?.statusColor}`}>
                  {beamReadiness?.statusLabel || 'READY'}
                </span>
                <p className="text-[11px] font-bold text-slate-500 mt-1 truncate">
                  Alloc: {((beamReadiness?.allocatedWarpMeters || 0)).toLocaleString()} M
                </p>
              </div>
            </div>

            {/* Card 6: LOOM CAPACITY */}
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border-2 border-slate-300 dark:border-slate-700 shadow-xs flex flex-col justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                LOOM CAPACITY
              </span>
              <div className="mt-2.5">
                <div className="text-lg font-black text-slate-900 dark:text-white">
                  {loomCapacity.compatibleCount} <span className="text-xs font-bold text-slate-400">Compatible</span>
                </div>
                <p className="text-[11px] font-black text-emerald-600 dark:text-emerald-400 mt-1">
                  {loomCapacity.availableNowCount} Available Now ({currentlyRunningLooms.length} Running)
                </p>
              </div>
            </div>

            {/* Card 7: TARGET FEASIBILITY */}
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border-2 border-slate-300 dark:border-slate-700 shadow-xs flex flex-col justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                TARGET FEASIBILITY
              </span>
              <div className="mt-2.5">
                <span className={`inline-block px-2.5 py-1 rounded-md text-[11px] font-black ${targetFeasibility?.badgeColor}`}>
                  {targetFeasibility?.status || 'FEASIBLE'}
                </span>
                <p className="text-[11px] font-bold text-slate-500 mt-1 truncate">
                  {targetFeasibility?.varianceText}
                </p>
              </div>
            </div>
          </div>

          {/* ════════════════════════════════════════════════════════════════════════
              SECTION 2: ORDER SUMMARY (HIGH-CONTRAST HEADINGS)
             ════════════════════════════════════════════════════════════════════════ */}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-300 dark:border-slate-700 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
              <div>
                <h2 className="text-base font-black text-slate-950 dark:text-white uppercase tracking-wider">
                  ORDER SUMMARY
                </h2>
                <p className="text-xs font-bold text-slate-500">
                  Comprehensive order master details and delivery schedule
                </p>
              </div>
              <Link
                to={`/orders`}
                className="text-xs font-black text-spu-primary hover:underline flex items-center gap-1"
              >
                <span>OPEN ORDER MANAGEMENT</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3.5 text-xs">
              <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-700">
                <span className="text-[10px] font-black text-slate-400 uppercase block">Order Number</span>
                <span className="font-black text-slate-900 dark:text-white text-sm">{selectedOrder.order_no}</span>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-700">
                <span className="text-[10px] font-black text-slate-400 uppercase block">IBPO Number</span>
                <span className="font-black text-slate-900 dark:text-white text-sm">{selectedOrder.ibpo_no || '—'}</span>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-700">
                <span className="text-[10px] font-black text-slate-400 uppercase block">Customer / Buyer</span>
                <span className="font-black text-slate-900 dark:text-white text-sm truncate block">{orderSpec?.buyer}</span>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-700">
                <span className="text-[10px] font-black text-slate-400 uppercase block">Design / SP No</span>
                <span className="font-black text-spu-primary text-sm truncate block">{selectedOrder.design_no_sp_no}</span>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-700">
                <span className="text-[10px] font-black text-slate-400 uppercase block">Order Received Date</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{formatRunoutDate(selectedOrder.order_date || selectedOrder.received_date)}</span>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-700">
                <span className="text-[10px] font-black text-slate-400 uppercase block">Target Completion</span>
                <span className="font-black text-indigo-600 dark:text-indigo-400">{formatRunoutDate(selectedOrder.target_delivery_date || selectedOrder.weaving_completion_date)}</span>
              </div>
            </div>
          </div>

          {/* ════════════════════════════════════════════════════════════════════════
              SECTION 3 & 4: LIVE PRODUCTION & DESIGN SPECIFICATIONS
             ════════════════════════════════════════════════════════════════════════ */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

            {/* LIVE PRODUCTION (7 cols) */}
            <div className="lg:col-span-7 bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-300 dark:border-slate-700 shadow-sm space-y-4">
              <div className="border-b border-slate-200 dark:border-slate-700 pb-3">
                <h2 className="text-base font-black text-slate-950 dark:text-white uppercase tracking-wider">
                  ORDER BALANCE & LIVE PRODUCTION
                </h2>
                <p className="text-xs font-bold text-slate-500">
                  Real-time production progress from Main Entry running looms and daily logs
                </p>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-black">
                  <span className="text-slate-700 dark:text-slate-300">PROGRESS STATUS</span>
                  <span className="text-spu-primary">{productionSummary.progressPercent}% COMPLETE</span>
                </div>
                <div className="w-full h-3.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden p-0.5 border border-slate-200 dark:border-slate-600">
                  <div
                    className="h-full bg-spu-primary rounded-full transition-all duration-500"
                    style={{ width: `${productionSummary.progressPercent}%` }}
                  />
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] font-black text-slate-400 uppercase block">ORDER QUANTITY</span>
                  <div className="text-lg font-black text-slate-950 dark:text-white mt-1">
                    {(orderSpec?.orderQty || 0).toLocaleString()} <span className="text-xs font-normal text-slate-400">M</span>
                  </div>
                </div>

                <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-800">
                  <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-400 uppercase block">PRODUCED SO FAR</span>
                  <div className="text-lg font-black text-emerald-800 dark:text-emerald-300 mt-1">
                    {productionSummary.totalProduced.toLocaleString()} <span className="text-xs font-normal">M</span>
                  </div>
                </div>

                <div className="p-3.5 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800">
                  <span className="text-[10px] font-black text-amber-700 dark:text-amber-400 uppercase block">BALANCE TO WEAVE</span>
                  <div className="text-lg font-black text-amber-800 dark:text-amber-300 mt-1">
                    {productionSummary.balanceQty.toLocaleString()} <span className="text-xs font-normal">M</span>
                  </div>
                </div>

                <div className="p-3.5 bg-indigo-50 dark:bg-indigo-950/30 rounded-xl border border-indigo-200 dark:border-indigo-800">
                  <span className="text-[10px] font-black text-indigo-700 dark:text-indigo-400 uppercase block">DAILY RUN RATE</span>
                  <div className="text-lg font-black text-indigo-800 dark:text-indigo-300 mt-1">
                    {productionSummary.dailyRunRate.toLocaleString()} <span className="text-xs font-normal">M/day</span>
                  </div>
                </div>
              </div>

              {productionSummary.hasDiscrepancy && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs font-bold text-amber-900 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <span>DATA CONSISTENCY WARNING: Order Management recorded balance differs slightly from calculated live production.</span>
                </div>
              )}
            </div>

            {/* DESIGN TECHNICAL SPECIFICATIONS (5 cols) */}
            <div className="lg:col-span-5 bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-300 dark:border-slate-700 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
                <div>
                  <h2 className="text-base font-black text-slate-950 dark:text-white uppercase tracking-wider">
                    DESIGN SPECIFICATIONS
                  </h2>
                  <p className="text-xs font-bold text-slate-500">
                    Design Master technical parameters
                  </p>
                </div>
                <Link
                  to={`/designs`}
                  className="text-xs font-black text-spu-primary hover:underline flex items-center gap-1"
                >
                  <span>DESIGN MASTER</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] font-black text-slate-400 uppercase block">WEAVE TYPE</span>
                  <span className="font-black text-slate-900 dark:text-white text-xs">{orderSpec?.weave}</span>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] font-black text-slate-400 uppercase block">FRAMES REQUIRED</span>
                  <span className="font-black text-slate-900 dark:text-white text-xs">{orderSpec?.frames} Frames</span>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] font-black text-slate-400 uppercase block">REED COUNT</span>
                  <span className="font-black text-slate-900 dark:text-white text-xs">{orderSpec?.reedCount}</span>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] font-black text-slate-400 uppercase block">PICKS/INCH (PPI)</span>
                  <span className="font-black text-slate-900 dark:text-white text-xs">{orderSpec?.pick}</span>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] font-black text-slate-400 uppercase block">GREIGE WIDTH</span>
                  <span className="font-black text-slate-900 dark:text-white text-xs">{orderSpec?.greigeWidth}"</span>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] font-black text-slate-400 uppercase block">CRIMP %</span>
                  <span className="font-black text-slate-900 dark:text-white text-xs">{orderSpec?.crimp}%</span>
                </div>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                <span className="text-[10px] font-black text-slate-400 uppercase block">CONSTRUCTION</span>
                <span className="font-bold text-slate-900 dark:text-white mt-1 block">{orderSpec?.construction}</span>
              </div>
            </div>
          </div>

          {/* ════════════════════════════════════════════════════════════════════════
              SECTION 5: RESOURCE READINESS (SIZING, REED, BEAM)
             ════════════════════════════════════════════════════════════════════════ */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            {/* SIZING READINESS */}
            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-300 dark:border-slate-700 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
                <div>
                  <h2 className="text-sm font-black text-slate-950 dark:text-white uppercase tracking-wider">
                    SIZING READINESS
                  </h2>
                  <p className="text-[11px] font-bold text-slate-500">
                    Warp sizing readiness before loom start
                  </p>
                </div>
                <Link to="/sizing" className="text-xs font-black text-spu-primary hover:underline">
                  SIZING
                </Link>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center p-2.5 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="font-bold text-slate-500">Sizing Approval:</span>
                  <span className="font-black text-slate-900 dark:text-white">{sizingReadiness.approvalStatus}</span>
                </div>
                <div className="flex justify-between items-center p-2.5 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="font-bold text-slate-500">Sizing Production:</span>
                  <span className={`px-2 py-0.5 rounded font-black text-[11px] ${sizingReadiness.statusColor}`}>
                    {sizingReadiness.productionStatus}
                  </span>
                </div>
                <div className="flex justify-between items-center p-2.5 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="font-bold text-slate-500">Sizing Date:</span>
                  <span className="font-black text-slate-900 dark:text-white">{sizingReadiness.dateText}</span>
                </div>
              </div>

              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 italic">
                {sizingReadiness.explanation}
              </p>
            </div>

            {/* REED READINESS */}
            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-300 dark:border-slate-700 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
                <div>
                  <h2 className="text-sm font-black text-slate-950 dark:text-white uppercase tracking-wider">
                    REED READINESS
                  </h2>
                  <p className="text-[11px] font-bold text-slate-500">
                    Physical reed stock availability
                  </p>
                </div>
                <Link to="/reed-stock" className="text-xs font-black text-spu-primary hover:underline">
                  REED STOCK
                </Link>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center p-2.5 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="font-bold text-slate-500">Target Reed Count:</span>
                  <span className="font-black text-slate-900 dark:text-white">{orderSpec?.reedCount}</span>
                </div>
                <div className="flex justify-between items-center p-2.5 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="font-bold text-slate-500">Required Reeds:</span>
                  <span className="font-black text-slate-900 dark:text-white">{reedReadiness?.requiredReedQty || 0} Reeds</span>
                </div>
                <div className="flex justify-between items-center p-2.5 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="font-bold text-slate-500">Usable in Stock:</span>
                  <span className="font-black text-emerald-600 dark:text-emerald-400">{reedReadiness?.usableBalance || 0} Reeds</span>
                </div>
                <div className="flex justify-between items-center p-2.5 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="font-bold text-slate-500">Shortage:</span>
                  <span className={`font-black ${reedReadiness?.shortageQty ? 'text-rose-600' : 'text-slate-500'}`}>
                    {reedReadiness?.shortageQty || 0} Reeds
                  </span>
                </div>
              </div>

              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 italic">
                {reedReadiness?.message}
              </p>
            </div>

            {/* BEAM READINESS */}
            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-300 dark:border-slate-700 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
                <div>
                  <h2 className="text-sm font-black text-slate-950 dark:text-white uppercase tracking-wider">
                    BEAM READINESS
                  </h2>
                  <p className="text-[11px] font-bold text-slate-500">
                    Physical beam stock & warp availability
                  </p>
                </div>
                <Link to="/beam-stock" className="text-xs font-black text-spu-primary hover:underline">
                  BEAM STOCK
                </Link>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center p-2.5 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="font-bold text-slate-500">Required Warp Meters:</span>
                  <span className="font-black text-slate-900 dark:text-white">{(beamReadiness?.requiredWarpMeters || 0).toLocaleString()} M</span>
                </div>
                <div className="flex justify-between items-center p-2.5 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="font-bold text-slate-500">Allocated Warp:</span>
                  <span className="font-black text-emerald-600 dark:text-emerald-400">{(beamReadiness?.allocatedWarpMeters || 0).toLocaleString()} M</span>
                </div>
                <div className="flex justify-between items-center p-2.5 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="font-bold text-slate-500">Available Unallocated Stock:</span>
                  <span className="font-black text-blue-600 dark:text-blue-400">{(beamReadiness?.freeAvailableWarpMeters || 0).toLocaleString()} M</span>
                </div>
                <div className="flex justify-between items-center p-2.5 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="font-bold text-slate-500">Remaining Warp to Prepare:</span>
                  <span className={`font-black ${beamReadiness?.remainingWarpMeters ? 'text-rose-600' : 'text-slate-500'}`}>
                    {(beamReadiness?.remainingWarpMeters || 0).toLocaleString()} M
                  </span>
                </div>
              </div>

              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 italic">
                {beamReadiness?.message}
              </p>
            </div>
          </div>

          {/* ════════════════════════════════════════════════════════════════════════
              SECTION 6: 224-LOOM CAPACITY & TECHNICAL COMPATIBILITY
             ════════════════════════════════════════════════════════════════════════ */}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-300 dark:border-slate-700 shadow-sm space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-700 pb-4">
              <div>
                <h2 className="text-base font-black text-slate-950 dark:text-white uppercase tracking-wider">
                  LOOM CAPACITY & AVAILABILITY (224 LOOMS)
                </h2>
                <p className="text-xs font-bold text-slate-500">
                  Technical compatibility vs actual real-time availability
                </p>
              </div>

              {/* Statistics Breakdown */}
              <div className="flex flex-wrap gap-2 text-xs font-black">
                <span className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-600">
                  TECHNICALLY COMPATIBLE: {loomCapacity.compatibleCount}
                </span>
                <span className="px-3 py-1.5 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300">
                  CURRENTLY AVAILABLE NOW: {loomCapacity.availableNowCount}
                </span>
                <span className="px-3 py-1.5 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 border border-blue-300">
                  RUNNING THIS ORDER: {loomCapacity.runningThisOrderCount}
                </span>
                <span className="px-3 py-1.5 rounded-xl bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300">
                  FUTURE PLANS: {loomCapacity.queuedNextPlanCount}
                </span>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex flex-wrap items-center gap-2 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl text-xs print:hidden">
              <button
                onClick={() => setLoomFilterTab('COMPATIBLE')}
                className={`px-3.5 py-1.5 rounded-lg font-black transition-all ${
                  loomFilterTab === 'COMPATIBLE'
                    ? 'bg-white dark:bg-slate-800 text-spu-primary shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Compatible Looms ({loomCapacity.compatibleCount})
              </button>
              <button
                onClick={() => setLoomFilterTab('AVAILABLE')}
                className={`px-3.5 py-1.5 rounded-lg font-black transition-all ${
                  loomFilterTab === 'AVAILABLE'
                    ? 'bg-white dark:bg-slate-800 text-emerald-700 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Available / Idle Now ({loomCapacity.availableNowCount})
              </button>
              <button
                onClick={() => setLoomFilterTab('RUNNING')}
                className={`px-3.5 py-1.5 rounded-lg font-black transition-all ${
                  loomFilterTab === 'RUNNING'
                    ? 'bg-white dark:bg-slate-800 text-blue-700 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Running This Order ({loomCapacity.runningThisOrderCount})
              </button>
              <button
                onClick={() => setLoomFilterTab('NEXT_PLANNED')}
                className={`px-3.5 py-1.5 rounded-lg font-black transition-all ${
                  loomFilterTab === 'NEXT_PLANNED'
                    ? 'bg-white dark:bg-slate-800 text-amber-700 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Queued Next Plans ({loomCapacity.queuedNextPlanCount})
              </button>
              <button
                onClick={() => setLoomFilterTab('ALL')}
                className={`px-3.5 py-1.5 rounded-lg font-black transition-all ${
                  loomFilterTab === 'ALL'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                All 224 Looms
              </button>
            </div>

            {/* Loom Detail Table with multi-page printing */}
            <div className="overflow-x-auto rounded-xl border border-slate-300 dark:border-slate-700">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <PrintTableHeaderRow
                    colSpan={8}
                    title={`ORDER TRACKING & PLANNING ANALYTICS — ${selectedOrder.order_no}`}
                    subtitle={`Design: ${selectedOrder.design_no_sp_no} | Technically Compatible: ${loomCapacity.compatibleCount} | Available Now: ${loomCapacity.availableNowCount}`}
                  />
                  <tr className="bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-black border-b border-slate-300 dark:border-slate-700">
                    <th className="py-3 px-3">Loom No</th>
                    <th className="py-3 px-3">Unit / Model</th>
                    <th className="py-3 px-3">Technical Capability</th>
                    <th className="py-3 px-3">Compatibility</th>
                    <th className="py-3 px-3">Operational Status</th>
                    <th className="py-3 px-3">Main Entry Live Runout</th>
                    <th className="py-3 px-3">Next Plans Queued</th>
                    <th className="py-3 px-3">Earliest Available Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {filteredLooms.slice(0, 50).map(item => {
                    const { loomNo, loom, compat, isRunning, isRunningThisOrder, isTrulyAvailableNow, mainEntryRun, calculatedPlans, earliestAvailableDate } = item;
                    const itemActiveRunAny = item.activeRun as any;

                    return (
                      <tr
                        key={loomNo}
                        className={`hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors print:table-row ${
                          isRunningThisOrder ? 'bg-blue-50/50 dark:bg-blue-950/20' : isTrulyAvailableNow ? 'bg-emerald-50/40 dark:bg-emerald-950/20' : ''
                        }`}
                      >
                        {/* Loom No */}
                        <td className="py-2.5 px-3 font-black text-slate-900 dark:text-white whitespace-nowrap">
                          <span className={`inline-block px-2 py-0.5 rounded font-mono ${
                            isRunningThisOrder
                              ? 'bg-blue-600 text-white'
                              : isTrulyAvailableNow
                              ? 'bg-emerald-600 text-white'
                              : compat.compatible
                              ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white'
                              : 'bg-slate-100 text-slate-400'
                          }`}>
                            L-{loomNo}
                          </span>
                        </td>

                        {/* Unit / Model */}
                        <td className="py-2.5 px-3">
                          <span className="font-bold text-slate-900 dark:text-white block">{loom.unit || 'Unit 1'}</span>
                          <span className="text-[10px] text-slate-500">{loom.make} {loom.model}</span>
                        </td>

                        {/* Technical Capability */}
                        <td className="py-2.5 px-3">
                          <span className="font-bold text-slate-800 dark:text-slate-200 block">{loom.capabilities || loom.weave || 'CAM / DOBBY'}</span>
                          <span className="text-[10px] text-slate-500">Max Frames: {compat.maxFramesSupported || loom.installed_lever || 8}F • RS: {loom.reed_space || '—'}"</span>
                        </td>

                        {/* Compatibility */}
                        <td className="py-2.5 px-3">
                          {compat.compatible ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-black text-emerald-700 dark:text-emerald-400">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>COMPATIBLE</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 dark:text-rose-400" title={compat.reason}>
                              <AlertCircle className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate max-w-[120px]">{compat.reason || 'INCOMPATIBLE'}</span>
                            </span>
                          )}
                        </td>

                        {/* Operational Status */}
                        <td className="py-2.5 px-3">
                          {isRunningThisOrder ? (
                            <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 font-black text-[11px]">
                              ● RUNNING THIS ORDER
                            </span>
                          ) : isRunning ? (
                            <div>
                              <span className="font-black text-slate-800 dark:text-slate-200 block truncate max-w-[130px]" title={item.activeRun?.designNo}>
                                RUNNING OTHER ORDER
                              </span>
                              <span className="text-[10px] text-slate-500">{item.activeRun?.designNo}</span>
                            </div>
                          ) : isTrulyAvailableNow ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-black text-[11px]">
                              AVAILABLE NOW
                            </span>
                          ) : (
                            <span className="text-slate-400 font-medium italic">Idle (Has Plans)</span>
                          )}
                        </td>

                        {/* Main Entry Live Runout */}
                        <td className="py-2.5 px-3">
                          {isRunning ? (
                            <div>
                              <span className="font-bold text-slate-900 dark:text-white block">
                                {formatRunoutDate(mainEntryRun.expectedRunoutDate)}
                              </span>
                              <span className="text-[10px] text-slate-500">
                                {formatBalanceDays(mainEntryRun.balanceDays)} • Bal: {mainEntryRun.netBalanceMeter.toFixed(0)}M
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        {/* Queued Next Plans */}
                        <td className="py-2.5 px-3">
                          {calculatedPlans.length > 0 ? (
                            <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-bold text-[10px]">
                              {calculatedPlans.length} Next Plan(s)
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">No Queue</span>
                          )}
                        </td>

                        {/* Earliest Available Date */}
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className={`font-black ${
                            isRunningThisOrder || isTrulyAvailableNow
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-slate-900 dark:text-white'
                          }`}>
                            {formatRunoutDate(earliestAvailableDate)}
                          </span>
                          <span className="text-[10px] text-slate-500 block">{item.availabilityReason}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {filteredLooms.length > 50 && (
                <div className="p-3 text-center text-xs font-bold text-slate-500 bg-slate-50 dark:bg-slate-900 border-t border-slate-300 dark:border-slate-700">
                  Showing top 50 of {filteredLooms.length} matching looms.
                </div>
              )}
            </div>
          </div>

          {/* ════════════════════════════════════════════════════════════════════════
              SECTION 7 & 8: RECOMMENDED LOOM COMBINATIONS & WHAT-IF SIMULATOR
             ════════════════════════════════════════════════════════════════════════ */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

            {/* RECOMMENDED LOOMS (6 cols) */}
            <div className="lg:col-span-6 bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-300 dark:border-slate-700 shadow-sm space-y-4">
              <div className="border-b border-slate-200 dark:border-slate-700 pb-3">
                <h2 className="text-base font-black text-slate-950 dark:text-white uppercase tracking-wider">
                  RECOMMENDED LOOM COMBINATIONS
                </h2>
                <p className="text-xs font-bold text-slate-500">
                  Optimal loom allocations validated against technical compatibility and future queues
                </p>
              </div>

              {loomCombinations ? (
                <div className="space-y-3.5 text-xs">
                  {/* Option A */}
                  <div className="p-4 rounded-xl border-2 border-spu-primary/40 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-black text-spu-primary text-xs uppercase flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-spu-primary" />
                        {loomCombinations.optionA.label} ({loomCombinations.optionA.loomCount} Looms)
                      </span>
                      <span className={`px-2 py-0.5 rounded font-black text-[11px] ${loomCombinations.optionA.badgeColor}`}>
                        {loomCombinations.optionA.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {loomCombinations.optionA.loomNos.map(no => (
                        <span key={no} className="px-2 py-0.5 rounded bg-spu-primary text-white text-[11px] font-black font-mono">
                          L-{no}
                        </span>
                      ))}
                    </div>
                    <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400 pt-1 font-semibold">
                      <span>Start: <strong>{formatRunoutDate(loomCombinations.optionA.startDate)}</strong></span>
                      <span>Finish: <strong>{formatRunoutDate(loomCombinations.optionA.finishDate)}</strong></span>
                      <span>Rate: <strong>{loomCombinations.optionA.daily} M/day</strong></span>
                    </div>
                  </div>

                  {/* Option B */}
                  <div className="p-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-black text-slate-900 dark:text-white text-xs uppercase flex items-center gap-1.5">
                        <Zap className="w-4 h-4 text-amber-500" />
                        {loomCombinations.optionB.label} ({loomCombinations.optionB.loomCount} Looms)
                      </span>
                      <span className={`px-2 py-0.5 rounded font-black text-[11px] ${loomCombinations.optionB.badgeColor}`}>
                        {loomCombinations.optionB.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {loomCombinations.optionB.loomNos.map(no => (
                        <span key={no} className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 text-[11px] font-black font-mono">
                          L-{no}
                        </span>
                      ))}
                    </div>
                    <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400 pt-1 font-semibold">
                      <span>Start: {formatRunoutDate(loomCombinations.optionB.startDate)}</span>
                      <span>Finish: {formatRunoutDate(loomCombinations.optionB.finishDate)}</span>
                      <span>Rate: {loomCombinations.optionB.daily} M/day</span>
                    </div>
                  </div>

                  {/* Option C */}
                  <div className="p-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-black text-slate-900 dark:text-white text-xs uppercase flex items-center gap-1.5">
                        <PlayCircle className="w-4 h-4 text-emerald-500" />
                        {loomCombinations.optionC.label} ({loomCombinations.optionC.loomCount} Looms)
                      </span>
                      <span className={`px-2 py-0.5 rounded font-black text-[11px] ${loomCombinations.optionC.badgeColor}`}>
                        {loomCombinations.optionC.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {loomCombinations.optionC.loomNos.map(no => (
                        <span key={no} className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 text-[11px] font-black font-mono">
                          L-{no}
                        </span>
                      ))}
                    </div>
                    <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400 pt-1 font-semibold">
                      <span>Start: {formatRunoutDate(loomCombinations.optionC.startDate)}</span>
                      <span>Finish: {formatRunoutDate(loomCombinations.optionC.finishDate)}</span>
                      <span>Rate: {loomCombinations.optionC.daily} M/day</span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500 font-bold">No compatible loom combinations could be generated.</p>
              )}
            </div>

            {/* WHAT-IF SIMULATOR (6 cols) */}
            <div className="lg:col-span-6 bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-300 dark:border-slate-700 shadow-sm space-y-4">
              <div className="border-b border-slate-200 dark:border-slate-700 pb-3">
                <h2 className="text-base font-black text-slate-950 dark:text-white uppercase tracking-wider">
                  WHAT-IF LOOM ALLOCATION SIMULATOR
                </h2>
                <p className="text-xs font-bold text-slate-500">
                  Hypothetical analysis only (Values never save or alter order data)
                </p>
              </div>

              {/* Loom count picker */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs font-black">
                  <span className="text-slate-800 dark:text-slate-200 uppercase">Simulated Loom Allocation:</span>
                  <span className="text-base font-black text-spu-primary">{whatIfLoomCount} Looms</span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[4, 5, 6, 7, 8, 9, 10, 12].map(num => (
                    <button
                      key={num}
                      onClick={() => setWhatIfLoomCount(num)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all ${
                        whatIfLoomCount === num
                          ? 'bg-spu-primary text-white shadow-sm'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>

              {/* Simulation Result Cards */}
              {whatIfResult && (
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] font-black text-slate-400 uppercase block">SIMULATED DAILY OUTPUT</span>
                    <div className="text-lg font-black text-slate-950 dark:text-white mt-1">
                      {whatIfResult.projectedDailyRate.toLocaleString()} <span className="text-xs font-normal">M/day</span>
                    </div>
                  </div>

                  <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] font-black text-slate-400 uppercase block">PRODUCTION DAYS NEEDED</span>
                    <div className="text-lg font-black text-slate-950 dark:text-white mt-1">
                      {whatIfResult.daysRequired} <span className="text-xs font-normal">Days</span>
                    </div>
                  </div>

                  <div className="p-3.5 bg-indigo-50 dark:bg-indigo-950/30 rounded-xl border border-indigo-200 dark:border-indigo-800">
                    <span className="text-[10px] font-black text-indigo-700 dark:text-indigo-400 uppercase block">PROJECTED FINISH</span>
                    <div className="text-lg font-black text-indigo-800 dark:text-indigo-300 mt-1">
                      {formatRunoutDate(whatIfResult.projectedCompletion)}
                    </div>
                  </div>

                  <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] font-black text-slate-400 uppercase block">TARGET FEASIBILITY</span>
                    <div className="mt-1">
                      <span className={`px-2 py-0.5 rounded text-xs font-black ${whatIfResult.badgeColor}`}>
                        {whatIfResult.targetStatus}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ════════════════════════════════════════════════════════════════════════
              SECTION 9: ORDER TRACKING TIMELINE
             ════════════════════════════════════════════════════════════════════════ */}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-300 dark:border-slate-700 shadow-sm space-y-4">
            <div className="border-b border-slate-200 dark:border-slate-700 pb-3">
              <h2 className="text-base font-black text-slate-950 dark:text-white uppercase tracking-wider">
                ORDER TRACKING TIMELINE
              </h2>
              <p className="text-xs font-bold text-slate-500">
                End-to-end production readiness and operational state progression
              </p>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2.5">
              {lifecycleSteps.map(step => (
                <div
                  key={step.id}
                  className={`p-3 rounded-xl border text-center space-y-1 ${
                    step.status === 'COMPLETED'
                      ? 'bg-emerald-50/80 border-emerald-300 dark:bg-emerald-950/30'
                      : step.status === 'RUNNING' || step.status === 'PARTIAL'
                      ? 'bg-blue-50/80 border-blue-300 dark:bg-blue-950/30'
                      : step.status === 'IN PROCESS'
                      ? 'bg-amber-50/80 border-amber-300 dark:bg-amber-950/30'
                      : 'bg-slate-50 border-slate-200 dark:bg-slate-900/40 dark:border-slate-700'
                  }`}
                >
                  <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full inline-block ${
                    step.status === 'COMPLETED'
                      ? 'bg-emerald-100 text-emerald-800'
                      : step.status === 'RUNNING' || step.status === 'PARTIAL'
                      ? 'bg-blue-100 text-blue-800'
                      : step.status === 'IN PROCESS'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-slate-200 text-slate-600'
                  }`}>
                    {step.status}
                  </span>
                  <div className="text-xs font-black text-slate-900 dark:text-white truncate" title={step.title}>
                    {step.title}
                  </div>
                  <div className="text-[10px] font-bold text-slate-500 truncate">
                    {step.date}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ════════════════════════════════════════════════════════════════════════
              SECTION 10: READINESS & BLOCKERS ("WHY CAN'T THIS ORDER START NOW?")
             ════════════════════════════════════════════════════════════════════════ */}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-300 dark:border-slate-700 shadow-sm space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-700 pb-4">
              <div>
                <h2 className="text-base font-black text-slate-950 dark:text-white uppercase tracking-wider">
                  WHY CAN'T THIS ORDER START NOW?
                </h2>
                <p className="text-xs font-bold text-slate-500">
                  Automated audit across Design Master, Sizing, Reed Stock, Beam Stock, and Loom Availability
                </p>
              </div>

              {/* Overall Verdict Banner */}
              <div className={`px-5 py-2 rounded-xl border-2 font-black text-xs flex items-center gap-2 ${overallVerdict.verdictColor}`}>
                <overallVerdict.verdictIcon className="w-4 h-4" />
                <span>{overallVerdict.verdict}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {blockersChecklist.map(check => (
                <div
                  key={check.id}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    check.passed
                      ? 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-700'
                      : check.isBlocker
                      ? 'bg-rose-50/70 dark:bg-rose-950/20 border-rose-300 dark:border-rose-900'
                      : 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-300 dark:border-amber-900'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5">
                      {check.passed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${
                          check.isBlocker ? 'text-rose-600' : 'text-amber-600'
                        }`} />
                      )}
                      <div>
                        <h4 className="text-xs font-black text-slate-950 dark:text-white uppercase">{check.title}</h4>
                        <p className="text-xs font-bold text-slate-600 dark:text-slate-400 mt-1">{check.description}</p>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black whitespace-nowrap ${
                      check.passed
                        ? 'bg-emerald-100 text-emerald-800'
                        : check.isBlocker
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      {check.statusText}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ════════════════════════════════════════════════════════════════════════
              SECTION 11: NEXT BEST ACTION (GENERATED FROM ACTUAL BLOCKERS)
             ════════════════════════════════════════════════════════════════════════ */}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border-2 border-spu-primary/30 shadow-md space-y-4">
            <div className="border-b border-slate-200 dark:border-slate-700 pb-3">
              <h2 className="text-base font-black text-slate-950 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <CheckSquare className="w-5 h-5 text-spu-primary" />
                NEXT BEST ACTION FOR PLANNER
              </h2>
              <p className="text-xs font-bold text-slate-500">
                Actionable checklist generated dynamically from actual identified blockers
              </p>
            </div>

            <div className="space-y-2.5">
              {nextBestActions.map((action, idx) => (
                <div key={idx} className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-black text-slate-800 dark:text-slate-200">
                  <span className="w-6 h-6 rounded-full bg-spu-primary text-white flex items-center justify-center font-black text-xs flex-shrink-0">
                    {idx + 1}
                  </span>
                  <span className="mt-0.5">{action}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ════════════════════════════════════════════════════════════════════════
              SECTION 12: ACTIONABLE NAVIGATION SHORTCUTS
             ════════════════════════════════════════════════════════════════════════ */}
          <div className="bg-slate-100 dark:bg-slate-900 p-6 rounded-2xl border border-slate-300 dark:border-slate-700 shadow-sm space-y-3 print:hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <ArrowRight className="w-4 h-4 text-spu-primary" />
                NAVIGATION SHORTCUTS (READ-ONLY ANALYTICS • USE MODULES BELOW TO MODIFY DATA)
              </span>
            </div>

            <div className="flex flex-wrap gap-2.5">
              <Link
                to="/orders"
                className="px-3.5 py-2 bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 border border-slate-300 dark:border-slate-600 rounded-xl text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5 transition-all shadow-xs"
              >
                <span>VIEW ORDER</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
              </Link>
              <Link
                to="/designs"
                className="px-3.5 py-2 bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 border border-slate-300 dark:border-slate-600 rounded-xl text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5 transition-all shadow-xs"
              >
                <span>VIEW DESIGN</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
              </Link>
              <Link
                to="/entry"
                className="px-3.5 py-2 bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 border border-slate-300 dark:border-slate-600 rounded-xl text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5 transition-all shadow-xs"
              >
                <span>VIEW MAIN ENTRY</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
              </Link>
              <Link
                to="/beam-stock"
                className="px-3.5 py-2 bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 border border-slate-300 dark:border-slate-600 rounded-xl text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5 transition-all shadow-xs"
              >
                <span>VIEW BEAM STOCK</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
              </Link>
              <Link
                to="/reed-stock"
                className="px-3.5 py-2 bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 border border-slate-300 dark:border-slate-600 rounded-xl text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5 transition-all shadow-xs"
              >
                <span>VIEW REED STOCK</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
              </Link>
              <Link
                to="/availability"
                className="px-3.5 py-2 bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 border border-slate-300 dark:border-slate-600 rounded-xl text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5 transition-all shadow-xs"
              >
                <span>VIEW AVAILABILITY</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
              </Link>
              <Link
                to="/runout-monitor"
                className="px-3.5 py-2 bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 border border-slate-300 dark:border-slate-600 rounded-xl text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5 transition-all shadow-xs"
              >
                <span>VIEW RUNOUT</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
              </Link>
              <Link
                to="/eligibility"
                className="px-3.5 py-2 bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 border border-slate-300 dark:border-slate-600 rounded-xl text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5 transition-all shadow-xs"
              >
                <span>VIEW SMART RECOMMENDATION</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
              </Link>
              <Link
                to="/plan"
                className="px-3.5 py-2 bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 border border-slate-300 dark:border-slate-600 rounded-xl text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5 transition-all shadow-xs"
              >
                <span>VIEW LOOM PLANNING</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
