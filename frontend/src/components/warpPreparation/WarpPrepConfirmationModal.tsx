import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, AlertTriangle, Play, Calendar, Layers, Sparkles, User, MessageSquare } from 'lucide-react';
import { API_BASE_URL } from '../../config';

export interface WarpPrepEvaluation {
  isEligible: boolean;
  suggestedProcess: string;
  suggestedProcessLabel: string;
  sameSp: boolean;
  sameWarpColours: boolean;
  sameColourCount: boolean;
  endsDifference: number | null;
  endsDiffOk: boolean;
  reasons: string[];
}

export interface WarpPrepDetails {
  planId: number;
  loomNo: number;
  unit: string;
  currentDesign: string;
  nextDesign: string;
  orderNo: string;
  currentEnds: number | null;
  nextEnds: number | null;
  endsDifference: number | null;
  currentWarpColours: string;
  nextWarpColours: string;
  currentWarpColourCount: number;
  nextWarpColourCount: number;
  setNo: string;
  beamNo: string;
  warpLoadingDate: string | null;
  evaluation: WarpPrepEvaluation;
  existingProcess?: any | null;
}

export interface WarpPrepConfirmPayload {
  planId: number;
  loomNo: number;
  processType: 'KNOTTING' | 'KNOTTING_SORT_CHANGE' | 'GAITING';
  startDate: string;
  responsiblePerson?: string;
  remarks?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  details: WarpPrepDetails | null;
  onSuccess: (result?: any) => void;
  onConfirm?: (payload: WarpPrepConfirmPayload) => Promise<void> | void;
  mode?: 'CONFIRM_LOOM' | 'PREP_ONLY';
}

