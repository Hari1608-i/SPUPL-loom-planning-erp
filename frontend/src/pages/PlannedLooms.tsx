import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ListTodo, Search, AlertCircle, CheckCircle2, Play, Lock, Eye, X, 
  AlertTriangle, ArrowRight, ShieldCheck, Sparkles, RefreshCw, MessageSquare, ExternalLink, Filter, Check
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
  beam_status?: string;
  reserved_beam_id: number | null;
  reserved_beam_no?: string | null;
  reserved_set_no?: string | null;
  confirmation_status: string;
  remarks?: string;
  planner_name?: string;
  change_request_remark?: string;
}

export default function PlannedLooms() {
  const navigate = useNavigate();
  const { looms, designs, beams, orders, refreshData } = useAppContext();
  const { user } = useAuth();

  const [searchTerm, setSearchTerm] = useState('');
  const [assignments, setAssignments] = useState<PlannedAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Modals state
  const [selectedPlanForReview, setSelectedPlanForReview] = useState<PlannedAssignment | null>(null);
  const [confirmBeamModalPlan, setConfirmBeamModalPlan] = useState<PlannedAssignment | null>(null);
  const [declineModalPlan, setDeclineModalPlan] = useState<PlannedAssignment | null>(null);
  const [declineRemark, setDeclineRemark] = useState<string>('');

  // Interactive Beam Selection Modal State inside Confirm Beam Modal
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
    const interval = setInterval(fetchAssignments, 15000);
    return () => clearInterval(interval);
  }, []);

  // Open Confirm Beam Modal for a plan
  const handleOpenConfirmBeamModal = (plan: PlannedAssignment) => {
    setConfirmBeamModalPlan(plan);
    setSelectedBeamForConfirmation(null);
    setBeamSearchTerm('');
    setBeamFilterTab('COMPATIBLE');
  };

  // STEP 1: Confirm Beam Allocation (User explicitly selected physical beam)
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

    // Verify double allocation safeguard
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

  // STEP 2: Confirm Loom (Allowed ONLY AFTER Beam Confirmation)
  const handleConfirmLoom = async (plan: PlannedAssignment) => {
    const isBeamConfirmed = plan.status === 'CONFIRMED' || plan.beam_status === 'BEAM ALLOCATED' || plan.reserved_beam_id !== null;
    if (!isBeamConfirmed) {
      setErrorMsg('❌ LOOM CONFIRMATION BLOCKED: Beam confirmation is required first. Please click [ CONFIRM BEAM ] before confirming loom.');
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
          beamId: plan.reserved_beam_id,
          startDate: plan.planned_start_date,
          remarks: 'Loom Confirmed & Ready for Main Entry',
          plannerName: user?.username || 'Confirmation User'
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMsg(`🚀 LOOM CONFIRMED for Loom ${plan.loom_no}! Plan is ready. Click [ GO TO MAIN ENTRY ] to start production.`);
        await refreshData();
        await fetchAssignments();
        setTimeout(() => setSuccessMsg(null), 5000);
      } else {
        setErrorMsg(data.error || 'Failed to confirm loom.');
      }
    } catch (err: any) {
      setErrorMsg('Error confirming loom: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // STEP 3: Navigate to Main Entry with Pre-filled State
  const handleGoToMainEntry = (plan: PlannedAssignment) => {
    navigate('/entry', {
      state: {
        loomNo: plan.loom_no,
        designNo: plan.next_design,
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
        setSuccessMsg(`⚠️ Loom Plan #${declineModalPlan.id} DECLINED! Reserved beam released and Change Request sent to Loom Planning Setup.`);
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

  const filteredData = assignments.filter(d => {
    const q = searchTerm.toLowerCase();
    return (
      d.loom_no.toString().includes(q) ||
      d.next_design.toLowerCase().includes(q) ||
      (d.order_no && d.order_no.toLowerCase().includes(q)) ||
      (d.reserved_beam_no && d.reserved_beam_no.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6 flex flex-col h-full bg-slate-50/70 p-4 font-sans">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-industrial-900 flex items-center">
            <ListTodo className="w-6 h-6 mr-3 text-blue-600" /> NEXT PLANNED LOOMS & BEAM CONFIRMATION CONTROL
          </h1>
          <p className="text-industrial-500 text-sm mt-1">
            2-Step Confirmation Workflow: <strong>NEXT PLANNED LOOM → BEAM CONFIRMATION → LOOM CONFIRMATION → GO TO MAIN ENTRY</strong>
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
              placeholder="Search by Loom, IBPO, Design or Beam..."
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
                <th className="p-3 text-emerald-300">Suggested Beam</th>
                <th className="p-3">Beam Status</th>
                <th className="p-3">Plan Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {isLoading ? (
                <tr>
                  <td colSpan={12} className="p-12 text-center text-slate-400 font-medium">
                    Loading planned looms...
                  </td>
                </tr>
              ) : filteredData.length === 0 ? (
                <tr>
                  <td colSpan={12} className="p-12 text-center text-slate-400 font-medium">
                    No active proposed next plans found. Assign a loom in <strong>Loom Planning Setup</strong>.
                  </td>
                </tr>
              ) : (
                filteredData.map((row, idx) => {
                  const loomMaster = looms.find(l => l.loomNo === row.loom_no);
                  const cleanDesign = (row.next_design || '').trim().toLowerCase();
                  const cleanOrder = (row.order_no || '').trim().toLowerCase();
                  const designMaster = designs.find(d => (d.design_no_sp_no || d.designNo || '').trim().toLowerCase() === cleanDesign);
                  const orderMaster = orders.find(o => 
                    (o.ibpo_no || '').trim().toLowerCase() === cleanOrder ||
                    (o.order_no || '').trim().toLowerCase() === cleanOrder ||
                    (o.design_no_sp_no || '').trim().toLowerCase() === cleanDesign
                  );

                  const isChangeRequested = row.status === 'CHANGE_REQUESTED';
                  const isBeamConfirmed = row.reserved_beam_id !== null || row.beam_status === 'BEAM ALLOCATED' || row.status === 'CONFIRMED';
                  const isLoomConfirmed = row.confirmation_status === 'LOOM CONFIRMED' || row.status === 'CONFIRMED';

                  // Matching beam stock check
                  const matchingBeams = beams.filter(b => {
                    const bDesign = (b.design_no || b.designNo || '').trim().toLowerCase();
                    const bParty = (b.party_beam_no || b.ibpo || b.order_no || '').trim().toLowerCase();
                    const isMatch = (bDesign && cleanDesign && bDesign === cleanDesign) ||
                                    (bParty && cleanOrder && bParty === cleanOrder) ||
                                    (bDesign && cleanOrder && bDesign === cleanOrder) ||
                                    (bParty && cleanDesign && bParty === cleanDesign);
                    const isAvail = b.status === 'Available' || b.status === 'AVAILABLE' || b.status === 'READY' || b.status === 'Running' || (b.available_meter || 0) > 0;
                    return isMatch && isAvail;
                  });
                  const hasBeamStock = matchingBeams.length > 0;

                  // Resolve Greige Width with fallbacks
                  let resolvedWidth = designMaster?.greigeWidth || designMaster?.greige_width || orderMaster?.greige_width || orderMaster?.width || orderMaster?.required_reed_space || designMaster?.reedSpace || '';
                  if (!resolvedWidth) {
                    const constr = designMaster?.construction || orderMaster?.construction || '';
                    if (constr) {
                      const m = constr.match(/(\d+(?:\.\d+)?)(?:\"|in|inch|\s*in)?$/i);
                      if (m) resolvedWidth = m[1];
                    }
                  }

                  const resolvedReed = designMaster?.reedCount || designMaster?.reed_count || orderMaster?.reed_count || orderMaster?.reedCount || '—';
                  const resolvedPick = designMaster?.pick || (orderMaster?.ppi !== undefined && orderMaster?.ppi !== null && orderMaster?.ppi !== '' ? String(orderMaster.ppi) : '') || orderMaster?.pick || '—';

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

                      <td className="p-3">
                        <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase border ${
                          isBeamConfirmed ? 'bg-emerald-100 text-emerald-900 border-emerald-300' :
                          hasBeamStock ? 'bg-blue-100 text-blue-900 border-blue-300' :
                          'bg-amber-100 text-amber-900 border-amber-300'
                        }`}>
                          {isBeamConfirmed ? 'BEAM CONFIRMED' : (hasBeamStock ? 'BEAM AVAILABLE' : 'BEAM PENDING')}
                        </span>
                      </td>

                      <td className="p-3 font-bold">
                        <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase ${
                          isLoomConfirmed ? 'bg-emerald-100 text-emerald-900' : isChangeRequested ? 'bg-red-100 text-red-900' : 'bg-blue-100 text-blue-900'
                        }`}>
                          {isLoomConfirmed ? 'LOOM CONFIRMED' : (isChangeRequested ? 'CHANGE REQUESTED' : 'PLANNED')}
                        </span>
                      </td>

                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => setSelectedPlanForReview(row)}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg font-bold text-xs flex items-center transition-all"
                          >
                            <Eye className="w-3.5 h-3.5 mr-1" /> VIEW BEAMS
                          </button>

                          {!isBeamConfirmed && (
                            <button
                              onClick={() => handleOpenConfirmBeamModal(row)}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs shadow-sm flex items-center transition-all"
                            >
                              <ShieldCheck className="w-3.5 h-3.5 mr-1" /> ALLOCATE BEAM
                            </button>
                          )}

                          {isBeamConfirmed && !isLoomConfirmed && (
                            <button
                              onClick={() => handleConfirmLoom(row)}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs shadow-sm flex items-center transition-all"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> CONFIRM LOOM
                            </button>
                          )}

                          {isLoomConfirmed && (
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
          return (bDesign && cleanModalDesign && bDesign === cleanModalDesign) ||
                 (bParty && cleanModalOrder && bParty === cleanModalOrder) ||
                 (bDesign && cleanModalOrder && bDesign === cleanModalOrder) ||
                 (bParty && cleanModalDesign && bParty === cleanModalDesign);
        };

        const isModalBeamAvailable = (b: any) => {
          const st = (b.status || '').toUpperCase();
          return st === 'AVAILABLE' || st === 'READY' || st === 'RUNNING' || (Number(b.available_meter || 0) > 0) || (Number(b.total_warped_meter || 0) > 0);
        };

        // System suggested beam
        const suggestedBeam = beams.find(b => checkModalBeamMatch(b) && isModalBeamAvailable(b));

        // Filter physical beams
        const allAvailableBeams = beams.filter(b => isModalBeamAvailable(b));
        
        const compatibleBeams = allAvailableBeams.filter(b => {
          const matchDesign = checkModalBeamMatch(b);
          const matchSearch = !beamSearchTerm ||
            (b.beam_no || '').toLowerCase().includes(beamSearchTerm.toLowerCase()) ||
            (b.design_no || '').toLowerCase().includes(beamSearchTerm.toLowerCase()) ||
            (b.party_beam_no || '').toLowerCase().includes(beamSearchTerm.toLowerCase()) ||
            (b.vendor_name || b.party || '').toLowerCase().includes(beamSearchTerm.toLowerCase());
          return matchDesign && matchSearch;
        });

        const incompatibleBeams = allAvailableBeams.filter(b => {
          const matchDesign = checkModalBeamMatch(b);
          const matchSearch = !beamSearchTerm ||
            (b.beam_no || '').toLowerCase().includes(beamSearchTerm.toLowerCase()) ||
            (b.design_no || '').toLowerCase().includes(beamSearchTerm.toLowerCase()) ||
            (b.party_beam_no || '').toLowerCase().includes(beamSearchTerm.toLowerCase());
          return !matchDesign && matchSearch;
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
                    <span className="text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded border border-emerald-300">Recommendation Only</span>
                  </div>
                ) : (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center space-x-2 text-amber-900 font-bold">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>0 Beams currently available in Beam Stock for Design "{confirmBeamModalPlan.next_design}". You may add beam stock in Beam Stock Master.</span>
                  </div>
                )}

                {/* Search & Filter Controls */}
                <div className="flex flex-wrap justify-between items-center gap-3 pt-1">
                  <div className="relative w-72">
                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search Beam No, Design, Vendor..."
                      value={beamSearchTerm}
                      onChange={e => setBeamSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>

                  <div className="flex items-center space-x-1.5 font-bold">
                    <button
                      onClick={() => setBeamFilterTab('COMPATIBLE')}
                      className={`px-3 py-1 rounded-lg border transition-all ${beamFilterTab === 'COMPATIBLE' ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-100 text-slate-700 border-slate-200'}`}
                    >
                      Compatible ({compatibleBeams.length})
                    </button>
                    <button
                      onClick={() => setBeamFilterTab('ALL_AVAILABLE')}
                      className={`px-3 py-1 rounded-lg border transition-all ${beamFilterTab === 'ALL_AVAILABLE' ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-100 text-slate-700 border-slate-200'}`}
                    >
                      All Available ({allAvailableBeams.length})
                    </button>
                    <button
                      onClick={() => setBeamFilterTab('INCOMPATIBLE')}
                      className={`px-3 py-1 rounded-lg border transition-all ${beamFilterTab === 'INCOMPATIBLE' ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-100 text-slate-700 border-slate-200'}`}
                    >
                      Incompatible ({incompatibleBeams.length})
                    </button>
                  </div>
                </div>

                {/* Physical Beam Selection Table */}
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left border-collapse whitespace-nowrap font-mono">
                    <thead>
                      <tr className="bg-slate-900 text-white text-[10px] uppercase font-black">
                        <th className="p-2.5 text-center w-10">Select</th>
                        <th className="p-2.5 text-amber-300">Beam No</th>
                        <th className="p-2.5 text-blue-300">Design</th>
                        <th className="p-2.5 text-right text-emerald-300">Warp Mtr</th>
                        <th className="p-2.5">Beam Type</th>
                        <th className="p-2.5 text-right">Beam Dia</th>
                        <th className="p-2.5 text-right">Width</th>
                        <th className="p-2.5 text-right">Ends</th>
                        <th className="p-2.5">Vendor</th>
                        <th className="p-2.5 text-center">Status</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-200 text-[11px]">
                      {displayedBeamsInTable.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="p-6 text-center text-slate-400 font-sans font-medium">
                            No physical beams match the selected filter.
                          </td>
                        </tr>
                      ) : (
                        displayedBeamsInTable.map(b => {
                          const isSelected = selectedBeamForConfirmation === b.id;
                          const isCompatible = checkModalBeamMatch(b);

                          return (
                            <tr
                              key={b.id}
                              onClick={() => isCompatible && setSelectedBeamForConfirmation(b.id)}
                              className={`cursor-pointer transition-colors ${
                                isSelected ? 'bg-emerald-50/80 font-bold border-l-4 border-l-emerald-600' :
                                !isCompatible ? 'opacity-50 bg-slate-50 cursor-not-allowed' : 'hover:bg-blue-50/40'
                              }`}
                            >
                              <td className="p-2.5 text-center">
                                <input
                                  type="radio"
                                  name="selectedBeamRadio"
                                  checked={isSelected}
                                  disabled={!isCompatible}
                                  onChange={() => setSelectedBeamForConfirmation(b.id)}
                                  className="w-4 h-4 text-emerald-600 cursor-pointer"
                                />
                              </td>

                              <td className="p-2.5 font-black text-slate-900">
                                Beam #{b.beam_no || b.beamNo}
                                {suggestedBeam?.id === b.id ? (
                                  <span className="ml-1.5 px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[9px] font-sans">SUGGESTED</span>
                                ) : null}
                              </td>

                              <td className="p-2.5 text-blue-700 font-bold">{b.design_no || '—'}</td>

                              <td className="p-2.5 text-right font-black text-emerald-700">{(b.available_meter || b.total_warped_meter || 5000).toLocaleString()} M</td>

                              <td className="p-2.5 font-semibold text-slate-700">{b.beam_type || 'Standard'}</td>

                              <td className="p-2.5 text-right">{b.beam_dia || 800} mm</td>

                              <td className="p-2.5 text-right">{b.beam_width || 68}"</td>

                              <td className="p-2.5 text-right">{b.total_ends || b.ends || 4648}</td>

                              <td className="p-2.5 font-medium text-slate-600">{b.vendor_name || b.party || 'In-House'}</td>

                              <td className="p-2.5 text-center font-sans">
                                <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${isCompatible ? 'bg-emerald-100 text-emerald-900' : 'bg-red-100 text-red-900'}`}>
                                  {isCompatible ? 'COMPATIBLE' : 'DESIGN MISMATCH'}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Selected Physical Beam Summary Details Card */}
                {chosenBeamObject ? (
                  <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl space-y-2 font-sans">
                    <div className="flex justify-between items-center">
                      <span className="font-black text-xs text-emerald-950 flex items-center">
                        <Check className="w-4 h-4 mr-1 text-emerald-600" /> SELECTED PHYSICAL BEAM: #{chosenBeamObject.beam_no}
                      </span>
                      <span className="text-[10px] font-bold text-emerald-800 bg-emerald-200/60 px-2 py-0.5 rounded">READY FOR ALLOCATION</span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-semibold text-emerald-900 pt-1 border-t border-emerald-200">
                      <div>Warp Meter: <strong>{(chosenBeamObject.available_meter || chosenBeamObject.total_warped_meter || 5000).toLocaleString()} M</strong></div>
                      <div>Vendor: <strong>{chosenBeamObject.vendor_name || chosenBeamObject.party || 'In-House'}</strong></div>
                      <div>Set No: <strong>{chosenBeamObject.set_no || 'N/A'}</strong></div>
                      <div>Location: <strong>{chosenBeamObject.location || 'At Sizing'}</strong></div>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-slate-100 border border-slate-200 rounded-xl text-slate-600 font-semibold text-center font-sans text-xs">
                    👉 Click a radio button row above to select a physical beam for confirmation.
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
                <Sparkles className="w-5 h-5 mr-2 text-blue-400" /> Beam Selection Panel — Loom {selectedPlanForReview.loom_no}
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
                  .filter(b => (b.design_no || b.designNo || '').trim().toLowerCase() === selectedPlanForReview.next_design.trim().toLowerCase())
                  .map(b => {
                    const isSelected = selectedPlanForReview.reserved_beam_id === b.id;
                    const isAvailable = b.status === 'Available' || b.status === 'AVAILABLE';

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
