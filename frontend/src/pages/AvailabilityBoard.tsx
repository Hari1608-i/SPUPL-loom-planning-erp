import React, { useState, useEffect, useMemo } from 'react';
import { calculateLoomRun, calculateNextPlanRunouts, calculateOrderPlanning, getMainEntryLoomRun } from '../utils/calculations';

import { Calendar, Search, ArrowRight, Printer } from 'lucide-react';
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
  const { activeRuns, nextPlans, rawNextPlans, orders, looms, designs } = useAppContext();
  const [searchTerm, setSearchTerm] = useState('');
  const [timelineScale, setTimelineScale] = useState(90);
  const [beamStock, setBeamStock] = useState<any[]>([]);
  const [productionLogs, setProductionLogs] = useState<any[]>([]);

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

      let loomDailyProd = 300;

      if (activeRun && (activeRun.designNo || activeRun.design_no_sp_no)) {
        const runDesignNo = (activeRun.designNo || activeRun.design_no_sp_no || '').trim();
        currentDesign = runDesignNo;

        const cleanRunDesign = runDesignNo.toLowerCase();
        const design = designs.find(d => (d.design_no_sp_no || d.designNo || '').trim().toLowerCase() === cleanRunDesign);
        const matchedOrder = orders.find(o => 
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
              startDateFormatted: np.startDateFormatted,
              expectedRunoutDateFormatted: np.expectedRunoutDateFormatted,
              remarks,
              tooltip: `N${np.sequence} PLAN DETAILS:\n• Design: ${np.designNo}\n• Order: ${orderNo}\n• Construction: ${construction}\n• Beam: ${hasConfirmedBeam ? np.beamNo : 'Pending Allocation'}\n• Start: ${np.startDateFormatted}\n• Runout: ${np.expectedRunoutDateFormatted}\n• Remarks: ${remarks}`
            });
          }
        });
      }

      const finalDesign = currentDesign !== '-' ? currentDesign : (nextDesign !== '-' ? nextDesign : '-');
      const finalRunout = currentRunoutDate || (calculatedNextPlans.length > 0 ? calculatedNextPlans[0].expectedRunoutDate : null);
      const isNextPlanDisplay = currentDesign === '-' && nextDesign !== '-';

      return {
        loomNo,
        unit: loom?.unit || '1',
        currentDesign: finalDesign,
        currentRunout: finalRunout,
        nextDesign,
        beamStatus: activeBeamStatus,
        planningStatus,
        currentBar,
        nextBars,
        isNextPlanDisplay,
        currentBeamNo: activeRun?.currentBeamNo || activeRun?.beam_no || '',
        currentSetNo: activeRun?.setNo || activeRun?.set_no || '',
        currentOrderNo: activeRun?.orderNo || activeRun?.order_no || '',
        loomType: loom?.loomType || loom?.make || ''
      };
    });

    return rows.sort((a, b) => a.loomNo - b.loomNo);
  }, [looms, activeRuns, nextPlans, rawNextPlans, orders, designs, timelineStart, timelineEnd, beamStock, productionLogs]);

  const filteredData = boardData.filter(d => {
    const q = (searchTerm || '').trim().toLowerCase();
    if (!q) return true;
    return (
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
  const runningCount = boardData.filter(b => b.currentDesign !== '-').length;
  const availableCount = totalLooms - runningCount;
  const waitingCount = boardData.filter(b => b.currentDesign === '-' && b.planningStatus === 'WAITING FOR BEAM').length;
  const readyCount = boardData.filter(b => b.currentDesign === '-' && b.planningStatus === 'READY TO START').length;

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
              <div className="w-16 p-3 text-[10px] font-black uppercase text-slate-500">Loom</div>
              <div className="w-32 p-3 text-[10px] font-black uppercase text-slate-500">Current Design</div>
              <div className="w-20 p-3 text-[10px] font-black uppercase text-slate-500 text-center">Runout</div>
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
                  <div className="w-16 p-2 flex items-center justify-center font-black text-slate-800 text-sm">{row.loomNo}</div>
                  <div className="w-32 p-2 flex items-center text-xs font-bold text-slate-700 truncate">
                    {row.currentDesign !== '-' ? (
                      <span className={`px-2 py-0.5 rounded text-white text-[10px] ${getDesignColor(row.currentDesign).split(' ')[0]}`} title={row.isNextPlanDisplay ? `Planned Next: ${row.currentDesign}` : `Running: ${row.currentDesign}`}>
                        {row.currentDesign}
                      </span>
                    ) : '-'}
                  </div>
                  <div className="w-20 p-2 flex items-center justify-center text-xs font-bold text-slate-600">
                    {row.currentRunout && !isNaN(new Date(row.currentRunout).getTime()) ? format(new Date(row.currentRunout), 'dd/MM') : '-'}
                  </div>
                  <div className="flex-1 p-2 flex flex-col justify-center truncate">
                      <span className={`text-[10px] font-black uppercase ${
                        row.planningStatus === 'AVAILABLE FOR PLANNING' ? 'text-slate-400' :
                        row.planningStatus === 'READY TO START' ? 'text-emerald-600' :
                        row.planningStatus === 'WAITING FOR BEAM' ? 'text-yellow-600' :
                        row.planningStatus === 'CONFIRMED - WAITING RUNOUT' ? 'text-blue-600 font-black' : 'text-purple-600'
                      }`}>{row.planningStatus}</span>
                     {row.nextDesign !== '-' && <span className="text-[11px] font-bold text-slate-700 truncate">» {row.nextDesign}</span>}
                  </div>
                </div>

                <div 
                  className="relative h-full flex items-center group/timeline py-1"
                  style={{ minWidth: timelineWidth }}
                >
                   {!row.currentBar && (!row.nextBars || row.nextBars.length === 0) && (
                     <div 
                       className="absolute h-[28px] left-0 right-0 bg-slate-100/50 border border-slate-200 rounded-[10px] flex items-center justify-center text-[10px] font-bold text-slate-400 cursor-pointer hover:bg-slate-200 hover:text-slate-600 transition-all mx-1"
                       title="Click to Create Next Plan"
                     >
                       AVAILABLE
                     </div>
                   )}

                   {row.currentBar && (
                     <div 
                       className={`absolute h-[28px] rounded-[10px] border shadow-sm flex items-center overflow-hidden whitespace-nowrap text-[10px] font-bold px-3 transition-all duration-300 hover:z-30 hover:scale-[1.02] hover:shadow-lg cursor-pointer ${row.currentBar.color}`}
                       style={{ left: row.currentBar.left, width: row.currentBar.width }}
                       title={row.currentBar.tooltip}
                     >
                       <span className="truncate">{row.currentBar.label}</span>
                     </div>
                   )}

                   {row.nextBars && row.nextBars.map((nb: any, idx: number) => (
                     <div 
                       key={nb.sequence || idx}
                       className={`absolute h-[28px] rounded-[10px] border shadow-sm flex items-center overflow-hidden whitespace-nowrap text-[10px] font-bold px-2.5 transition-all duration-300 z-10 hover:z-30 hover:scale-[1.02] hover:shadow-lg cursor-pointer ${nb.color}`}
                       style={{ 
                         left: nb.left, 
                         width: nb.width,
                         marginLeft: (idx === 0 && row.currentBar) ? (nb.isSameDesign ? '0px' : '4px') : '0px',
                         borderTopLeftRadius: (idx === 0 && row.currentBar && nb.isSameDesign) ? '0px' : '10px',
                         borderBottomLeftRadius: (idx === 0 && row.currentBar && nb.isSameDesign) ? '0px' : '10px',
                       }}
                       title={nb.tooltip}
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
    </div>
  );
}