export const WarpPrepConfirmationModal: React.FC<Props> = ({
  isOpen,
  onClose,
  details,
  onSuccess,
  onConfirm,
  mode = 'PREP_ONLY'
}) => {
  const [selectedProcess, setSelectedProcess] = useState<'KNOTTING' | 'KNOTTING_SORT_CHANGE' | 'GAITING'>('KNOTTING');
  const [loomStartDate, setLoomStartDate] = useState('');
  const [responsiblePerson, setResponsiblePerson] = useState('');
  const [remarks, setRemarks] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (details) {
      if (details.existingProcess?.confirmed_process) {
        setSelectedProcess(details.existingProcess.confirmed_process);
        setResponsiblePerson(details.existingProcess.responsible_person || '');
        setRemarks(details.existingProcess.remarks || '');
      } else if (details.evaluation?.isEligible) {
        setSelectedProcess('KNOTTING');
      } else {
        setSelectedProcess('KNOTTING_SORT_CHANGE');
      }

      // Initialize Loom Start Date
      const defaultDate = details.warpLoadingDate
        ? String(details.warpLoadingDate).split('T')[0]
        : new Date().toISOString().split('T')[0];
      setLoomStartDate(defaultDate);

      setErrorMsg(null);
    }
  }, [details]);

  if (!isOpen || !details) return null;

  const { evaluation } = details;
  const isEligible = evaluation?.isEligible;
  const isLoomConfirmMode = mode === 'CONFIRM_LOOM';

  const handleSubmit = async () => {
    if (!loomStartDate) {
      setErrorMsg('Please select a valid Loom Start Date.');
      return;
    }

    if (!selectedProcess) {
      setErrorMsg('Please select a process type.');
      return;
    }

    if (selectedProcess === 'KNOTTING' && !isEligible) {
      setErrorMsg('Normal Knotting cannot be confirmed because Knotting eligibility rules are not satisfied.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    const payload: WarpPrepConfirmPayload = {
      planId: details.planId,
      loomNo: details.loomNo,
      processType: selectedProcess,
      startDate: loomStartDate,
      responsiblePerson,
      remarks
    };

    try {
      if (onConfirm) {
        await onConfirm(payload);
        onSuccess(payload);
        onClose();
      } else {
        const res = await fetch(`${API_BASE_URL}/api/warp-preparation/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            planId: details.planId,
            loomNo: details.loomNo,
            processType: selectedProcess,
            startDate: loomStartDate,
            responsiblePerson,
            remarks
          })
        });

        const data = await res.json();
        if (!res.ok) {
          setErrorMsg(data.error || 'Failed to confirm warp preparation process.');
        } else {
          onSuccess(data);
          onClose();
        }
      }
    } catch (e: any) {
      setErrorMsg('Error: ' + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full my-8 overflow-hidden border border-slate-200 dark:border-slate-700 animate-fade-in">
        
        {/* Header */}
        <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-blue-600 text-white font-black text-xs rounded">
              L-{details.loomNo}
            </span>
            <h3 className="font-bold text-sm tracking-tight">
              {isLoomConfirmMode
                ? `Loom ${details.loomNo} Confirmation & Process Setup`
                : `Planner Confirmation: Warp Preparation & Knotting (Loom ${details.loomNo})`}
            </h3>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-xs max-h-[80vh] overflow-y-auto custom-scrollbar">
          
          {/* Error Banner */}
          {errorMsg && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-700 rounded-xl text-red-800 dark:text-red-300 font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Knotting Eligibility Banner */}
          <div className={`p-3.5 rounded-xl border ${
            isEligible 
              ? 'bg-emerald-50 border-emerald-300 dark:bg-emerald-950/30 dark:border-emerald-800' 
              : 'bg-amber-50 border-amber-300 dark:bg-amber-950/30 dark:border-amber-800'
          }`}>
            <div className="flex items-center justify-between mb-1">
              <span className={`px-2.5 py-1 rounded-full font-black text-xs uppercase tracking-wider ${
                isEligible 
                  ? 'bg-emerald-600 text-white' 
                  : 'bg-amber-600 text-white'
              }`}>
                {isEligible ? '✅ KNOTTING SUGGESTED' : '⚠️ KNOTTING SORT CHANGE / GAITING REQUIRED'}
              </span>
              <span className="text-[11px] font-bold text-slate-500">
                Loom {details.loomNo} ({details.unit || 'Unit 1'}) | Plan #{details.planId}
              </span>
            </div>

            {!isEligible && evaluation?.reasons && evaluation.reasons.length > 0 && (
              <div className="mt-2 text-[11px] text-amber-900 dark:text-amber-200 bg-amber-100/60 dark:bg-amber-900/40 p-2 rounded-lg border border-amber-200 dark:border-amber-800 space-y-0.5">
                <span className="font-bold block">Reasons Knotting Not Suggested:</span>
                <ul className="list-disc list-inside space-y-0.5">
                  {evaluation.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Loom Start Date (MANDATORY) */}
          <div className="p-3.5 bg-blue-50/70 dark:bg-blue-950/30 rounded-xl border border-blue-200 dark:border-blue-800">
            <label className="font-black text-slate-900 dark:text-white text-xs uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
              <Calendar className="w-4 h-4 text-blue-600" />
              Loom Start Date <span className="text-red-500 font-black">* (Required)</span>
            </label>
            <div className="flex items-center gap-3">
              <input
                type="date"
                required
                value={loomStartDate}
                onChange={e => setLoomStartDate(e.target.value)}
                className="w-full max-w-xs px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-black text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 shadow-xs"
              />
              <span className="text-[11px] text-slate-500 font-medium">
                Flows directly into Main Entry & Completed Warp History
              </span>
            </div>
          </div>

          {/* Process Selection Section */}
          <div className="space-y-2">
            <label className="font-black text-slate-900 dark:text-white text-xs uppercase tracking-wider block">
              Confirm Process Type <span className="text-red-500">*</span>
            </label>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              
              {/* Option 1: KNOTTING */}
              <label className={`p-3 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
                selectedProcess === 'KNOTTING'
                  ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-100 ring-2 ring-emerald-400'
                  : !isEligible
                  ? 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 opacity-60 cursor-not-allowed text-slate-400'
                  : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 text-slate-800 dark:text-slate-200'
              }`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-black text-xs uppercase">1. KNOTTING</span>
                  <input
                    type="radio"
                    name="prepProcessOption"
                    value="KNOTTING"
                    disabled={!isEligible}
                    checked={selectedProcess === 'KNOTTING'}
                    onChange={() => setSelectedProcess('KNOTTING')}
                    className="accent-emerald-600 w-4 h-4"
                  />
                </div>
                <p className="text-[10px] leading-tight">
                  {isEligible ? 'Direct tie-in of warp ends (eligible).' : 'Ineligible: Requirements not satisfied.'}
                </p>
              </label>

              {/* Option 2: KNOTTING SORT CHANGE */}
              <label className={`p-3 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
                selectedProcess === 'KNOTTING_SORT_CHANGE'
                  ? 'border-amber-600 bg-amber-50/70 dark:bg-amber-950/40 text-amber-900 dark:text-amber-100 ring-2 ring-amber-400'
                  : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 text-slate-800 dark:text-slate-200'
              }`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-black text-xs uppercase">2. KNOTTING SORT CHANGE</span>
                  <input
                    type="radio"
                    name="prepProcessOption"
                    value="KNOTTING_SORT_CHANGE"
                    checked={selectedProcess === 'KNOTTING_SORT_CHANGE'}
                    onChange={() => setSelectedProcess('KNOTTING_SORT_CHANGE')}
                    className="accent-amber-600 w-4 h-4"
                  />
                </div>
                <p className="text-[10px] leading-tight text-slate-500 dark:text-slate-400">
                  Knotting with pattern/sort change adjustments.
                </p>
              </label>

              {/* Option 3: GAITING */}
              <label className={`p-3 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
                selectedProcess === 'GAITING'
                  ? 'border-purple-600 bg-purple-50/70 dark:bg-purple-950/40 text-purple-900 dark:text-purple-100 ring-2 ring-purple-400'
                  : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 text-slate-800 dark:text-slate-200'
              }`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-black text-xs uppercase">3. GAITING</span>
                  <input
                    type="radio"
                    name="prepProcessOption"
                    value="GAITING"
                    checked={selectedProcess === 'GAITING'}
                    onChange={() => setSelectedProcess('GAITING')}
                    className="accent-purple-600 w-4 h-4"
                  />
                </div>
                <p className="text-[10px] leading-tight text-slate-500 dark:text-slate-400">
                  Full re-drawing, heald frames & reed setup.
                </p>
              </label>

            </div>
          </div>

          {/* DEDICATED SORT CHANGE DETAILS (When Knotting Sort Change is selected) */}
          {selectedProcess === 'KNOTTING_SORT_CHANGE' && (
            <div className="p-4 bg-amber-50/80 dark:bg-amber-950/40 rounded-xl border-2 border-amber-300 dark:border-amber-700 space-y-2.5 animate-fade-in">
              <div className="flex items-center gap-1.5 text-amber-900 dark:text-amber-200 font-black text-xs uppercase">
                <Sparkles className="w-4 h-4 text-amber-600" />
                Sort Change Parameters & Differences
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                <div className="bg-white/80 dark:bg-slate-900/80 p-2 rounded-lg border border-amber-200 dark:border-amber-800">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Current Ends</span>
                  <span className="font-black text-slate-800 dark:text-white">{details.currentEnds ?? 'N/A'}</span>
                </div>
                <div className="bg-white/80 dark:bg-slate-900/80 p-2 rounded-lg border border-amber-200 dark:border-amber-800">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Next Ends</span>
                  <span className="font-black text-slate-800 dark:text-white">{details.nextEnds ?? 'N/A'}</span>
                </div>
                <div className="bg-white/80 dark:bg-slate-900/80 p-2 rounded-lg border border-amber-200 dark:border-amber-800">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Ends Difference</span>
                  <span className="font-black text-amber-700 dark:text-amber-300">
                    {details.endsDifference !== null ? Math.abs(details.endsDifference) : 'N/A'} ends
                  </span>
                </div>
                <div className="bg-white/80 dark:bg-slate-900/80 p-2 rounded-lg border border-amber-200 dark:border-amber-800">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Warp Colors</span>
                  <span className="font-bold text-slate-800 dark:text-white truncate block">
                    {details.currentWarpColours || 'Std'} → {details.nextWarpColours || 'Std'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Transition Comparison Summary */}
          <div className="bg-slate-50 dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
            <h4 className="font-black text-[11px] uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-blue-600" />
              Design & Allocation Transition
            </h4>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
              <div>
                <span className="text-slate-400 block font-semibold text-[10px] uppercase">Current Running</span>
                <span className="font-black text-purple-700 dark:text-purple-300 truncate block">
                  {details.currentDesign || 'None (Empty)'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block font-semibold text-[10px] uppercase">Next Planned</span>
                <span className="font-black text-blue-700 dark:text-blue-300 truncate block">
                  {details.nextDesign}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block font-semibold text-[10px] uppercase">Order / IBPO</span>
                <span className="font-bold text-slate-900 dark:text-white truncate block">
                  {details.orderNo || '—'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block font-semibold text-[10px] uppercase">Set / Beam No</span>
                <span className="font-bold text-slate-900 dark:text-white truncate block">
                  {details.setNo || '—'} / {details.beamNo || '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Operator & Remarks */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1 mb-1">
                <User className="w-3.5 h-3.5 text-slate-400" />
                Responsible Operator / Person (Optional)
              </label>
              <input
                type="text"
                value={responsiblePerson}
                onChange={e => setResponsiblePerson(e.target.value)}
                placeholder="e.g. Ramesh Kumar"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1 mb-1">
                <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                Planner Remarks / Notes (Optional)
              </label>
              <input
                type="text"
                value={remarks}
                onChange={e => setRemarks(e.target.value)}
                placeholder="Setup instructions..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium"
              />
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold rounded-xl text-xs transition-colors"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={isSubmitting || !loomStartDate}
            onClick={handleSubmit}
            className={`px-5 py-2.5 text-white font-black rounded-xl text-xs shadow-md transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1.5 ${
              isLoomConfirmMode ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isLoomConfirmMode ? <Play className="w-4 h-4 fill-white" /> : <CheckCircle2 className="w-4 h-4" />}
            <span>
              {isSubmitting
                ? 'Processing...'
                : isLoomConfirmMode
                ? `Confirm Loom ${details.loomNo} (${selectedProcess.replace(/_/g, ' ')})`
                : `Confirm Process: ${selectedProcess.replace(/_/g, ' ')}`}
            </span>
          </button>
        </div>

      </div>
    </div>
  );
};
