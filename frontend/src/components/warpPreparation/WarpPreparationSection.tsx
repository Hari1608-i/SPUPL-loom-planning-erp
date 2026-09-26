import React, { useState, useEffect, useMemo } from 'react';
import { 
  Scissors, Search, RefreshCw, CheckCircle2, AlertTriangle, Clock, 
  History as HistoryIcon, Lock, Save, Layers, User, Calendar, FileText, ChevronDown, ChevronUp
} from 'lucide-react';
import { format } from 'date-fns';
import { API_BASE_URL } from '../../config';
import { WarpPrepHistoryModal } from './WarpPrepHistoryModal';
import { WarpPrepConfirmationModal, WarpPrepDetails } from './WarpPrepConfirmationModal';

interface ProcessFormState {
  processType: 'KNOTTING' | 'KNOTTING_SORT_CHANGE' | 'GAITING';
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  startDate: string;
  startTime: string;
  completionDate: string;
  completionTime: string;
  responsiblePerson: string;
  remarks: string;
}

interface Props {
  looms: any[];
  designs: any[];
  activeRuns: Record<number, any>;
  rawNextPlans: any[];
}

export const WarpPreparationSection: React.FC<Props> = ({
  looms,
  designs,
  activeRuns,
  rawNextPlans
}) => {
  const [prepRecords, setPrepRecords] = useState<Record<number, any>>({});
  const [evaluations, setEvaluations] = useState<Record<number, WarpPrepDetails>>({});
  const [formStates, setFormStates] = useState<Record<number, ProcessFormState>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [isLoading, setIsLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [savingLoom, setSavingLoom] = useState<number | null>(null);
  const [isSectionOpen, setIsSectionOpen] = useState(true);

  // Modals
  const [historyLoomNo, setHistoryLoomNo] = useState<number | null>(null);
  const [confirmModalDetails, setConfirmModalDetails] = useState<WarpPrepDetails | null>(null);

  const fetchPreparationData = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/warp-preparation/all`);
      const data = await res.json();
      if (data.success && data.latestByLoom) {
        setPrepRecords(data.latestByLoom);
      }
    } catch (e: any) {
      console.error('Failed to fetch preparation records:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPreparationData();
  }, []);

  // Sync / fetch evaluation details for all looms that have an active plan or running transition
  useEffect(() => {
    const plansByLoom: Record<number, any> = {};
    rawNextPlans.forEach(p => {
      const st = (p.status || '').toUpperCase();
      if (st !== 'CANCELLED' && st !== 'COMPLETED' && p.next_design) {
        if (!plansByLoom[p.loom_no]) {
          plansByLoom[p.loom_no] = p;
        }
      }
    });

    // For each planned loom, fetch evaluation if not already evaluated
    Object.keys(plansByLoom).forEach(loomStr => {
      const lNo = Number(loomStr);
      const plan = plansByLoom[lNo];
      if (plan && !evaluations[lNo]) {
        fetch(`${API_BASE_URL}/api/warp-preparation/evaluate/${plan.id}`)
          .then(r => r.json())
          .then(res => {
            if (res.success && res.details) {
              setEvaluations(prev => ({ ...prev, [lNo]: res.details }));
            }
          })
          .catch(() => {});
      }
    });
  }, [rawNextPlans]);

  // Synchronize form states when prepRecords or evaluations update
  useEffect(() => {
    const newFormStates: Record<number, ProcessFormState> = { ...formStates };

    looms.forEach(l => {
      const lNo = l.loomNo;
      const rec = prepRecords[lNo];
      const ev = evaluations[lNo];

      if (rec && !newFormStates[lNo]) {
        newFormStates[lNo] = {
          processType: (rec.confirmed_process || rec.process_type || 'KNOTTING') as any,
          status: (rec.status || 'PENDING') as any,
          startDate: rec.process_start_date ? format(new Date(rec.process_start_date), 'yyyy-MM-dd') : '',
          startTime: rec.process_start_time || '',
          completionDate: rec.process_completion_date ? format(new Date(rec.process_completion_date), 'yyyy-MM-dd') : '',
          completionTime: rec.process_completion_time || '',
          responsiblePerson: rec.responsible_person || '',
          remarks: rec.remarks || ''
        };
      } else if (!newFormStates[lNo] && ev) {
        newFormStates[lNo] = {
          processType: (ev.evaluation?.isEligible ? 'KNOTTING' : 'KNOTTING_SORT_CHANGE') as any,
          status: 'PENDING',
          startDate: '',
          startTime: '',
          completionDate: '',
          completionTime: '',
          responsiblePerson: '',
          remarks: ''
        };
      }
    });

    setFormStates(newFormStates);
  }, [prepRecords, evaluations, looms]);

  // Handle local form edit
  const handleFormFieldChange = (loomNo: number, field: keyof ProcessFormState, value: string) => {
    setFormStates(prev => ({
      ...prev,
      [loomNo]: {
        ...(prev[loomNo] || {
          processType: 'KNOTTING',
          status: 'PENDING',
          startDate: '',
          startTime: '',
          completionDate: '',
          completionTime: '',
          responsiblePerson: '',
          remarks: ''
        }),
        [field]: value
      }
    }));
  };

  // Save / Update Process record to database
  const handleSaveProcess = async (loomNo: number) => {
    const fState = formStates[loomNo];
    const rec = prepRecords[loomNo];
    const ev = evaluations[loomNo];

    if (!fState) return;

    setSavingLoom(loomNo);
    setActionMsg(null);

    try {
      if (rec && rec.id) {
        // Update existing record
        const res = await fetch(`${API_BASE_URL}/api/warp-preparation/status/${rec.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: fState.status,
            processStartDate: fState.startDate ? fState.startDate : null,
            processStartTime: fState.startTime || null,
            processCompletionDate: fState.completionDate ? fState.completionDate : null,
            processCompletionTime: fState.completionTime || null,
            responsiblePerson: fState.responsiblePerson || null,
            remarks: fState.remarks || null
          })
        });

        const data = await res.json();
        if (!res.ok) {
          setActionMsg({ type: 'error', text: data.error || 'Failed to update process status.' });
        } else {
          setActionMsg({ type: 'success', text: `✅ Loom ${loomNo} preparation process updated to ${fState.status}!` });
          await fetchPreparationData();
        }
      } else {
        // Confirm new record for this plan
        const targetPlanId = ev?.planId;
        const res = await fetch(`${API_BASE_URL}/api/warp-preparation/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            planId: targetPlanId,
            loomNo,
            processType: fState.processType,
            responsiblePerson: fState.responsiblePerson,
            remarks: fState.remarks
          })
        });

        const data = await res.json();
        if (!res.ok) {
          setActionMsg({ type: 'error', text: data.error || 'Failed to confirm preparation process.' });
        } else {
          setActionMsg({ type: 'success', text: `✅ Loom ${loomNo} preparation process confirmed and saved in DB!` });
          await fetchPreparationData();
        }
      }
    } catch (e: any) {
      setActionMsg({ type: 'error', text: 'Error saving process: ' + e.message });
    } finally {
      setSavingLoom(null);
    }
  };

  // Compile list of looms that have an active plan or existing preparation record
  const plannedLoomItems = useMemo(() => {
    return looms
      .map(loom => {
        const lNo = loom.loomNo;
        const activeRun = activeRuns[lNo];
        const nextPlan = rawNextPlans.find(
          p => p.loom_no === lNo && (p.status || '').toUpperCase() !== 'CANCELLED' && (p.status || '').toUpperCase() !== 'COMPLETED' && p.next_design
        );
        const record = prepRecords[lNo];
        const evalItem = evaluations[lNo];

        return {
          loom,
          lNo,
          activeRun,
          nextPlan,
          record,
          evalItem
        };
      })
      .filter(item => {
        // Show if there is a planned next design or existing preparation record
        return !!(item.nextPlan || item.record || item.evalItem);
      })
      .filter(item => {
        // Search filter
        if (!searchTerm) return true;
        const q = searchTerm.toLowerCase();
        const lMatch = String(item.lNo).includes(q);
        const curDesMatch = (item.activeRun?.designNo || '').toLowerCase().includes(q);
        const nextDesMatch = (item.nextPlan?.next_design || '').toLowerCase().includes(q);
        const orderMatch = (item.nextPlan?.order_no || '').toLowerCase().includes(q);
        return lMatch || curDesMatch || nextDesMatch || orderMatch;
      })
      .filter(item => {
        // Status filter
        if (filterStatus === 'ALL') return true;
        const st = (item.record?.status || 'PENDING').toUpperCase();
        return st === filterStatus;
      });
  }, [looms, activeRuns, rawNextPlans, prepRecords, evaluations, searchTerm, filterStatus]);

  // Overall counts for summary
  const summaryCounts = useMemo(() => {
    let knottingSuggested = 0;
    let pending = 0;
    let inProgress = 0;
    let completed = 0;

    Object.values(prepRecords).forEach((r: any) => {
      if (r.status === 'COMPLETED') completed++;
      else if (r.status === 'IN_PROGRESS') inProgress++;
      else pending++;
    });

    Object.values(evaluations).forEach((ev: any) => {
      if (ev.evaluation?.isEligible) knottingSuggested++;
    });

    return {
      total: Object.keys(prepRecords).length,
      knottingSuggested,
      pending,
      inProgress,
      completed
    };
  }, [prepRecords, evaluations]);

  // Helper for status badge style
  const getProcessStatusBadge = (rec: any, ev: any) => {
    if (!rec) {
      if (ev?.evaluation?.isEligible) {
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-300">
            Knotting Suggested
          </span>
        );
      }
      return (
        <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-slate-100 text-slate-700 border border-slate-300">
          Awaiting Planner Confirmation
        </span>
      );
    }

    if (rec.status === 'COMPLETED') {
      return (
        <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-emerald-600 text-white shadow-sm flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" /> Completed
        </span>
      );
    }

    if (rec.status === 'IN_PROGRESS') {
      return (
        <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-blue-100 text-blue-800 border border-blue-300 animate-pulse flex items-center gap-1">
          <Clock className="w-3 h-3 text-blue-600" /> In Progress
        </span>
      );
    }

    // PENDING
    const pType = rec.confirmed_process || rec.process_type;
    if (pType === 'KNOTTING') {
      return (
        <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-300">
          Knotting Pending
        </span>
      );
    }
    if (pType === 'KNOTTING_SORT_CHANGE') {
      return (
        <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-indigo-100 text-indigo-800 border border-indigo-300">
          Knotting Sort Change Pending
        </span>
      );
    }
    return (
      <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-purple-100 text-purple-800 border border-purple-300">
        Gaiting Pending
      </span>
    );
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden text-xs">
      
      {/* ── Section Header Bar ── */}
      <div 
        onClick={() => setIsSectionOpen(!isSectionOpen)}
        className="p-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex flex-wrap items-center justify-between gap-3 cursor-pointer select-none"
      >
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-600/80 rounded-xl text-white font-black shadow-inner">
            <Scissors className="w-5 h-5 text-indigo-100" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-black uppercase tracking-wider text-indigo-200">
                WARP PREPARATION & KNOTTING
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/30 text-indigo-300 border border-indigo-400/40">
                Loom Transitions & Warp Loading Prerequisites
              </span>
            </div>
            <p className="text-xs text-slate-300/80 font-medium">
              Evaluates running vs next planned designs, automates Knotting eligibility (formula: Ends Diff ≤ 1, same SP No & colors), records Sort Change or Gaiting, and manages physical preparation workflow.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Quick Metrics Badges */}
          <div className="hidden md:flex items-center gap-2 text-[10px] font-bold">
            <span className="px-2.5 py-1 bg-emerald-900/60 text-emerald-200 border border-emerald-700/60 rounded-lg">
              Knotting Suggested: {summaryCounts.knottingSuggested}
            </span>
            <span className="px-2.5 py-1 bg-amber-900/60 text-amber-200 border border-amber-700/60 rounded-lg">
              Pending: {summaryCounts.pending}
            </span>
            <span className="px-2.5 py-1 bg-blue-900/60 text-blue-200 border border-blue-700/60 rounded-lg">
              In Progress: {summaryCounts.inProgress}
            </span>
            <span className="px-2.5 py-1 bg-emerald-950 text-emerald-300 border border-emerald-800 rounded-lg">
              Completed: {summaryCounts.completed}
            </span>
          </div>

          <button 
            type="button"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
          >
            {isSectionOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {isSectionOpen && (
        <div className="p-5 space-y-4">
          
          {/* Action Notification Alert */}
          {actionMsg && (
            <div className={`p-3 rounded-xl border flex items-center justify-between text-xs font-bold animate-fade-in ${
              actionMsg.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 text-emerald-800 dark:text-emerald-300'
                : 'bg-red-50 dark:bg-red-950/40 border-red-300 text-red-800 dark:text-red-300'
            }`}>
              <div className="flex items-center gap-2">
                {actionMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-red-600" />}
                <span>{actionMsg.text}</span>
              </div>
              <button onClick={() => setActionMsg(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
          )}

          {/* Search & Filter Toolbar */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-slate-50 dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search Loom No, SP No, Order No, Design..."
                className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-slate-500">Filter Status:</span>
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold"
              >
                <option value="ALL">All Statuses ({summaryCounts.total})</option>
                <option value="PENDING">Pending ({summaryCounts.pending})</option>
                <option value="IN_PROGRESS">In Progress ({summaryCounts.inProgress})</option>
                <option value="COMPLETED">Completed ({summaryCounts.completed})</option>
              </select>

              <button
                onClick={fetchPreparationData}
                disabled={isLoading}
                className="p-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 text-slate-700 dark:text-slate-300"
                title="Refresh Preparation Data"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Loom Cards / Tables */}
          {plannedLoomItems.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 dark:bg-slate-900 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 text-slate-400">
              No active or planned loom transitions requiring warp preparation currently match the filter.
            </div>
          ) : (
            <div className="space-y-4">
              {plannedLoomItems.map(item => {
                const { loom, lNo, activeRun, nextPlan, record, evalItem } = item;
                const formState = formStates[lNo] || {
                  processType: 'KNOTTING',
                  status: 'PENDING',
                  startDate: '',
                  startTime: '',
                  completionDate: '',
                  completionTime: '',
                  responsiblePerson: '',
                  remarks: ''
                };

                const currentDesign = activeRun?.designNo || evalItem?.currentDesign || 'None (Empty Loom)';
                const nextDesign = nextPlan?.next_design || evalItem?.nextDesign || '—';
                const orderNo = nextPlan?.order_no || evalItem?.orderNo || '—';
                const currentEnds = evalItem?.currentEnds ?? '—';
                const nextEnds = evalItem?.nextEnds ?? '—';
                const endsDiff = evalItem?.endsDifference !== null && evalItem?.endsDifference !== undefined ? evalItem.endsDifference : '—';
                const currentWarpColours = evalItem?.currentWarpColours || 'Standard';
                const nextWarpColours = evalItem?.nextWarpColours || 'Standard';
                const currentWarpColourCount = evalItem?.currentWarpColourCount ?? 1;
                const nextWarpColourCount = evalItem?.nextWarpColourCount ?? 1;
                const setNo = nextPlan?.reserved_set_no || evalItem?.setNo || activeRun?.setNo || '—';
                const beamNo = nextPlan?.reserved_beam_no || evalItem?.beamNo || activeRun?.currentBeamNo || '—';
                const warpLoadingDate = nextPlan?.planned_start_date || evalItem?.warpLoadingDate;

                const isKnottingEligible = evalItem?.evaluation?.isEligible;
                const suggestedProcessLabel = evalItem?.evaluation?.suggestedProcessLabel || (isKnottingEligible ? 'KNOTTING SUGGESTED' : 'KNOTTING SORT CHANGE / GAITING REQUIRED');

                return (
                  <div
                    key={`prep-card-${lNo}`}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm space-y-4"
                  >
                    {/* Header Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-700 pb-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="px-2.5 py-1 bg-spu-primary text-white font-black text-xs rounded-lg shadow-sm">
                          LOOM {lNo}
                        </span>
                        <span className="font-bold text-slate-700 dark:text-slate-300">
                          Unit: {loom.unit || 'UNIT 1'}
                        </span>
                        {nextPlan && (
                          <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">
                            Plan ID #{nextPlan.id}
                          </span>
                        )}
                        {record && (
                          <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800">
                            Prep Record #{record.id}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {getProcessStatusBadge(record, evalItem)}

                        <button
                          onClick={() => setHistoryLoomNo(lNo)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-colors"
                          title="View complete historical logs for this loom"
                        >
                          <HistoryIcon className="w-3 h-3 text-slate-500" /> History
                        </button>
                      </div>
                    </div>

                    {/* TWO-COLUMN LAYOUT: A. READ-ONLY PLAN DETAILS | B. PROCESS ENTRY FIELDS */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                      
                      {/* ── A. 16 READ-ONLY PLAN DETAILS (8 Cols) ── */}
                      <div className="lg:col-span-7 p-3.5 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2.5">
                        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-1.5">
                          <h4 className="font-black text-[11px] uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                            <Lock className="w-3.5 h-3.5 text-slate-500" /> A. READ-ONLY PLAN DETAILS (Source of Truth)
                          </h4>
                          <span className="text-[10px] text-slate-400 italic">Locked from editing</span>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-2 text-[11px]">
                          {/* 1. Loom No */}
                          <div>
                            <span className="text-slate-400 text-[10px] block">1. Loom No</span>
                            <span className="font-black text-slate-900 dark:text-white">L-{lNo}</span>
                          </div>

                          {/* 2. Unit */}
                          <div>
                            <span className="text-slate-400 text-[10px] block">2. Unit</span>
                            <span className="font-bold text-slate-800 dark:text-slate-200">{loom.unit || 'UNIT 1'}</span>
                          </div>

                          {/* 3. Current SP No */}
                          <div>
                            <span className="text-slate-400 text-[10px] block">3. Current Design / SP</span>
                            <span className="font-bold text-purple-700 dark:text-purple-300 truncate block" title={currentDesign}>
                              {currentDesign}
                            </span>
                          </div>

                          {/* 4. Next Planned SP No */}
                          <div>
                            <span className="text-slate-400 text-[10px] block">4. Next Planned SP</span>
                            <span className="font-black text-blue-700 dark:text-blue-300 truncate block" title={nextDesign}>
                              {nextDesign}
                            </span>
                          </div>

                          {/* 5. Order No / IBPO */}
                          <div>
                            <span className="text-slate-400 text-[10px] block">5. Order No / IBPO</span>
                            <span className="font-bold text-slate-900 dark:text-white">{orderNo}</span>
                          </div>

                          {/* 6. Current Total Ends */}
                          <div>
                            <span className="text-slate-400 text-[10px] block">6. Current Ends</span>
                            <span className="font-bold text-slate-800 dark:text-slate-200">{currentEnds}</span>
                          </div>

                          {/* 7. Next Planned Total Ends */}
                          <div>
                            <span className="text-slate-400 text-[10px] block">7. Next Ends</span>
                            <span className="font-bold text-slate-800 dark:text-slate-200">{nextEnds}</span>
                          </div>

                          {/* 12. Ends Difference */}
                          <div>
                            <span className="text-slate-400 text-[10px] block">12. Ends Diff (ABS)</span>
                            <span className={`font-black px-1.5 py-0.2 rounded text-[10px] inline-block ${
                              endsDiff !== '—' && Number(endsDiff) <= 1 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                            }`}>
                              {endsDiff}
                            </span>
                          </div>

                          {/* 8. Current Warp Colour */}
                          <div>
                            <span className="text-slate-400 text-[10px] block">8. Current Warp Clr</span>
                            <span className="font-medium text-slate-800 dark:text-slate-200">{currentWarpColours}</span>
                          </div>

                          {/* 9. Next Planned Warp Colour */}
                          <div>
                            <span className="text-slate-400 text-[10px] block">9. Next Warp Clr</span>
                            <span className="font-medium text-slate-800 dark:text-slate-200">{nextWarpColours}</span>
                          </div>

                          {/* 10. Current Number of Warp Colours */}
                          <div>
                            <span className="text-slate-400 text-[10px] block">10. Curr Clr Count</span>
                            <span className="font-bold text-slate-800 dark:text-slate-200">{currentWarpColourCount}</span>
                          </div>

                          {/* 11. Next Number of Warp Colours */}
                          <div>
                            <span className="text-slate-400 text-[10px] block">11. Next Clr Count</span>
                            <span className="font-bold text-slate-800 dark:text-slate-200">{nextWarpColourCount}</span>
                          </div>

                          {/* 13. Set No */}
                          <div>
                            <span className="text-slate-400 text-[10px] block">13. Set No</span>
                            <span className="font-bold text-slate-800 dark:text-slate-200">{setNo}</span>
                          </div>

                          {/* 14. Beam No */}
                          <div>
                            <span className="text-slate-400 text-[10px] block">14. Beam No</span>
                            <span className="font-mono text-indigo-700 dark:text-indigo-300 font-bold">{beamNo}</span>
                          </div>

                          {/* 15. Warp Loading Date */}
                          <div>
                            <span className="text-slate-400 text-[10px] block">15. Warp Load Date</span>
                            <span className="font-medium text-slate-800 dark:text-slate-200">
                              {warpLoadingDate ? format(new Date(warpLoadingDate), 'dd-MM-yyyy') : '—'}
                            </span>
                          </div>

                          {/* 16. Suggested Process */}
                          <div className="col-span-2 md:col-span-1">
                            <span className="text-slate-400 text-[10px] block">16. Suggested</span>
                            <span className={`font-black text-[10px] px-1.5 py-0.5 rounded inline-block ${
                              isKnottingEligible ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                            }`}>
                              {isKnottingEligible ? 'KNOTTING' : 'SORT CHG / GAITING'}
                            </span>
                          </div>
                        </div>

                        {/* Ineligibility Reasons if applicable */}
                        {!isKnottingEligible && evalItem?.evaluation?.reasons && evalItem.evaluation.reasons.length > 0 && (
                          <div className="text-[10px] text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/30 p-2 rounded-lg border border-amber-200 dark:border-amber-800 space-y-0.5">
                            <span className="font-bold">Reasons Knotting Not Suggested:</span>
                            {evalItem.evaluation.reasons.map((r: string, idx: number) => (
                              <div key={idx}>• {r}</div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* ── B. 8 PROCESS ENTRY FIELDS (5 Cols) ── */}
                      <div className="lg:col-span-5 p-3.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-1.5">
                          <h4 className="font-black text-[11px] uppercase tracking-wider text-indigo-700 dark:text-indigo-400 flex items-center gap-1.5">
                            <Scissors className="w-3.5 h-3.5" /> B. PROCESS ENTRY FIELDS
                          </h4>
                          <span className="text-[10px] text-slate-500 font-semibold">User-Entered Actuals</span>
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-[11px]">
                          
                          {/* 1. Process Type */}
                          <div className="col-span-2">
                            <label className="text-[10px] font-bold text-slate-500 block mb-1">
                              1. Process Type <span className="text-red-500">*</span>
                            </label>
                            <select
                              value={formState.processType}
                              onChange={e => handleFormFieldChange(lNo, 'processType', e.target.value)}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 font-black text-xs"
                            >
                              <option value="KNOTTING" disabled={!isKnottingEligible && !record}>
                                KNOTTING {isKnottingEligible ? '(Recommended)' : '(Ineligible)'}
                              </option>
                              <option value="KNOTTING_SORT_CHANGE">KNOTTING SORT CHANGE</option>
                              <option value="GAITING">GAITING</option>
                            </select>
                          </div>

                          {/* 2. Process Status */}
                          <div className="col-span-2">
                            <label className="text-[10px] font-bold text-slate-500 block mb-1">
                              2. Process Status <span className="text-red-500">*</span>
                            </label>
                            <select
                              value={formState.status}
                              onChange={e => handleFormFieldChange(lNo, 'status', e.target.value)}
                              className={`w-full px-2.5 py-1.5 rounded-lg border font-black text-xs ${
                                formState.status === 'COMPLETED'
                                  ? 'bg-emerald-50 border-emerald-400 text-emerald-800'
                                  : formState.status === 'IN_PROGRESS'
                                  ? 'bg-blue-50 border-blue-400 text-blue-800'
                                  : 'bg-amber-50 border-amber-400 text-amber-800'
                              }`}
                            >
                              <option value="PENDING">PENDING</option>
                              <option value="IN_PROGRESS">IN PROGRESS</option>
                              <option value="COMPLETED">COMPLETED</option>
                            </select>
                          </div>

                          {/* 3. Process Start Date */}
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 block mb-1">
                              3. Start Date
                            </label>
                            <input
                              type="date"
                              value={formState.startDate}
                              onChange={e => handleFormFieldChange(lNo, 'startDate', e.target.value)}
                              className="w-full px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-[11px]"
                            />
                          </div>

                          {/* 4. Process Start Time */}
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 block mb-1">
                              4. Start Time
                            </label>
                            <input
                              type="time"
                              value={formState.startTime}
                              onChange={e => handleFormFieldChange(lNo, 'startTime', e.target.value)}
                              className="w-full px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-[11px]"
                            />
                          </div>

                          {/* 5. Process Completion Date */}
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 block mb-1">
                              5. Completion Date
                            </label>
                            <input
                              type="date"
                              value={formState.completionDate}
                              onChange={e => handleFormFieldChange(lNo, 'completionDate', e.target.value)}
                              className="w-full px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-[11px]"
                            />
                          </div>

                          {/* 6. Process Completion Time */}
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 block mb-1">
                              6. Completion Time
                            </label>
                            <input
                              type="time"
                              value={formState.completionTime}
                              onChange={e => handleFormFieldChange(lNo, 'completionTime', e.target.value)}
                              className="w-full px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-[11px]"
                            />
                          </div>

                          {/* 7. Responsible Person / Employee */}
                          <div className="col-span-2">
                            <label className="text-[10px] font-bold text-slate-500 block mb-1">
                              7. Responsible Person / Employee
                            </label>
                            <input
                              type="text"
                              value={formState.responsiblePerson}
                              placeholder="e.g. Ramesh Kumar (Operator)"
                              onChange={e => handleFormFieldChange(lNo, 'responsiblePerson', e.target.value)}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-medium"
                            />
                          </div>

                          {/* 8. Remarks */}
                          <div className="col-span-2">
                            <label className="text-[10px] font-bold text-slate-500 block mb-1">
                              8. Remarks
                            </label>
                            <input
                              type="text"
                              value={formState.remarks}
                              placeholder="Process observations, warp condition, etc."
                              onChange={e => handleFormFieldChange(lNo, 'remarks', e.target.value)}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-medium"
                            />
                          </div>

                        </div>

                        {/* Save / Update Button */}
                        <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-end">
                          <button
                            disabled={savingLoom === lNo}
                            onClick={() => handleSaveProcess(lNo)}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl text-xs shadow-md transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
                          >
                            <Save className="w-3.5 h-3.5" />
                            <span>{savingLoom === lNo ? 'Saving...' : 'Update Preparation Status'}</span>
                          </button>
                        </div>

                      </div>

                    </div>

                  </div>
                );
              })}
            </div>
          )}

        </div>
      )}

      {/* History Modal */}
      {historyLoomNo !== null && (
        <WarpPrepHistoryModal
          isOpen={historyLoomNo !== null}
          onClose={() => setHistoryLoomNo(null)}
          loomNo={historyLoomNo}
        />
      )}

      {/* Planner Confirmation Modal */}
      {confirmModalDetails !== null && (
        <WarpPrepConfirmationModal
          isOpen={confirmModalDetails !== null}
          onClose={() => setConfirmModalDetails(null)}
          details={confirmModalDetails}
          onSuccess={fetchPreparationData}
        />
      )}

    </div>
  );
};
