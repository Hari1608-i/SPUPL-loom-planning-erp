import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '../context/AppProvider';
import { calculateOrderLoomPlanningSummary, checkLoomCompatibility, calculateLoomRun } from '../utils/calculations';
import { format } from 'date-fns';
import {
  History, Search, CheckCircle2, AlertTriangle, ShieldCheck,
  Play, RefreshCw, Layers, Clock, AlertCircle, Plus, X, Eye, ShieldAlert, CheckCircle, FileText, Calendar, RotateCcw
} from 'lucide-react';
import { API_BASE_URL } from '../config';

export default function NextPlan() {
  const { activeRuns, rawNextPlans, looms, designs, reeds, beams, orders, refreshData } = useAppContext();

  // Search & Selected Order State
  const [orderSearchTerm, setOrderSearchTerm] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);

  // Modals & Actions
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showBeamModal, setShowBeamModal] = useState<any | null>(null); // holds plan object being edited for beam allocation
  const [selectedBeamIdInModal, setSelectedBeamIdInModal] = useState<number | null>(null);
  const [beamModalSearchTerm, setBeamModalSearchTerm] = useState('');

  // Form State for Loom Assignment
  const [assignLoomNo, setAssignLoomNo] = useState<number | null>(null);
  const [assignStartDate, setAssignStartDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [assignRemarks, setAssignRemarks] = useState<string>('');

  // Status & Loading State
  const [loadingLoom, setLoadingLoom] = useState<number | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);

  useEffect(() => {
    refreshData();
  }, []);

  // Filter Active Orders (excluding COMPLETED orders)
  const activeOrders = useMemo(() => {
    return orders.filter(o => {
      const st = (o.status || '').toUpperCase();
      const compSt = (o.order_completion_status || '').toUpperCase();
      return st !== 'ORDER COMPLETED' && st !== 'COMPLETED' && compSt !== 'COMPLETED';
    });
  }, [orders]);

  // Set default selected order if none selected
  useEffect(() => {
    if (!selectedOrder && activeOrders.length > 0) {
      setSelectedOrder(activeOrders[0]);
    }
  }, [activeOrders, selectedOrder]);

  // Reset selected beam when beam modal opens or closes
  useEffect(() => {
    if (showBeamModal) {
      setSelectedBeamIdInModal(showBeamModal.reserved_beam_id || null);
      setBeamModalSearchTerm('');
    } else {
      setSelectedBeamIdInModal(null);
      setBeamModalSearchTerm('');
    }
  }, [showBeamModal]);

  // Search Results for Order Selection Dropdown
  const searchedOrders = useMemo(() => {
    if (!orderSearchTerm.trim()) return activeOrders;
    const q = orderSearchTerm.toLowerCase();
    return activeOrders.filter(o =>
      (o.ibpo_no && o.ibpo_no.toLowerCase().includes(q)) ||
      (o.order_no && o.order_no.toLowerCase().includes(q)) ||
      (o.design_no_sp_no && o.design_no_sp_no.toLowerCase().includes(q)) ||
      (o.customer_name && o.customer_name.toLowerCase().includes(q)) ||
      (o.construction && o.construction.toLowerCase().includes(q))
    );
  }, [activeOrders, orderSearchTerm]);

  // Calculate Order Loom Requirement Metrics for Selected Order
  const requirementSummary = useMemo(() => {
    if (!selectedOrder) {
      return {
        requiredLooms: 0,
        runningLooms: 0,
        runningLoomNos: [],
        plannedLooms: 0,
        plannedLoomNos: [],
        totalCoveredLooms: 0,
        remainingLooms: 0,
        overPlannedLooms: 0,
        planningStatus: 'LOOM PLANNING PENDING' as const
      };
    }

    return calculateOrderLoomPlanningSummary({
      orderId: selectedOrder.id,
      ibpoNo: selectedOrder.ibpo_no || selectedOrder.order_no,
      designNoSpNo: selectedOrder.design_no_sp_no || selectedOrder.ibpo_no,
      plannedLoomCount: selectedOrder.planned_loom_count || 1,
      activeRunsMap: activeRuns,
      plannedAssignmentsArray: rawNextPlans
    });
  }, [selectedOrder, activeRuns, rawNextPlans]);

  // Matched Design Specs from Design Master or Selected Order
  const currentDesignSpec = useMemo(() => {
    if (!selectedOrder) return null;
    const targetSp = (selectedOrder.design_no_sp_no || selectedOrder.ibpo_no || '').trim().toLowerCase();
    return designs.find(d => {
      const dSp = (d.design_no_sp_no || d.designNo || '').trim().toLowerCase();
      return dSp === targetSp || dSp.replace('SP026', 'SP26') === targetSp.replace('SP026', 'SP26');
    });
  }, [selectedOrder, designs]);

  // Compatible Available Beams in Beam Stock for the current Beam Modal
  const modalCompatibleBeams = useMemo(() => {
    if (!showBeamModal) return [];
    const targetDesign = (showBeamModal.next_design || selectedOrder?.design_no_sp_no || selectedOrder?.ibpo_no || '').trim().toLowerCase();

    return beams.filter(b => {
      const bDesign = (b.design_no || b.designNo || '').trim().toLowerCase();
      const isDesignMatch = (bDesign === targetDesign || bDesign.replace('SP026', 'SP26') === targetDesign.replace('SP026', 'SP26') || bDesign.includes(targetDesign) || targetDesign.includes(bDesign));

      const st = (b.status || b.beam_status || '').trim().toUpperCase();
      const isAvailableSt = (st === 'AVAILABLE' || st === 'READY');
      const isUnassigned = !b.loom_no_assigned && !b.reserved_for;
      const isCurrentModalBeam = b.id === showBeamModal.reserved_beam_id;

      const isEligible = (isAvailableSt && isUnassigned) || isCurrentModalBeam;

      if (!isDesignMatch || !isEligible) return false;

      if (!beamModalSearchTerm.trim()) return true;
      const q = beamModalSearchTerm.toLowerCase();
      return (
        (b.beam_no || b.beamNo || '').toLowerCase().includes(q) ||
        (b.vendor_name || b.vendorBeamNo || '').toLowerCase().includes(q) ||
        (b.set_no || b.setNo || '').toLowerCase().includes(q) ||
        (b.beam_type || b.beamType || '').toLowerCase().includes(q)
      );
    });
  }, [showBeamModal, selectedOrder, beams, beamModalSearchTerm]);

  // Selected Beam Object in Modal
  const selectedBeamInModalObj = useMemo(() => {
    if (!selectedBeamIdInModal) return null;
    return beams.find(b => b.id === selectedBeamIdInModal) || null;
  }, [selectedBeamIdInModal, beams]);

  // Compatible Available Looms for Assignment
  const compatibleAvailableLooms = useMemo(() => {
    if (!selectedOrder) return [];

    return looms.map(loom => {
      const run = activeRuns[loom.loomNo];
      const plan = rawNextPlans.find(p => p.loom_no === loom.loomNo && p.status !== 'CANCELLED' && p.status !== 'COMPLETED');
      const isAlreadyAssignedToOrder = plan && (
        (plan.order_no || '').trim().toLowerCase() === (selectedOrder.ibpo_no || '').trim().toLowerCase() ||
        (plan.next_design || '').trim().toLowerCase() === (selectedOrder.design_no_sp_no || '').trim().toLowerCase()
      );
      const isAssignedToOtherPlan = !!plan && !isAlreadyAssignedToOrder;
      const comp = checkLoomCompatibility(selectedOrder, loom);

      return {
        loom,
        run,
        plan,
        isAlreadyAssignedToOrder,
        isAssignedToOtherPlan,
        isCompatible: comp.compatible,
        reasons: comp.failedChecks,
        compatibilityReason: comp.reason,
        capabilities: comp.normalizedLoomCapabilities
      };
    });
  }, [looms, activeRuns, rawNextPlans, selectedOrder]);

  // Handle Loom Plan Setup Save
  const handleSaveLoomAssignment = async (loomNo: number) => {
    if (!selectedOrder) return;
    const targetIbpo = selectedOrder.ibpo_no || selectedOrder.order_no;
    const targetDesign = selectedOrder.design_no_sp_no || targetIbpo;

    if (requirementSummary.remainingLooms === 0) {
      const confirmOverplan = window.confirm(
        `This order (${targetIbpo}) already has the required loom capacity (${requirementSummary.requiredLooms} looms covered: ${requirementSummary.runningLooms} running, ${requirementSummary.plannedLooms} planned).\n\nDo you want to over-plan an additional loom?`
      );
      if (!confirmOverplan) return;
    }

    setLoadingLoom(loomNo);
    setStatusMsg(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/planning/next-plan/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loomNo,
          ibpoNo: targetIbpo,
          orderNo: targetIbpo,
          nextDesign: targetDesign,
          expectedStartDate: assignStartDate,
          remarks: assignRemarks || 'Assigned via Loom Planning Setup',
          allowOverplan: requirementSummary.remainingLooms === 0
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setStatusMsg({ type: 'error', text: data.error || 'Failed to assign loom' });
      } else {
        setStatusMsg({
          type: 'success',
          text: `✅ Loom ${loomNo} plan saved! Next Step: Click "ALLOCATE BEAM" to select a compatible Beam before confirming.`
        });
        setShowAssignModal(false);
        setAssignLoomNo(null);
        await refreshData();
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: 'Error saving loom assignment: ' + err.message });
    } finally {
      setLoadingLoom(null);
    }
  };

  // STEP 1: ALLOCATE BEAM TO LOOM PLAN
  const handleAllocateBeamToPlan = async () => {
    if (!showBeamModal || !selectedBeamIdInModal) return;
    setLoadingLoom(showBeamModal.loom_no);
    setStatusMsg(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/planning/next-plan/allocate-beam`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: showBeamModal.id,
          loomNo: showBeamModal.loom_no,
          beamId: selectedBeamIdInModal
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setStatusMsg({ type: 'error', text: data.error || 'Beam allocation failed' });
      } else {
        setStatusMsg({
          type: 'success',
          text: `🎉 BEAM ALLOCATED! Beam #${data.beam?.beam_no || selectedBeamInModalObj?.beam_no} reserved for Loom ${showBeamModal.loom_no}. Loom Confirmation is now ENABLED!`
        });
        setShowBeamModal(null);
        await refreshData();
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: 'Error allocating beam: ' + err.message });
    } finally {
      setLoadingLoom(null);
    }
  };

  // STEP 1-B: CHANGE / RELEASE BEAM ALLOCATION
  const handleChangeBeamAllocation = async (plan: any) => {
    if (!plan) return;
    setLoadingLoom(plan.loom_no);
    setStatusMsg(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/planning/next-plan/change-beam`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: plan.id, loomNo: plan.loom_no })
      });

      const data = await res.json();
      if (!res.ok) {
        setStatusMsg({ type: 'error', text: data.error || 'Failed to release beam' });
      } else {
        setStatusMsg({
          type: 'warning',
          text: `Previous beam allocation released for Loom ${plan.loom_no}. Select another compatible Beam from Beam Stock.`
        });
        await refreshData();
        setShowBeamModal(plan);
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: 'Error changing beam: ' + err.message });
    } finally {
      setLoadingLoom(null);
    }
  };

  // STEP 2: CONFIRM LOOM PLAN (MOVES LOOM TO LIVE MAIN ENTRY)
  const handleConfirmLoomPlan = async (plan: any) => {
    if (!plan) return;

    if (!plan.reserved_beam_id && !plan.reserved_beam_no) {
      setStatusMsg({
        type: 'error',
        text: `❌ BEAM ALLOCATION REQUIRED: A compatible Beam from Beam Stock must be allocated to Loom ${plan.loom_no} before confirming Loom!`
      });
      return;
    }

    if (!window.confirm(`Confirm Loom ${plan.loom_no} with allocated Beam #${plan.reserved_beam_no}? This will activate the Loom in Main Entry live production.`)) return;

    setLoadingLoom(plan.loom_no);
    setStatusMsg(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/planning/next-plan/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loomNo: plan.loom_no,
          nextDesign: plan.next_design,
          orderNo: plan.order_no,
          beamId: plan.reserved_beam_id,
          startDate: format(new Date(plan.planned_start_date || new Date()), 'yyyy-MM-dd'),
          remarks: 'Loom confirmed after beam allocation',
          plannerName: 'Senior Production Planner'
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setStatusMsg({ type: 'error', text: data.error || 'Loom confirmation failed' });
      } else {
        setStatusMsg({
          type: 'success',
          text: `🚀 LOOM CONFIRMED! Loom ${plan.loom_no} is now ACTIVE in Main Entry with Beam #${plan.reserved_beam_no || 'Allocated'}.`
        });
        await refreshData();
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: 'Error confirming loom: ' + err.message });
    } finally {
      setLoadingLoom(null);
    }
  };

  // Handle Cancel Loom Plan
  const handleCancelPlan = async (planId: number, loomNo: number) => {
    if (!window.confirm(`Cancel Loom Assignment for Loom ${loomNo}? This will release the plan and any allocated beam.`)) return;
    setLoadingLoom(loomNo);
    try {
      const res = await fetch(`${API_BASE_URL}/api/planning/next-plan/${planId}`, { method: 'DELETE' });
      if (res.ok) {
        setStatusMsg({ type: 'success', text: `Loom plan cancelled and released for Loom ${loomNo}.` });
        await refreshData();
      } else {
        const data = await res.json();
        setStatusMsg({ type: 'error', text: data.error || 'Failed to cancel plan' });
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: 'Failed to cancel plan: ' + err.message });
    } finally {
      setLoadingLoom(null);
    }
  };

  return (
    <div className="space-y-6 flex flex-col h-full bg-slate-50/70 p-4 font-sans">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-industrial-900 flex items-center">
            <History className="w-6 h-6 mr-3 text-blue-600" /> NEXT PLANNED LOOMS & BEAM CONFIRMATION CONTROL
          </h1>
          <p className="text-industrial-500 text-sm mt-1">
            Order-Driven Workflow: <strong>ORDER MANAGEMENT → LOOM PLANNING → ALLOCATE BEAM → CONFIRM LOOM → MAIN ENTRY</strong>
          </p>
        </div>

        <button
          onClick={async () => {
            setLoadingLoom(99999);
            await refreshData();
            setTimeout(() => setLoadingLoom(null), 400);
          }}
          className="flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-md transition-all"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loadingLoom === 99999 ? 'animate-refresh-spin' : ''}`} /> Refresh Live Data
        </button>
      </div>

      {/* Alert Banner */}
      {statusMsg && (
        <div className={`p-4 rounded-xl border flex items-start justify-between shadow-sm transition-all ${
          statusMsg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' :
          statusMsg.type === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-900' :
          'bg-red-50 border-red-200 text-red-900'
        }`}>
          <div className="flex items-center space-x-3">
            {statusMsg.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />}
            {statusMsg.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />}
            {statusMsg.type === 'error' && <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />}
            <span className="text-xs font-bold">{statusMsg.text}</span>
          </div>
          <button onClick={() => setStatusMsg(null)} className="text-slate-400 hover:text-slate-600 font-bold text-xs">✕</button>
        </div>
      )}

      {/* SECTION 1 — ORDER SELECTION CONTROL */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-wrap justify-between items-center gap-3 border-b border-slate-100 pb-3">
          <label className="text-xs font-black uppercase text-blue-900 tracking-wider flex items-center">
            <Search className="w-4 h-4 mr-2 text-blue-600" /> SELECT ORDER (ACTIVE ORDERS)
          </label>
          <span className="text-[11px] text-slate-500 font-semibold">
            Showing <strong className="text-slate-900">{searchedOrders.length}</strong> of {activeOrders.length} Active Orders
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Search Input Filter */}
          <div className="md:col-span-1">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Type to search IBPO or Design..."
                value={orderSearchTerm}
                onChange={e => setOrderSearchTerm(e.target.value)}
                className="w-full pl-9 pr-8 py-2.5 bg-slate-50 border border-slate-200 text-slate-800 rounded-xl text-xs font-bold outline-none focus:border-blue-500 focus:bg-white transition-all"
              />
              {orderSearchTerm && (
                <button
                  onClick={() => setOrderSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 font-bold text-xs"
                  title="Clear Search"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Active Orders Dropdown */}
          <div className="md:col-span-2">
            <select
              value={selectedOrder ? selectedOrder.id : ''}
              onChange={e => {
                const found = activeOrders.find(o => o.id === Number(e.target.value));
                if (found) setSelectedOrder(found);
              }}
              className="w-full p-2.5 bg-blue-50 border border-blue-300 text-blue-900 rounded-xl text-xs font-black outline-none focus:ring-2 focus:ring-blue-500"
            >
              {searchedOrders.length === 0 ? (
                <option value="">No orders found matching "{orderSearchTerm}"</option>
              ) : (
                searchedOrders.map(ord => (
                  <option key={ord.id} value={ord.id}>
                    IBPO: {ord.ibpo_no || ord.order_no} ({ord.design_no_sp_no})
                  </option>
                ))
              )}
            </select>
          </div>
        </div>
      </div>

      {/* SECTION 2 — SELECTED ORDER DETAILS & ORDER LOOM REQUIREMENT PANEL */}
      {selectedOrder && (
        <div className="bg-slate-900 text-white p-5 rounded-2xl border border-slate-800 shadow-xl space-y-5">
          <div className="flex flex-wrap justify-between items-center border-b border-slate-800 pb-3 gap-3">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 font-black text-white flex items-center justify-center text-sm shadow-md">
                IBPO
              </div>
              <div>
                <h3 className="text-base font-black text-blue-300 uppercase tracking-wide">
                  {selectedOrder.ibpo_no || selectedOrder.order_no}
                </h3>
                <p className="text-xs text-slate-400 font-semibold">
                  Design: <span className="text-white font-bold">{selectedOrder.design_no_sp_no}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <span className={`px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider border ${
                requirementSummary.planningStatus === 'LOOM REQUIREMENT COMPLETED' ? 'bg-emerald-950 text-emerald-400 border-emerald-700' :
                requirementSummary.planningStatus === 'OVER PLANNED' ? 'bg-amber-950 text-amber-400 border-amber-700' :
                'bg-blue-950 text-blue-300 border-blue-700'
              }`}>
                {requirementSummary.planningStatus}
              </span>

              <button
                onClick={() => setShowAssignModal(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl shadow-lg flex items-center transition-all"
              >
                <Plus className="w-4 h-4 mr-1.5" /> ASSIGN LOOM
              </button>
            </div>
          </div>

          {/* Specification Grid */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-xs">
            <div className="p-3 bg-slate-850 rounded-xl border border-slate-800">
              <span className="text-slate-400 text-[10px] uppercase font-bold block">Design / SP Number</span>
              <span className="text-sm font-black text-blue-300 mt-0.5 block">{selectedOrder.design_no_sp_no || selectedOrder.ibpo_no}</span>
            </div>
            <div className="p-3 bg-slate-850 rounded-xl border border-slate-800">
              <span className="text-slate-400 text-[10px] uppercase font-bold block">Construction</span>
              <span className="text-xs font-bold text-slate-200 mt-0.5 block">{selectedOrder.construction || currentDesignSpec?.construction || '—'}</span>
            </div>
            <div className="p-3 bg-slate-850 rounded-xl border border-slate-800">
              <span className="text-slate-400 text-[10px] uppercase font-bold block">Reed Count & Space</span>
              <span className="text-xs font-bold text-slate-200 mt-0.5 block">
                {selectedOrder.reed_count || currentDesignSpec?.reed_count || '—'} ({selectedOrder.reed_space || currentDesignSpec?.reed_space_warp_width || '—'})
              </span>
            </div>
            <div className="p-3 bg-slate-850 rounded-xl border border-slate-800">
              <span className="text-slate-400 text-[10px] uppercase font-bold block">Weave & Frames</span>
              <span className="text-xs font-bold text-slate-200 mt-0.5 block">
                {selectedOrder.weave_type || currentDesignSpec?.weave_type || 'Plain'} ({selectedOrder.frames || currentDesignSpec?.frames || 4} Frames)
              </span>
            </div>
            <div className="p-3 bg-slate-850 rounded-xl border border-slate-800">
              <span className="text-slate-400 text-[10px] uppercase font-bold block">Order Quantity</span>
              <span className="text-sm font-black text-emerald-400 mt-0.5 block">
                {(selectedOrder.order_qty || 0).toLocaleString()} {selectedOrder.uom || 'M'}
              </span>
            </div>
            <div className="p-3 bg-slate-850 rounded-xl border border-slate-800">
              <span className="text-slate-400 text-[10px] uppercase font-bold block">Target Completion Date</span>
              <span className="text-xs font-bold text-indigo-300 mt-0.5 block">
                {selectedOrder.weaving_completion_date ? format(new Date(selectedOrder.weaving_completion_date), 'dd-MM-yyyy') : '—'}
              </span>
            </div>
          </div>

          {/* ORDER LOOM REQUIREMENT SUMMARY CARD (SSOT ENGINE) */}
          <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
            <h4 className="text-xs font-black uppercase text-indigo-400 tracking-wider flex items-center">
              <Layers className="w-4 h-4 mr-2" /> ORDER-WISE LOOM REQUIREMENT SUMMARY
            </h4>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-center">
                <div className="text-[10px] uppercase font-bold text-slate-400">Required Looms</div>
                <div className="text-xl font-black text-white mt-1">{requirementSummary.requiredLooms}</div>
                <div className="text-[9px] text-slate-500 font-semibold mt-0.5">Order Master Baseline</div>
              </div>

              <div className="p-3 bg-purple-950/40 rounded-xl border border-purple-800/60 text-center">
                <div className="text-[10px] uppercase font-bold text-purple-300">Currently Running</div>
                <div className="text-xl font-black text-purple-200 mt-1">{requirementSummary.runningLooms}</div>
                <div className="text-[9px] text-purple-400 font-semibold mt-0.5">
                  {requirementSummary.runningLoomNos.length > 0 ? `Looms: ${requirementSummary.runningLoomNos.join(', ')}` : 'None active'}
                </div>
              </div>

              <div className="p-3 bg-blue-950/40 rounded-xl border border-blue-800/60 text-center">
                <div className="text-[10px] uppercase font-bold text-blue-300">Already Planned</div>
                <div className="text-xl font-black text-blue-200 mt-1">{requirementSummary.plannedLooms}</div>
                <div className="text-[9px] text-blue-400 font-semibold mt-0.5">
                  {requirementSummary.plannedLoomNos.length > 0 ? `Looms: ${requirementSummary.plannedLoomNos.join(', ')}` : 'None planned'}
                </div>
              </div>

              <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-center">
                <div className="text-[10px] uppercase font-bold text-slate-400">Total Covered</div>
                <div className="text-xl font-black text-indigo-300 mt-1">{requirementSummary.totalCoveredLooms}</div>
                <div className="text-[9px] text-slate-500 font-semibold mt-0.5">Running + Planned</div>
              </div>

              <div className="p-3 bg-amber-950/40 rounded-xl border border-amber-800/60 text-center">
                <div className="text-[10px] uppercase font-bold text-amber-300">Remaining Required</div>
                <div className={`text-xl font-black mt-1 ${requirementSummary.remainingLooms > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {requirementSummary.remainingLooms}
                </div>
                <div className="text-[9px] text-amber-400 font-semibold mt-0.5">
                  {requirementSummary.remainingLooms === 0 ? 'Requirement Met' : 'Looms Still Needed'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 3 — ASSIGNED / PLANNED LOOMS FOR SELECTED ORDER */}
      {selectedOrder && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div className="flex justify-between items-center border-b border-slate-200 pb-3">
            <h3 className="font-black text-slate-900 text-sm uppercase flex items-center">
              <Clock className="w-4 h-4 mr-2 text-blue-600" /> LOOM ASSIGNMENT LIST — IBPO "{selectedOrder.ibpo_no || selectedOrder.order_no}"
            </h3>
            <span className="text-xs font-bold text-slate-500">
              Total Assigned / Planned: <strong className="text-blue-700">{requirementSummary.totalCoveredLooms}</strong> / {requirementSummary.requiredLooms}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 1. Running Looms */}
            {requirementSummary.runningLoomNos.map(lNo => (
              <div key={`running-${lNo}`} className="p-4 bg-purple-50 rounded-xl border border-purple-200 flex justify-between items-center text-xs">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="px-2 py-0.5 bg-purple-700 text-white font-black text-xs rounded">LOOM {lNo}</span>
                    <span className="font-bold text-purple-900">WEAVING RUNNING</span>
                  </div>
                  <div className="text-slate-600 mt-1 font-medium">
                    Order: <strong className="text-slate-900">{selectedOrder.ibpo_no}</strong> | Design: <strong>{selectedOrder.design_no_sp_no}</strong>
                  </div>
                </div>
                <span className="px-3 py-1 bg-purple-200 text-purple-900 font-black text-[10px] uppercase rounded-full">
                  ACTIVE IN PRODUCTION
                </span>
              </div>
            ))}

            {/* 2. Planned Looms */}
            {rawNextPlans
              .filter(p => {
                const st = (p.status || '').toUpperCase();
                if (st === 'CANCELLED' || st === 'COMPLETED') return false;
                const pIbpo = (p.order_no || '').trim().toLowerCase();
                const pDes = (p.next_design || '').trim().toLowerCase();
                const tIbpo = (selectedOrder.ibpo_no || selectedOrder.order_no || '').trim().toLowerCase();
                const tDes = (selectedOrder.design_no_sp_no || '').trim().toLowerCase();
                return (pIbpo && pIbpo === tIbpo) || (pDes && pDes === tDes);
              })
              .map(plan => {
                const isBeamAllocated = !!(plan.reserved_beam_no || plan.reserved_beam_id || plan.beam_status === 'BEAM ALLOCATED');

                const activeRunForLoom = activeRuns[plan.loom_no];
                let currentRunDesign = 'None (Empty Loom)';
                let currentRunoutText = 'Ready Now';

                if (activeRunForLoom && activeRunForLoom.designNo) {
                  currentRunDesign = activeRunForLoom.designNo;
                  const runDesign = designs.find(d => d.designNo === activeRunForLoom.designNo);
                  const rCalc = calculateLoomRun({
                    loomStartDate: new Date(activeRunForLoom.loomStartDate || new Date()),
                    warpedMeter: Number(activeRunForLoom.warpedMeter || 0),
                    dailyProduction: Number(activeRunForLoom.dailyProduction || 0),
                    rpm: activeRunForLoom.rpm ? Number(activeRunForLoom.rpm) : 600,
                    efficiency: activeRunForLoom.efficiency ? Number(activeRunForLoom.efficiency) : 60,
                    crimpPercent: runDesign ? runDesign.crimpPercent : 0,
                  });
                  if (rCalc && rCalc.expectedRunoutDate && rCalc.balanceDays !== 999999) {
                    currentRunoutText = `${format(rCalc.expectedRunoutDate, 'dd-MM-yyyy')} (${rCalc.balanceDays.toFixed(1)}d bal)`;
                  }
                }

                return (
                  <div key={`plan-${plan.id}`} className="p-4 bg-white rounded-xl border border-slate-300 shadow-sm space-y-3 text-xs">
                    <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                      <div className="flex items-center space-x-2">
                        <span className="px-2 py-0.5 bg-blue-700 text-white font-black text-xs rounded">LOOM {plan.loom_no}</span>
                        <span className="font-bold text-slate-800">PLANNED ASSIGNMENT #{plan.id}</span>
                      </div>

                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border ${
                        isBeamAllocated ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-amber-100 text-amber-800 border-amber-300'
                      }`}>
                        {isBeamAllocated ? `BEAM ALLOCATED (${plan.reserved_beam_no || 'RESERVED'})` : '⚠ BEAM PENDING'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                      <div>Current Running: <strong className="text-purple-800 block">{currentRunDesign}</strong></div>
                      <div>Expected Runout: <strong className="text-indigo-700 block">{currentRunoutText}</strong></div>
                      <div>Next Design: <strong className="text-teal-700 block">{plan.next_design}</strong></div>
                      <div>Next Start: <strong className="text-slate-900 block">{format(new Date(plan.planned_start_date || new Date()), 'dd-MM-yyyy')}</strong></div>
                      <div className="col-span-2">
                        Allocated Beam: <strong className={isBeamAllocated ? 'text-emerald-700 font-mono' : 'text-amber-700'}>
                          {isBeamAllocated ? `BM-${plan.reserved_beam_no || 'Allocated'}` : 'BEAM PENDING'}
                        </strong>
                      </div>
                      <div className="col-span-2 text-slate-500 italic">Remarks: {plan.remarks || 'Saved plan'}</div>
                    </div>

                    {/* ACTIONS: [CANCEL PLAN] | [ALLOCATE BEAM] / [CHANGE BEAM] | [CONFIRM LOOM] */}
                    <div className="flex flex-wrap justify-between items-center gap-2 pt-2 border-t border-slate-100">
                      <button
                        onClick={() => handleCancelPlan(plan.id, plan.loom_no)}
                        className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 font-bold rounded-lg transition-all text-[11px]"
                      >
                        Cancel Plan
                      </button>

                      <div className="flex items-center space-x-2">
                        {!isBeamAllocated ? (
                          <button
                            onClick={() => setShowBeamModal(plan)}
                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-sm flex items-center transition-all text-[11px]"
                          >
                            <ShieldCheck className="w-3.5 h-3.5 mr-1" /> ALLOCATE BEAM
                          </button>
                        ) : (
                          <button
                            onClick={() => handleChangeBeamAllocation(plan)}
                            className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-lg shadow-sm flex items-center transition-all text-[11px]"
                            title="Release current beam and select another compatible beam"
                          >
                            <RotateCcw className="w-3.5 h-3.5 mr-1" /> CHANGE BEAM
                          </button>
                        )}

                        <button
                          disabled={!isBeamAllocated || loadingLoom === plan.loom_no}
                          onClick={() => handleConfirmLoomPlan(plan)}
                          className={`px-4 py-1.5 font-black rounded-lg shadow-sm flex items-center transition-all text-[11px] ${
                            isBeamAllocated
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
                              : 'bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed'
                          }`}
                          title={isBeamAllocated ? 'Confirm Loom to Main Entry' : 'Allocate Beam first to enable confirmation'}
                        >
                          <Play className="w-3.5 h-3.5 mr-1" /> CONFIRM LOOM
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

            {requirementSummary.totalCoveredLooms === 0 && (
              <div className="col-span-2 p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300 text-slate-400">
                No looms currently assigned or planned for IBPO "{selectedOrder.ibpo_no || selectedOrder.order_no}". Click <strong>ASSIGN LOOM</strong> to plan a loom.
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 1 — LOOM ASSIGNMENT MODAL */}
      {showAssignModal && selectedOrder && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full my-8 overflow-hidden border border-slate-200">
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
              <h3 className="font-bold text-sm flex items-center">
                <Plus className="w-4 h-4 mr-2 text-blue-400" /> ASSIGN LOOM TO ORDER ({selectedOrder.ibpo_no || selectedOrder.order_no})
              </h3>
              <button onClick={() => setShowAssignModal(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-5 space-y-4 text-xs font-medium max-h-[80vh] overflow-y-auto custom-scrollbar">
              {/* Order Requirement Summary Header */}
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl grid grid-cols-4 gap-2 text-center text-blue-900">
                <div>Required: <strong>{requirementSummary.requiredLooms}</strong></div>
                <div>Running: <strong>{requirementSummary.runningLooms}</strong></div>
                <div>Planned: <strong>{requirementSummary.plannedLooms}</strong></div>
                <div>Remaining: <strong className="text-emerald-700">{requirementSummary.remainingLooms}</strong></div>
              </div>

              {/* Compatible Available Looms Table */}
              <div className="space-y-2">
                <label className="block text-slate-700 font-bold">Select Available Compatible Loom *</label>
                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-60 overflow-y-auto custom-scrollbar">
                  <table className="min-w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0">
                      <tr className="border-b border-slate-200">
                        <th className="p-2.5 text-center">Select</th>
                        <th className="p-2.5">Loom No</th>
                        <th className="p-2.5">Type & Unit</th>
                        <th className="p-2.5">Current Design</th>
                        <th className="p-2.5">Status</th>
                        <th className="p-2.5 text-indigo-700">Expected Runout Date</th>
                        <th className="p-2.5">Compatibility</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {compatibleAvailableLooms.map(item => {
                        const isSelected = assignLoomNo === item.loom.loomNo;
                        const isDisabled = item.isAlreadyAssignedToOrder || !item.isCompatible;

                        let runoutCalc = null;
                        if (item.run) {
                          try {
                            runoutCalc = calculateLoomRun({
                              loomStartDate: new Date(item.run.loomStartDate || new Date()),
                              warpedMeter: Number(item.run.warpedMeter || 10000),
                              dailyProduction: Number(item.run.dailyProduction || 300),
                              rpm: Number(item.run.rpm || 720),
                              efficiency: Number(item.run.efficiency || 92),
                              crimpPercent: 0.05,
                              actualProductionHistory: (item.run as any).actualProductionHistory || []
                            });
                          } catch(e) {}
                        }

                        const runoutFormatted = runoutCalc && runoutCalc.expectedRunoutDate && runoutCalc.balanceDays !== 999999
                          ? format(runoutCalc.expectedRunoutDate, 'dd-MM-yyyy')
                          : null;

                        return (
                          <tr key={item.loom.loomNo} className={`hover:bg-slate-50 transition-colors ${isSelected ? 'bg-blue-50/60' : ''}`}>
                            <td className="p-2.5 text-center">
                              <input
                                type="radio"
                                name="assignLoom"
                                disabled={isDisabled}
                                checked={isSelected}
                                onChange={() => {
                                  setAssignLoomNo(item.loom.loomNo);
                                  if (runoutCalc && runoutCalc.expectedRunoutDate && runoutCalc.balanceDays !== 999999) {
                                    setAssignStartDate(format(runoutCalc.expectedRunoutDate, 'yyyy-MM-dd'));
                                    setAssignRemarks(`Planned after runout of current beam (${format(runoutCalc.expectedRunoutDate, 'dd-MM-yyyy')})`);
                                  }
                                }}
                                className="w-4 h-4 text-blue-600"
                              />
                            </td>
                            <td className="p-2.5 font-black text-slate-900">LOOM {item.loom.loomNo}</td>
                            <td className="p-2.5 text-slate-600">{item.loom.loomType || 'Ruti C'} ({item.loom.unit || 'Unit 1'})</td>
                            <td className="p-2.5 font-bold text-slate-700">{item.run ? item.run.designNo : '—'}</td>
                            <td className="p-2.5 font-bold">{item.loom.status || 'Available'}</td>
                            <td className="p-2.5">
                              {runoutFormatted ? (
                                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded font-bold text-[11px] flex items-center w-fit">
                                  <Clock className="w-3 h-3 mr-1" />
                                  {runoutFormatted} {runoutCalc && runoutCalc.balanceDays > 0 ? `(${Math.ceil(runoutCalc.balanceDays)}d)` : ''}
                                </span>
                              ) : (
                                <span className="text-slate-400 font-semibold text-xs">Ready Now</span>
                              )}
                            </td>
                            <td className="p-2.5">
                              {item.isAlreadyAssignedToOrder ? (
                                <span className="text-amber-700 font-bold">Already Assigned</span>
                              ) : item.isCompatible ? (
                                <span className="px-2 py-1 rounded bg-emerald-100 text-emerald-800 font-bold text-xs inline-block" title={item.compatibilityReason}>
                                  ✓ Compatible
                                </span>
                              ) : (
                                <span className="px-2 py-1 rounded bg-red-100 text-red-700 font-bold text-xs inline-block" title={item.compatibilityReason}>
                                  ✕ {item.reasons.length > 0 ? item.reasons[0] : 'Incompatible'}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Start Date & Remarks */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-slate-700 font-bold">Planned Start Date *</label>
                    {(() => {
                      const selItem = compatibleAvailableLooms.find(i => i.loom.loomNo === assignLoomNo);
                      if (!selItem || !selItem.run) return null;
                      try {
                        const rCalc = calculateLoomRun({
                          loomStartDate: new Date(selItem.run.loomStartDate || new Date()),
                          warpedMeter: Number(selItem.run.warpedMeter || 10000),
                          dailyProduction: Number(selItem.run.dailyProduction || 300),
                          rpm: Number(selItem.run.rpm || 720),
                          efficiency: Number(selItem.run.efficiency || 92),
                          crimpPercent: 0.05,
                          actualProductionHistory: (selItem.run as any).actualProductionHistory || []
                        });
                        if (!rCalc || !rCalc.expectedRunoutDate || rCalc.balanceDays === 999999) return null;
                        const rDateStr = format(rCalc.expectedRunoutDate, 'dd-MM-yyyy');
                        return (
                          <button
                            type="button"
                            onClick={() => {
                              setAssignStartDate(format(rCalc.expectedRunoutDate, 'yyyy-MM-dd'));
                              setAssignRemarks(`Planned after runout of current beam (${rDateStr})`);
                            }}
                            className="text-[11px] bg-indigo-100 hover:bg-indigo-200 text-indigo-800 font-extrabold px-2 py-0.5 rounded border border-indigo-300 transition-all flex items-center"
                            title="Auto-set start date to current beam runout date"
                          >
                            <Calendar className="w-3 h-3 mr-1" />
                            Auto-Set Runout ({rDateStr})
                          </button>
                        );
                      } catch(e) { return null; }
                    })()}
                  </div>
                  <input
                    type="date"
                    required
                    value={assignStartDate}
                    onChange={e => setAssignStartDate(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Planner Remarks</label>
                  <input
                    type="text"
                    placeholder="e.g. Planned after runout of current beam"
                    value={assignRemarks}
                    onChange={e => setAssignRemarks(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-200 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!assignLoomNo || loadingLoom === assignLoomNo}
                  onClick={() => assignLoomNo && handleSaveLoomAssignment(assignLoomNo)}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl shadow-md disabled:opacity-40"
                >
                  SAVE LOOM PLAN
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2 — BEAM ALLOCATION MODAL (STRICT BEAM STOCK SELECTION) */}
      {showBeamModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full my-8 overflow-hidden border border-slate-200">
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
              <h3 className="font-bold text-sm flex items-center">
                <ShieldCheck className="w-4 h-4 mr-2 text-indigo-400" /> SELECT COMPATIBLE BEAM — LOOM {showBeamModal.loom_no}
              </h3>
              <button onClick={() => setShowBeamModal(null)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-5 space-y-4 text-xs font-medium max-h-[80vh] overflow-y-auto custom-scrollbar">
              {/* Planned Loom Context Header */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-2 md:grid-cols-4 gap-2 text-slate-700 text-[11px]">
                <div>Order / IBPO: <strong className="text-blue-900 block font-bold">{showBeamModal.order_no}</strong></div>
                <div>Design No: <strong className="text-slate-900 block font-bold">{showBeamModal.next_design}</strong></div>
                <div>Planned Loom: <strong className="text-slate-900 block font-bold">Loom {showBeamModal.loom_no}</strong></div>
                <div>Planned Start: <strong className="text-slate-900 block font-bold">{format(new Date(showBeamModal.planned_start_date || new Date()), 'dd-MM-yyyy')}</strong></div>
              </div>

              {/* Search Filter for Beams */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search available beams by Beam No, Set No, Vendor, or Beam Type..."
                  value={beamModalSearchTerm}
                  onChange={e => setBeamModalSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
                />
              </div>

              {/* Compatible Beams Table */}
              {modalCompatibleBeams.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-[11px] text-emerald-800 font-bold flex items-center">
                    <CheckCircle2 className="w-4 h-4 mr-1 text-emerald-600" />
                    Found {modalCompatibleBeams.length} Compatible Available Beam(s) in Stock for Design "{showBeamModal.next_design}"
                  </div>

                  <div className="border border-slate-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto custom-scrollbar">
                    <table className="min-w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0">
                        <tr className="border-b border-slate-200">
                          <th className="p-2.5 text-center">Select</th>
                          <th className="p-2.5">Beam No</th>
                          <th className="p-2.5">Design No</th>
                          <th className="p-2.5">Vendor / Set No</th>
                          <th className="p-2.5">Type & Dia</th>
                          <th className="p-2.5 text-right">Available Mtr</th>
                          <th className="p-2.5 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {modalCompatibleBeams.map(b => {
                          const isSelected = selectedBeamIdInModal === b.id;
                          return (
                            <tr
                              key={b.id}
                              onClick={() => setSelectedBeamIdInModal(b.id)}
                              className={`hover:bg-indigo-50/60 cursor-pointer transition-colors ${isSelected ? 'bg-indigo-50 font-bold' : ''}`}
                            >
                              <td className="p-2.5 text-center">
                                <input
                                  type="radio"
                                  name="selectedBeamModal"
                                  checked={isSelected}
                                  onChange={() => setSelectedBeamIdInModal(b.id)}
                                  className="w-4 h-4 text-indigo-600"
                                />
                              </td>
                              <td className="p-2.5 font-black text-indigo-900">{b.beam_no || b.beamNo}</td>
                              <td className="p-2.5 text-slate-800">{b.design_no || b.designNo}</td>
                              <td className="p-2.5 text-slate-600">{b.vendor_name || 'In-House'} / {b.set_no || 'Set 1'}</td>
                              <td className="p-2.5 text-slate-600">{b.beam_type || 'SINGLE BEAM'} ({b.beam_dia || 800}mm)</td>
                              <td className="p-2.5 text-right font-bold text-emerald-700">{(b.available_meter || b.beamLength || 0).toLocaleString()} M</td>
                              <td className="p-2.5 text-center">
                                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold text-[10px] rounded-full">
                                  {b.status || 'Available'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-900 space-y-2">
                  <div className="flex items-center font-bold text-sm text-red-800">
                    <AlertTriangle className="w-5 h-5 mr-2 text-red-600" /> NO COMPATIBLE BEAM AVAILABLE
                  </div>
                  <p className="text-xs text-red-700">
                    No compatible physical Beam Stock exists for Design "<strong>{showBeamModal.next_design}</strong>".
                  </p>
                  <p className="text-[11px] text-red-600 italic">
                    Beam Stock must be entered or produced in Beam Stock before this Loom Plan can be allocated and confirmed.
                  </p>
                </div>
              )}

              {/* Selected Beam Details Box */}
              {selectedBeamInModalObj && (
                <div className="p-3 bg-indigo-950 text-indigo-100 rounded-xl border border-indigo-800 space-y-2 text-[11px]">
                  <div className="font-bold text-indigo-300 uppercase flex items-center justify-between">
                    <span>Selected Beam Details</span>
                    <span className="text-emerald-400">Ready to Allocate</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>Beam No: <strong className="text-white block">{selectedBeamInModalObj.beam_no || selectedBeamInModalObj.beamNo}</strong></div>
                    <div>Design: <strong className="text-white block">{selectedBeamInModalObj.design_no || selectedBeamInModalObj.designNo}</strong></div>
                    <div>Vendor: <strong className="text-white block">{selectedBeamInModalObj.vendor_name || 'In-House'}</strong></div>
                    <div>Set No: <strong className="text-white block">{selectedBeamInModalObj.set_no || 'Set 1'}</strong></div>
                    <div>Warp Meter: <strong className="text-emerald-300 block">{(selectedBeamInModalObj.available_meter || 0).toLocaleString()} M</strong></div>
                    <div>Status: <strong className="text-white block">{selectedBeamInModalObj.status || 'Available'}</strong></div>
                  </div>
                </div>
              )}

              {/* Modal Buttons */}
              <div className="pt-3 border-t border-slate-200 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowBeamModal(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!selectedBeamIdInModal || loadingLoom === showBeamModal.loom_no}
                  onClick={handleAllocateBeamToPlan}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-md disabled:opacity-40"
                >
                  ALLOCATE SELECTED BEAM
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
