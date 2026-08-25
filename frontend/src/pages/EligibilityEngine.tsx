import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../context/AppProvider';
import { calculateLoomRun, checkLoomCompatibility, formatRunoutDate } from '../utils/calculations';
import { API_BASE_URL } from '../config';
import { format, addDays } from 'date-fns';
import {
  Cpu, Search, CheckCircle2, AlertTriangle, XCircle, Star,
  ArrowRight, Zap, BarChart2, Layers, Box, FileText, Activity,
  TrendingUp, Settings, MessageSquare, Info, RefreshCw, CheckCircle, Filter
} from 'lucide-react';
import { 
  BarChart, Bar, Tooltip, ResponsiveContainer, Cell
} from 'recharts';

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface CompatResult {
  loomNo: number;
  unit: string;
  loomType: string;
  beamType: string;
  beamDia: number;
  width: string;
  frameCapacity: number;
  weftColours: number;
  installedLever: number;
  currentDesign: string;
  balanceDays: number;
  runoutDate: Date;
  availableDate: Date;
  score: number;
  technicalScore: number;
  priority: number;
  status: string;
  reason: string;
  plannerNote: string;
  efficiency: number;
  avgProduction: number;
  beamStatus: 'READY' | 'UNAVAILABLE';
  beamFound?: any;
  reedStatus: 'READY' | 'UNAVAILABLE';
  reedFound?: any;
  comp: any;
}

// ─── Smart Compatibility Engine ─────────────────────────────────────────────

