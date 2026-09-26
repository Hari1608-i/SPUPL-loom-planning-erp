import React, { useState, useEffect } from 'react';
import { X, History as HistoryIcon, Clock, CheckCircle2, AlertCircle, Calendar, User, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { API_BASE_URL } from '../../config';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  loomNo: number;
}

export const WarpPrepHistoryModal: React.FC<Props> = ({ isOpen, onClose, loomNo }) => {
  const [history, setHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isOpen && loomNo) {
      setIsLoading(true);
      fetch(`${API_BASE_URL}/api/warp-preparation/history/${loomNo}`)
        .then(res => res.json())
        .then(data => {
          if (data.success && Array.isArray(data.history)) {
            setHistory(data.history);
          }
        })
        .catch(err => console.error('Failed to load history:', err))
        .finally(() => setIsLoading(false));
    }
  }, [isOpen, loomNo]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-3xl w-full my-8 overflow-hidden border border-slate-200 dark:border-slate-700 animate-fade-in">
        
        {/* Header */}
        <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
          <div className="flex items-center gap-2">
            <HistoryIcon className="w-5 h-5 text-blue-400" />
            <h3 className="font-bold text-sm tracking-tight">
              Loom {loomNo} — Warp Preparation & Knotting Audit Log
            </h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 max-h-[70vh] overflow-y-auto custom-scrollbar space-y-4 text-xs">
          {isLoading ? (
            <div className="p-8 text-center text-slate-400 font-bold">Loading permanent history...</div>
          ) : history.length === 0 ? (
            <div className="p-8 text-center text-slate-400 bg-slate-50 dark:bg-slate-900 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
              No previous preparation records recorded for Loom {loomNo}.
            </div>
          ) : (
            history.map(item => {
              const statusBadgeColor =
                item.status === 'COMPLETED'
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                  : item.status === 'IN_PROGRESS'
                  ? 'bg-blue-100 text-blue-800 border-blue-300'
                  : 'bg-amber-100 text-amber-800 border-amber-300';

              return (
                <div
                  key={item.id}
                  className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/50 space-y-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-slate-900 dark:text-white">
                        Record #{item.id}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                        {item.confirmed_process || item.process_type}
                      </span>
                      {item.plan_id && (
                        <span className="text-slate-500 font-semibold text-[10px]">
                          Plan #{item.plan_id}
                        </span>
                      )}
                    </div>

                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border ${statusBadgeColor}`}>
                      {item.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                    <div>
                      <span className="text-slate-400 block text-[10px]">Transition</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        {item.current_design || 'None'} ➔ {item.next_design}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-400 block text-[10px]">Total Ends Diff</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        {item.current_ends ?? '—'} ➔ {item.next_ends ?? '—'} (Diff: {item.ends_difference ?? '—'})
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-400 block text-[10px]">Warp Colours</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        {item.current_warp_colours || 'Std'} ➔ {item.next_warp_colours || 'Std'}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-400 block text-[10px]">Responsible Person</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        {item.responsible_person || '—'}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-400 block text-[10px]">Start Date / Time</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {item.process_start_date ? format(new Date(item.process_start_date), 'dd-MM-yyyy') : '—'} {item.process_start_time || ''}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-400 block text-[10px]">Completion Date / Time</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {item.process_completion_date ? format(new Date(item.process_completion_date), 'dd-MM-yyyy') : '—'} {item.process_completion_time || ''}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-400 block text-[10px]">Confirmed By / At</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {item.confirmed_by || 'Planner'} ({item.confirmed_date ? format(new Date(item.confirmed_date), 'dd-MM-yyyy') : '—'})
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-400 block text-[10px]">Created Timestamp</span>
                      <span className="font-semibold text-slate-500">
                        {format(new Date(item.createdAt), 'dd-MM-yyyy HH:mm')}
                      </span>
                    </div>
                  </div>

                  {item.remarks && (
                    <div className="text-[11px] text-slate-600 dark:text-slate-400 italic bg-white dark:bg-slate-800 p-2 rounded-lg border border-slate-200 dark:border-slate-700">
                      Remarks: {item.remarks}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 text-right">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-bold rounded-lg text-xs"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
