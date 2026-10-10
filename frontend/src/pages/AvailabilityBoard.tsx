import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { calculateLoomRun, calculateNextPlanRunouts, calculateOrderPlanning, getMainEntryLoomRun } from '../utils/calculations';

import { Calendar, Search, ArrowRight, Printer, X, Layers, CheckCircle2, AlertTriangle, ArrowUpRight, RotateCcw } from 'lucide-react';
import { format, addDays } from 'date-fns';
import { useAppContext } from '../context/AppProvider';
import { API_BASE_URL } from '../config';
import { CompanyPrintHeader } from '../components/common/CompanyPrintHeader';
import { triggerPrint } from '../utils/printManager';

// Stable colour generator for designs
const getDesignColor = (designNo: string) => {
  if (!designNo || designNo === '-') return 'bg-slate-300 border-slate-400 text-slate-700';
  
  const colors = [
    'bg-blue-500 border-blue-600',
    'bg-emerald-500 border-emerald-600',
    'bg-purple-500 border-purple-600',
    'bg-orange-500 border-orange-600',
    'bg-teal-500 border-teal-600',
    'bg-amber-700 border-amber-800', 
    'bg-pink-500 border-pink-600',
    'bg-indigo-500 border-indigo-600',
    'bg-rose-500 border-rose-600',
    'bg-cyan-500 border-cyan-600'
  ];
  let hash = 0;
  for (let i = 0; i < designNo.length; i++) {
    hash = designNo.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length] + ' text-white';
};

