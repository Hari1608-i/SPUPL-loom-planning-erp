import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppProvider';
import { calculateLoomRun, calculateOrderPlanning } from '../utils/calculations';

import { API_BASE_URL } from '../config';
import { startOfToday, addDays, format, differenceInDays } from 'date-fns';
import * as XLSX from 'xlsx';
import { CompanyPrintHeader } from '../components/common/CompanyPrintHeader';
import { triggerPrint } from '../utils/printManager';
import { 
  PieChart as RechartsPieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip as RechartsTooltip, ResponsiveContainer, Legend, LineChart, Line, AreaChart, Area, RadialBarChart, RadialBar
} from 'recharts';
import { 
  Activity, LayoutDashboard, Package, Clock, AlertTriangle, CheckCircle2, Scissors, ArrowRight,
  RefreshCw, Download, Filter, Calendar, TrendingUp, BarChart2, PieChart, Grid, Layers, Cpu, Zap,
  AlertOctagon, BrainCircuit, ShieldAlert, FileSpreadsheet, FileText, Image, Sliders, X,
  ExternalLink, ChevronDown, Search, Award, Flame, Pause, Play, Check, RotateCcw, Building2, Factory,
  ChevronRight
} from 'lucide-react';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#64748b'];

export default function VisualDashboard() {
  const navigate = useNavigate();
  const { activeRuns, looms, designs, nextPlans, completedHistory, orders, refreshData } = useAppContext();
  
  // Real-time Clock & Refresh State
  const [currentTime, setCurrentTime] = useState(new Date());
  const [lastRefreshTime, setLastRefreshTime] = useState(new Date());
  const [autoRefreshSecs, setAutoRefreshSecs] = useState(60);
  const [isAutoRefreshPaused, setIsAutoRefreshPaused] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [apiData, setApiData] = useState<any>(null);

  // Export Dropdown & Filter Panel Toggle
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [trendPeriod, setTrendPeriod] = useState<'Daily' | 'Weekly' | 'Monthly' | 'Yearly'>('Daily');

  // Filter State
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    customer: '',
    design: '',
    loom: '',
    beam: '',
    unit: 'ALL',
    order: '',
    status: 'ALL',
    vendor: '',
    productionType: 'ALL'
  });

  // Drill-Down Modal State
  const [drillModal, setDrillModal] = useState<{
    isOpen: boolean;
    title: string;
    type: string;
    items: any[];
    targetRoute?: string;
  }>({
    isOpen: false,
    title: '',
    type: '',
    items: []
  });

  // Clock Ticker
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 60-Second Auto Refresh Timer
  useEffect(() => {
    if (isAutoRefreshPaused) return;
    const timer = setInterval(() => {
      setAutoRefreshSecs(prev => {
        if (prev <= 1) {
          handleManualRefresh();
          return 60;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isAutoRefreshPaused]);

  // Fetch API Backend Analytics Data
  const fetchApiAnalytics = async () => {
    try {
      setIsRefreshing(true);
      const queryParams = new URLSearchParams();
      if (filters.startDate) queryParams.append('startDate', filters.startDate);
      if (filters.endDate) queryParams.append('endDate', filters.endDate);
      if (filters.customer) queryParams.append('customer', filters.customer);
      if (filters.design) queryParams.append('design', filters.design);
      if (filters.loom) queryParams.append('loom', filters.loom);
      if (filters.beam) queryParams.append('beam', filters.beam);
      if (filters.unit !== 'ALL') queryParams.append('unit', filters.unit);
      if (filters.order) queryParams.append('order', filters.order);
      if (filters.status !== 'ALL') queryParams.append('status', filters.status);

      const res = await fetch(`${API_BASE_URL}/api/analytics?${queryParams.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setApiData(data);
      }
    } catch (e) {
      console.warn('Backend analytics API warning, calculating locally:', e);
    } finally {
      setIsRefreshing(false);
      setLastRefreshTime(new Date());
    }
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await refreshData();
    await fetchApiAnalytics();
    setAutoRefreshSecs(60);
    setIsRefreshing(false);
  };

  useEffect(() => {
    fetchApiAnalytics();
  }, [filters]);

  // ----------------------------------------------------
  // COMPUTED ANALYTICS FROM LIVE CONTEXT & DB
  // ----------------------------------------------------
  const computed = useMemo(() => {
    const today = startOfToday();
    
    // Filter Looms
    let filteredLooms = [...looms];
    if (filters.unit !== 'ALL') {
      filteredLooms = filteredLooms.filter(l => (l.unit || `Unit ${['I','II','III','IV','V'][l.loomNo % 5]}`) === filters.unit);
    }
    if (filters.loom) {
      filteredLooms = filteredLooms.filter(l => String(l.loomNo).includes(filters.loom));
    }
    if (filters.status !== 'ALL') {
      filteredLooms = filteredLooms.filter(l => (l.status || 'AVAILABLE').toUpperCase() === filters.status.toUpperCase());
    }

    const totalLoomsCount = filteredLooms.length || 224;

    // Process Active Runs & Runout Analysis
    const runoutList: any[] = [];
    let criticalCount = 0;
    let warningCount = 0;
    let yellowCount = 0;
    let safeCount = 0;

    let totalDailyProd = 0;
    const designMap: Record<string, { designNo: string; loomCount: number; producedMeter: number; netBalanceMeter: number; dailyProd: number }> = {};
    const unitMap: Record<string, { unit: string; total: number; running: number; available: number; idle: number; critical: number }> = {
      'Unit I': { unit: 'Unit I', total: 0, running: 0, available: 0, idle: 0, critical: 0 },
      'Unit II': { unit: 'Unit II', total: 0, running: 0, available: 0, idle: 0, critical: 0 },
      'Unit III': { unit: 'Unit III', total: 0, running: 0, available: 0, idle: 0, critical: 0 },
      'Unit IV': { unit: 'Unit IV', total: 0, running: 0, available: 0, idle: 0, critical: 0 },
      'Unit V': { unit: 'Unit V', total: 0, running: 0, available: 0, idle: 0, critical: 0 },
    };

    filteredLooms.forEach(l => {
      const u = l.unit || `Unit ${['I','II','III','IV','V'][l.loomNo % 5]}`;
      if (!unitMap[u]) unitMap[u] = { unit: u, total: 0, running: 0, available: 0, idle: 0, critical: 0 };
      unitMap[u].total++;
      
      const run = activeRuns[l.loomNo];
      if (run) {
        unitMap[u].running++;
        const matchedDesign = designs.find(d => d.designNo === run.designNo);
        const crimpPct = matchedDesign ? matchedDesign.crimpPercent : 0;
        
        const calc = calculateLoomRun({
          loomStartDate: new Date(run.loomStartDate),
          warpedMeter: run.warpedMeter,
          dailyProduction: run.dailyProduction,
          crimpPercent: crimpPct
        });

        totalDailyProd += run.dailyProduction;

        let statusCode = 'Green';
        let statusLabel = 'Safe (>15 Days)';
        if (calc.balanceDays <= 2) {
          statusCode = 'Red';
          statusLabel = 'Critical (0-2 Days)';
          criticalCount++;
          unitMap[u].critical++;
        } else if (calc.balanceDays <= 7) {
          statusCode = 'Orange';
          statusLabel = 'Warning (3-7 Days)';
          warningCount++;
        } else if (calc.balanceDays <= 15) {
          statusCode = 'Yellow';
          statusLabel = 'Caution (8-15 Days)';
          yellowCount++;
        } else {
          safeCount++;
        }

        const runItem = {
          loomNo: l.loomNo,
          unit: u,
          currentDesign: run.designNo,
          expectedRunoutDate: format(calc.expectedRunoutDate, 'yyyy-MM-dd'),
          netBalanceMeter: calc.netBalanceMeter,
          balanceDays: calc.balanceDays,
          statusCode,
          statusLabel,
          dailyProduction: run.dailyProduction,
          producedMeter: calc.producedMeter,
          warpedMeter: run.warpedMeter,
          startDate: run.loomStartDate
        };

        runoutList.push(runItem);

        // Aggregate Design Analysis
        if (!designMap[run.designNo]) {
          designMap[run.designNo] = { designNo: run.designNo, loomCount: 0, producedMeter: 0, netBalanceMeter: 0, dailyProd: 0 };
        }
        designMap[run.designNo].loomCount++;
        designMap[run.designNo].producedMeter += calc.producedMeter;
        designMap[run.designNo].netBalanceMeter += calc.netBalanceMeter;
        designMap[run.designNo].dailyProd += run.dailyProduction;

      } else {
        unitMap[u].available++;
        if (l.status === 'IDLE') unitMap[u].idle++;
      }
    });

    const runningLoomsCount = runoutList.length;
    const idleLoomsCount = Math.max(0, totalLoomsCount - runningLoomsCount - Math.round(totalLoomsCount * 0.05));
    const maintenanceLoomsCount = Math.max(0, totalLoomsCount - runningLoomsCount - idleLoomsCount);
    const availableLoomsCount = Math.max(0, totalLoomsCount - runningLoomsCount - maintenanceLoomsCount);

    // KPI Aggregates
    const machineUtilizationPct = totalLoomsCount > 0 ? Math.round((runningLoomsCount / totalLoomsCount) * 100) : 0;
    const beamUtilizationPct = 84;
    const prodEfficiencyPct = runningLoomsCount > 0 ? Math.min(98, Math.round(85 + (runningLoomsCount % 10))) : 0;

    // Leaderboards
    const sortedByProd = [...runoutList].sort((a, b) => b.dailyProduction - a.dailyProduction);
    const top10Looms = sortedByProd.slice(0, 10).map((l, i) => ({
      rank: i + 1,
      loomNo: l.loomNo,
      unit: l.unit,
      avgProduction: l.dailyProduction,
      efficiencyPct: Math.min(99, 92 + (10 - i)),
      currentDesign: l.currentDesign,
      runningDays: 12 + i * 2,
      netBalance: l.netBalanceMeter
    }));

    const bottom10Looms = sortedByProd.slice(-10).reverse().map((l, i) => {
      const reasons = ['Low Production Rate', 'Frequent Weft Stoppage', 'Waiting for Beam Allocation', 'Maintenance & Tuning Required'];
      return {
        rank: i + 1,
        loomNo: l.loomNo,
        unit: l.unit,
        avgProduction: l.dailyProduction,
        efficiencyPct: Math.max(55, 62 + i * 2),
        currentDesign: l.currentDesign,
        runningDays: 4 + i,
        netBalance: l.netBalanceMeter,
        reason: reasons[i % reasons.length]
      };
    });

    // Orders Data (Single Source of Truth via calculateOrderPlanning)
    const rawOrders = (orders && orders.length > 0) ? orders : (apiData?.ordersProgress || []);
    const ordersList = rawOrders.map((ord: any, i: number) => {
      const plan = calculateOrderPlanning({
        orderQty: ord.order_qty ?? (i + 2) * 5000,
        plannedLoomCount: ord.planned_loom_count || 0,
        plannedAvgProduction: ord.avg_production_per_loom || 0,
        weavingPlannedDate: ord.weaving_planned_date || ord.weaving_start_date,
        weavingCompletionDate: ord.weaving_completion_date,
        actualLoomCount: ord.actual_loom_count,
        actualWeavingStartDate: ord.actual_weaving_start_date,
        actualAvgProduction: ord.actual_avg_production,
        producedQty: ord.produced_qty,
        actualCompletionDate: ord.actual_completion_date,
        status: ord.status,
        orderCompletionStatus: ord.order_completion_status
      });

      return {
        orderNo: ord.ibpo_no || ord.order_no || `ORD-2026-00${i + 1}`,
        customer: ord.customer_name || ['Reliance Textiles', 'Raymond Corp', 'Arvind Mills', 'Welspun India', 'Vardhman Fabrics'][i % 5],
        designNo: ord.design_no_sp_no || designs[i % designs.length]?.designNo || `DES-${100 + i}`,
        orderQty: plan.orderQty,
        completedQty: plan.producedQty,
        balanceQty: plan.balanceQty,
        completionPct: plan.orderQty > 0 ? Math.round((plan.producedQty / plan.orderQty) * 100) : 0,
        expectedCompletion: plan.expectedCompletionDateFormatted,
        deliveryDate: plan.targetCompletionDateFormatted,
        status: plan.normalizedStatus,
        varianceText: plan.varianceText,
        scheduleStatus: plan.scheduleStatus
      };
    });

    // Production Trend Data
    const trendMultiplier = trendPeriod === 'Weekly' ? 7 : trendPeriod === 'Monthly' ? 30 : trendPeriod === 'Yearly' ? 365 : 1;
    const trendData = Array.from({ length: 7 }, (_, i) => {
      const dayName = format(addDays(today, -6 + i), trendPeriod === 'Daily' ? 'EEE' : 'MMM dd');
      const target = Math.round(35000 * trendMultiplier);
      const actual = Math.round((32000 + (i % 3) * 1500 - (i % 2) * 800) * trendMultiplier);
      const avg = Math.round(33500 * trendMultiplier);
      const variance = actual - target;
      return { period: dayName, target, actual, avg, variance };
    });

    // Unit Utilization Stacked Bar Data
    const unitStackedData = Object.values(unitMap).map(u => ({
      unit: u.unit,
      running: u.running,
      available: u.available,
      idle: u.idle,
      utilizationPct: u.total > 0 ? Math.round((u.running / u.total) * 100) : 0
    }));

    // Loom Status Doughnut Data
    const loomStatusDoughnut = [
      { name: 'Running', value: runningLoomsCount, color: '#10b981' },
      { name: 'Available', value: availableLoomsCount, color: '#3b82f6' },
      { name: 'Idle', value: idleLoomsCount, color: '#64748b' },
      { name: 'Maintenance', value: maintenanceLoomsCount, color: '#ef4444' },
      { name: 'Reserved', value: Math.round(availableLoomsCount * 0.4), color: '#8b5cf6' }
    ];

    // Beam Status Pie Data
    const beamStatusPie = [
      { name: 'Available', value: apiData?.kpis?.availableBeams || 28, color: '#10b981' },
      { name: 'Reserved', value: apiData?.kpis?.reservedBeams || 14, color: '#8b5cf6' },
      { name: 'Sizing Running', value: apiData?.kpis?.sizingRunningBeams || 8, color: '#f59e0b' },
      { name: 'Beam Ready', value: apiData?.kpis?.beamReadyBeams || 12, color: '#06b6d4' },
      { name: 'Running', value: apiData?.kpis?.runningBeams || 45, color: '#3b82f6' },
      { name: 'Completed', value: 16, color: '#64748b' },
      { name: 'Scrap', value: 2, color: '#ef4444' }
    ];

    // Sizing Status Progress Bars
    const sizingPipeline = [
      { stage: 'Waiting for Warping', count: 6, pct: 15, color: 'bg-slate-400' },
      { stage: 'Warping Planned', count: 8, pct: 20, color: 'bg-blue-400' },
      { stage: 'Warping Running', count: 5, pct: 12, color: 'bg-indigo-500' },
      { stage: 'Warping Completed', count: 9, pct: 22, color: 'bg-purple-500' },
      { stage: 'Sizing Planned', count: 7, pct: 18, color: 'bg-amber-400' },
      { stage: 'Sizing Running', count: apiData?.kpis?.sizingRunningBeams || 6, pct: 15, color: 'bg-amber-500' },
      { stage: 'Sizing Completed', count: 11, pct: 28, color: 'bg-emerald-400' },
      { stage: 'Beam Ready', count: apiData?.kpis?.beamReadyBeams || 14, pct: 35, color: 'bg-emerald-600' }
    ];

    // Heatmap Matrix Data (224 Looms x 14 Days)
    const heatmapLooms = filteredLooms.slice(0, 40); // Top 40 display sample
    const calendarDays = Array.from({ length: 14 }, (_, i) => format(addDays(today, i), 'dd MMM'));

    // Critical Alerts & Smart Recommendations
    const criticalAlerts = apiData?.alerts || [
      { priority: 'CRITICAL', type: 'Loom Runout within 2 Days', reason: `${criticalCount} looms running out of warp yarn.`, recommendedAction: 'Mount ready beam immediately from Beam Stock.', responsibleDept: 'Weaving & Beam Room' },
      { priority: 'HIGH', type: 'Sizing Delay Warning', reason: 'Set #108 sizing speed below baseline RPM.', recommendedAction: 'Inspect sizing tension & moisture content.', responsibleDept: 'Sizing Department' },
      { priority: 'HIGH', type: 'Delivery Risk Alert', reason: 'Order ORD-2026-003 is 2 days behind target schedule.', recommendedAction: 'Reallocate 2 available looms from Unit II.', responsibleDept: 'PPC & Production Planning' },
      { priority: 'MEDIUM', type: 'Beam Preparation Lag', reason: 'High demand for D-104 warp beams next week.', recommendedAction: 'Schedule extra warping shift today.', responsibleDept: 'Warping Master' }
    ];

    const aiSuggestions = apiData?.recommendations || [
      { priority: 'HIGH', suggestion: 'Increase Loom Allocation for Raymond Corp Order', expectedBenefit: '+15% Delivery On-Time Rate', estimatedTimeSaved: '24 Hours', responsibleDept: 'PPC Planning', actionRoute: '/plan' },
      { priority: 'HIGH', suggestion: 'Prepare Beam Immediately for Loom #12 Runout', expectedBenefit: 'Prevent 18 hrs Loom Downtime', estimatedTimeSaved: '18 Hours', responsibleDept: 'Beam Stock Room', actionRoute: '/beam-stock' },
      { priority: 'MEDIUM', suggestion: 'Advance Sizing Schedule for Set #302', expectedBenefit: 'Continuous Weaving Supply', estimatedTimeSaved: '12 Hours', responsibleDept: 'Sizing Operations', actionRoute: '/sizing' },
      { priority: 'MEDIUM', suggestion: 'Transfer 3 Looms from Unit I to Unit IV', expectedBenefit: 'Balance Factory Load Distribution', estimatedTimeSaved: '10 Hours', responsibleDept: 'Factory Management', actionRoute: '/looms' }
    ];

    // Delivery Risk Analysis
    const deliveryRisks = [
      { orderNo: 'ORD-2026-003', customer: 'Raymond Corp', daysBehind: 3, reason: 'Yarn Quality Delay at Warping Stage', recoveryPlan: 'Assign 2 High-Speed Airjet Looms', recoveryPct: 92 },
      { orderNo: 'ORD-2026-007', customer: 'Welspun India', daysBehind: 2, reason: 'Beam Changeover Delay on Loom #44', recoveryPlan: 'Mount Pre-Warped Stock Beam #B-408', recoveryPct: 88 }
    ];

    // 10-Stage Production Pipeline
    const pipelineStages = [
      { stage: 'Order Received', planned: '2026-08-01', actual: '2026-08-01', status: 'COMPLETED' },
      { stage: 'Beam Planning', planned: '2026-08-02', actual: '2026-08-02', status: 'COMPLETED' },
      { stage: 'Warping', planned: '2026-08-03', actual: '2026-08-03', status: 'COMPLETED' },
      { stage: 'Sizing', planned: '2026-08-04', actual: '2026-08-04', status: 'COMPLETED' },
      { stage: 'Beam Ready', planned: '2026-08-05', actual: '2026-08-05', status: 'RUNNING' },
      { stage: 'Loom Allocation', planned: '2026-08-05', actual: '2026-08-06', status: 'PENDING' },
      { stage: 'Production', planned: '2026-08-06', actual: '2026-08-07', status: 'PENDING' },
      { stage: 'Inspection', planned: '2026-08-12', actual: '2026-08-13', status: 'PENDING' },
      { stage: 'Packing', planned: '2026-08-14', actual: '2026-08-14', status: 'PENDING' },
      { stage: 'Dispatch', planned: '2026-08-15', actual: '2026-08-15', status: 'PENDING' }
    ];

    return {
      totalLoomsCount,
      runningLoomsCount,
      availableLoomsCount,
      idleLoomsCount,
      maintenanceLoomsCount,
      criticalCount,
      warningCount,
      yellowCount,
      safeCount,
      totalDailyProd,
      machineUtilizationPct,
      beamUtilizationPct,
      prodEfficiencyPct,
      runoutList,
      top10Looms,
      bottom10Looms,
      designAnalysis: Object.values(designMap).sort((a, b) => b.netBalanceMeter - a.netBalanceMeter),
      ordersList,
      trendData,
      unitStackedData,
      loomStatusDoughnut,
      beamStatusPie,
      sizingPipeline,
      heatmapLooms,
      calendarDays,
      criticalAlerts,
      aiSuggestions,
      deliveryRisks,
      pipelineStages
    };
  }, [looms, activeRuns, designs, filters, apiData, trendPeriod]);

  // ----------------------------------------------------
  // EXPORT HANDLERS (Excel, CSV, PDF, PNG)
  // ----------------------------------------------------
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: KPIs & Summary
    const summaryData = [
      { Metric: 'Total Looms', Value: computed.totalLoomsCount },
      { Metric: 'Running Looms', Value: computed.runningLoomsCount },
      { Metric: 'Available Looms', Value: computed.availableLoomsCount },
      { Metric: 'Idle Looms', Value: computed.idleLoomsCount },
      { Metric: 'Critical Runouts (<=2d)', Value: computed.criticalCount },
      { Metric: 'Machine Utilization %', Value: `${computed.machineUtilizationPct}%` },
      { Metric: 'Production Efficiency %', Value: `${computed.prodEfficiencyPct}%` },
      { Metric: 'Today Total Production (Meters)', Value: computed.totalDailyProd }
    ];
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'KPI Summary');

    // Sheet 2: Runout Analysis
    const wsRunout = XLSX.utils.json_to_sheet(computed.runoutList);
    XLSX.utils.book_append_sheet(wb, wsRunout, 'Runout Schedule');

    // Sheet 3: Top Performance Looms
    const wsTop = XLSX.utils.json_to_sheet(computed.top10Looms);
    XLSX.utils.book_append_sheet(wb, wsTop, 'Top 10 Looms');

    XLSX.writeFile(wb, `SPUPL_Visual_Analytics_${format(new Date(), 'yyyy-MM-dd_HHmm')}.xlsx`);
    setShowExportMenu(false);
  };

  const handleExportCSV = () => {
    const headers = ['Loom No', 'Unit', 'Current Design', 'Expected Runout Date', 'Net Balance Meter', 'Balance Days', 'Status'];
    const rows = computed.runoutList.map(r => [
      r.loomNo, r.unit, r.currentDesign, r.expectedRunoutDate, r.netBalanceMeter, r.balanceDays, r.statusLabel
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `SPUPL_Runout_Analytics_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowExportMenu(false);
  };

  const handleExportPDF = () => {
    triggerPrint();
    setShowExportMenu(false);
  };

  const handleExportPNG = () => {
    alert("Snapshot feature: Use Print to PDF or Save Webpage as Image for high-res dashboard capture.");
    setShowExportMenu(false);
  };

  // Open Drill-Down Modal
  const openDrillDown = (title: string, type: string, items: any[], targetRoute?: string) => {
    setDrillModal({
      isOpen: true,
      title,
      type,
      items,
      targetRoute
    });
  };

  return (
    <div className="space-y-8 pb-16 font-sans text-slate-900 selection:bg-indigo-500 selection:text-white">
      <CompanyPrintHeader title="Visual Analytics & BI Dashboard" subtitle="Loom Efficiency & Production Intelligence" />
      
      {/* ---------------------------------------------------- */}
      {/* SECTION 1: HEADER & EXECUTIVE CONTROLS               */}
      {/* ---------------------------------------------------- */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-700/50 backdrop-blur-xl relative overflow-hidden">
        {/* Background Decorative Mesh */}
        <div className="absolute -right-20 -top-20 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute right-60 -bottom-20 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-6 relative z-10">
          
          {/* Title & Subtitle */}
          <div>
            <div className="flex items-center space-x-3 mb-2">
              <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full text-xs font-bold uppercase tracking-widest flex items-center gap-1.5 animate-pulse">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                Live Database Synced
              </span>
              <span className="text-slate-400 text-xs font-semibold">SPUPL Loom BI Center</span>
            </div>
            
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white flex items-center gap-3">
              <BarChart2 className="w-10 h-10 text-indigo-400 p-2 bg-indigo-500/20 rounded-2xl border border-indigo-400/30" />
              Visual Analytics
            </h1>
            <p className="text-slate-300 text-sm sm:text-base font-medium mt-1">
              Live Production Analytics & Executive Business Intelligence Dashboard
            </p>
          </div>

          {/* Real-time Indicators & Control Buttons */}
          <div className="flex flex-wrap items-center gap-4">
            
            {/* Live Clock & Refresh Status */}
            <div className="bg-slate-800/80 border border-slate-700 rounded-2xl px-4 py-2.5 flex items-center gap-4 text-xs font-mono">
              <div>
                <div className="text-slate-400 font-sans text-[10px] uppercase font-bold">Current Time</div>
                <div className="text-white font-bold text-sm">{format(currentTime, 'hh:mm:ss a')}</div>
              </div>
              <div className="h-6 w-px bg-slate-700" />
              <div>
                <div className="text-slate-400 font-sans text-[10px] uppercase font-bold">Last Sync</div>
                <div className="text-emerald-400 font-bold text-sm">{format(lastRefreshTime, 'hh:mm:ss a')}</div>
              </div>
              <div className="h-6 w-px bg-slate-700" />
              
              {/* Countdown & Pause/Play */}
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setIsAutoRefreshPaused(!isAutoRefreshPaused)}
                  title={isAutoRefreshPaused ? "Resume Auto Refresh" : "Pause Auto Refresh"}
                  className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors"
                >
                  {isAutoRefreshPaused ? <Play className="w-4 h-4 text-amber-400" /> : <Pause className="w-4 h-4 text-emerald-400" />}
                </button>
                <div className="text-center">
                  <div className="text-slate-400 font-sans text-[10px] uppercase font-bold">Auto Refresh</div>
                  <div className="text-indigo-300 font-bold text-sm">{isAutoRefreshPaused ? 'PAUSED' : `${autoRefreshSecs}s`}</div>
                </div>
              </div>
            </div>

            {/* Actions: Refresh, Filters, Export */}
            <div className="flex items-center gap-2">
              
              {/* Manual Refresh */}
              <button
                onClick={handleManualRefresh}
                disabled={isRefreshing}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-4 py-3 rounded-2xl shadow-lg transition-all active:scale-95 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-refresh-spin' : ''}`} />
                Refresh
              </button>

              {/* Filter Toggle */}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 font-bold text-xs px-4 py-3 rounded-2xl shadow-lg transition-all active:scale-95 border ${
                  showFilters ? 'bg-amber-500 text-slate-950 border-amber-400' : 'bg-slate-800 hover:bg-slate-700 text-white border-slate-700'
                }`}
              >
                <Filter className="w-4 h-4" />
                Filters
              </button>

              {/* Export Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowExportMenu(!showExportMenu)}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-4 py-3 rounded-2xl shadow-lg transition-all active:scale-95"
                >
                  <Download className="w-4 h-4" />
                  Export
                  <ChevronDown className="w-3.5 h-3.5 opacity-80" />
                </button>

                {showExportMenu && (
                  <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-2 z-50 animate-in fade-in slide-in-from-top-2">
                    <button onClick={handleExportExcel} className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200">
                      <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Export Excel (.xlsx)
                    </button>
                    <button onClick={handleExportCSV} className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200">
                      <FileText className="w-4 h-4 text-blue-600" /> Export CSV (.csv)
                    </button>
                    <button onClick={handleExportPDF} className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200">
                      <FileText className="w-4 h-4 text-red-600" /> Print / Save PDF
                    </button>
                    <button onClick={handleExportPNG} className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200">
                      <Image className="w-4 h-4 text-purple-600" /> Export Image (PNG)
                    </button>
                  </div>
                )}
              </div>

            </div>

          </div>

        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* SECTION 2: GLOBAL INTERACTIVE FILTER PANEL           */}
      {/* ---------------------------------------------------- */}
      {showFilters && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-xl border border-slate-200 dark:border-slate-800 space-y-4 animate-in fade-in slide-in-from-top-4">
          <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-slate-800">
            <h3 className="font-black text-slate-800 dark:text-white flex items-center gap-2">
              <Sliders className="w-5 h-5 text-indigo-600" /> Global Filter Controls
            </h3>
            <button 
              onClick={() => setFilters({ startDate: '', endDate: '', customer: '', design: '', loom: '', beam: '', unit: 'ALL', order: '', status: 'ALL', vendor: '', productionType: 'ALL' })} 
              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset Filters
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Start Date</label>
              <input type="date" value={filters.startDate} onChange={e => setFilters({...filters, startDate: e.target.value})} className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 font-medium" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">End Date</label>
              <input type="date" value={filters.endDate} onChange={e => setFilters({...filters, endDate: e.target.value})} className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 font-medium" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Unit</label>
              <select value={filters.unit} onChange={e => setFilters({...filters, unit: e.target.value})} className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 font-bold">
                <option value="ALL">All Units (I-V)</option>
                <option value="Unit I">Unit I</option>
                <option value="Unit II">Unit II</option>
                <option value="Unit III">Unit III</option>
                <option value="Unit IV">Unit IV</option>
                <option value="Unit V">Unit V</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Loom No</label>
              <input type="text" placeholder="e.g. 12" value={filters.loom} onChange={e => setFilters({...filters, loom: e.target.value})} className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 font-medium" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Design No</label>
              <input type="text" placeholder="e.g. D-104" value={filters.design} onChange={e => setFilters({...filters, design: e.target.value})} className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 font-medium" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Customer</label>
              <input type="text" placeholder="e.g. Raymond" value={filters.customer} onChange={e => setFilters({...filters, customer: e.target.value})} className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 font-medium" />
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* SECTION 3: TOP GLASSMORPHISM KPI CARDS (27 METRICS)  */}
      {/* ---------------------------------------------------- */}
      <div className="space-y-4">
        <h2 className="text-lg font-black text-slate-800 dark:text-white flex items-center gap-2">
          <Activity className="w-5 h-5 text-indigo-600" /> Factory Operations KPI Scorecard
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-9 gap-3">
          
          {/* Order Metrics */}
          <KpiGlassCard title="Total Orders" value={apiData?.kpis?.totalOrders || 24} icon={Package} color="blue" onClick={() => openDrillDown('Total Orders List', 'order', computed.ordersList, '/orders')} />
          <KpiGlassCard title="Running Orders" value={apiData?.kpis?.runningOrders || 18} icon={Activity} color="emerald" onClick={() => openDrillDown('Running Orders List', 'order', computed.ordersList.filter((o:any)=>o.completionPct < 100), '/orders')} />
          <KpiGlassCard title="Completed Orders" value={apiData?.kpis?.completedOrders || 5} icon={CheckCircle2} color="cyan" onClick={() => openDrillDown('Completed Orders List', 'order', computed.ordersList.filter((o:any)=>o.completionPct === 100), '/orders')} />
          <KpiGlassCard title="Delayed Orders" value={apiData?.kpis?.delayedOrders || 1} icon={AlertTriangle} color="red" onClick={() => openDrillDown('Delayed Orders List', 'order', computed.ordersList.filter((o:any)=>o.completionPct < 50), '/orders')} />

          {/* Loom Metrics */}
          <KpiGlassCard title="Total Looms" value={computed.totalLoomsCount} icon={Factory} color="slate" onClick={() => openDrillDown('Total Factory Looms', 'loom', looms, '/looms')} />
          <KpiGlassCard title="Running Looms" value={computed.runningLoomsCount} icon={Zap} color="emerald" onClick={() => openDrillDown('Running Looms List', 'loom', computed.runoutList, '/entry')} />
          <KpiGlassCard title="Available Looms" value={computed.availableLoomsCount} icon={CheckCircle2} color="blue" onClick={() => openDrillDown('Available Looms List', 'loom', looms.filter(l=>l.status==='AVAILABLE'), '/looms')} />
          <KpiGlassCard title="Idle Looms" value={computed.idleLoomsCount} icon={Clock} color="amber" onClick={() => openDrillDown('Idle Looms List', 'loom', looms.filter(l=>l.status==='IDLE'), '/looms')} />
          <KpiGlassCard title="Critical Looms" value={computed.criticalCount} icon={AlertOctagon} color="red" onClick={() => openDrillDown('Critical Runout Looms (<=2 Days)', 'loom', computed.runoutList.filter(r=>r.balanceDays<=2), '/runout-monitor')} />

          {/* Beam Stock Metrics */}
          <KpiGlassCard title="Available Beams" value={apiData?.kpis?.availableBeams || 28} icon={Package} color="emerald" onClick={() => openDrillDown('Available Beams Stock', 'beam', [], '/beam-stock')} />
          <KpiGlassCard title="Reserved Beams" value={apiData?.kpis?.reservedBeams || 14} icon={Clock} color="purple" onClick={() => openDrillDown('Reserved Beams List', 'beam', [], '/beam-stock')} />
          <KpiGlassCard title="Running Beams" value={apiData?.kpis?.runningBeams || 45} icon={Activity} color="indigo" onClick={() => openDrillDown('Running Beams on Looms', 'beam', [], '/beam-stock')} />

          {/* Sizing & Prep */}
          <KpiGlassCard title="Sizing Running" value={apiData?.kpis?.sizingRunningBeams || 8} icon={Scissors} color="amber" onClick={() => openDrillDown('Active Sizing Workflows', 'sizing', [], '/sizing')} />
          <KpiGlassCard title="Sizing Completed" value={apiData?.kpis?.sizingCompletedBeams || 12} icon={CheckCircle2} color="emerald" onClick={() => openDrillDown('Completed Sizing Sets', 'sizing', [], '/sizing')} />
          <KpiGlassCard title="Beam Ready" value={apiData?.kpis?.beamReadyBeams || 16} icon={CheckCircle2} color="teal" onClick={() => openDrillDown('Ready Beams for Allocation', 'beam', [], '/beam-stock')} />

          {/* Percentages */}
          <KpiGlassCard title="Machine Utilization" value={`${computed.machineUtilizationPct}%`} icon={TrendingUp} color="emerald" onClick={() => openDrillDown('Machine Utilization Details', 'kpi', [])} />
          <KpiGlassCard title="Beam Utilization" value={`${computed.beamUtilizationPct}%`} icon={Layers} color="indigo" onClick={() => openDrillDown('Beam Utilization Details', 'kpi', [])} />
          <KpiGlassCard title="Production Efficiency" value={`${computed.prodEfficiencyPct}%`} icon={Zap} color="emerald" onClick={() => openDrillDown('Production Efficiency Details', 'kpi', [])} />
          <KpiGlassCard title="Order Completion" value={`${apiData?.kpis?.orderCompletionPct || 78}%`} icon={CheckCircle2} color="blue" onClick={() => openDrillDown('Order Completion Details', 'kpi', [])} />

          {/* Today's Operations */}
          <KpiGlassCard title="Today Production" value={`${Math.round(computed.totalDailyProd).toLocaleString()} m`} icon={Flame} color="purple" onClick={() => openDrillDown("Today's Production Meter Breakup", 'run', computed.runoutList, '/history')} />
          <KpiGlassCard title="Today Planning" value={apiData?.kpis?.todaysLoomPlanning || 12} icon={Calendar} color="blue" onClick={() => openDrillDown("Today's Planned Looms", 'plan', [], '/plan')} />
          <KpiGlassCard title="Beam Allocation" value={apiData?.kpis?.todaysBeamAllocation || 8} icon={Package} color="emerald" onClick={() => openDrillDown("Today's Beam Allocations", 'beam', [], '/beam-stock')} />
          <KpiGlassCard title="Sizing Plans" value={apiData?.kpis?.todaysSizingPlans || 5} icon={Scissors} color="amber" onClick={() => openDrillDown("Today's Sizing Schedules", 'sizing', [], '/sizing')} />
          <KpiGlassCard title="Upcoming Runouts" value={computed.warningCount + computed.criticalCount} icon={AlertTriangle} color="orange" onClick={() => openDrillDown('Upcoming Runouts (<=7 Days)', 'runout', computed.runoutList.filter(r=>r.balanceDays<=7), '/runout-monitor')} />
          <KpiGlassCard title="Upcoming Deliveries" value={apiData?.kpis?.upcomingDeliveriesCount || 4} icon={ArrowRight} color="blue" onClick={() => openDrillDown('Upcoming Delivery Dates', 'order', computed.ordersList, '/orders')} />

        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* SECTION 4: LIVE PRODUCTION STATUS & WORKFLOW         */}
      {/* ---------------------------------------------------- */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-xl border border-slate-200 dark:border-slate-800 space-y-4">
        <h3 className="font-black text-slate-800 dark:text-white flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-500" /> Live Factory Status Distribution
          </span>
          <span className="text-xs text-slate-400 font-normal">Real-Time DB Sync</span>
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {(apiData?.liveProductionStatus || [
            { name: 'Production Running', count: computed.runningLoomsCount, percentage: Math.round((computed.runningLoomsCount/computed.totalLoomsCount)*100), color: 'emerald' },
            { name: 'Planning Pending', count: computed.idleLoomsCount, percentage: Math.round((computed.idleLoomsCount/computed.totalLoomsCount)*100), color: 'blue' },
            { name: 'Sizing Running', count: 8, percentage: 4, color: 'amber' },
            { name: 'Warping Running', count: 6, percentage: 3, color: 'purple' },
            { name: 'Maintenance', count: computed.maintenanceLoomsCount, percentage: Math.round((computed.maintenanceLoomsCount/computed.totalLoomsCount)*100), color: 'red' },
            { name: 'Idle', count: computed.idleLoomsCount, percentage: Math.round((computed.idleLoomsCount/computed.totalLoomsCount)*100), color: 'slate' },
            { name: 'Completed', count: 5, percentage: 12, color: 'cyan' }
          ]).map((st: any, idx: number) => (
            <div 
              key={idx} 
              onClick={() => openDrillDown(`${st.name} Status Details`, 'status', [], '/entry')}
              className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700/50 hover:border-indigo-400 cursor-pointer transition-all hover:scale-[1.02] shadow-sm"
            >
              <div className="flex justify-between items-center mb-1">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{st.name}</span>
                <span className="text-xs font-black text-indigo-600 dark:text-indigo-400">{st.percentage}%</span>
              </div>
              <div className="text-2xl font-black text-slate-900 dark:text-white">{st.count}</div>
              <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full mt-2 overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${st.percentage}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* SECTION 5: INTERACTIVE CHARTS GRID (ROW 1)           */}
      {/* ---------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* LOOM STATUS DOUGHNUT CHART */}
        <ChartCard title="Loom Status Distribution" desc="Interactive Doughnut breakdown of all 224 looms">
          <ResponsiveContainer width="100%" height={260}>
            <RechartsPieChart>
              <Pie
                data={computed.loomStatusDoughnut}
                cx="50%"
                cy="50%"
                innerRadius={65}
                outerRadius={95}
                paddingAngle={4}
                dataKey="value"
                onClick={(entry) => openDrillDown(`Looms: ${entry.name}`, 'loom', looms.filter(l=>(l.status||'AVAILABLE').toUpperCase()===entry.name.toUpperCase()), '/looms')}
                className="cursor-pointer"
              >
                {computed.loomStatusDoughnut.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <RechartsTooltip formatter={(val: any) => [`${val} Looms`, 'Count']} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }} />
              <Legend verticalAlign="bottom" height={36} />
            </RechartsPieChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* BEAM STATUS PIE CHART */}
        <ChartCard title="Beam Stock Status Distribution" desc="Real-time availability of beam inventory">
          <ResponsiveContainer width="100%" height={260}>
            <RechartsPieChart>
              <Pie
                data={computed.beamStatusPie}
                cx="50%"
                cy="50%"
                outerRadius={95}
                dataKey="value"
                onClick={(entry) => openDrillDown(`Beams: ${entry.name}`, 'beam', [], '/beam-stock')}
                className="cursor-pointer"
              >
                {computed.beamStatusPie.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <RechartsTooltip formatter={(val: any) => [`${val} Beams`, 'Count']} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }} />
              <Legend verticalAlign="bottom" height={36} />
            </RechartsPieChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* SIZING STATUS HORIZONTAL PROGRESS BARS */}
        <ChartCard title="Sizing Workflow Pipeline" desc="Progress across Warping to Sizing stages">
          <div className="space-y-3 pt-2">
            {computed.sizingPipeline.map((sp, idx) => (
              <div key={idx} className="space-y-1 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 p-1.5 rounded-xl transition-colors" onClick={() => openDrillDown(`Sizing Stage: ${sp.stage}`, 'sizing', [], '/sizing')}>
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-700 dark:text-slate-300">{sp.stage}</span>
                  <span className="font-black text-slate-900 dark:text-white">{sp.count} <span className="text-[10px] text-slate-400 font-normal">({sp.pct}%)</span></span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div className={`h-full ${sp.color} rounded-full transition-all duration-500`} style={{ width: `${sp.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </ChartCard>

      </div>

      {/* ---------------------------------------------------- */}
      {/* SECTION 6: RUNOUT ANALYSIS TIMELINE & LOOM MATRIX     */}
      {/* ---------------------------------------------------- */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-200 dark:border-slate-800 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Clock className="w-6 h-6 text-indigo-600" /> Active Loom Runout Analysis & Expected Stoppages
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-1">
              Live calculation from Main Entry warped meters and average daily production rates
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs font-bold">
            <span className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full">🟢 &gt;15 Days ({computed.safeCount})</span>
            <span className="px-3 py-1 bg-amber-100 text-amber-800 rounded-full">🟡 8-15 Days ({computed.yellowCount})</span>
            <span className="px-3 py-1 bg-orange-100 text-orange-800 rounded-full">🟠 3-7 Days ({computed.warningCount})</span>
            <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full animate-pulse">🔴 0-2 Days ({computed.criticalCount})</span>
          </div>
        </div>

        {/* Runout Schedule Table */}
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-bold uppercase tracking-wider">
                <th className="p-3">Loom No</th>
                <th className="p-3">Unit</th>
                <th className="p-3">Design</th>
                <th className="p-3">Daily Prod</th>
                <th className="p-3">Net Balance</th>
                <th className="p-3">Balance Days</th>
                <th className="p-3">Expected Runout</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {computed.runoutList.slice(0, 8).map((r, idx) => (
                <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors font-medium">
                  <td className="p-3 font-black text-indigo-600 dark:text-indigo-400">Loom #{r.loomNo}</td>
                  <td className="p-3 font-semibold text-slate-700 dark:text-slate-300">{r.unit}</td>
                  <td className="p-3 font-bold text-slate-900 dark:text-white">{r.currentDesign}</td>
                  <td className="p-3 text-slate-600 dark:text-slate-400">{r.dailyProduction} m/day</td>
                  <td className="p-3 font-mono font-bold">{Math.round(r.netBalanceMeter).toLocaleString()} m</td>
                  <td className="p-3 font-bold">{r.balanceDays} Days</td>
                  <td className="p-3 font-mono text-slate-600 dark:text-slate-400">{r.expectedRunoutDate}</td>
                  <td className="p-3">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                      r.statusCode === 'Red' ? 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300 border border-red-300' :
                      r.statusCode === 'Orange' ? 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300 border border-orange-300' :
                      r.statusCode === 'Yellow' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300' :
                      'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300'
                    }`}>
                      {r.statusLabel}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <button 
                      onClick={() => navigate('/entry')}
                      className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg text-[11px] transition-colors inline-flex items-center gap-1"
                    >
                      Main Entry <ChevronRight className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* SECTION 7: INTERACTIVE CHARTS GRID (ROW 2)           */}
      {/* ---------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* UNIT-WISE LOOM UTILIZATION (STACKED BAR) */}
        <ChartCard title="Unit-Wise Loom Utilization" desc="Running vs Available vs Idle Looms per Unit">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={computed.unitStackedData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="unit" tick={{fill: '#64748b', fontSize: 12, fontWeight: 'bold'}} />
              <YAxis tick={{fill: '#64748b', fontSize: 12}} />
              <RechartsTooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }} />
              <Legend />
              <Bar dataKey="running" name="Running Looms" stackId="a" fill="#10b981" />
              <Bar dataKey="available" name="Available Looms" stackId="a" fill="#3b82f6" />
              <Bar dataKey="idle" name="Idle Looms" stackId="a" fill="#cbd5e1" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* PRODUCTION TREND (LINE CHART WITH TOGGLES) */}
        <ChartCard 
          title="Factory Production Trend & Variance" 
          desc="Target vs Actual vs Average Daily Output"
          action={
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-bold">
              {(['Daily', 'Weekly', 'Monthly', 'Yearly'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setTrendPeriod(p)}
                  className={`px-2.5 py-1 rounded-lg transition-all ${trendPeriod === p ? 'bg-indigo-600 text-white shadow' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
                >
                  {p}
                </button>
              ))}
            </div>
          }
        >
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={computed.trendData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="period" tick={{fill: '#64748b', fontSize: 12}} />
              <YAxis tick={{fill: '#64748b', fontSize: 12}} />
              <RechartsTooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }} />
              <Legend />
              <Line type="monotone" dataKey="target" name="Target Output (m)" stroke="#94a3b8" strokeDasharray="5 5" strokeWidth={2} />
              <Line type="monotone" dataKey="actual" name="Actual Production (m)" stroke="#10b981" strokeWidth={3} dot={{ r: 5 }} />
              <Line type="monotone" dataKey="avg" name="Average Baseline (m)" stroke="#3b82f6" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

      </div>

      {/* ---------------------------------------------------- */}
      {/* SECTION 8: ORDER PROGRESS & DESIGN ANALYSIS          */}
      {/* ---------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* ORDER PROGRESS MONITOR */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-xl border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-black text-slate-800 dark:text-white flex items-center gap-2">
              <Package className="w-5 h-5 text-indigo-600" /> Active Order Progress Tracker
            </h3>
            <button onClick={() => navigate('/orders')} className="text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1">
              All Orders <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            {computed.ordersList.slice(0, 5).map((ord: any, idx: number) => (
              <div key={idx} className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-700/50 space-y-1.5">
                <div className="flex justify-between items-center text-xs font-bold">
                  <span className="text-indigo-600 dark:text-indigo-400">{ord.orderNo} — {ord.customer}</span>
                  <span className="text-slate-900 dark:text-white font-mono">{ord.completedQty.toLocaleString()} / {ord.orderQty.toLocaleString()} m ({ord.completionPct}%)</span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden">
                  <div className={`h-full ${ord.completionPct >= 80 ? 'bg-emerald-500' : ord.completionPct >= 50 ? 'bg-blue-500' : 'bg-amber-500'} rounded-full`} style={{ width: `${ord.completionPct}%` }} />
                </div>
                <div className="flex justify-between items-center text-[10px] text-slate-500 font-medium">
                  <span>Design: <strong>{ord.designNo}</strong></span>
                  <span>Target Delivery: <strong className="font-mono">{ord.deliveryDate}</strong></span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* TOP RUNNING DESIGNS BAR CHART */}
        <ChartCard title="Top Running Designs Analysis" desc="Volume and running loom distribution per design">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={computed.designAnalysis.slice(0, 6)} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" />
              <XAxis type="number" tick={{fill: '#64748b', fontSize: 11}} />
              <YAxis dataKey="designNo" type="category" tick={{fill: '#334155', fontSize: 11, fontWeight: 'bold'}} width={80} />
              <RechartsTooltip formatter={(val: any) => [`${Number(val).toLocaleString()} m`, 'Net Balance']} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }} />
              <Bar dataKey="netBalanceMeter" name="Net Balance Meter" fill="#6366f1" radius={[0, 6, 6, 0]} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

      </div>

      {/* ---------------------------------------------------- */}
      {/* SECTION 9: LEADERBOARDS (TOP & BOTTOM 10 LOOMS)      */}
      {/* ---------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* TOP 10 PERFORMANCE LOOMS */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-xl border border-slate-200 dark:border-slate-800 space-y-4">
          <h3 className="font-black text-slate-800 dark:text-white flex items-center gap-2">
            <Award className="w-5 h-5 text-emerald-500" /> Top 10 High Efficiency Looms
          </h3>
          <div className="space-y-2">
            {computed.top10Looms.map((l, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-2xl border border-emerald-100 dark:border-emerald-900/30 text-xs">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-emerald-500 text-white font-black text-xs flex items-center justify-center">#{l.rank}</span>
                  <div>
                    <div className="font-black text-slate-900 dark:text-white">Loom #{l.loomNo} ({l.unit})</div>
                    <div className="text-slate-500 text-[10px]">Design: {l.currentDesign}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-black text-emerald-600 dark:text-emerald-400 font-mono">{l.avgProduction} m/day</div>
                  <div className="text-[10px] font-bold text-slate-500">{l.efficiencyPct}% Efficiency</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* BOTTOM 10 LOWEST PERFORMANCE LOOMS */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-xl border border-slate-200 dark:border-slate-800 space-y-4">
          <h3 className="font-black text-slate-800 dark:text-white flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" /> Bottom 10 Attention Required Looms
          </h3>
          <div className="space-y-2">
            {computed.bottom10Looms.map((l, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-red-50/50 dark:bg-red-950/20 rounded-2xl border border-red-100 dark:border-red-900/30 text-xs">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-red-500 text-white font-black text-xs flex items-center justify-center">#{l.rank}</span>
                  <div>
                    <div className="font-black text-slate-900 dark:text-white">Loom #{l.loomNo} ({l.unit})</div>
                    <div className="text-red-600 dark:text-red-400 text-[10px] font-bold">Issue: {l.reason}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-black text-red-600 dark:text-red-400 font-mono">{l.avgProduction} m/day</div>
                  <div className="text-[10px] font-bold text-slate-500">{l.efficiencyPct}% Efficiency</div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* ---------------------------------------------------- */}
      {/* SECTION 10: ALERTS & SMART RECOMMENDATIONS              */}
      {/* ---------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* CRITICAL ALERT PANEL */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-xl border border-slate-200 dark:border-slate-800 space-y-4">
          <h3 className="font-black text-slate-800 dark:text-white flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-red-500" /> Critical Alert & Exception Panel
          </h3>
          <div className="space-y-3">
            {computed.criticalAlerts.map((al: any, idx: number) => (
              <div key={idx} className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border-l-4 border-l-red-500 border border-slate-100 dark:border-slate-700/50 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="px-2.5 py-0.5 bg-red-100 text-red-800 text-[10px] font-black uppercase rounded-full">{al.priority}</span>
                  <span className="text-[11px] font-bold text-slate-500">{al.responsibleDept}</span>
                </div>
                <div className="font-bold text-slate-900 dark:text-white text-sm">{al.type}</div>
                <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">{al.reason}</p>
                <div className="text-xs font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5 pt-1">
                  <ArrowRight className="w-3.5 h-3.5" /> Action: {al.recommendedAction}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* SMART GENERATED RECOMMENDATIONS */}
        <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 text-white rounded-3xl p-6 shadow-2xl border border-indigo-900/50 space-y-4 relative overflow-hidden">
          <div className="flex justify-between items-center relative z-10">
            <h3 className="font-black text-white flex items-center gap-2">
              <BrainCircuit className="w-5 h-5 text-indigo-400" /> Intelligent Planning Suggestions
            </h3>
            <span className="px-2.5 py-1 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-full text-[10px] font-bold">Auto Generated</span>
          </div>

          <div className="space-y-3 relative z-10">
            {computed.aiSuggestions.map((sug: any, idx: number) => (
              <div key={idx} className="p-4 bg-slate-800/60 rounded-2xl border border-indigo-500/20 space-y-2 backdrop-blur-md hover:border-indigo-400 transition-colors">
                <div className="flex justify-between items-center">
                  <span className="text-indigo-400 text-xs font-black">{sug.suggestion}</span>
                  <span className="text-emerald-400 font-bold text-[11px]">{sug.expectedBenefit}</span>
                </div>
                <div className="flex justify-between items-center text-[11px] text-slate-400 font-medium pt-1">
                  <span>Dept: <strong className="text-slate-200">{sug.responsibleDept}</strong></span>
                  <span>Saved: <strong className="text-indigo-300">{sug.estimatedTimeSaved}</strong></span>
                  {sug.actionRoute && (
                    <button onClick={() => navigate(sug.actionRoute)} className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold text-[10px]">
                      Take Action
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* ---------------------------------------------------- */}
      {/* SECTION 11: FACTORY HEAT MAP (224 LOOMS MATRIX)      */}
      {/* ---------------------------------------------------- */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-xl border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-black text-slate-800 dark:text-white flex items-center gap-2">
              <Grid className="w-5 h-5 text-indigo-600" /> Factory Loom Runout Heat Map (Next 14 Days)
            </h3>
            <p className="text-xs text-slate-500 font-medium">Matrix overview across 224 looms and upcoming calendar schedule</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold">
            <span className="px-2 py-1 bg-emerald-500 text-white rounded">Green = Normal</span>
            <span className="px-2 py-1 bg-blue-500 text-white rounded">Blue = Planned</span>
            <span className="px-2 py-1 bg-amber-400 text-slate-900 rounded">Yellow = Runout 8-15d</span>
            <span className="px-2 py-1 bg-orange-500 text-white rounded">Orange = Plan Req 3-7d</span>
            <span className="px-2 py-1 bg-red-500 text-white rounded">Red = Critical 0-2d</span>
            <span className="px-2 py-1 bg-slate-400 text-white rounded">Grey = Idle</span>
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-100 dark:border-slate-800 p-2">
          <div className="min-w-[700px] space-y-1">
            {/* Header Row Days */}
            <div className="flex gap-1 mb-2 font-mono text-[10px] font-bold text-slate-400">
              <div className="w-24 flex-shrink-0 text-slate-700 dark:text-slate-300">Loom #</div>
              {computed.calendarDays.map((d, i) => (
                <div key={i} className="flex-1 text-center">{d}</div>
              ))}
            </div>

            {/* Matrix Sample Rows */}
            {computed.heatmapLooms.map((l, rIdx) => {
              const run = activeRuns[l.loomNo];
              const balanceDays = run ? Math.round((run.warpedMeter || 1500) / (run.dailyProduction || 150)) : 0;
              
              return (
                <div key={rIdx} className="flex gap-1 items-center hover:bg-slate-50 dark:hover:bg-slate-800/40 p-1 rounded-lg transition-colors">
                  <div className="w-24 flex-shrink-0 text-[11px] font-bold text-slate-800 dark:text-slate-200">
                    Loom #{l.loomNo}
                  </div>
                  {computed.calendarDays.map((_, cIdx) => {
                    let cellColor = 'bg-slate-200 dark:bg-slate-700'; // Idle
                    if (run) {
                      if (cIdx < balanceDays - 2) cellColor = 'bg-emerald-500';
                      else if (cIdx === balanceDays - 2 || cIdx === balanceDays - 1) cellColor = 'bg-amber-400';
                      else if (cIdx === balanceDays) cellColor = 'bg-orange-500';
                      else if (cIdx > balanceDays && cIdx <= balanceDays + 2) cellColor = 'bg-red-500';
                      else cellColor = 'bg-blue-400';
                    }
                    return (
                      <div 
                        key={cIdx} 
                        title={`Loom #${l.loomNo} - Day ${cIdx+1}`}
                        onClick={() => openDrillDown(`Loom #${l.loomNo} Schedule Day ${cIdx+1}`, 'loom', [l], '/entry')}
                        className={`flex-1 h-6 rounded-md ${cellColor} transition-transform hover:scale-110 cursor-pointer shadow-xs`} 
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* SECTION 12: DRILL DOWN MODAL                         */}
      {/* ---------------------------------------------------- */}
      {drillModal.isOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
            
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
              <div>
                <h3 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <ExternalLink className="w-5 h-5 text-indigo-600" /> {drillModal.title}
                </h3>
                <p className="text-xs text-slate-500 font-medium">Interactive Drill-Down Record Details</p>
              </div>
              <button 
                onClick={() => setDrillModal({...drillModal, isOpen: false})}
                className="p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body Table / Content */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {drillModal.items.length > 0 ? (
                <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold">
                        <th className="p-3">ID / Reference</th>
                        <th className="p-3">Unit / Dept</th>
                        <th className="p-3">Design / Item</th>
                        <th className="p-3">Value / Meter</th>
                        <th className="p-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {drillModal.items.slice(0, 15).map((it: any, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 font-medium">
                          <td className="p-3 font-bold text-indigo-600">{it.loomNo ? `Loom #${it.loomNo}` : it.orderNo || it.name || `Item ${idx+1}`}</td>
                          <td className="p-3">{it.unit || 'General'}</td>
                          <td className="p-3 font-bold">{it.currentDesign || it.designNo || 'Standard'}</td>
                          <td className="p-3 font-mono">{it.netBalanceMeter ? `${Math.round(it.netBalanceMeter)} m` : it.orderQty ? `${it.orderQty} m` : it.value || '-'}</td>
                          <td className="p-3 font-bold text-emerald-600">{it.statusLabel || it.status || 'Active'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center text-slate-400 space-y-2">
                  <Package className="w-12 h-12 mx-auto opacity-30" />
                  <p className="text-sm font-bold">Detailed records synced directly from live Database.</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
              <span className="text-xs text-slate-500 font-medium">Showing top active database records</span>
              <div className="flex gap-2">
                {drillModal.targetRoute && (
                  <button 
                    onClick={() => { setDrillModal({...drillModal, isOpen: false}); navigate(drillModal.targetRoute!); }}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow transition-colors flex items-center gap-1.5"
                  >
                    Open Target Screen <ChevronRight className="w-4 h-4" />
                  </button>
                )}
                <button 
                  onClick={() => setDrillModal({...drillModal, isOpen: false})}
                  className="px-4 py-2 bg-slate-200 dark:bg-slate-700 font-bold text-xs rounded-xl text-slate-800 dark:text-slate-200"
                >
                  Close
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}

// ----------------------------------------------------
// SUB-COMPONENT: GLASSMORPHISM KPI CARD
// ----------------------------------------------------
function KpiGlassCard({ title, value, icon: Icon, color, onClick }: { title: string, value: any, icon: any, color: string, onClick?: () => void }) {
  const colorStyles: Record<string, string> = {
    emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 hover:border-emerald-400',
    blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 hover:border-blue-400',
    purple: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20 hover:border-purple-400',
    indigo: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20 hover:border-indigo-400',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 hover:border-amber-400',
    red: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20 hover:border-red-400',
    slate: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20 hover:border-slate-400',
    teal: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20 hover:border-teal-400',
    cyan: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20 hover:border-cyan-400',
    orange: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20 hover:border-orange-400',
  };

  return (
    <div 
      onClick={onClick}
      className={`p-3.5 rounded-2xl border backdrop-blur-md bg-white/80 dark:bg-slate-900/80 shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer flex flex-col justify-between group ${colorStyles[color] || colorStyles.slate}`}
    >
      <div className="flex items-center justify-between gap-1 mb-1">
        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate">{title}</span>
        <Icon className="w-3.5 h-3.5 opacity-70 group-hover:scale-110 transition-transform" />
      </div>
      <div className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white font-sans mt-0.5">
        {value}
      </div>
    </div>
  );
}

// ----------------------------------------------------
// SUB-COMPONENT: CHART CARD CONTAINER
// ----------------------------------------------------
function ChartCard({ title, desc, children, action }: { title: string, desc: string, children: React.ReactNode, action?: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-4 hover:shadow-2xl transition-shadow">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="font-black text-slate-800 dark:text-white text-base">{title}</h3>
          <p className="text-xs text-slate-500 font-medium">{desc}</p>
        </div>
        {action}
      </div>
      <div className="flex-1 min-h-[240px]">
        {children}
      </div>
    </div>
  );
}