function computeCompatibility(
  loom: any, 
  design: any, 
  activeRun: any, 
  nextPlan: any, 
  beams: any[], 
  reeds: any[]
): CompatResult {
  const comp = checkLoomCompatibility(design, loom);
  const weaveMatch = comp.weaveCompatible;
  const frameMatch = comp.frameCompatible;
  const colourMatch = comp.colourCompatible;
  const beamTypeMatch = comp.beamTypeCompatible;
  const widthMatch = comp.widthCompatible;

  // Technical Score (Up to 50%)
  let technicalScore = 0;
  if (weaveMatch) technicalScore += 20;
  if (frameMatch) technicalScore += 15;
  if (colourMatch) technicalScore += 5;
  if (beamTypeMatch) technicalScore += 5;
  if (widthMatch) technicalScore += 5;

  // Beam Readiness for this design
  const desNoNorm = (design.designNo || design.design_no_sp_no || '').trim().toLowerCase();
  const availableBeams = beams.filter(b => {
    const bDes = (b.design_no || '').trim().toLowerCase();
    const st = (b.beam_status || b.status || '').trim().toUpperCase();
    return bDes === desNoNorm && (st === 'AVAILABLE' || st === 'READY');
  });
  const readyBeamCount = availableBeams.length;
  const beamStatus: 'READY' | 'UNAVAILABLE' = readyBeamCount > 0 ? 'READY' : 'UNAVAILABLE';

  // Reed Readiness for this design
  const reedCountTarget = (design.reedCount || design.reed_count || '').toString().trim();
  const availableReeds = reeds.filter(r => {
    const rCount = (r.reed_count || r.reedCount || '').toString().trim();
    const st = (r.beam_status || r.status || '').trim().toUpperCase();
    return rCount === reedCountTarget && (st === 'AVAILABLE' || st === 'READY');
  });
  const readyReedCount = availableReeds.reduce((sum, r) => sum + (Number(r.available_qty) || Number(r.quantity) || 1), 0);
  const reedStatus: 'READY' | 'UNAVAILABLE' = readyReedCount > 0 ? 'READY' : 'UNAVAILABLE';

  // Runout & Availability calculation
  let balanceDays = 0;
  let runoutDate = new Date();
  let avgProduction = 0;
  let isCurrentlyRunning = false;
  let currentDesign = '-';

  if (activeRun && activeRun.designNo && activeRun.designNo !== 'NOT RUNNING') {
    isCurrentlyRunning = true;
    currentDesign = activeRun.designNo;
    avgProduction = Number(activeRun.dailyProduction) || 300;
    try {
      const calc = calculateLoomRun({
        loomStartDate: new Date(activeRun.loomStartDate || new Date()),
        warpedMeter: Number(activeRun.warpedMeter) || 1800,
        dailyProduction: avgProduction,
        crimpPercent: Number(design.crimpPercent || design.crimp_percent) || 5
      });
      balanceDays = calc.balanceDays;
      runoutDate = calc.expectedRunoutDate;
    } catch (e) {
      balanceDays = 0;
    }
  }

  // Calculate Overall Match Score (0 - 100%)
  let score = technicalScore; // max 50

  // Availability Score (up to 25%)
  if (balanceDays === 0) score += 25;
  else if (balanceDays <= 2) score += 20;
  else if (balanceDays <= 7) score += 15;
  else score += 5;

  // Stock Readiness Score (up to 15%)
  if (beamStatus === 'READY') score += 10;
  if (reedStatus === 'READY') score += 5;

  // Efficiency/Loom performance (up to 10%)
  score += 10;

  score = Math.min(100, Math.max(0, Math.round(score)));

  // Determine Ranking Priority & Reason
  let priority = 10;
  let reason = 'Alternative Machine Option';
  let plannerNote = 'Suitable machine option.';

  if (comp.compatible && balanceDays === 0) {
    priority = 1;
    reason = 'Best Overall Match — Technical Fit & Available Immediately';
    plannerNote = 'Top recommendation! Allocate this machine immediately.';
  } else if (comp.compatible && balanceDays <= 2) {
    priority = 2;
    reason = 'Perfect Technical Match — Runout in <= 2 Days';
    plannerNote = 'Reserve machine for upcoming runout.';
  } else if (comp.compatible && balanceDays <= 7) {
    priority = 3;
    reason = 'Perfect Technical Match — Runout in <= 7 Days';
    plannerNote = 'Good candidate for upcoming schedule.';
  } else if (comp.compatible) {
    priority = 4;
    reason = 'Technical Match — Currently Running';
    plannerNote = 'Available after current run completes.';
  } else if (!weaveMatch) {
    priority = 8;
    reason = 'Weave Capability Mismatch';
    plannerNote = 'Requires weave conversion / setup.';
  } else if (!frameMatch) {
    priority = 9;
    reason = 'Frame Capacity Insufficient';
    plannerNote = 'Loom capacity is less than required frames.';
  }

  let statusText = 'READY NOW';
  if (isCurrentlyRunning && balanceDays > 0) {
    statusText = `RUNNING (Runout in ${Math.ceil(balanceDays)} Days)`;
  } else if (isCurrentlyRunning && balanceDays <= 0) {
    statusText = 'RUNNING (Runout Overdue)';
  }

  return {
    loomNo: Number(loom.loomNo || loom.loom_no),
    unit: loom.unit || 'I',
    loomType: loom.loomType || loom.loom_type || 'Airjet',
    beamType: loom.beamType || loom.beam_type || 'Standard',
    beamDia: Number(loom.beamDia || loom.beam_dia) || 800,
    width: (loom.width || loom.reed_space || '68').toString(),
    frameCapacity: Number(loom.installedLever || loom.frameCapacity || loom.frame_capacity) || 12,
    weftColours: Number(loom.maxWeftColours || loom.weftColours || loom.weft_colours) || 4,
    installedLever: Number(loom.installedLever || loom.frameCapacity) || 12,
    currentDesign,
    balanceDays,
    runoutDate,
    availableDate: addDays(runoutDate, 1),
    score,
    technicalScore,
    priority,
    status: statusText,
    reason,
    plannerNote,
    efficiency: 92,
    avgProduction,
    beamStatus,
    beamFound: availableBeams[0] || null,
    reedStatus,
    reedFound: availableReeds[0] || null,
    comp
  };
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function EligibilityEngine() {
  const { looms, activeRuns, designs, nextPlans, rawNextPlans, orders, refreshData } = useAppContext();
  
  const [beams, setBeams] = useState<any[]>([]);
  const [reeds, setReeds] = useState<any[]>([]);
  const [designSearch, setDesignSearch] = useState('');
  const [selectedDesign, setSelectedDesign] = useState<any>(null);
  
  const [confirmModal, setConfirmModal] = useState<CompatResult | null>(null);
  const [machineModal, setMachineModal] = useState<CompatResult | null>(null);
  const [feedbackReason, setFeedbackReason] = useState('');
  
  const [isAssigning, setIsAssigning] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState('ALL');

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE_URL}/api/beam-stock`).then(r => r.json()),
      fetch(`${API_BASE_URL}/api/reed-stock`).then(r => r.json())
    ]).then(([beamsData, reedsData]) => {
      if (Array.isArray(beamsData)) setBeams(beamsData);
      if (Array.isArray(reedsData)) setReeds(reedsData);
    }).catch(console.error);
  }, []);

  // Quick Active Designs List for easy 1-click selection
  const activeDesignsList = useMemo(() => {
    const list: any[] = [];
    const seen = new Set<string>();

    orders.forEach(o => {
      const desNo = (o.design_no_sp_no || o.order_no || '').trim();
      if (desNo && !seen.has(desNo.toLowerCase())) {
        seen.add(desNo.toLowerCase());
        const dObj = designs.find(d => (d.designNo || d.design_no_sp_no || '').trim().toLowerCase() === desNo.toLowerCase()) || {
          designNo: desNo,
          weave: 'PLAIN',
          beamType: 'Standard',
          reedCount: '42/2',
          reedSpace: '68'
        };
        list.push({ ...dObj, linkedOrder: o });
      }
    });

    designs.forEach(d => {
      const desNo = (d.designNo || d.design_no_sp_no || '').trim();
      if (desNo && !seen.has(desNo.toLowerCase())) {
        seen.add(desNo.toLowerCase());
        list.push(d);
      }
    });

    return list;
  }, [orders, designs]);

  // Design Search Match Filtering
  const designMatches = useMemo(() => {
    if (!designSearch || designSearch.length < 1) return activeDesignsList.slice(0, 8);
    const searchLow = designSearch.toLowerCase();
    return activeDesignsList.filter(d => 
      (d.designNo || d.design_no_sp_no || '').toLowerCase().includes(searchLow) ||
      (d.linkedOrder?.ibpo_no || d.linkedOrder?.order_no || '').toLowerCase().includes(searchLow)
    ).slice(0, 10);
  }, [designSearch, activeDesignsList]);

  // Linked Order info for selected design
  const linkedOrder = useMemo(() => {
    if (!selectedDesign) return null;
    const targetDes = (selectedDesign.designNo || selectedDesign.design_no_sp_no || '').trim().toLowerCase();
    return orders.find(o => (o.design_no_sp_no || o.order_no || '').trim().toLowerCase() === targetDes) || selectedDesign.linkedOrder || null;
  }, [selectedDesign, orders]);

  // Beam Stock count for selected design
  const readyBeamCount = useMemo(() => {
    if (!selectedDesign) return 0;
    const desNoNorm = (selectedDesign.designNo || selectedDesign.design_no_sp_no || '').trim().toLowerCase();
    return beams.filter(b => {
      const bDes = (b.design_no || '').trim().toLowerCase();
      const st = (b.beam_status || b.status || '').trim().toUpperCase();
      return bDes === desNoNorm && (st === 'AVAILABLE' || st === 'READY');
    }).length;
  }, [selectedDesign, beams]);

  // Reed Stock count for selected design
  const readyReedCount = useMemo(() => {
    if (!selectedDesign) return 0;
    const reedCountTarget = (selectedDesign.reedCount || selectedDesign.reed_count || '').toString().trim();
    return reeds.filter(r => {
      const rCount = (r.reed_count || r.reedCount || '').toString().trim();
      const st = (r.beam_status || r.status || '').trim().toUpperCase();
      return rCount === reedCountTarget && (st === 'AVAILABLE' || st === 'READY');
    }).reduce((sum, r) => sum + (Number(r.available_qty) || Number(r.quantity) || 1), 0);
  }, [selectedDesign, reeds]);

  // Calculate Recommendations for all 224 Looms
  const allRecommendations = useMemo(() => {
    if (!selectedDesign) return [];
    const results = looms.map(loom => {
      const run = activeRuns[loom.loomNo || loom.loom_no];
      const plan = (rawNextPlans || []).find((p: any) => p.loom_no === (loom.loomNo || loom.loom_no));
      return computeCompatibility(loom, selectedDesign, run, plan, beams, reeds);
    });
    
    return results.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (b.score !== a.score) return b.score - a.score;
      return a.balanceDays - b.balanceDays;
    });
  }, [selectedDesign, looms, activeRuns, rawNextPlans, beams, reeds]);

  // Filtered Recommendations by Category Tab
  const filteredRecommendations = useMemo(() => {
    let filtered = allRecommendations;
    if (activeTab === 'READY NOW') filtered = allRecommendations.filter(r => r.balanceDays === 0);
    else if (activeTab === 'READY TODAY') filtered = allRecommendations.filter(r => r.balanceDays <= 1);
    else if (activeTab === 'READY WITHIN 7 DAYS') filtered = allRecommendations.filter(r => r.balanceDays <= 7);
    else if (activeTab === 'CHANGEOVER REQ') filtered = allRecommendations.filter(r => !r.comp?.compatible);
    return filtered.slice(0, 15);
  }, [allRecommendations, activeTab]);

  const bestLoom = allRecommendations.find(r => r.comp?.compatible) || allRecommendations[0];

  const handleStartAllocate = (rec: CompatResult) => {
    if (!rec.comp?.compatible) {
      alert(`⚠️ ALLOCATION BLOCKED (TECHNICAL MISMATCH)\n\nLoom ${rec.loomNo} does not satisfy technical requirements:\n- ${rec.comp?.reason || 'Weave/Frame Mismatch'}\n\nAutomatic allocation is not allowed for non-compatible looms.`);
      return;
    }
    setConfirmModal(rec);
  };

  const handleConfirmAllocation = async () => {
    if (!confirmModal || !selectedDesign) return;
    setIsAssigning(true);
    
    try {
      const payload = {
        loomNo: confirmModal.loomNo,
        designNo: selectedDesign.designNo || selectedDesign.design_no_sp_no,
        beamId: confirmModal.beamFound?.id,
        reedId: confirmModal.reedFound?.id,
        expectedStartDate: format(confirmModal.availableDate, 'yyyy-MM-dd'),
        expectedRunoutDate: format(confirmModal.runoutDate, 'yyyy-MM-dd'),
        oldPlan: confirmModal.currentDesign,
        user: "Planner"
      };

      const res = await fetch(`${API_BASE_URL}/api/allocate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await res.json();
      if (data.success) {
        setSuccessMsg(`✅ ${selectedDesign.designNo || selectedDesign.design_no_sp_no} successfully assigned to Loom ${confirmModal.loomNo}!`);
        await refreshData();
        setConfirmModal(null);
        setFeedbackReason('');
      } else {
        alert('Allocation failed: ' + (data.error || 'Unknown error'));
      }
    } catch (err: any) {
      console.error(err);
      alert('Network error during allocation.');
    }
    
    setIsAssigning(false);
    setTimeout(() => setSuccessMsg(null), 5000);
  };

  const scoreData = filteredRecommendations.slice(0, 10).map(r => ({ name: `L-` + r.loomNo, score: r.score }));

  return (
    <div className="space-y-6 flex flex-col min-h-full pb-20">
      {/* Top Banner Header + KPI Summary */}
      <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden border border-slate-800">
        <div className="absolute right-0 top-0 opacity-10 pointer-events-none">
           <Cpu className="w-64 h-64 -mt-10 -mr-10" />
        </div>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-500/20 border border-blue-500/30 rounded-xl flex items-center justify-center backdrop-blur shadow-inner">
              <Zap className="w-6 h-6 text-blue-400 fill-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">Smart Loom Planning Engine</h1>
              <p className="text-xs sm:text-sm text-slate-400 font-medium mt-0.5">Intelligent Machine Allocation & Priority Scoring</p>
            </div>
          </div>

          <button
            onClick={async () => {
              await refreshData();
            }}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-md transition-all flex items-center shrink-0"
          >
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh Engine Data
          </button>
        </div>
        
        {/* KPI Cards Header */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 relative z-10">
           <div className="bg-slate-800/80 rounded-xl p-3.5 border border-slate-700 shadow-md">
             <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1 flex items-center">
               <Star className="w-3.5 h-3.5 mr-1 text-amber-400 fill-amber-400"/> Best Available
             </div>
             <div className="text-2xl font-black text-amber-400">{selectedDesign && bestLoom ? `Loom ${bestLoom.loomNo}` : '—'}</div>
             <div className="text-[10px] text-slate-400 font-semibold mt-0.5">{selectedDesign && bestLoom ? `${bestLoom.score}% Match Score` : 'Select a Design'}</div>
           </div>

           <div className="bg-slate-800/80 rounded-xl p-3.5 border border-slate-700 shadow-md">
             <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1 flex items-center">
               <Activity className="w-3.5 h-3.5 mr-1 text-blue-400"/> Avg Rec Score
             </div>
             <div className="text-2xl font-black text-blue-400">
               {selectedDesign && allRecommendations.length > 0 
                 ? `${Math.round(allRecommendations.slice(0, 10).reduce((a,b)=>a+b.score, 0) / Math.min(10, allRecommendations.length))}%` 
                 : '0%'}
             </div>
             <div className="text-[10px] text-slate-400 font-semibold mt-0.5">Top 10 Recommendations</div>
           </div>

           <div className="bg-slate-800/80 rounded-xl p-3.5 border border-slate-700 shadow-md">
             <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1 flex items-center">
               <Box className="w-3.5 h-3.5 mr-1 text-emerald-400"/> Ready Beams
             </div>
             <div className="text-2xl font-black text-emerald-400">{selectedDesign ? readyBeamCount : beams.filter(b=> (b.beam_status || b.status || '').toUpperCase() === 'AVAILABLE').length}</div>
             <div className="text-[10px] text-slate-400 font-semibold mt-0.5">{selectedDesign ? `For ${selectedDesign.designNo || selectedDesign.design_no_sp_no}` : 'Total Central Stock'}</div>
           </div>

           <div className="bg-slate-800/80 rounded-xl p-3.5 border border-slate-700 shadow-md">
             <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1 flex items-center">
               <BarChart2 className="w-3.5 h-3.5 mr-1 text-purple-400"/> Ready Reeds
             </div>
             <div className="text-2xl font-black text-purple-400">{selectedDesign ? readyReedCount : reeds.filter(r=> (r.beam_status || r.status || '').toUpperCase() === 'AVAILABLE').length}</div>
             <div className="text-[10px] text-slate-400 font-semibold mt-0.5">{selectedDesign ? `Reed Count ${selectedDesign.reedCount || selectedDesign.reed_count || '—'}` : 'Total Central Stock'}</div>
           </div>
        </div>
      </div>

      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 p-4 rounded-xl font-bold flex items-center shadow-md animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 mr-2 text-emerald-600" />
          {successMsg}
        </div>
      )}

      {/* Main Layout Area */}
      <div className="grid grid-cols-12 gap-6 flex-1">
        
        {/* Left Column: Search & Design Specs */}
        <div className="col-span-12 lg:col-span-4 space-y-4">
          
          {/* Plan Design Search Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-3">
            <h3 className="font-black text-slate-900 text-sm uppercase tracking-wide flex items-center">
              <Search className="w-4 h-4 mr-2 text-blue-600" /> Plan Design / Select Requirement
            </h3>
            
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Search Design No, SP No, IBPO..."
                value={designSearch}
                onChange={e => {
                  setDesignSearch(e.target.value);
                  if (e.target.value === '') setSelectedDesign(null);
                }}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 font-medium text-xs text-slate-900 outline-none"
              />
              {designSearch && (
                <button onClick={() => { setDesignSearch(''); setSelectedDesign(null); }} className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 text-xs font-bold">✕</button>
              )}
            </div>

            {/* Suggestions List */}
            {designMatches.length > 0 && (!selectedDesign || designSearch !== (selectedDesign.designNo || selectedDesign.design_no_sp_no)) && (
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-lg bg-white divide-y divide-slate-100 max-h-60 overflow-y-auto custom-scrollbar">
                {designMatches.map(d => (
                  <button 
                    key={d.designNo || d.design_no_sp_no} 
                    onClick={() => { 
                      setSelectedDesign(d); 
                      setDesignSearch(d.designNo || d.design_no_sp_no); 
                    }} 
                    className="w-full text-left px-3 py-2.5 hover:bg-blue-50/80 transition-colors flex justify-between items-center group"
                  >
                    <div>
                      <div className="font-bold text-xs text-slate-900">{d.designNo || d.design_no_sp_no}</div>
                      <div className="text-[10px] text-slate-500 font-semibold">
                        Weave: {d.weave || d.weave_type || 'PLAIN'} | Reed: {d.reedCount || d.reed_count || '—'}
                        {d.linkedOrder ? ` | Order: ${d.linkedOrder.ibpo_no}` : ''}
                      </div>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-600 transition-colors" />
                  </button>
                ))}
              </div>
            )}

            {/* Quick Select Active Order Chips */}
            <div className="pt-2 border-t border-slate-100 space-y-1.5">
              <div className="text-[10px] uppercase font-bold text-slate-400">Quick Select Active Requirement:</div>
              <div className="flex flex-wrap gap-1.5">
                {activeDesignsList.slice(0, 6).map(d => {
                  const dName = d.designNo || d.design_no_sp_no;
                  const isSelected = selectedDesign && (selectedDesign.designNo || selectedDesign.design_no_sp_no) === dName;
                  return (
                    <button
                      key={dName}
                      onClick={() => {
                        setSelectedDesign(d);
                        setDesignSearch(dName);
                      }}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-all ${
                        isSelected 
                          ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                          : 'bg-slate-100 text-slate-700 hover:bg-blue-50 border-slate-200'
                      }`}
                    >
                      {dName}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Design Master Specifications Panel */}
          {selectedDesign && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-3">
               <h3 className="font-black text-slate-900 text-sm uppercase tracking-wide flex items-center border-b border-slate-100 pb-2">
                 <FileText className="w-4 h-4 mr-2 text-indigo-600" /> Design Master Specifications
               </h3>
               
               <div className="space-y-2 text-xs font-medium text-slate-700">
                 <div className="flex justify-between border-b border-slate-50 pb-1.5">
                   <span className="text-slate-500 font-bold">Design / SP No:</span>
                   <span className="font-black text-blue-900">{selectedDesign.designNo || selectedDesign.design_no_sp_no}</span>
                 </div>
                 <div className="flex justify-between border-b border-slate-50 pb-1.5">
                   <span className="text-slate-500 font-bold">Construction:</span>
                   <span className="font-bold text-slate-800">{selectedDesign.construction || selectedDesign.fabric_construction || '—'}</span>
                 </div>
                 <div className="flex justify-between border-b border-slate-50 pb-1.5">
                   <span className="text-slate-500 font-bold">Weave Type:</span>
                   <span className="font-black text-purple-700">{selectedDesign.weave || selectedDesign.weave_type || 'PLAIN'}</span>
                 </div>
                 <div className="flex justify-between border-b border-slate-50 pb-1.5">
                   <span className="text-slate-500 font-bold">Required Frames:</span>
                   <span className="font-bold text-slate-800">{selectedDesign.frames || selectedDesign.no_of_frames || 5} Frames</span>
                 </div>
                 <div className="flex justify-between border-b border-slate-50 pb-1.5">
                   <span className="text-slate-500 font-bold">Reed Count / Pick:</span>
                   <span className="font-bold text-slate-800">{selectedDesign.reedCount || selectedDesign.reed_count || '—'} / {selectedDesign.pick || 64} Picks</span>
                 </div>
                 <div className="flex justify-between border-b border-slate-50 pb-1.5">
                   <span className="text-slate-500 font-bold">Width / Reed Space:</span>
                   <span className="font-bold text-slate-800">{selectedDesign.greigeWidth || selectedDesign.greige_width || '68'}" / {selectedDesign.reedSpace || selectedDesign.reed_space || '70'}"</span>
                 </div>
                 <div className="flex justify-between pb-1.5">
                   <span className="text-slate-500 font-bold">Total Ends / Crimp:</span>
                   <span className="font-bold text-slate-800">{selectedDesign.totalEnds || selectedDesign.total_ends || 4648} / {selectedDesign.crimpPercent || selectedDesign.crimp_percent || 5}%</span>
                 </div>
               </div>
            </div>
          )}

          {/* Linked Order Info Card */}
          {selectedDesign && linkedOrder && (
            <div className="bg-slate-900 text-white rounded-2xl shadow-sm border border-slate-800 p-5 space-y-3">
               <h3 className="font-black text-blue-300 text-xs uppercase tracking-wide flex items-center border-b border-slate-800 pb-2">
                 <Layers className="w-4 h-4 mr-2 text-blue-400" /> Linked Order Requirement
               </h3>
               
               <div className="space-y-2 text-xs font-mono">
                 <div className="flex justify-between border-b border-slate-800 pb-1.5">
                   <span className="text-slate-400 font-bold">IBPO / Order No:</span>
                   <span className="font-black text-blue-300">{linkedOrder.ibpo_no || linkedOrder.order_no}</span>
                 </div>
                 <div className="flex justify-between border-b border-slate-800 pb-1.5">
                   <span className="text-slate-400 font-bold">Customer:</span>
                   <span className="font-bold text-slate-200">{linkedOrder.customer_name || linkedOrder.party_name || '—'}</span>
                 </div>
                 <div className="flex justify-between border-b border-slate-800 pb-1.5">
                   <span className="text-slate-400 font-bold">Order / Warp Qty:</span>
                   <span className="font-bold text-emerald-400">{(Number(linkedOrder.order_qty) || 0).toLocaleString()} M / {(Number(linkedOrder.warp_qty) || 0).toLocaleString()} M</span>
                 </div>
                 <div className="flex justify-between border-b border-slate-800 pb-1.5">
                   <span className="text-slate-400 font-bold">Planned Looms:</span>
                   <span className="font-black text-amber-400">{linkedOrder.planned_loom_count || 1} Looms</span>
                 </div>
                 <div className="flex justify-between pb-1.5">
                   <span className="text-slate-400 font-bold">Planned Weaving Start:</span>
                   <span className="font-bold text-cyan-300">{linkedOrder.weaving_planned_date ? formatRunoutDate(linkedOrder.weaving_planned_date) : 'Pending'}</span>
                 </div>
               </div>
            </div>
          )}

        </div>

        {/* Right Column: Recommendations Dashboard */}
        <div className="col-span-12 lg:col-span-8">
           {selectedDesign ? (
             <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
                
                {/* Decision Support Panel */}
                <div className="bg-slate-50 p-4 border-b border-slate-200 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-black text-slate-900 flex items-center text-base uppercase tracking-tight">
                        <Star className="w-5 h-5 mr-2 text-amber-500 fill-amber-500" /> Compatible Loom Recommendations
                      </h3>
                      <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                        Scanned all 224 looms for {selectedDesign.designNo || selectedDesign.design_no_sp_no}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                       {['ALL', 'READY NOW', 'READY TODAY', 'READY WITHIN 7 DAYS', 'CHANGEOVER REQ'].map(tab => (
                         <button 
                           key={tab} 
                           onClick={()=>setActiveTab(tab)}
                           className={`px-3 py-1 text-[11px] font-bold rounded-lg border transition-all ${
                             activeTab === tab 
                               ? 'bg-slate-900 text-white border-slate-900 shadow-sm' 
                               : 'bg-white text-slate-600 hover:bg-slate-100 border-slate-200'
                           }`}
                         >
                           {tab}
                         </button>
                       ))}
                    </div>
                  </div>
                  
                  {/* Top 10 Match Score Bar Chart */}
                  {scoreData.length > 0 && (
                    <div className="h-16 w-full pt-1">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={scoreData}>
                          <Tooltip 
                            cursor={{fill: 'rgba(0,0,0,0.04)'}} 
                            contentStyle={{borderRadius:'8px', border:'1px solid #e2e8f0', fontSize:'11px', fontWeight:'bold'}}
                          />
                          <Bar dataKey="score" radius={[4,4,0,0]}>
                            {scoreData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={index === 0 ? '#10b981' : '#3b82f6'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
                
                {/* Recommendation Cards List */}
                <div className="p-4 space-y-3.5 max-h-[700px] overflow-y-auto custom-scrollbar bg-slate-50/50">
                  {filteredRecommendations.length === 0 ? (
                    <div className="text-center p-12 bg-white rounded-xl border border-slate-200">
                      <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-2" />
                      <h4 className="font-black text-slate-800 text-base">NO COMPATIBLE LOOM FOUND FOR THIS CATEGORY</h4>
                      <p className="text-xs text-slate-500 font-semibold max-w-md mx-auto mt-1">
                        Try selecting the <strong>ALL</strong> tab to view alternative looms or changeover options.
                      </p>
                    </div>
                  ) : (
                    filteredRecommendations.map((rec, idx) => {
                      const isTopRank = idx === 0 && rec.comp?.compatible;
                      return (
                        <div 
                          key={rec.loomNo} 
                          className={`border rounded-2xl p-4 transition-all bg-white shadow-sm flex flex-col sm:flex-row justify-between gap-4 ${
                            isTopRank 
                              ? 'border-emerald-400 ring-2 ring-emerald-400/20 bg-emerald-50/10' 
                              : rec.comp?.compatible 
                                ? 'border-slate-200 hover:border-blue-300' 
                                : 'border-amber-200 bg-amber-50/10'
                          }`}
                        >
                          <div className="flex gap-3.5 flex-1">
                            {/* Loom Badge */}
                            <div className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center font-black border shrink-0 ${
                              isTopRank 
                                ? 'bg-gradient-to-br from-emerald-500 to-teal-700 text-white border-emerald-600 shadow-md' 
                                : rec.comp?.compatible 
                                  ? 'bg-slate-900 text-white border-slate-800' 
                                  : 'bg-slate-100 text-slate-700 border-slate-200'
                            }`}>
                              <span className="text-[9px] opacity-80 uppercase tracking-widest leading-none">LOOM</span>
                              <span className="text-xl leading-none mt-1">{rec.loomNo}</span>
                            </div>

                            <div className="space-y-1.5 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 font-mono">
                                  Rank #{idx + 1}
                                </span>
                                <span className="text-xs font-black text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
                                  {rec.score}% Match Score
                                </span>
                                {isTopRank && (
                                  <span className="bg-emerald-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
                                    Best Overall Match
                                  </span>
                                )}
                                {!rec.comp?.compatible && (
                                  <span className="bg-amber-100 text-amber-900 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                                    Changeover Required
                                  </span>
                                )}
                              </div>
                              
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs">
                                <div className="flex items-center text-slate-600">
                                  <Activity className="w-3.5 h-3.5 mr-1.5 text-slate-400 shrink-0"/> 
                                  <span className="font-bold text-slate-500 w-16">Unit / Type:</span> 
                                  <span className="font-bold text-slate-800">Unit {rec.unit} ({rec.loomType})</span>
                                </div>

                                <div className="flex items-center text-slate-600">
                                  <TrendingUp className="w-3.5 h-3.5 mr-1.5 text-slate-400 shrink-0"/> 
                                  <span className="font-bold text-slate-500 w-16">Status:</span> 
                                  <span className={`font-bold ${rec.balanceDays > 0 ? 'text-blue-700' : 'text-emerald-700'}`}>{rec.status}</span>
                                </div>

                                <div className="flex items-center text-slate-600">
                                  <Layers className="w-3.5 h-3.5 mr-1.5 text-slate-400 shrink-0"/> 
                                  <span className="font-bold text-slate-500 w-16">Running:</span> 
                                  <span className="font-bold text-slate-800">{rec.currentDesign}</span>
                                </div>

                                <div className="flex items-center text-slate-600">
                                  <MessageSquare className="w-3.5 h-3.5 mr-1.5 text-slate-400 shrink-0"/> 
                                  <span className="font-bold text-slate-500 w-16">Reason:</span> 
                                  <span className="font-bold text-slate-800">{rec.reason}</span>
                                </div>
                              </div>

                              {/* Technical & Readiness Chips */}
                              <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
                                {rec.comp?.weaveCompatible ? (
                                  <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded font-bold">
                                    ✓ Weave: {rec.comp.matchedCapability || rec.comp.orderRequirement?.weaveType || 'Matched'}
                                  </span>
                                ) : (
                                  <span className="bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded font-bold">
                                    ✕ Weave: Mismatch ({rec.comp?.orderRequirement?.weaveType})
                                  </span>
                                )}

                                {rec.comp?.frameCompatible ? (
                                  <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded font-bold">
                                    ✓ Frame: Req {rec.comp?.requiredFrames || 0} ≤ Max {rec.comp?.maxFramesSupported ?? '12'}
                                  </span>
                                ) : (
                                  <span className="bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded font-bold">
                                    ✕ Frame: Req {rec.comp?.requiredFrames} &gt; Max {rec.comp?.maxFramesSupported ?? 'N/A'}
                                  </span>
                                )}

                                <span className={`px-2 py-0.5 rounded font-bold border ${
                                  rec.beamStatus === 'READY' 
                                    ? 'bg-purple-50 text-purple-800 border-purple-200' 
                                    : 'bg-amber-50 text-amber-800 border-amber-200'
                                }`}>
                                  {rec.beamStatus === 'READY' ? '✓ Beam: Stock Ready' : '⚡ Beam: Stock Required'}
                                </span>

                                <span className={`px-2 py-0.5 rounded font-bold border ${
                                  rec.reedStatus === 'READY' 
                                    ? 'bg-cyan-50 text-cyan-800 border-cyan-200' 
                                    : 'bg-amber-50 text-amber-800 border-amber-200'
                                }`}>
                                  {rec.reedStatus === 'READY' ? '✓ Reed: Stock Ready' : '⚡ Reed: Stock Required'}
                                </span>
                              </div>
                            </div>
                          </div>
                          
                          {/* Action Buttons */}
                          <div className="flex sm:flex-col justify-end gap-2 shrink-0">
                            <button 
                              onClick={() => handleStartAllocate(rec)} 
                              className={`px-4 py-2 text-white font-black rounded-xl shadow-sm transition-all flex items-center justify-center text-xs ${
                                isTopRank 
                                  ? 'bg-emerald-600 hover:bg-emerald-700' 
                                  : rec.comp?.compatible 
                                    ? 'bg-blue-600 hover:bg-blue-700' 
                                    : 'bg-slate-400 cursor-not-allowed'
                              }`}
                            >
                              ALLOCATE <ArrowRight className="w-3.5 h-3.5 ml-1" />
                            </button>

                            <button 
                              onClick={() => setMachineModal(rec)} 
                              className="px-4 py-1.5 bg-white border border-slate-300 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-colors flex items-center justify-center text-xs"
                            >
                              <Info className="w-3.5 h-3.5 mr-1 text-slate-500"/> DETAILS
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
             </div>
           ) : (
             <div className="h-full flex items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl bg-white p-8">
               <div className="text-center max-w-md mx-auto space-y-3">
                 <div className="w-16 h-16 bg-blue-50 rounded-2xl shadow-sm flex items-center justify-center mx-auto text-blue-600 border border-blue-100">
                   <Cpu className="w-8 h-8" />
                 </div>
                 <h3 className="text-lg font-black text-slate-800">Awaiting Design Selection</h3>
                 <p className="text-xs text-slate-500 leading-relaxed font-medium">
                   Search or click any active design on the left panel. The Smart Recommendation Engine will scan all 224 looms to calculate technical fit, runout timeline, stock readiness, and ranking.
                 </p>

                 <div className="pt-2">
                   <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Popular Active Requirements:</div>
                   <div className="flex flex-wrap justify-center gap-1.5">
                     {activeDesignsList.slice(0, 4).map(d => {
                       const dName = d.designNo || d.design_no_sp_no;
                       return (
                         <button
                           key={dName}
                           onClick={() => {
                             setSelectedDesign(d);
                             setDesignSearch(dName);
                           }}
                           className="px-3 py-1 bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-800 font-bold text-xs rounded-xl border border-slate-200 transition-all shadow-sm"
                         >
                           {dName}
                         </button>
                       );
                     })}
                   </div>
                 </div>
               </div>
             </div>
           )}
        </div>
      </div>

      {/* Details Modal */}
      {machineModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200">
            <div className="bg-slate-900 p-4 text-white flex justify-between items-center border-b border-slate-800">
              <h2 className="font-black text-sm uppercase flex items-center tracking-wide">
                <Settings className="w-4 h-4 mr-2 text-blue-400"/> Machine Capability Details — Loom {machineModal.loomNo}
              </h2>
              <button onClick={() => setMachineModal(null)} className="text-slate-400 hover:text-white p-1 rounded-lg">
                <XCircle className="w-5 h-5"/>
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs font-medium text-slate-700">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="text-[10px] text-slate-500 font-bold uppercase mb-0.5">Technical Match Score</div>
                  <div className="text-2xl font-black text-indigo-900">{machineModal.technicalScore}/50</div>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="text-[10px] text-slate-500 font-bold uppercase mb-0.5">Overall Match Score</div>
                  <div className="text-2xl font-black text-emerald-700">{machineModal.score}%</div>
                </div>
              </div>

              <div className="bg-blue-50 text-blue-900 p-3 rounded-xl text-xs font-medium border border-blue-200 space-y-1">
                <div className="font-black text-blue-800 uppercase text-[10px] tracking-wider">Recommendation Assessment</div>
                <p className="font-bold leading-relaxed">{machineModal.reason}</p>
                <p className="text-slate-600">{machineModal.plannerNote}</p>
              </div>
              
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                 <div className="font-black text-slate-900 uppercase text-[10px] tracking-wider border-b border-slate-200 pb-1">
                   Technical Capability Breakdown
                 </div>
                 <div className="space-y-1.5 font-mono text-[11px]">
                   <div className="flex justify-between">
                     <span className="text-slate-500">Required Weave:</span>
                     <span className="font-bold text-slate-900">{machineModal.comp?.orderRequirement?.weaveType || 'PLAIN'}</span>
                   </div>
                   <div className="flex justify-between">
                     <span className="text-slate-500">Weave Status:</span>
                     <span className={`font-bold ${machineModal.comp?.weaveCompatible ? 'text-emerald-700' : 'text-red-700'}`}>
                       {machineModal.comp?.weaveCompatible ? `✓ Matched (${machineModal.comp?.matchedCapability || 'Supported'})` : '✕ Mismatch'}
                     </span>
                   </div>
                   <div className="flex justify-between">
                     <span className="text-slate-500">Required Frames:</span>
                     <span className="font-bold text-slate-900">{machineModal.comp?.requiredFrames || 0} Frames</span>
                   </div>
                   <div className="flex justify-between">
                     <span className="text-slate-500">Frame Status:</span>
                     <span className={`font-bold ${machineModal.comp?.frameCompatible ? 'text-emerald-700' : 'text-red-700'}`}>
                       {machineModal.comp?.frameCompatible ? `✓ Supported (Max ${machineModal.comp?.maxFramesSupported ?? '12'})` : `✕ Exceeds Loom Capacity (Max ${machineModal.comp?.maxFramesSupported ?? 'N/A'})`}
                     </span>
                   </div>
                 </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-1 font-mono">
                 <div className="font-black text-slate-900 uppercase text-[10px] tracking-wider mb-1">Production & Runout Status</div>
                 <div className="grid grid-cols-2 gap-2 text-[11px]">
                   <div>Current Running: <span className="font-bold text-slate-900">{machineModal.currentDesign}</span></div>
                   <div>Balance Days: <span className="font-bold text-red-700">{Math.ceil(machineModal.balanceDays)} Days</span></div>
                   <div>Expected Runout: <span className="font-bold text-blue-900">{formatRunoutDate(machineModal.runoutDate)}</span></div>
                   <div>Available Date: <span className="font-bold text-emerald-700">{formatRunoutDate(machineModal.availableDate)}</span></div>
                 </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal && selectedDesign && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col border border-slate-200">
            <div className="bg-slate-900 p-4 text-white flex justify-between items-center border-b border-slate-800">
              <h2 className="text-sm font-black uppercase tracking-wide flex items-center">
                <CheckCircle2 className="w-5 h-5 mr-2 text-emerald-400" /> Confirm Machine Allocation
              </h2>
              <button onClick={() => setConfirmModal(null)} className="text-slate-400 hover:text-white"><XCircle className="w-5 h-5" /></button>
            </div>
            
            <div className="p-5 bg-slate-50 space-y-3 text-xs font-medium text-slate-700">
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-2 font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold">Design No:</span>
                  <span className="font-black text-slate-900">{selectedDesign.designNo || selectedDesign.design_no_sp_no}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold">Target Loom:</span>
                  <span className="font-black text-indigo-900">Loom {confirmModal.loomNo} (Unit {confirmModal.unit})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold">Expected Available:</span>
                  <span className="font-bold text-emerald-700">{formatRunoutDate(confirmModal.availableDate)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold">Match Score:</span>
                  <span className="font-black text-blue-900">{confirmModal.score}%</span>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 leading-relaxed font-sans">
                Allocating will record this recommendation for Loom {confirmModal.loomNo}. Existing master data and stock levels will not be modified automatically.
              </p>
            </div>

            <div className="p-4 border-t border-slate-200 bg-white flex justify-end gap-2">
              <button 
                onClick={() => setConfirmModal(null)} 
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-colors text-xs"
              >
                CANCEL
              </button>
              <button 
                onClick={handleConfirmAllocation} 
                disabled={isAssigning} 
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black shadow-sm transition-all text-xs disabled:opacity-50"
              >
                {isAssigning ? 'Processing...' : 'CONFIRM ALLOCATION'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