export default function AvailabilityBoard() {
  const navigate = useNavigate();
  const { activeRuns, nextPlans, rawNextPlans, orders, looms, designs, refreshData } = useAppContext();
  const [searchTerm, setSearchTerm] = useState('');
  const [timelineScale, setTimelineScale] = useState(90);
  const [beamStock, setBeamStock] = useState<any[]>([]);
  const [productionLogs, setProductionLogs] = useState<any[]>([]);

  // Direct Change Next Design Modal State
  const [changePlanModal, setChangePlanModal] = useState<{
    fromLoomNo: number;
    planId?: number;
    nextDesign: string;
    orderNo: string;
    beamNo: string;
    setNo: string;
    warpMeter?: number;
    construction?: string;
  } | null>(null);
  const [targetLoomNo, setTargetLoomNo] = useState<number | null>(null);
  const [targetLoomSearch, setTargetLoomSearch] = useState<string>('');
  const [isReassigning, setIsReassigning] = useState<boolean>(false);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/beam-stock`)
      .then(res => res.json())
      .then(data => setBeamStock(data))
      .catch(console.error);

    fetch(`${API_BASE_URL}/api/production-logs`)
      .then(res => res.json())
      .then(data => { if (Array.isArray(data)) setProductionLogs(data); })
      .catch(console.error);
  }, []);

  const handleExecuteReassign = async () => {
    if (!changePlanModal || !targetLoomNo) return;
    if (targetLoomNo === changePlanModal.fromLoomNo) {
      alert('Target loom must be different from current loom.');
      return;
    }

    const confirmMessage = 
      `⚠️ CONFIRM NEXT DESIGN REASSIGNMENT\n\n` +
      `Move Next Design: ${changePlanModal.nextDesign}\n` +
      `From: Loom ${changePlanModal.fromLoomNo} ➔ To: Loom ${targetLoomNo}\n` +
      `Order / IBPO No: ${changePlanModal.orderNo}\n` +
      `Allocated Beam No: ${changePlanModal.beamNo || 'Pending'}\n` +
      `Set No: ${changePlanModal.setNo || 'Pending'}\n\n` +
      `IMPORTANT RULES:\n` +
      `1. Plan on Loom ${changePlanModal.fromLoomNo} will be completely REMOVED.\n` +
      `2. Next Design will exist ONLY on Loom ${targetLoomNo}.\n` +
      `3. Beam No, Set No, and Warp Preparation specs will be transferred to Loom ${targetLoomNo}.\n\n` +
      `Do you want to proceed with this direct change?`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setIsReassigning(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/planning/next-plan/reassign-loom`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromLoomNo: changePlanModal.fromLoomNo,
          toLoomNo: targetLoomNo,
          planId: changePlanModal.planId,
          nextDesign: changePlanModal.nextDesign,
          orderNo: changePlanModal.orderNo
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || 'Failed to reassign loom plan.');
      } else {
        alert(`✅ SUCCESS!\n\n${data.message || `Next Design ${changePlanModal.nextDesign} successfully transferred to Loom ${targetLoomNo}!`}`);
        setChangePlanModal(null);
        setTargetLoomNo(null);
        await refreshData();
      }
    } catch (err: any) {
      alert('Error reassigning plan: ' + err.message);
    } finally {
      setIsReassigning(false);
    }
  };

  const today = new Date(new Date().toDateString());
  const timelineStart = today;
  const timelineEnd = addDays(today, timelineScale);
  const totalMs = timelineEnd.getTime() - timelineStart.getTime();

  const calculatePosition = (start: Date, end: Date) => {
    const actualStart = start < timelineStart ? timelineStart : start;
    const actualEnd = end > timelineEnd ? timelineEnd : end;
    
    if (actualStart > timelineEnd || actualEnd < timelineStart) return null;

    const left = ((actualStart.getTime() - timelineStart.getTime()) / totalMs) * 100;
    let width = ((actualEnd.getTime() - actualStart.getTime()) / totalMs) * 100;
    
    if (width < 0.5) width = 0.5;
    return { left: `${left}%`, width: `${width}%` };
  };

  const boardData = useMemo(() => {
    const allLoomNos = looms.length > 0 ? looms.map(l => l.loomNo) : Array.from({length: 224}).map((_,i) => i+1);

    const rows = allLoomNos.map(loomNo => {
      const loom = looms.find(l => l.loomNo === loomNo);
      const activeRun = (activeRuns as any)[loomNo] || (activeRuns as any)[String(loomNo)];
      
      let currentBar = null;
      let nextBars: any[] = [];
      let currentRunoutDate: Date | null = null;
      let planningStatus = 'AVAILABLE FOR PLANNING';
      let currentDesign = '-';
      let nextDesign = '-';
      let activeBeamStatus = '-';
      let matchedOrder: any = null;

      let loomDailyProd = 300;

      if (activeRun && (activeRun.designNo || activeRun.design_no_sp_no)) {
        const runDesignNo = (activeRun.designNo || activeRun.design_no_sp_no || '').trim();
        currentDesign = runDesignNo;

        const cleanRunDesign = runDesignNo.toLowerCase();
        const design = designs.find(d => (d.design_no_sp_no || d.designNo || '').trim().toLowerCase() === cleanRunDesign);
        matchedOrder = orders.find(o =>
          (o.design_no_sp_no || '').trim().toLowerCase() === cleanRunDesign ||
          (o.ibpo_no || '').trim().toLowerCase() === cleanRunDesign ||
          (o.order_no || '').trim().toLowerCase() === cleanRunDesign
        );

        const currentRunout = activeRun.expectedRunoutDate instanceof Date ? activeRun.expectedRunoutDate : new Date(activeRun.expectedRunoutDate || new Date());
        currentRunoutDate = currentRunout;
        loomDailyProd = activeRun.effectiveDailyProduction > 0 ? activeRun.effectiveDailyProduction : 300;
        const start = new Date(activeRun.loomStartDate || activeRun.loom_start_date || new Date());

        const pos = currentRunoutDate ? calculatePosition(start, currentRunoutDate) : null;
        if (pos && currentRunoutDate) {
          const baseColor = getDesignColor(currentDesign);
          currentBar = {
            ...pos,
            label: currentDesign,
            color: baseColor,
            tooltip: `Running: ${currentDesign}\nProduced: ${Math.round(activeRun.producedMeter || 0)}m\nEffective Prod: ${(activeRun.effectiveDailyProduction || activeRun.avgDailyProduction || 0).toFixed(1)}m/d\nRunout: ${format(currentRunoutDate, 'dd MMM yyyy')}`
          };
        }
      }

      // Find all queued next plans for this loom from rawNextPlans (excluding plans already confirmed/running in Main Entry)
      const runningDesignClean = (currentDesign !== '-' ? currentDesign : '').trim().toLowerCase();
      const runningBeamClean = (activeRun?.currentBeamNo || activeRun?.beam_no || '').trim().toLowerCase();

      const loomPlans = (rawNextPlans || []).filter(p => {
        if (Number(p.loom_no) !== loomNo) return false;
        const st = (p.status || '').toUpperCase();
        const rSt = (p.readiness_status || '').toUpperCase();
        const cSt = (p.confirmation_status || '').toUpperCase();

        if (st === 'CANCELLED' || st === 'COMPLETED' || rSt === 'RUNNING IN MAIN ENTRY') return false;

        const pDes = (p.next_design || p.designNo || '').trim().toLowerCase();
        const pBeam = (p.reserved_beam_no || p.beamNo || '').trim().toLowerCase();

        // If the plan is already running on this loom (same design or same beam that's currently active in Main Entry)
        if (runningDesignClean && pDes === runningDesignClean) {
          if (st === 'CONFIRMED' || rSt === 'RUNNING IN MAIN ENTRY' || cSt === 'CONFIRMED' || (runningBeamClean && pBeam === runningBeamClean)) {
            return false;
          }
        }
        if (runningBeamClean && pBeam && runningBeamClean === pBeam) {
          return false;
        }

        return true;
      });

      const calculatedNextPlans = calculateNextPlanRunouts(
        currentRunoutDate,
        loomDailyProd,
        loomPlans,
        orders,
        designs
      );

      if (calculatedNextPlans.length > 0) {
        nextDesign = calculatedNextPlans[0].designNo;
        
        calculatedNextPlans.forEach(np => {
          const pos = calculatePosition(np.startDate, np.expectedRunoutDate);
          const isSameDesign = np.designNo === currentDesign;
          const hasConfirmedBeam = np.beamNo && np.beamNo !== '—' && np.beamNo !== 'NOT ALLOCATED' && np.beamNo !== 'PENDING';
          const bStatus = hasConfirmedBeam ? 'READY' : 'WAITING';

          if (np.sequence === 1) {
            activeBeamStatus = bStatus;
            if (currentDesign !== '-') {
              planningStatus = hasConfirmedBeam ? 'CONFIRMED - WAITING RUNOUT' : 'PLAN SETUP — BEAM PENDING';
            } else {
              planningStatus = hasConfirmedBeam ? 'READY TO START' : 'WAITING FOR BEAM';
            }
          }

          if (pos) {
            let barColor = getDesignColor(np.designNo);
            let isUnbeamedSetup = false;

            if (!hasConfirmedBeam) {
              // Unified Amber Dashed style for all plan setups prior to beam confirmation
              barColor = 'bg-amber-400 border-2 border-dashed border-amber-600 text-amber-950 font-black shadow-sm';
              isUnbeamedSetup = true;
            }

            const rawPlanObj = loomPlans[np.sequence - 1];
            const orderNo = rawPlanObj?.order_no || '—';
            const remarks = rawPlanObj?.remarks || (isUnbeamedSetup ? 'Plan Setup — Beam Confirmation Pending' : 'Beam Confirmed & Ready');
            const matchedDesign = designs.find(d => (d.design_no_sp_no || d.designNo) === np.designNo);
            const construction = matchedDesign?.construction || matchedDesign?.warp_weft_quality || '—';
            const allocatedSetNo = rawPlanObj?.reserved_set_no || rawPlanObj?.set_no || '—';
            const allocatedWarpMeter = rawPlanObj?.planned_warp_meter || rawPlanObj?.warp_meter || 0;

            nextBars.push({
              sequence: np.sequence,
              ...pos,
              label: `N${np.sequence}: ${np.designNo}`,
              color: barColor,
              isSameDesign,
              isUnbeamedSetup,
              designNo: np.designNo,
              orderNo,
              construction,
              beamNo: np.beamNo,
              setNo: allocatedSetNo,
              warpMeter: allocatedWarpMeter,
              planId: rawPlanObj?.id,
              startDateFormatted: np.startDateFormatted,
              expectedRunoutDateFormatted: np.expectedRunoutDateFormatted,
              remarks,
              tooltip: `N${np.sequence} PLAN DETAILS:\n• Design: ${np.designNo}\n• Order: ${orderNo}\n• Construction: ${construction}\n• Beam: ${hasConfirmedBeam ? np.beamNo : 'Pending Allocation'}\n• Set No: ${allocatedSetNo}\n• Start: ${np.startDateFormatted}\n• Runout: ${np.expectedRunoutDateFormatted}\n• Remarks: ${remarks}`
            });
          }
        });
      }

      const isRunning = currentDesign !== '-' && currentBar !== null;

      return {
        loomNo,
        unit: loom?.unit || '1',
        currentDesign,
        currentRunout: currentRunoutDate,
        nextDesign,
        beamStatus: activeBeamStatus,
        planningStatus,
        currentBar,
        nextBars,
        isRunning,
        currentBeamNo: activeRun?.currentBeamNo || activeRun?.beam_no || '',
        currentSetNo: activeRun?.setNo || activeRun?.set_no || '',
        currentOrderNo: activeRun?.orderNo || activeRun?.order_no || activeRun?.ibpo_no || matchedOrder?.ibpo_no || '',
        loomType: loom?.loomType || loom?.make || '',
        netBalanceMeter: activeRun?.netBalanceMeter ?? activeRun?.warpBalanceGross ?? 0,
        loomDailyProd: loomDailyProd,
        balanceDays: typeof activeRun?.balanceDays === 'number' ? activeRun.balanceDays : null,
        runoutStatus: activeRun?.runoutStatus || (activeRun && currentRunoutDate ? 'NORMAL' : 'NOT AVAILABLE'),
        nextOrderNo: (calculatedNextPlans[0] as any)?.orderNo || loomPlans[0]?.order_no || '-',
        nextStartDate: calculatedNextPlans[0]?.startDateFormatted || '-',
        orderType: (matchedOrder?.order_type || (matchedOrder as any)?.order_type_category || '').toUpperCase().includes('YD') ? 'YD' : 'Grey'
      };
    });

    return rows.sort((a, b) => a.loomNo - b.loomNo);
  }, [looms, activeRuns, nextPlans, rawNextPlans, orders, designs, timelineStart, timelineEnd, beamStock, productionLogs]);

  const [orderTypeFilter, setOrderTypeFilter] = useState<'ALL' | 'GREY' | 'YD'>('ALL');

  const filteredData = boardData.filter(d => {
    if (orderTypeFilter !== 'ALL') {
      const matchType = (d.orderType || '').toUpperCase() === orderTypeFilter;
      if (!matchType) return false;
    }
    const q = (searchTerm || '').trim().toLowerCase();
    if (!q) return true;
    const cleanLoomQ = q.replace(/^loom\s*|^l-?\s*/i, '');
    return (
      (cleanLoomQ && d.loomNo.toString().includes(cleanLoomQ)) ||
      d.loomNo.toString().includes(q) ||
      (d.currentDesign || '').toLowerCase().includes(q) ||
      (d.nextDesign || '').toLowerCase().includes(q) ||
      (d.currentBeamNo || '').toString().toLowerCase().includes(q) ||
      (d.currentSetNo || '').toString().toLowerCase().includes(q) ||
      (d.currentOrderNo || '').toString().toLowerCase().includes(q) ||
      (d.unit || '').toString().toLowerCase().includes(q) ||
      (d.planningStatus || '').toLowerCase().includes(q) ||
      (d.loomType || '').toLowerCase().includes(q) ||
      (d.nextBars || []).some((nb: any) =>
        (nb.designNo || '').toLowerCase().includes(q) ||
        (nb.orderNo || '').toString().toLowerCase().includes(q) ||
        (nb.beamNo || '').toString().toLowerCase().includes(q)
      )
    );
  });

  const totalLooms = boardData.length;
  const runningCount = boardData.filter(b => b.currentBar !== null).length;
  const availableCount = totalLooms - runningCount;
  const waitingCount = boardData.filter(b => b.currentBar === null && b.planningStatus.includes('WAITING')).length;
  const readyCount = boardData.filter(b => b.currentBar === null && b.planningStatus === 'READY TO START').length;

  const DAY_WIDTH = 60;
  const timelineWidth = Math.max(1200, timelineScale * DAY_WIDTH);

  const timelineTicks = [];
  for (let i = 0; i <= timelineScale; i++) {
    const d = addDays(today, i);
    const pos = (i / timelineScale) * 100;
    timelineTicks.push({ date: d, left: pos });
  }

  return (
    <div className="space-y-6 flex flex-col h-[calc(100vh-6rem)] relative overflow-hidden">
      <CompanyPrintHeader title="Smart Availability Board & Gantt Schedule" subtitle="Loom Planning & Production Timeline Audit" />
      
      <div className="flex justify-between items-end flex-shrink-0 print:hidden">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center tracking-tight">
            <Calendar className="w-8 h-8 mr-3 text-indigo-600 p-1.5 bg-indigo-50 rounded-lg" /> Smart Availability Board
          </h1>
          <p className="text-slate-500 text-sm mt-2 font-medium">
            Advanced Gantt Timeline with auto-generated horizontal scrolling and dynamic design coloring.
          </p>
        </div>
        
        <div className="flex gap-4">
          <button
            onClick={() => triggerPrint({ orientation: 'landscape' })}
            title="Print Board (Landscape)"
            className="flex items-center px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg shadow-sm font-bold text-xs transition-colors"
          >
            <Printer className="w-4 h-4 mr-2" /> Print Board
          </button>

          <div className="flex items-center gap-2 bg-white px-3 py-2 border border-slate-200 rounded-lg shadow-sm hover:border-indigo-300 transition-colors">
            <Search className="w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search looms, designs..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="text-sm outline-none w-48 bg-transparent"
            />
          </div>
          
          <div className="flex bg-white rounded-lg border border-slate-200 shadow-sm p-1">
             {[30, 60, 90, 180, 365].map(scale => (
               <button
                 key={scale}
                 onClick={() => setTimelineScale(scale)}
                 className={`px-3 py-1 text-xs font-bold rounded-md transition-all duration-200 ${timelineScale === scale ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
               >
                 {scale}D
               </button>
             ))}
          </div>

          {/* Order Type Filter: ALL / GREY / YD */}
          <div className="flex bg-white rounded-lg border border-slate-200 shadow-sm p-1">
            {(['ALL', 'GREY', 'YD'] as const).map(type => (
              <button
                key={type}
                onClick={() => setOrderTypeFilter(type)}
                className={`px-3 py-1 text-xs font-black rounded-md transition-all duration-200 ${
                  orderTypeFilter === type
                    ? 'bg-spu-primary text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {type === 'ALL' ? 'All' : type === 'GREY' ? 'Grey' : 'YD'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-4 flex-shrink-0">
        {[
          { label: 'Running Looms', val: runningCount, color: 'text-blue-600' },
          { label: 'Available / Empty', val: availableCount, color: 'text-gray-500' },
          { label: 'Waiting For Beam', val: waitingCount, color: 'text-yellow-600' },
          { label: 'Ready To Start', val: readyCount, color: 'text-emerald-600' },
          { label: 'Machine Utilization', val: Math.round((runningCount/totalLooms)*100)+'%', color: 'text-indigo-600' },
        ].map(k => (
          <div key={k.label} className="bg-white border border-slate-100 shadow-sm rounded-xl p-4 flex flex-col justify-between hover:shadow-md transition-shadow">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">{k.label}</div>
            <div className={`text-2xl font-black mt-2 ${k.color}`}>{k.val}</div>
          </div>
        ))}
      </div>

      <div className="flex-1 bg-white border border-slate-200 shadow-sm rounded-xl flex flex-col overflow-hidden relative">
        <div className="flex-1 overflow-auto custom-scrollbar flex flex-col relative">
          
          <div className="flex border-b border-slate-200 bg-slate-50 flex-shrink-0 shadow-sm z-30 sticky top-0 min-w-max">
            <div className="flex w-[480px] flex-shrink-0 divide-x divide-slate-200 sticky left-0 z-40 bg-slate-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] border-r border-slate-300">
              <div className="w-16 p-3 text-[10px] font-black uppercase text-slate-500 text-center">Loom</div>
              <div className="w-32 p-3 text-[10px] font-black uppercase text-slate-500">Current Design</div>
              <div className="w-24 p-3 text-[10px] font-black uppercase text-slate-500 text-center">Runout & Days</div>
              <div className="flex-1 p-3 text-[10px] font-black uppercase text-slate-500">Planning Status</div>
            </div>
            
            <div 
              className="relative overflow-hidden bg-slate-100"
              style={{ minWidth: timelineWidth }}
            >
              {timelineTicks.map(tick => (
                <div 
                  key={tick.left} 
                  className="absolute top-0 bottom-0 border-l border-slate-300/50 flex items-end pb-1 pl-1"
                  style={{ left: `${tick.left}%` }}
                >
                  <span className="text-[10px] font-bold text-slate-500 whitespace-nowrap">{format(tick.date, 'dd MMM')}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col min-h-full pb-10 min-w-max relative z-10">
            <div className="absolute top-0 bottom-0 pointer-events-none z-0 left-[480px]" style={{ minWidth: timelineWidth }}>
               {timelineTicks.map(tick => (
                 <div key={tick.left} className="absolute top-0 bottom-0 border-l border-slate-100" style={{ left: `${tick.left}%` }} />
               ))}
               <div className="absolute top-0 bottom-0 border-l-2 border-red-500 z-0" style={{ left: '0%' }} title="Today" />
            </div>

            {filteredData.map(row => (
              <div key={row.loomNo} className="flex border-b border-slate-100 hover:bg-slate-50 transition-colors group relative z-10 h-[44px]">
                
                <div className="flex w-[480px] flex-shrink-0 bg-white group-hover:bg-slate-50 divide-x divide-slate-100 sticky left-0 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] border-r border-slate-300">
                  <div 
                    onClick={() => navigate(`/plan?loomNo=${row.loomNo}`)}
                    className="w-16 p-1.5 flex flex-col items-center justify-center font-black text-slate-800 text-xs cursor-pointer hover:text-indigo-600 hover:bg-indigo-50/50 transition-colors"
                    title={`Click to Create/Assign Plan on Loom ${row.loomNo}`}
                  >
                    <span>L-{row.loomNo}</span>
                    <span className="text-[9px] text-slate-400 font-bold">U{row.unit}</span>
                  </div>
                  <div className="w-32 p-1.5 flex flex-col justify-center truncate">
                    {row.currentDesign !== '-' ? (
                      <>
                        <span className={`px-1.5 py-0.5 rounded text-white text-[10px] font-black truncate ${getDesignColor(row.currentDesign).split(' ')[0]}`} title={`Running: ${row.currentDesign}`}>
                          {row.currentDesign}
                        </span>
                        {row.currentOrderNo && (
                          <span className="text-[10px] text-slate-500 font-semibold truncate mt-0.5" title={`IBPO: ${row.currentOrderNo}`}>
                            #{row.currentOrderNo}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-slate-400 text-xs italic">Available</span>
                    )}
                  </div>
                  <div
                    className="w-24 p-1.5 flex flex-col items-center justify-center text-xs font-bold text-slate-600"
                    title={row.currentRunout ? `Expected Runout: ${format(new Date(row.currentRunout), 'dd/MM/yyyy')}\nEst. Days Left: ${row.balanceDays !== null ? row.balanceDays : 'N/A'}\nNet Warp Balance: ${Math.round(row.netBalanceMeter)}m\nAvg Prod: ${Math.round(row.loomDailyProd)}m/d` : 'No Active Run'}
                  >
                    {row.currentRunout && !isNaN(new Date(row.currentRunout).getTime()) ? (
                      <>
                        <div className="flex items-center gap-1">
                          <span className="text-slate-900 font-black text-[11px]">{format(new Date(row.currentRunout), 'dd/MM')}</span>
                          {row.balanceDays !== null && (
                            <span className={`text-[9px] px-1 py-0.2 rounded font-black ${
                              row.balanceDays <= 1 ? 'bg-red-100 text-red-700' :
                              row.balanceDays <= 3 ? 'bg-amber-100 text-amber-700' :
                              'bg-slate-100 text-slate-700'
                            }`}>
                              {row.balanceDays <= 0 ? 'Due' : `${row.balanceDays}d`}
                            </span>
                          )}
                        </div>
                        <div className="text-[9px] text-slate-400 font-medium">
                          {row.netBalanceMeter > 0 ? `${Math.round(row.netBalanceMeter).toLocaleString()}m` : row.runoutStatus}
                        </div>
                      </>
                    ) : (
                      <span className="text-slate-400 font-normal">-</span>
                    )}
                  </div>
                  <div 
                    onClick={() => {
                      if (row.nextBars && row.nextBars.length > 0) {
                        const nb = row.nextBars[0];
                        setChangePlanModal({
                          fromLoomNo: row.loomNo,
                          planId: nb.planId,
                          nextDesign: nb.designNo,
                          orderNo: nb.orderNo,
                          beamNo: nb.beamNo,
                          setNo: nb.setNo,
                          warpMeter: nb.warpMeter,
                          construction: nb.construction
                        });
                        setTargetLoomNo(null);
                        setTargetLoomSearch('');
                      } else {
                        navigate(`/plan?loomNo=${row.loomNo}`);
                      }
                    }}
                    className="flex-1 p-1.5 flex flex-col justify-center truncate cursor-pointer hover:bg-indigo-50/40 transition-colors"
                    title={row.nextBars && row.nextBars.length > 0 ? `Click to Direct Change / Reassign Next Design (${row.nextBars[0].designNo})` : `Click to Create Plan on Loom ${row.loomNo}`}
                  >
                      <span className={`text-[10px] font-black uppercase ${
                        row.planningStatus === 'AVAILABLE FOR PLANNING' ? 'text-slate-400' :
                        row.planningStatus === 'READY TO START' ? 'text-emerald-600' :
                        row.planningStatus === 'WAITING FOR BEAM' ? 'text-yellow-600' :
                        row.planningStatus === 'CONFIRMED - WAITING RUNOUT' ? 'text-blue-600 font-black' : 'text-purple-600'
                      }`}>{row.planningStatus}</span>
                     {row.nextDesign !== '-' && (
                       <span className="text-[11px] font-bold text-slate-700 truncate flex items-center gap-1">
                         » {row.nextDesign}
                         {row.nextOrderNo && row.nextOrderNo !== '-' && <span className="text-[9px] text-slate-400 font-medium">({row.nextOrderNo})</span>}
                         <span className="text-[9px] px-1 py-0.2 bg-indigo-100 text-indigo-700 rounded font-semibold ml-1">Change</span>
                       </span>
                     )}
                  </div>
                </div>

                <div 
                  className="relative h-full flex items-center group/timeline py-1"
                  style={{ minWidth: timelineWidth }}
                >
                   {!row.currentBar && (!row.nextBars || row.nextBars.length === 0) && (
                     <div 
                       onClick={() => navigate(`/plan?loomNo=${row.loomNo}`)}
                       className="absolute h-[28px] left-0 right-0 bg-slate-100/50 border border-slate-200 rounded-[10px] flex items-center justify-center text-[10px] font-bold text-slate-400 cursor-pointer hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-600 transition-all mx-1"
                       title={`Loom ${row.loomNo} is Available — Click to Assign Order / Next Plan`}
                     >
                       AVAILABLE FOR PLANNING (CLICK TO ASSIGN)
                     </div>
                   )}

                   {row.currentBar && (
                     <div 
                       onClick={() => navigate(`/entry?search=L-${row.loomNo}`)}
                       className={`absolute h-[28px] rounded-[10px] border shadow-sm flex items-center overflow-hidden whitespace-nowrap text-[10px] font-bold px-3 transition-all duration-300 hover:z-30 hover:scale-[1.02] hover:shadow-lg cursor-pointer ${row.currentBar.color}`}
                       style={{ left: row.currentBar.left, width: row.currentBar.width }}
                       title={`${row.currentBar.tooltip}\n\nClick to view in Main Entry`}
                     >
                       <span className="truncate">{row.currentBar.label}</span>
                     </div>
                   )}

                   {row.nextBars && row.nextBars.map((nb: any, idx: number) => (
                     <div 
                       key={nb.sequence || idx}
                       onClick={() => {
                         setChangePlanModal({
                           fromLoomNo: row.loomNo,
                           planId: nb.planId,
                           nextDesign: nb.designNo,
                           orderNo: nb.orderNo,
                           beamNo: nb.beamNo,
                           setNo: nb.setNo,
                           warpMeter: nb.warpMeter,
                           construction: nb.construction
                         });
                         setTargetLoomNo(null);
                         setTargetLoomSearch('');
                       }}
                       className={`absolute h-[28px] rounded-[10px] border shadow-sm flex items-center overflow-hidden whitespace-nowrap text-[10px] font-bold px-2.5 transition-all duration-300 z-10 hover:z-30 hover:scale-[1.02] hover:shadow-lg cursor-pointer ${nb.color}`}
                       style={{ 
                         left: nb.left, 
                         width: nb.width,
                         marginLeft: (idx === 0 && row.currentBar) ? (nb.isSameDesign ? '0px' : '4px') : '0px',
                         borderTopLeftRadius: (idx === 0 && row.currentBar && nb.isSameDesign) ? '0px' : '10px',
                         borderBottomLeftRadius: (idx === 0 && row.currentBar && nb.isSameDesign) ? '0px' : '10px',
                       }}
                       title={`${nb.tooltip}\n\nClick to Direct Change / Reassign this Plan to another Loom`}
                     >
                       <span className="truncate">{nb.label}</span>
                     </div>
                   ))}
                </div>

              </div>
            ))}
          </div>
        </div>
        <div className="border-t border-slate-200 bg-white p-3 flex justify-center gap-6 z-20 flex-shrink-0 shadow-sm">
          <div className="flex items-center text-[10px] font-bold text-slate-600"><span className="w-3 h-3 rounded-full bg-blue-500 mr-1.5 shadow-sm"></span> Design Specific Colors (Beam Confirmed)</div>
          <div className="flex items-center text-[10px] font-bold text-slate-600"><span className="w-4 h-3 rounded bg-amber-400 border-2 border-dashed border-amber-600 mr-1.5 shadow-sm"></span> Plan Setup (Beam Pending)</div>
          <div className="flex items-center text-[10px] font-bold text-slate-600"><span className="w-3 h-3 rounded-full bg-emerald-600 mr-1.5 shadow-sm"></span> Ready To Start</div>
          <div className="flex items-center text-[10px] font-bold text-slate-600"><span className="w-3 h-3 rounded-full bg-slate-200 mr-1.5 border border-slate-300"></span> Available</div>
        </div>
      </div>

      {/* DIRECT CHANGE NEXT DESIGN MODAL */}
      {changePlanModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 flex items-center justify-between border-b border-indigo-900/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600/30 border border-indigo-400/30 flex items-center justify-center text-indigo-400">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black tracking-tight text-white flex items-center gap-2">
                    Direct Change / Transfer Next Design
                  </h3>
                  <p className="text-xs text-indigo-200">
                    Reassign plan from <strong className="text-white">Loom {changePlanModal.fromLoomNo}</strong> to a target loom
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setChangePlanModal(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto text-xs">
              {/* Plan Information Card */}
              <div className="bg-indigo-50/60 border border-indigo-200 rounded-xl p-4 space-y-2.5">
                <div className="flex items-center justify-between pb-2 border-b border-indigo-200/70">
                  <span className="text-indigo-950 font-black text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-indigo-600" /> Plan to Transfer
                  </span>
                  <span className="px-2 py-0.5 bg-indigo-600 text-white font-black text-[11px] rounded">
                    Current: Loom {changePlanModal.fromLoomNo}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Next Design</span>
                    <strong className="text-xs font-black text-slate-900">{changePlanModal.nextDesign}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Order / IBPO</span>
                    <strong className="text-xs font-bold text-slate-800">{changePlanModal.orderNo}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Allocated Beam No</span>
                    <strong className="text-xs font-bold text-indigo-700">{changePlanModal.beamNo || '—'}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Set No</span>
                    <strong className="text-xs font-bold text-slate-800">{changePlanModal.setNo || '—'}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Warp Length</span>
                    <strong className="text-xs font-bold text-slate-800">{changePlanModal.warpMeter ? `${changePlanModal.warpMeter.toLocaleString()} M` : '—'}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Construction</span>
                    <strong className="text-xs font-bold text-slate-800 truncate block">{changePlanModal.construction || 'Standard'}</strong>
                  </div>
                </div>
              </div>

              {/* Target Loom Selection */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-800 flex items-center gap-1.5">
                    Select Target Loom <span className="text-red-500">*</span>
                  </label>
                  {targetLoomNo && (
                    <span className="text-emerald-700 font-bold text-[11px] flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Selected: Loom {targetLoomNo}
                    </span>
                  )}
                </div>

                {/* Target Loom Search */}
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search Loom No (e.g. 14, 274) or design..."
                    value={targetLoomSearch}
                    onChange={e => setTargetLoomSearch(e.target.value)}
                    className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  {targetLoomSearch && (
                    <button
                      onClick={() => setTargetLoomSearch('')}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Looms List */}
                <div className="border border-slate-200 rounded-xl max-h-56 overflow-y-auto divide-y divide-slate-100 bg-white">
                  {boardData
                    .filter(row => {
                      if (row.loomNo === changePlanModal.fromLoomNo) return false;
                      const q = targetLoomSearch.trim().toLowerCase();
                      if (!q) return true;
                      const cleanLoom = q.replace(/^loom\s*|^l-?\s*/i, '');
                      return (
                        (cleanLoom && row.loomNo.toString().includes(cleanLoom)) ||
                        row.loomNo.toString().includes(q) ||
                        row.currentDesign.toLowerCase().includes(q) ||
                        row.planningStatus.toLowerCase().includes(q)
                      );
                    })
                    .slice(0, 50)
                    .map(row => {
                      const isSelected = targetLoomNo === row.loomNo;
                      const isAvail = row.currentDesign === '-';
                      const hasNext = row.nextDesign !== '-';

                      const eligLabel = isAvail
                        ? 'Eligible (Empty Loom)'
                        : (!hasNext ? 'Eligible (No Next Plan)' : 'Occupied (Will Replace Plan)');
                      const eligBadge = isAvail
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : (!hasNext ? 'bg-blue-100 text-blue-800 border border-blue-300' : 'bg-amber-100 text-amber-800 border border-amber-300');

                      return (
                        <div
                          key={row.loomNo}
                          onClick={() => setTargetLoomNo(row.loomNo)}
                          className={`p-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                            isSelected ? 'bg-indigo-50 border-l-4 border-indigo-600' : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <input
                              type="radio"
                              name="targetLoomSelect"
                              checked={isSelected}
                              onChange={() => setTargetLoomNo(row.loomNo)}
                              className="text-indigo-600"
                            />
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-black text-slate-900 text-xs">LOOM {row.loomNo}</span>
                                <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                  Unit {row.unit} • {row.loomType || 'Airjet'}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5">
                                {isAvail ? (
                                  <span className="text-emerald-700 font-semibold text-[10px]">Empty / Available</span>
                                ) : (
                                  <>
                                    <span className="font-bold text-slate-800 text-[10px]">Running: {row.currentDesign}</span>
                                    {row.currentOrderNo && <span className="text-slate-400 text-[10px]">#{row.currentOrderNo}</span>}
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-0.5">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${eligBadge}`}>
                              {eligLabel}
                            </span>
                            <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
                              {row.currentRunout && !isNaN(new Date(row.currentRunout).getTime()) ? (
                                <span>Runout: <strong className="text-slate-700">{format(new Date(row.currentRunout), 'dd/MM/yyyy')}</strong> ({row.balanceDays !== null ? `${row.balanceDays}d left` : row.runoutStatus})</span>
                              ) : (
                                <span className="text-slate-400">Runout: Not Available</span>
                              )}
                              <span>•</span>
                              <span>{hasNext ? <strong className="text-indigo-700">Next: {row.nextDesign}</strong> : 'No Next Plan'}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Transfer Notice Box */}
              {targetLoomNo && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1 text-amber-900">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-amber-800">
                    <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    Reassignment Impact & Warp Beam Preservation:
                  </div>
                  <ul className="list-disc list-inside text-[11px] text-amber-800/90 space-y-0.5 pl-1">
                    <li>Plan on <strong>Loom {changePlanModal.fromLoomNo}</strong> will be <strong>REMOVED</strong>.</li>
                    <li>Next Design will only exist on <strong>Loom {targetLoomNo}</strong>.</li>
                    <li>Beam <strong>#{changePlanModal.beamNo || 'N/A'}</strong> (Set: {changePlanModal.setNo || 'N/A'}) and Warp Preparation specs will be transferred to Loom {targetLoomNo}.</li>
                  </ul>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <button
                onClick={() => {
                  navigate(`/plan?loomNo=${changePlanModal.fromLoomNo}&ibpo=${encodeURIComponent(changePlanModal.orderNo)}&designNo=${encodeURIComponent(changePlanModal.nextDesign)}`);
                }}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 underline"
              >
                Go to Full Loom Planning Setup <ArrowUpRight className="w-3.5 h-3.5" />
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setChangePlanModal(null)}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExecuteReassign}
                  disabled={!targetLoomNo || isReassigning}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-black rounded-xl text-xs shadow-md transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${isReassigning ? 'animate-spin' : ''}`} />
                  {isReassigning ? 'Reassigning...' : targetLoomNo ? `Confirm Transfer to Loom ${targetLoomNo}` : 'Select a Target Loom'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
