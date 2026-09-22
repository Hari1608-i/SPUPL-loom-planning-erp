import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ListTodo, Search, AlertCircle, CheckCircle2, Play, Lock, Eye, X, 
  AlertTriangle, ArrowRight, ShieldCheck, Sparkles, RefreshCw, MessageSquare, ExternalLink, Filter, Check, Layers, Trash2
} from 'lucide-react';
import { format } from 'date-fns';
import { useAppContext } from '../context/AppProvider';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../config';

interface PlannedAssignment {
  id: number;
  loom_no: number;
  current_design: string;
  next_design: string;
  order_no?: string;
  customer_name?: string;
  required_qty?: number;
  planned_start_date: string;
  expected_start_date?: string;
  expected_finish_date?: string;
  planned_warp_meter: number;
  planned_avg_daily_production: number;
  status: string;
  reed_status?: string;
  reserved_reed_id?: number | null;
  reserved_reed_no?: string | null;
  beam_status?: string;
  reserved_beam_id: number | null;
  reserved_beam_no?: string | null;
  reserved_set_no?: string | null;
  confirmation_status: string;
  remarks?: string;
  planner_name?: string;
  readiness_status?: string | null;
  change_request_remark?: string;
}

export default function PlannedLooms() {
  const navigate = useNavigate();
  const { looms, designs, beams, reeds, orders, activeRuns, refreshData } = useAppContext();
  const { user } = useAuth();

  const [searchTerm, setSearchTerm] = useState('');
  const [assignments, setAssignments] = useState<PlannedAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Modals state
  const [selectedPlanForReview, setSelectedPlanForReview] = useState<PlannedAssignment | null>(null);
  const [confirmReedModalPlan, setConfirmReedModalPlan] = useState<PlannedAssignment | null>(null);
  const [confirmBeamModalPlan, setConfirmBeamModalPlan] = useState<PlannedAssignment | null>(null);
  const [declineModalPlan, setDeclineModalPlan] = useState<PlannedAssignment | null>(null);
  const [declineRemark, setDeclineRemark] = useState<string>('');

  // Interactive Selection State for Reed Allocation
  const [selectedReedForConfirmation, setSelectedReedForConfirmation] = useState<number | null>(null);
  const [reedSearchTerm, setReedSearchTerm] = useState('');

  // Delete a plan
  const handleDeletePlan = async (row: PlannedAssignment) => {
    if (!window.confirm(`Delete planned assignment for Loom ${row.loom_no}? This will also release any allocated reed and beam.`)) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/planning/next-plan/${row.id}`, { method: 'DELETE' });
      if (res.ok) {
        setSuccessMsg(`Plan for Loom ${row.loom_no} deleted and all allocations released.`);
        await refreshData();
        // Re-fetch assignments to update the table
        const updated = await fetch(`${API_BASE_URL}/api/planning/next-plans`);
        if (updated.ok) setAssignments(await updated.json());
      } else {
        const data = await res.json();
        setErrorMsg(data.error || 'Failed to delete plan.');
      }
    } catch (err: any) {
      setErrorMsg('Error deleting plan: ' + err.message);
    }
  };
  const [reedFilterTab, setReedFilterTab] = useState<'COMPATIBLE' | 'ALL_AVAILABLE'>('COMPATIBLE');

  // Interactive Selection State for Beam Allocation
  const [selectedBeamForConfirmation, setSelectedBeamForConfirmation] = useState<number | null>(null);
  const [beamSearchTerm, setBeamSearchTerm] = useState('');
  const [beamFilterTab, setBeamFilterTab] = useState<'COMPATIBLE' | 'ALL_AVAILABLE' | 'INCOMPATIBLE'>('COMPATIBLE');

  const fetchAssignments = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/planning/next-plans`);
      const data = await res.json();
      if (Array.isArray(data)) setAssignments(data);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAssignments();
    refreshData();
    const interval = setInterval(() => {
      fetchAssignments();
      refreshData();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Open Confirm Reed Modal
  const handleOpenConfirmReedModal = (plan: PlannedAssignment) => {
    setConfirmReedModalPlan(plan);
    setSelectedReedForConfirmation(plan.reserved_reed_id || null);
    setReedSearchTerm('');
    setReedFilterTab('COMPATIBLE');
  };

  // Open Confirm Beam Modal
  const handleOpenConfirmBeamModal = (plan: PlannedAssignment) => {
    setConfirmBeamModalPlan(plan);
    setSelectedBeamForConfirmation(plan.reserved_beam_id || null);
    setBeamSearchTerm('');
    setBeamFilterTab('COMPATIBLE');
  };

  // STEP 1: Confirm Reed Allocation (User selects physical Reed from stock)
  const handleConfirmReed = async (plan: PlannedAssignment, chosenReedId?: number | null) => {
    const reedIdToAllocate = chosenReedId !== undefined ? chosenReedId : selectedReedForConfirmation;

    if (!reedIdToAllocate && !plan.reserved_reed_id) {
      setErrorMsg(`⚠️ REED SELECTION REQUIRED: Please select a physical Reed row from stock table before clicking Confirm Reed.`);
      return;
    }

    const targetReedId = reedIdToAllocate || plan.reserved_reed_id;

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/planning/next-plan/allocate-reed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: plan.id,
          loomNo: plan.loom_no,
          reedId: targetReedId
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMsg(`🎉 REED CONFIRMED! Reed #${data.plan?.reserved_reed_no || 'RD-ALLOCATED'} allocated & reserved for Loom ${plan.loom_no}. Reed Stock updated.`);
        setConfirmReedModalPlan(null);
        setSelectedReedForConfirmation(null);
        setSelectedPlanForReview(null);
        await refreshData();
        await fetchAssignments();
        setTimeout(() => setSuccessMsg(null), 5000);
      } else {
        setErrorMsg(data.error || 'Failed to confirm reed.');
      }
    } catch (err: any) {
      setErrorMsg('Error confirming reed: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // STEP 2: Confirm Beam Allocation (User selects physical Beam from stock)
  const handleConfirmBeam = async (plan: PlannedAssignment, chosenBeamId?: number | null) => {
    const beamIdToAllocate = chosenBeamId !== undefined ? chosenBeamId : selectedBeamForConfirmation;

    if (!beamIdToAllocate && !plan.reserved_beam_id) {
      setErrorMsg(`⚠️ BEAM SELECTION REQUIRED: Please select a physical beam row from the table before clicking Confirm Beam.`);
      return;
    }

    const targetBeamId = beamIdToAllocate || plan.reserved_beam_id;
    const targetBeam = beams.find(b => b.id === targetBeamId);

    if (!targetBeam && !plan.reserved_beam_id) {
      setErrorMsg(`❌ BEAM SELECTION ERROR: Selected beam could not be found in Beam Stock.`);
      return;
    }

    if (targetBeam && (targetBeam.status === 'RESERVED' || targetBeam.status === 'Allocated' || targetBeam.status === 'RUNNING')) {
      alert(`⚠️ Beam #${targetBeam.beam_no} is no longer available. Stock has been updated. Please select another beam.`);
      await refreshData();
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/planning/next-plan/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loomNo: plan.loom_no,
          nextDesign: plan.next_design,
          orderNo: plan.order_no,
          beamId: targetBeamId,
          reedId: plan.reserved_reed_id,
          startDate: plan.planned_start_date,
          remarks: plan.remarks || 'Beam confirmed via Interactive Picker',
          plannerName: user?.username || 'Confirmation User'
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMsg(`🎉 BEAM CONFIRMED! Physical Beam #${targetBeam ? targetBeam.beam_no : plan.reserved_beam_no} allocated & reserved for Loom ${plan.loom_no}. You may now click CONFIRM LOOM.`);
        setConfirmBeamModalPlan(null);
        setSelectedBeamForConfirmation(null);
        setSelectedPlanForReview(null);
        await refreshData();
        await fetchAssignments();
        setTimeout(() => setSuccessMsg(null), 5000);
      } else {
        setErrorMsg(data.error || 'Failed to confirm beam.');
      }
    } catch (err: any) {
      setErrorMsg('Error confirming beam: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // STEP 3: Confirm Loom (Allowed ONLY AFTER Both Reed & Beam Confirmations)
  const handleConfirmLoom = async (plan: PlannedAssignment) => {
    const isReedConfirmed = plan.reserved_reed_id !== null || plan.reserved_reed_no || plan.reed_status === 'REED ALLOCATED';
    const isBeamConfirmed = plan.status === 'CONFIRMED' || plan.beam_status === 'BEAM ALLOCATED' || plan.reserved_beam_id !== null;

    if (!isReedConfirmed) {
      setErrorMsg('❌ LOOM CONFIRMATION BLOCKED: Reed confirmation is required first. Please click [ ALLOCATE REED ] and select a physical Reed from stock.');
      return;
    }

    if (!isBeamConfirmed) {
      setErrorMsg('❌ LOOM CONFIRMATION BLOCKED: Beam confirmation is required first. Please click [ ALLOCATE BEAM ] and select a physical Beam from stock.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/planning/next-plan/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loomNo: plan.loom_no,
          nextDesign: plan.next_design,
          orderNo: plan.order_no,
          reedId: plan.reserved_reed_id,
          beamId: plan.reserved_beam_id,
          startDate: plan.planned_start_date,
          remarks: 'Loom Confirmed & Ready for Main Entry',
          plannerName: user?.username || 'Confirmation User'
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMsg(`🚀 LOOM CONFIRMED for Loom ${plan.loom_no}! Transferring to Main Entry...`);
        await refreshData();
        await fetchAssignments();
        setTimeout(() => setSuccessMsg(null), 3000);
        handleGoToMainEntry(plan);
      } else {
        setErrorMsg(data.error || 'Failed to confirm loom.');
      }
    } catch (err: any) {
      setErrorMsg('Error confirming loom: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Navigate to Main Entry with Pre-filled State
  const handleGoToMainEntry = (plan: PlannedAssignment) => {
    navigate('/entry', {
      state: {
        loomNo: plan.loom_no,
        designNo: plan.next_design,
        reedNo: plan.reserved_reed_no || '',
        beamNo: plan.reserved_beam_no || '',
        orderNo: plan.order_no || '',
        plannedStartDate: plan.planned_start_date
      }
    });
  };

  // Decline Plan Action
  const handleDeclinePlan = async () => {
    if (!declineModalPlan) return;
    if (!declineRemark.trim()) {
      alert('Mandatory remark is required for declining / requesting a change!');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/planning/next-plan/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: declineModalPlan.id,
          remark: declineRemark,
          user: user?.username || 'Confirmation User'
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMsg(`⚠️ Loom Plan #${declineModalPlan.id} DECLINED! Reserved reed & beam released to stock.`);
        setDeclineModalPlan(null);
        setSelectedPlanForReview(null);
        setDeclineRemark('');
        await refreshData();
        await fetchAssignments();
        setTimeout(() => setSuccessMsg(null), 5000);
      } else {
        setErrorMsg(data.error || 'Failed to decline plan.');
      }
    } catch (err: any) {
      setErrorMsg('Error declining plan: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const isLoomRunning = (loomNo: number | string) => {
    const num = Number(String(loomNo).replace(/\D/g, ''));
    if (!num) return false;
    const activeObj = (activeRuns as any)[num] || (activeRuns as any)[String(num)] || (activeRuns as any)[`L-${num}`] || Object.values(activeRuns as any[]).find((r: any) => Number(r.loomNo || r.loom_no) === num);
    return Boolean(activeObj && ((activeObj as any).designNo || (activeObj as any).design_no_sp_no));
  };

  const filteredData = assignments.filter(d => {
    // Hide cancelled or completed plans
    if (
      d.status === 'CANCELLED' || 
      d.status === 'COMPLETED' || 
      d.confirmation_status === 'CANCELLED' || 
      d.confirmation_status === 'COMPLETED'
    ) {
      return false;
    }
    // Hide plans that are already confirmed and running in Main Entry (page is dedicated to beam allocation and pending plans)
    if (
      d.readiness_status === 'RUNNING IN MAIN ENTRY' ||
      d.status === 'CONFIRMED' ||
      d.status === 'COMPLETED' ||
      d.confirmation_status === 'CONFIRMED' ||
      d.confirmation_status === 'COMPLETED' ||
      d.confirmation_status === 'LOOM CONFIRMED'
    ) {
      return false;
    }

    // If this loom is already actively running this exact design in Main Entry, hide it (it was already confirmed and running)
    const runningRun = (activeRuns as any)[d.loom_no];
    const runningDesign = runningRun ? (runningRun.designNo || runningRun.design_no_sp_no || '').trim().toLowerCase() : '';
    const planDesign = (d.next_design || '').trim().toLowerCase();
    if (runningDesign && planDesign && runningDesign === planDesign) {
      return false;
    }
    const q = (searchTerm || '').trim().toLowerCase();
    if (!q) return true;
    return (
      d.loom_no.toString().includes(q) ||
      (d.next_design && d.next_design.toLowerCase().includes(q)) ||
      (d.current_design && d.current_design.toLowerCase().includes(q)) ||
      (d.order_no && d.order_no.toLowerCase().includes(q)) ||
      (d.customer_name && d.customer_name.toLowerCase().includes(q)) ||
      (d.reserved_reed_no && d.reserved_reed_no.toLowerCase().includes(q)) ||
      (d.reserved_beam_no && d.reserved_beam_no.toLowerCase().includes(q)) ||
      (d.reserved_set_no && d.reserved_set_no.toLowerCase().includes(q)) ||
      (d.status && d.status.toLowerCase().includes(q)) ||
      ((d as any).readiness_status && String((d as any).readiness_status).toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6 flex flex-col h-full bg-slate-50/70 p-4 font-sans">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-industrial-900 flex items-center">
            <ListTodo className="w-6 h-6 mr-3 text-blue-600" /> NEXT PLANNED LOOMS & REED / BEAM CONFIRMATION CONTROL
          </h1>
          <p className="text-industrial-500 text-sm mt-1">
            2-Step Confirmation Workflow: <strong>NEXT PLANNED LOOM → REED CONFIRMATION → BEAM CONFIRMATION → LOOM CONFIRMATION → GO TO MAIN ENTRY</strong>
          </p>
        </div>

        <button
          onClick={async () => {
            setIsLoading(true);
            await refreshData();
            await fetchAssignments();
            setIsLoading(false);
          }}
          className="flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-md transition-all"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-refresh-spin' : ''}`} /> Refresh Plans
        </button>
      </div>

      {/* Alert Messages */}
      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl flex items-center justify-between shadow-sm">
          <div className="flex items-center space-x-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <span className="font-bold text-xs">{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-900 rounded-xl flex items-center justify-between shadow-sm">
          <div className="flex items-center space-x-3">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <span className="font-bold text-xs">{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
        </div>
      )}

      {/* Main Table Container */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col flex-1">
        
        {/* Table Top Controls */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap justify-between items-center gap-4">
          <div className="relative w-80">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by Loom, IBPO, Design, Reed or Beam..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div className="flex items-center space-x-4 text-xs">
            <span className="font-bold text-slate-600">Total Next Plans: <strong className="text-blue-600 font-black">{filteredData.length}</strong></span>
          </div>
        </div>

        {/* Planned Looms Table */}
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse whitespace-nowrap text-xs">
            <thead>
              <tr className="bg-slate-900 text-white uppercase text-[10px] font-black border-b border-slate-800">
                <th className="p-3 text-center">S.No</th>
                <th className="p-3">Loom No</th>
                <th className="p-3">Order / IBPO</th>
                <th className="p-3 text-blue-300">Next Design</th>
                <th className="p-3">Construction</th>
                <th className="p-3">Reed / Pick</th>
                <th className="p-3">Greige Width</th>
                <th className="p-3">Expected Start Date</th>
                <th className="p-3 text-amber-300">Allocated Reed</th>
                <th className="p-3 text-emerald-300">Allocated Beam</th>
                <th className="p-3">Reed Status</th>
                <th className="p-3">Beam Status</th>
                <th className="p-3">Plan Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {isLoading ? (
                <tr>
                  <td colSpan={14} className="p-12 text-center text-slate-400 font-medium">
                    Loading planned looms...
                  </td>
                </tr>
              ) : filteredData.length === 0 ? (
                <tr>
                  <td colSpan={14} className="p-12 text-center text-slate-400 font-medium">
                    No active proposed next plans found. Assign a loom in <strong>Loom Planning Setup</strong>.
                  </td>
                </tr>
              ) : (
                filteredData.map((row, idx) => {
                  const cleanDesign = (row.next_design || '').trim().toLowerCase();
                  const cleanOrder = (row.order_no || '').trim().toLowerCase();
                  const designMaster = designs.find(d => (d.design_no_sp_no || d.designNo || '').trim().toLowerCase() === cleanDesign);
                  const orderMaster = orders.find(o => 
                    (o.ibpo_no || '').trim().toLowerCase() === cleanOrder ||
                    (o.order_no || '').trim().toLowerCase() === cleanOrder ||
                    (o.design_no_sp_no || '').trim().toLowerCase() === cleanDesign
                  );

                  const isChangeRequested = row.status === 'CHANGE_REQUESTED';
                  const isReedConfirmed = row.reserved_reed_id !== null || !!row.reserved_reed_no || row.reed_status === 'REED ALLOCATED';
                  const isBeamConfirmed = row.reserved_beam_id !== null || row.beam_status === 'BEAM ALLOCATED' || row.status === 'CONFIRMED';
                  const isLoomConfirmed = row.confirmation_status === 'LOOM CONFIRMED' || row.status === 'CONFIRMED';

                  const resolvedReed = designMaster?.reedCount || designMaster?.reed_count || orderMaster?.reed_count || orderMaster?.reedCount || '—';
                  const resolvedPick = designMaster?.pick || (orderMaster?.ppi !== undefined && orderMaster?.ppi !== null && orderMaster?.ppi !== '' ? String(orderMaster.ppi) : '') || orderMaster?.pick || '—';

                  // Matching beam stock check
                  const matchingBeams = beams.filter(b => {
                    const bDesign = (b.design_no || b.designNo || '').trim().toLowerCase();
                    const bParty = (b.party_beam_no || b.ibpo || b.order_no || '').trim().toLowerCase();
                    const isMatch = (bDesign && cleanDesign && (bDesign === cleanDesign || bDesign.includes(cleanDesign) || cleanDesign.includes(bDesign))) ||
                                    (bParty && cleanOrder && (bParty === cleanOrder || bParty.includes(cleanOrder) || cleanOrder.includes(bParty))) ||
                                    (bDesign && cleanOrder && (bDesign === cleanOrder || bDesign.includes(cleanOrder) || cleanOrder.includes(bDesign))) ||
                                    (bParty && cleanDesign && (bParty === cleanDesign || bParty.includes(cleanDesign) || cleanDesign.includes(bParty)));
                    const st = (b.status || '').trim().toUpperCase();
                    const isRunningOnLoom = b.loom_no_assigned && activeRuns[b.loom_no_assigned]?.currentBeamNo === b.beam_no;
                    const isAvail = (st === 'AVAILABLE' || st === 'READY' || st === 'CUT BEAM' || st === '') &&
                                    !isRunningOnLoom &&
                                    Number(b.available_meter || b.current_balance_meter || b.total_warped_meter || (b as any).warp_meter || 0) > 0;
                    return isMatch && isAvail;
                  });
                  const hasBeamStock = matchingBeams.length > 0;

                  // Matching reed stock check
                  const matchingReeds = (reeds || []).filter(r => {
                    const rCount = (r.reed_count || r.reedCount || '').trim().toLowerCase();
                    const reqCount = resolvedReed.trim().toLowerCase();
                    const isMatch = !reqCount || reqCount === '—' || rCount === reqCount || rCount.includes(reqCount);
                    return isMatch && (r.available_qty > 0 || r.status === 'Available');
                  });
                  const hasReedStock = matchingReeds.length > 0;

                  // Resolve Greige Width with fallbacks
                  let resolvedWidth = designMaster?.greigeWidth || designMaster?.greige_width || orderMaster?.greige_width || orderMaster?.width || orderMaster?.required_reed_space || designMaster?.reedSpace || '';
                  if (!resolvedWidth) {
                    const constr = designMaster?.construction || orderMaster?.construction || '';
                    if (constr) {
                      const m = constr.match(/(\d+(?:\.\d+)?)(?:\"|in|inch|\s*in)?$/i);
                      if (m) resolvedWidth = m[1];
                    }
                  }

                  return (
                    <tr key={row.id} className={`hover:bg-slate-50 transition-colors ${isChangeRequested ? 'bg-amber-50/60' : ''}`}>
                      <td className="p-3 text-center text-slate-400 font-mono font-bold">{idx + 1}</td>

                      <td className="p-3 font-black text-slate-900">
                        <span className="px-2.5 py-1 bg-blue-50 text-blue-900 border border-blue-200 rounded-lg font-mono text-xs">
                          Loom {row.loom_no}
                        </span>
                      </td>

                      <td className="p-3 font-bold text-slate-900">{row.order_no || '—'}</td>

                      <td className="p-3 font-black text-blue-700">{row.next_design}</td>

                      <td className="p-3 text-slate-600 font-medium">{designMaster?.construction || orderMaster?.construction || '—'}</td>

                      <td className="p-3 text-slate-600 font-medium">
                        {resolvedReed} / {resolvedPick}
                      </td>

                      <td className="p-3 text-slate-600 font-medium">{resolvedWidth || '—'}</td>

                      <td className="p-3 font-bold text-slate-800">
                        {row.planned_start_date ? format(new Date(row.planned_start_date), 'dd-MM-yyyy') : '—'}
                      </td>

                      {/* Allocated Reed */}
                      <td className="p-3 font-black text-amber-800">
                        {row.reserved_reed_no ? (
                          <span className="px-2 py-1 bg-amber-50 text-amber-900 border border-amber-200 rounded-md">
                            Reed #{row.reserved_reed_no}
                          </span>
                        ) : hasReedStock ? (
                          <span className="text-amber-700 font-bold">Reed #{matchingReeds[0].reed_no || matchingReeds[0].id} Available</span>
                        ) : (
                          <span className="text-slate-400 font-semibold">0 Reeds Ready</span>
                        )}
                      </td>

                      {/* Allocated Beam */}
                      <td className="p-3 font-black text-emerald-800">
                        {row.reserved_beam_no ? (
                          <span className="px-2 py-1 bg-emerald-50 text-emerald-900 border border-emerald-200 rounded-md">
                            Beam #{row.reserved_beam_no}
                          </span>
                        ) : hasBeamStock ? (
                          <span className="text-emerald-700 font-bold">Beam #{matchingBeams[0].beam_no} Ready</span>
                        ) : (
                          <span className="text-amber-600 font-semibold">0 Beams Available</span>
                        )}
                      </td>

                      {/* Reed Status */}
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase border ${
                          isReedConfirmed ? 'bg-amber-100 text-amber-900 border-amber-300' :
                          hasReedStock ? 'bg-blue-100 text-blue-900 border-blue-300' :
                          'bg-red-100 text-red-900 border-red-300'
                        }`}>
                          {isReedConfirmed ? 'REED ALLOCATED' : (hasReedStock ? 'REED AVAILABLE' : 'REED REQUIRED')}
                        </span>
                      </td>

                      {/* Beam Status */}
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase border ${
                          isBeamConfirmed ? 'bg-emerald-100 text-emerald-900 border-emerald-300' :
                          hasBeamStock ? 'bg-blue-100 text-blue-900 border-blue-300' :
                          'bg-amber-100 text-amber-900 border-amber-300'
                        }`}>
                          {isBeamConfirmed ? 'BEAM ALLOCATED' : (hasBeamStock ? 'BEAM AVAILABLE' : 'BEAM PENDING')}
                        </span>
                      </td>

                      {/* Plan Status */}
                      <td className="p-3 font-bold">
                        <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase ${
                          isLoomConfirmed ? 'bg-emerald-100 text-emerald-900' : isChangeRequested ? 'bg-red-100 text-red-900' : 'bg-blue-100 text-blue-900'
                        }`}>
                          {isLoomConfirmed ? 'LOOM CONFIRMED' : (isChangeRequested ? 'CHANGE REQUESTED' : 'PLANNED')}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => setSelectedPlanForReview(row)}
                            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg font-bold text-xs flex items-center transition-all"
                            title="View Available Stocks"
                          >
                            <Eye className="w-3.5 h-3.5 mr-1" /> VIEW
                          </button>

                          {/* Delete Plan Button */}
                          <button
                            onClick={() => handleDeletePlan(row)}
                            className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg font-bold text-xs flex items-center transition-all"
                            title="Delete this planned assignment"
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-1" /> DELETE
                          </button>

                          {/* Allocate Reed Button */}
                          <button
                            onClick={() => handleOpenConfirmReedModal(row)}
                            className={`px-3 py-1.5 rounded-lg font-bold text-xs shadow-sm flex items-center transition-all ${
                              isReedConfirmed
                                ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300'
                                : 'bg-amber-600 hover:bg-amber-700 text-white'
                            }`}
                          >
                            <Layers className="w-3.5 h-3.5 mr-1" /> {isReedConfirmed ? 'CHANGE REED' : 'ALLOCATE REED'}
                          </button>

                          {/* Allocate Beam Button */}
                          <button
                            onClick={() => handleOpenConfirmBeamModal(row)}
                            className={`px-3 py-1.5 rounded-lg font-bold text-xs shadow-sm flex items-center transition-all ${
                              isBeamConfirmed
                                ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border border-emerald-300'
                                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                            }`}
                          >
                            <ShieldCheck className="w-3.5 h-3.5 mr-1" /> {isBeamConfirmed ? 'CHANGE BEAM' : 'ALLOCATE BEAM'}
                          </button>

                          {/* Confirm Loom Button */}
                          {!isLoomConfirmed ? (
                            <button
                              onClick={() => handleConfirmLoom(row)}
                              className={`px-3 py-1.5 rounded-lg font-bold text-xs shadow-sm flex items-center transition-all ${
                                isReedConfirmed && isBeamConfirmed
                                  ? 'bg-blue-600 hover:bg-blue-700 text-white ring-2 ring-blue-400/50'
                                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                              }`}
                              title={!isReedConfirmed ? 'Reed allocation required first' : (!isBeamConfirmed ? 'Beam allocation required first' : 'Confirm Loom Plan')}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> CONFIRM LOOM
                            </button>
                          ) : (
                            <button
                              onClick={() => handleGoToMainEntry(row)}
                              className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-black text-xs shadow-md flex items-center transition-all"
                            >
                              <ExternalLink className="w-3.5 h-3.5 mr-1" /> GO TO MAIN ENTRY
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* INTERACTIVE REED SELECTION & CONFIRMATION MODAL */}
      {confirmReedModalPlan && (() => {
        const cleanModalDesign = (confirmReedModalPlan.next_design || '').trim().toLowerCase();
        const cleanModalOrder = (confirmReedModalPlan.order_no || '').trim().toLowerCase();

        const designMaster = designs.find(d => (d.design_no_sp_no || d.designNo || '').trim().toLowerCase() === cleanModalDesign);
        const orderMaster = orders.find(o => 
          (o.ibpo_no || '').trim().toLowerCase() === cleanModalOrder ||
          (o.order_no || '').trim().toLowerCase() === cleanModalOrder ||
          (o.design_no_sp_no || '').trim().toLowerCase() === cleanModalDesign
        );

        const modalReedCount = designMaster?.reedCount || designMaster?.reed_count || orderMaster?.reed_count || orderMaster?.reedCount || '—';
        const modalReedSpace = designMaster?.reedSpace || designMaster?.reed_space_warp_width || orderMaster?.greige_width || '—';

        // Filter Reeds from Stock
        const allReeds = (reeds || []).map(r => ({
          ...r,
          count: r.reed_count || r.reedCount || '—',
          space: r.reed_space || r.reed_width || '—',
          availQty: r.available_qty ?? r.availableQty ?? 1,
          resQty: r.reserved_qty ?? r.reservedQty ?? 0,
          runQty: r.running_qty ?? r.runningQty ?? 0
        }));

        const availableReeds = allReeds.filter(r => r.availQty > 0 || r.status === 'Available');

        const matchReedSearch = (r: any) => {
          const q = (reedSearchTerm || '').trim().toLowerCase();
          if (!q) return true;
          return (
            (r.reed_no || '').toLowerCase().includes(q) ||
            (r.count || '').toLowerCase().includes(q) ||
            (r.location || '').toLowerCase().includes(q) ||
            (r.vendor || r.make_vendor || '').toLowerCase().includes(q) ||
            (r.status || '').toLowerCase().includes(q)
          );
        };

        const compatibleReeds = availableReeds.filter(r => {
          const matchCount = !modalReedCount || modalReedCount === '—' || (r.count && r.count.trim().toLowerCase() === modalReedCount.trim().toLowerCase());
          return matchCount && matchReedSearch(r);
        });

        const displayedReedsInTable = reedFilterTab === 'COMPATIBLE' ? compatibleReeds : availableReeds.filter(r => matchReedSearch(r));

        const chosenReedObject = reeds.find(r => r.id === selectedReedForConfirmation);

        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-4xl my-6 overflow-hidden flex flex-col max-h-[90vh]">
              
              {/* Header */}
              <div className="p-4 bg-slate-900 text-white flex justify-between items-center shrink-0">
                <h3 className="font-bold text-sm flex items-center">
                  <Layers className="w-5 h-5 mr-2 text-amber-400" /> REED SELECTION & CONFIRMATION — LOOM {confirmReedModalPlan.loom_no}
                </h3>
                <button onClick={() => setConfirmReedModalPlan(null)} className="text-slate-400 hover:text-white font-bold text-base">✕</button>
              </div>

              <div className="p-5 space-y-4 text-xs overflow-y-auto flex-1 custom-scrollbar">
                
                {/* Specification Header */}
                <div className="p-4 bg-amber-50/50 rounded-xl border border-amber-200 space-y-2">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center border-b border-amber-200 pb-2">
                    <div><span className="text-[10px] text-slate-400 font-bold block uppercase">IBPO / ORDER</span><strong className="text-blue-900 text-xs block">{confirmReedModalPlan.order_no || '—'}</strong></div>
                    <div><span className="text-[10px] text-slate-400 font-bold block uppercase">DESIGN NO</span><strong className="text-slate-900 text-xs block">{confirmReedModalPlan.next_design}</strong></div>
                    <div><span className="text-[10px] text-slate-400 font-bold block uppercase">TARGET LOOM</span><strong className="text-slate-900 text-xs block">Loom {confirmReedModalPlan.loom_no}</strong></div>
                    <div><span className="text-[10px] text-slate-400 font-bold block uppercase">REQUIRED REED COUNT</span><strong className="text-amber-800 text-xs font-black block">{modalReedCount}</strong></div>
                  </div>
                </div>

                {/* Filter Tabs & Search */}
                <div className="flex flex-wrap justify-between items-center gap-3 pt-2">
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setReedFilterTab('COMPATIBLE')}
                      className={`px-3 py-1.5 rounded-lg font-bold text-xs border transition-all ${
                        reedFilterTab === 'COMPATIBLE'
                          ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      Compatible Reeds ({compatibleReeds.length})
                    </button>
                    <button
                      onClick={() => setReedFilterTab('ALL_AVAILABLE')}
                      className={`px-3 py-1.5 rounded-lg font-bold text-xs border transition-all ${
                        reedFilterTab === 'ALL_AVAILABLE'
                          ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      All Stock Reeds ({availableReeds.length})
                    </button>
                  </div>

                  <div className="relative w-64">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search Reed No, Count, Location..."
                      value={reedSearchTerm}
                      onChange={e => setReedSearchTerm(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-amber-500/20"
                    />
                  </div>
                </div>

                {/* Reed Stock Selection Table */}
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-inner max-h-64 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 border-b border-slate-200">
                      <tr>
                        <th className="p-2.5 text-center w-12">Select</th>
                        <th className="p-2.5">Reed No</th>
                        <th className="p-2.5">Reed Count</th>
                        <th className="p-2.5 text-center">Available Stock</th>
                        <th className="p-2.5 text-center">Reserved</th>
                        <th className="p-2.5 text-center">Running</th>
                        <th className="p-2.5">Location / Maker</th>
                        <th className="p-2.5 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {displayedReedsInTable.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="p-6 text-center text-slate-400 font-bold">
                            No matching reeds available in stock. Check Reed Stock master.
                          </td>
                        </tr>
                      ) : (
                        displayedReedsInTable.map(r => {
                          const isSelected = selectedReedForConfirmation === r.id;
                          return (
                            <tr
                              key={r.id}
                              onClick={() => setSelectedReedForConfirmation(r.id)}
                              className={`cursor-pointer transition-colors ${
                                isSelected ? 'bg-amber-100/70 border-l-4 border-l-amber-600' : 'hover:bg-slate-50'
                              }`}
                            >
                              <td className="p-2.5 text-center">
                                <input
                                  type="radio"
                                  name="selectedReed"
                                  checked={isSelected}
                                  onChange={() => setSelectedReedForConfirmation(r.id)}
                                  className="w-4 h-4 text-amber-600 focus:ring-amber-500 cursor-pointer accent-amber-600"
                                />
                              </td>
                              <td className="p-2.5 font-black text-slate-900">RD #{r.reed_no || r.id}</td>
                              <td className="p-2.5 font-bold text-amber-800">{r.count}</td>
                              <td className="p-2.5 text-center font-black text-emerald-600 bg-emerald-50/50">{r.availQty} Units</td>
                              <td className="p-2.5 text-center font-bold text-amber-700">{r.resQty}</td>
                              <td className="p-2.5 text-center font-bold text-blue-700">{r.runQty}</td>
                              <td className="p-2.5 text-slate-600">{r.location || r.vendor || 'Factory Main'}</td>
                              <td className="p-2.5 text-center">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                                  r.availQty > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                                }`}>
                                  {r.availQty > 0 ? 'AVAILABLE' : r.status}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Selected Summary Callout */}
                {chosenReedObject && (
                  <div className="p-3 bg-amber-100/80 border border-amber-300 rounded-xl flex items-center justify-between text-amber-950 font-bold">
                    <span>
                      Selected: Reed <strong className="text-amber-900 font-black">#{chosenReedObject.reed_no}</strong> ({chosenReedObject.reed_count}) — 1 Unit will be deducted from Available Stock.
                    </span>
                    <Check className="w-5 h-5 text-amber-700" />
                  </div>
                )}
              </div>

              {/* Footer Buttons */}
              <div className="p-4 bg-slate-100 border-t border-slate-200 flex justify-end space-x-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setConfirmReedModalPlan(null)}
                  className="px-4 py-2 bg-slate-200 text-slate-700 font-bold rounded-xl text-xs hover:bg-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!selectedReedForConfirmation || isLoading}
                  onClick={() => handleConfirmReed(confirmReedModalPlan)}
                  className="px-6 py-2 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs rounded-xl shadow-md disabled:opacity-40 flex items-center"
                >
                  <ShieldCheck className="w-4 h-4 mr-1.5" /> CONFIRM REED ALLOCATION
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* INTERACTIVE BEAM SELECTION & CONFIRMATION MODAL */}
      {confirmBeamModalPlan && (() => {
        const cleanModalDesign = (confirmBeamModalPlan.next_design || '').trim().toLowerCase();
        const cleanModalOrder = (confirmBeamModalPlan.order_no || '').trim().toLowerCase();

        const designMaster = designs.find(d => (d.design_no_sp_no || d.designNo || '').trim().toLowerCase() === cleanModalDesign);
        const orderMaster = orders.find(o => 
          (o.ibpo_no || '').trim().toLowerCase() === cleanModalOrder ||
          (o.order_no || '').trim().toLowerCase() === cleanModalOrder ||
          (o.design_no_sp_no || '').trim().toLowerCase() === cleanModalDesign
        );

        let modalWidth = designMaster?.greigeWidth || designMaster?.greige_width || orderMaster?.greige_width || orderMaster?.width || orderMaster?.required_reed_space || designMaster?.reedSpace || '';
        if (!modalWidth) {
          const constr = designMaster?.construction || orderMaster?.construction || '';
          if (constr) {
            const m = constr.match(/(\d+(?:\.\d+)?)(?:\"|in|inch|\s*in)?$/i);
            if (m) modalWidth = m[1];
          }
        }

        const modalReed = designMaster?.reedCount || designMaster?.reed_count || orderMaster?.reed_count || orderMaster?.reedCount || '—';
        const modalPick = designMaster?.pick || (orderMaster?.ppi !== undefined && orderMaster?.ppi !== null && orderMaster?.ppi !== '' ? String(orderMaster.ppi) : '') || orderMaster?.pick || '—';

        // Check if a beam record matches current modal plan
        const checkModalBeamMatch = (b: any) => {
          const bDesign = (b.design_no || b.designNo || '').trim().toLowerCase();
          const bParty = (b.party_beam_no || b.ibpo || b.order_no || '').trim().toLowerCase();
          return (bDesign && cleanModalDesign && (bDesign === cleanModalDesign || bDesign.includes(cleanModalDesign) || cleanModalDesign.includes(bDesign))) ||
                 (bParty && cleanModalOrder && (bParty === cleanModalOrder || bParty.includes(cleanModalOrder) || cleanModalOrder.includes(bParty))) ||
                 (bDesign && cleanModalOrder && (bDesign === cleanModalOrder || bDesign.includes(cleanModalOrder) || cleanModalOrder.includes(bDesign))) ||
                 (bParty && cleanModalDesign && (bParty === cleanModalDesign || bParty.includes(cleanModalDesign) || cleanModalDesign.includes(bParty)));
        };

        const isModalBeamAvailable = (b: any) => {
          // If this beam is already reserved for this specific plan, keep it selectable
          if (confirmBeamModalPlan.reserved_beam_id && confirmBeamModalPlan.reserved_beam_id === b.id) {
            return true;
          }
          if (confirmBeamModalPlan.reserved_beam_no && (b.beam_no === confirmBeamModalPlan.reserved_beam_no)) {
            return true;
          }

          const st = (b.status || '').trim().toUpperCase();
          // Never consider Running, In Use, Completed, Reserved or Allocated beams as available
          if (st === 'RUNNING' || st === 'IN USE' || st === 'COMPLETED' || st === 'RESERVED' || st === 'ALLOCATED') {
            return false;
          }

          // If assigned to any loom, verify against actual running status
          if (b.loom_no_assigned && Number(b.loom_no_assigned) > 0) {
            const isActuallyRunning = activeRuns[b.loom_no_assigned]?.currentBeamNo === b.beam_no;
            if (isActuallyRunning) return false;
          }

          // Check against active running looms
          const isCurrentlyRunningOnLoom = Object.values(activeRuns || {}).some((r: any) => {
            if (!r || !r.designNo || r.designNo === '—') return false;
            return (r.beamId && r.beamId === b.id) || (r.currentBeamNo && r.currentBeamNo === b.beam_no);
          });
          if (isCurrentlyRunningOnLoom) {
            return false;
          }

          // Must have available warp meters
          const meter = Number(b.available_meter || b.current_balance_meter || b.beam_length || b.total_warped_meter || (b as any).warp_meter || 0);
          if (meter <= 0) {
            return false;
          }

          return st === 'AVAILABLE' || st === 'READY' || st === 'CUT BEAM' || st === '';
        };

        // System suggested beam
        const suggestedBeam = beams.find(b => checkModalBeamMatch(b) && isModalBeamAvailable(b));

        // Filter physical beams
        const allAvailableBeams = beams.filter(b => isModalBeamAvailable(b));
        
        const matchBeamSearch = (b: any) => {
          const q = (beamSearchTerm || '').trim().toLowerCase();
          if (!q) return true;
          return (
            (b.beam_no || '').toLowerCase().includes(q) ||
            (b.design_no || '').toLowerCase().includes(q) ||
            (b.party_beam_no || '').toLowerCase().includes(q) ||
            ((b.set_no || '')).toString().toLowerCase().includes(q) ||
            ((b.order_no || b.ibpo || '')).toString().toLowerCase().includes(q) ||
            (b.customer || '').toLowerCase().includes(q) ||
            (b.vendor_name || b.party || '').toLowerCase().includes(q) ||
            (b.beam_type || '').toLowerCase().includes(q)
          );
        };

        const compatibleBeams = allAvailableBeams.filter(b => {
          const matchDesign = checkModalBeamMatch(b);
          return matchDesign && matchBeamSearch(b);
        });

        const incompatibleBeams = allAvailableBeams.filter(b => {
          const matchDesign = checkModalBeamMatch(b);
          return !matchDesign && matchBeamSearch(b);
        });

        const displayedBeamsInTable = beamFilterTab === 'COMPATIBLE' ? compatibleBeams : (beamFilterTab === 'ALL_AVAILABLE' ? allAvailableBeams : incompatibleBeams);

        const chosenBeamObject = beams.find(b => b.id === selectedBeamForConfirmation);

        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-4xl my-6 overflow-hidden flex flex-col max-h-[90vh]">
              
              {/* Header */}
              <div className="p-4 bg-slate-900 text-white flex justify-between items-center shrink-0">
                <h3 className="font-bold text-sm flex items-center">
                  <ShieldCheck className="w-5 h-5 mr-2 text-emerald-400" /> BEAM SELECTION & CONFIRMATION — LOOM {confirmBeamModalPlan.loom_no}
                </h3>
                <button onClick={() => setConfirmBeamModalPlan(null)} className="text-slate-400 hover:text-white font-bold text-base">✕</button>
              </div>

              <div className="p-5 space-y-4 text-xs overflow-y-auto flex-1 custom-scrollbar">
                
                {/* Loom Plan Specification Header */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center border-b border-slate-200 pb-2">
                    <div><span className="text-[10px] text-slate-400 font-bold block uppercase">IBPO / ORDER</span><strong className="text-blue-900 text-xs block">{confirmBeamModalPlan.order_no || '—'}</strong></div>
                    <div><span className="text-[10px] text-slate-400 font-bold block uppercase">DESIGN NO</span><strong className="text-slate-900 text-xs block">{confirmBeamModalPlan.next_design}</strong></div>
                    <div><span className="text-[10px] text-slate-400 font-bold block uppercase">TARGET LOOM</span><strong className="text-slate-900 text-xs block">Loom {confirmBeamModalPlan.loom_no}</strong></div>
                    <div><span className="text-[10px] text-slate-400 font-bold block uppercase">EXPECTED START</span><strong className="text-slate-900 text-xs block">{confirmBeamModalPlan.planned_start_date ? format(new Date(confirmBeamModalPlan.planned_start_date), 'dd-MM-yyyy') : '—'}</strong></div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center pt-1 text-[11px] text-slate-600 font-semibold">
                    <div>Construction: <strong>{designMaster?.construction || orderMaster?.construction || '—'}</strong></div>
                    <div>Reed/Pick: <strong>{modalReed} / {modalPick}</strong></div>
                    <div>Greige Width: <strong>{modalWidth || '—'}</strong></div>
                    <div>Required Beams: <strong>1</strong></div>
                  </div>
                </div>

                {/* System Recommendation Callout */}
                {suggestedBeam ? (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span className="font-bold text-emerald-950">
                        System Recommendation: Physical Beam <strong className="text-emerald-700">#{suggestedBeam.beam_no}</strong> (Warp: {suggestedBeam.available_meter || 5000} M) is available.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedBeamForConfirmation(suggestedBeam.id)}
                      className="px-3 py-1 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700"
                    >
                      Use Recommended Beam
                    </button>
                  </div>
                ) : (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center space-x-2 text-amber-900 font-semibold">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>No exact matching pre-prepared beam found for Design "{confirmBeamModalPlan.next_design}". You can select any ready available beam below.</span>
                  </div>
                )}

                {/* Filter Tabs & Search */}
                <div className="flex flex-wrap justify-between items-center gap-3 pt-2">
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setBeamFilterTab('COMPATIBLE')}
                      className={`px-3 py-1.5 rounded-lg font-bold text-xs border transition-all ${
                        beamFilterTab === 'COMPATIBLE'
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      Compatible Beams ({compatibleBeams.length})
                    </button>
                    <button
                      onClick={() => setBeamFilterTab('ALL_AVAILABLE')}
                      className={`px-3 py-1.5 rounded-lg font-bold text-xs border transition-all ${
                        beamFilterTab === 'ALL_AVAILABLE'
                          ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      All Available Stock ({allAvailableBeams.length})
                    </button>
                  </div>

                  <div className="relative w-64">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search Beam No, Party, Vendor..."
                      value={beamSearchTerm}
                      onChange={e => setBeamSearchTerm(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>
                </div>

                {/* Stock Selection Table */}
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-inner max-h-64 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 border-b border-slate-200">
                      <tr>
                        <th className="p-2.5 text-center w-12">Select</th>
                        <th className="p-2.5">Beam No</th>
                        <th className="p-2.5">Set / DC No</th>
                        <th className="p-2.5">Design / Order</th>
                        <th className="p-2.5 text-right">Available Warp (M)</th>
                        <th className="p-2.5">Vendor / Party</th>
                        <th className="p-2.5 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {displayedBeamsInTable.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-6 text-center text-slate-400 font-bold">
                            No matching beams found in Beam Stock.
                          </td>
                        </tr>
                      ) : (
                        displayedBeamsInTable.map(b => {
                          const isSelected = selectedBeamForConfirmation === b.id;
                          return (
                            <tr
                              key={b.id}
                              onClick={() => setSelectedBeamForConfirmation(b.id)}
                              className={`cursor-pointer transition-colors ${
                                isSelected ? 'bg-emerald-100/70 border-l-4 border-l-emerald-600' : 'hover:bg-slate-50'
                              }`}
                            >
                              <td className="p-2.5 text-center">
                                <input
                                  type="radio"
                                  name="selectedBeam"
                                  checked={isSelected}
                                  onChange={() => setSelectedBeamForConfirmation(b.id)}
                                  className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 cursor-pointer accent-emerald-600"
                                />
                              </td>
                              <td className="p-2.5 font-black text-slate-900">Beam #{b.beam_no}</td>
                              <td className="p-2.5 text-slate-600">{b.set_no || b.warp_dc_no || 'N/A'}</td>
                              <td className="p-2.5 font-bold text-blue-900">{b.design_no || b.order_no || 'Standard'}</td>
                              <td className="p-2.5 text-right font-black text-emerald-700">{b.available_meter || b.beam_length || 5000} M</td>
                              <td className="p-2.5 text-slate-600">{b.vendor_name || b.party || 'Internal'}</td>
                              <td className="p-2.5 text-center">
                                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[10px] font-black uppercase">
                                  {b.status || 'AVAILABLE'}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Selected Summary Callout */}
                {chosenBeamObject && (
                  <div className="p-3 bg-emerald-100/80 border border-emerald-300 rounded-xl flex items-center justify-between text-emerald-950 font-bold">
                    <span>
                      Selected: Beam <strong className="text-emerald-900 font-black">#{chosenBeamObject.beam_no}</strong> (Warp: {chosenBeamObject.available_meter || 5000} M) — Ready to assign to Loom {confirmBeamModalPlan.loom_no}.
                    </span>
                    <Check className="w-5 h-5 text-emerald-700" />
                  </div>
                )}
              </div>

              {/* Footer Buttons */}
              <div className="p-4 bg-slate-100 border-t border-slate-200 flex justify-end space-x-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setConfirmBeamModalPlan(null)}
                  className="px-4 py-2 bg-slate-200 text-slate-700 font-bold rounded-xl text-xs hover:bg-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!selectedBeamForConfirmation || isLoading}
                  onClick={() => handleConfirmBeam(confirmBeamModalPlan)}
                  className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-md disabled:opacity-40 flex items-center"
                >
                  <ShieldCheck className="w-4 h-4 mr-1.5" /> CONFIRM BEAM ALLOCATION
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* VIEW BEAMS MODAL */}
      {selectedPlanForReview && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-3xl overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
              <h3 className="font-bold text-base flex items-center">
                <Sparkles className="w-5 h-5 mr-2 text-blue-400" /> Selection Panel — Loom {selectedPlanForReview.loom_no}
              </h3>
              <button onClick={() => setSelectedPlanForReview(null)} className="text-slate-400 hover:text-white font-bold">✕</button>
            </div>

            <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-3 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                <div>Order / IBPO: <strong className="text-blue-900">{selectedPlanForReview.order_no}</strong></div>
                <div>Design: <strong className="text-slate-900">{selectedPlanForReview.next_design}</strong></div>
                <div>Loom: <strong className="text-slate-900">Loom {selectedPlanForReview.loom_no}</strong></div>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-xs uppercase text-slate-700">Matching Beams in Central Beam Stock</h4>
                {beams
                  .filter(b => {
                    const isMatch = (b.design_no || b.designNo || '').trim().toLowerCase() === selectedPlanForReview.next_design.trim().toLowerCase();
                    const st = (b.status || '').trim().toUpperCase();
                    const isAvail = (st === 'AVAILABLE' || st === 'READY' || st === 'CUT BEAM' || st === '') && !b.loom_no_assigned;
                    const isSelected = selectedPlanForReview.reserved_beam_id === b.id;
                    return isMatch && (isAvail || isSelected);
                  })
                  .map(b => {
                    const isSelected = selectedPlanForReview.reserved_beam_id === b.id;
                    const isAvailable = true;

                    return (
                      <div key={b.id} className="p-3 rounded-xl border flex items-center justify-between text-xs bg-white border-slate-200">
                        <div>
                          <div className="font-black text-slate-900">Beam #{b.beam_no || b.beamNo} (Set #{b.set_no || b.setNo || 'N/A'})</div>
                          <div className="text-slate-500 mt-0.5">Warp Meter: {b.available_meter || 5000} M | Status: {b.status}</div>
                        </div>

                        {isAvailable && !isSelected && (
                          <button
                            onClick={() => handleConfirmBeam(selectedPlanForReview, b.id)}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs shadow-sm"
                          >
                            SELECT & CONFIRM BEAM
                          </button>
                        )}

                        {isSelected && (
                          <span className="px-3 py-1 bg-emerald-100 text-emerald-900 font-bold rounded-lg border border-emerald-300">
                            ✓ ALLOCATED BEAM
                          </span>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>

            <div className="p-4 bg-slate-100 border-t border-slate-200 flex justify-end">
              <button onClick={() => setSelectedPlanForReview(null)} className="px-4 py-2 bg-slate-200 text-slate-700 font-bold rounded-xl text-xs">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
