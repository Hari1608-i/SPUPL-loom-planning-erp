import React, { useState, useEffect } from 'react';
import { 
  Layers, CheckCircle2, XCircle, Clock, Calendar, Check, 
  AlertTriangle, RefreshCw, ArrowRight, UserCheck, Search, ShieldCheck
} from 'lucide-react';
import { API_BASE_URL } from '../../config';

interface ToaInHouseAllocationProps {
  initialIbpo?: string;
  onAllocationConfirmed?: (ibpo: string) => void;
}

export default function ToaInHouseAllocation({ initialIbpo, onAllocationConfirmed }: ToaInHouseAllocationProps) {
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedIbpo, setSelectedIbpo] = useState<string>(initialIbpo || '');
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [loadingCapability, setLoadingCapability] = useState(false);
  const [capabilityData, setCapabilityData] = useState<any>(null);
  const [selectedLooms, setSelectedLooms] = useState<Record<number, { allocated_meters: number; start_date: string; runout_date: string; daily_rate: number }>>({});
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [filterEligibleOnly, setFilterEligibleOnly] = useState(false);

  // Load orders that need allocation
  useEffect(() => {
    setLoadingOrders(true);
    fetch(`${API_BASE_URL}/api/total-order-allocation/orders`)
      .then(res => res.json())
      .then(json => {
        if (json.success) {
          setOrders(json.data || []);
          if (!selectedIbpo && json.data.length > 0) {
            // Find first pending or partially allocated order
            const firstPending = json.data.find((o: any) => o.status === 'PENDING' || o.unallocated_meters > 0);
            if (firstPending) setSelectedIbpo(firstPending.ibpo);
            else setSelectedIbpo(json.data[0].ibpo);
          }
        }
      })
      .finally(() => setLoadingOrders(false));
  }, []);

  // When selectedIbpo changes, fetch capability & schedule analysis
  useEffect(() => {
    if (!selectedIbpo) {
      setCapabilityData(null);
      setSelectedLooms({});
      return;
    }

    setLoadingCapability(true);
    setNotification(null);
    setSelectedLooms({});

    fetch(`${API_BASE_URL}/api/total-order-allocation/capability/in-house/${selectedIbpo}`)
      .then(res => res.json())
      .then(json => {
        if (json.success) {
          setCapabilityData(json.data);
          // Pre-select top eligible candidate loom if any
          const eligible = json.data.candidate_looms.filter((l: any) => l.is_eligible);
          if (eligible.length > 0) {
            const topLoom = eligible[0];
            const remaining = json.data.requirements.remaining_to_allocate;
            setSelectedLooms({
              [topLoom.loom_no]: {
                allocated_meters: remaining,
                start_date: topLoom.earliest_start_date,
                runout_date: topLoom.estimated_completion_date,
                daily_rate: topLoom.daily_prod_rate
              }
            });
          }
        } else {
          setNotification({ type: 'error', message: json.error || 'Failed to check capability' });
        }
      })
      .catch(err => setNotification({ type: 'error', message: err.message }))
      .finally(() => setLoadingCapability(false));
  }, [selectedIbpo]);

  // Handle toggle loom selection
  const handleToggleLoom = (loom: any) => {
    if (!loom.is_eligible) return;
    setSelectedLooms(prev => {
      const updated = { ...prev };
      if (updated[loom.loom_no]) {
        delete updated[loom.loom_no];
      } else {
        const remaining = capabilityData?.requirements?.remaining_to_allocate || 0;
        const currentTotal = Object.values(updated).reduce((acc: number, item: any) => acc + (item.allocated_meters || 0), 0);
        const unallocated = Math.max(0, remaining - currentTotal);
        const days = Math.max(1, Math.ceil(unallocated / (loom.daily_prod_rate || 160)));
        const startDate = new Date(loom.earliest_start_date);
        const runoutDate = new Date(startDate);
        runoutDate.setDate(runoutDate.getDate() + days);

        updated[loom.loom_no] = {
          allocated_meters: unallocated,
          start_date: loom.earliest_start_date,
          runout_date: runoutDate.toISOString().split('T')[0],
          daily_rate: loom.daily_prod_rate
        };
      }
      return updated;
    });
  };

  // Evenly distribute remaining meters across selected candidate looms
  const handleDistributeEvenly = () => {
    const loomKeys = Object.keys(selectedLooms).map(k => parseInt(k));
    if (loomKeys.length === 0) return;
    const remaining = capabilityData?.requirements?.remaining_to_allocate || 0;
    const share = Math.round(remaining / loomKeys.length);

    setSelectedLooms(prev => {
      const updated = { ...prev };
      let assignedTotal = 0;
      loomKeys.forEach((k, idx) => {
        const item = updated[k];
        const loomMtr = (idx === loomKeys.length - 1) ? (remaining - assignedTotal) : share;
        assignedTotal += loomMtr;
        const days = Math.max(1, Math.ceil(loomMtr / (item.daily_rate || 160)));
        const sDate = new Date(item.start_date);
        const rDate = new Date(sDate);
        rDate.setDate(rDate.getDate() + days);

        updated[k] = {
          ...item,
          allocated_meters: loomMtr,
          runout_date: rDate.toISOString().split('T')[0]
        };
      });
      return updated;
    });
  };

  // Submit in-house allocation
  const handleConfirmAllocation = async () => {
    const allocationsList = Object.entries(selectedLooms).map(([loomNo, data]) => ({
      loom_no: parseInt(loomNo),
      allocated_meters: data.allocated_meters,
      estimated_start_date: data.start_date,
      estimated_runout_date: data.runout_date,
      avg_daily_prod: data.daily_rate
    })).filter(a => a.allocated_meters > 0);

    if (allocationsList.length === 0) {
      setNotification({ type: 'error', message: 'Please select at least one eligible loom with allocated meters > 0' });
      return;
    }

    setSubmitting(true);
    setNotification(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/total-order-allocation/allocate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ibpo: selectedIbpo,
          allocation_type: 'IN_HOUSE',
          allocations: allocationsList
        })
      });
      const json = await res.json();
      if (json.success) {
        setNotification({ type: 'success', message: `In-House Allocation confirmed for ${selectedIbpo} successfully!` });
        if (onAllocationConfirmed) onAllocationConfirmed(selectedIbpo);
      } else {
        setNotification({ type: 'error', message: json.error || 'Failed to confirm allocation' });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Network error' });
    } finally {
      setSubmitting(false);
    }
  };

  const currentProposedTotal = Object.values(selectedLooms).reduce((acc: number, item: any) => acc + (Number(item.allocated_meters) || 0), 0);
  const remainingReq = capabilityData?.requirements?.remaining_to_allocate || 0;
  const shortfall = Math.max(0, remainingReq - currentProposedTotal);

  return (
    <div className="space-y-6">
      {/* Header and Order Selector */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-3 py-0.5 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 rounded-full text-[10px] font-black uppercase tracking-wider">
              In-House Allocation Stream
            </span>
          </div>
          <h2 className="text-xl font-black text-slate-800 dark:text-white tracking-tight">
            In-House Loom Capability & Schedule Allocation
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Automated technical compatibility assessment against 224 in-house looms, FIFO queue estimation, and runout forecasting.
          </p>
        </div>

        {/* Order Selector Dropdown */}
        <div className="flex items-center gap-3 w-full md:w-auto">
          <label className="text-xs font-bold text-slate-500 whitespace-nowrap">Select Order:</label>
          <select
            value={selectedIbpo}
            onChange={e => setSelectedIbpo(e.target.value)}
            className="px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-indigo-600 focus:outline-none focus:border-indigo-500 min-w-[200px]"
          >
            {orders.map(o => (
              <option key={o.id} value={o.ibpo}>
                {o.ibpo} • {o.sp_no} • {Number(o.order_qty).toLocaleString()} M ({o.status})
              </option>
            ))}
          </select>
        </div>
      </div>

      {notification && (
        <div className={`p-4 rounded-2xl text-xs font-bold flex items-center gap-3 border ${
          notification.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'
        }`}>
          {notification.type === 'success' ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <XCircle className="w-4 h-4 flex-shrink-0" />}
          <span className="flex-1">{notification.message}</span>
          <button onClick={() => setNotification(null)} className="text-slate-400 hover:text-slate-600">×</button>
        </div>
      )}

      {loadingCapability && (
        <div className="flex items-center justify-center p-12 space-x-3 text-slate-500">
          <RefreshCw className="w-6 h-6 animate-spin text-indigo-600" />
          <span className="text-xs font-bold">Checking capability against In-House Loom Master...</span>
        </div>
      )}

      {capabilityData && !loadingCapability && (
        <>
          {/* Order Technical Requirements Summary Card */}
          <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 rounded-3xl shadow-xl border border-slate-800">
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-4 text-xs">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase">IBPO</p>
                <p className="text-base font-black text-indigo-400 font-mono mt-0.5">{capabilityData.order.ibpo}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase">SP NO / Design</p>
                <p className="text-sm font-bold text-white mt-0.5">{capabilityData.order.sp_no}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase">GREY REQ</p>
                <p className="text-sm font-black text-white mt-0.5">{Number(capabilityData.order.order_qty).toLocaleString()} M</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Balance To Allocate</p>
                <p className="text-sm font-black text-amber-400 mt-0.5">{Number(capabilityData.requirements.remaining_to_allocate).toLocaleString()} M</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Width Req</p>
                <p className="text-xs font-bold text-slate-200 mt-0.5">{capabilityData.order.width || 'Standard'}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Frames Req</p>
                <p className="text-xs font-bold text-slate-200 mt-0.5">{capabilityData.order.frames || 'Any'}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Colours Req</p>
                <p className="text-xs font-bold text-slate-200 mt-0.5">{capabilityData.order.weft_colours || 'Any'}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Eligible Looms</p>
                <p className="text-sm font-black text-emerald-400 mt-0.5">{capabilityData.eligible_looms_count} / {capabilityData.total_in_house_looms}</p>
              </div>
            </div>
          </div>

          {/* Allocation Actions Bar */}
          <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col sm:flex-row justify-between items-center gap-4 text-xs">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={filterEligibleOnly}
                  onChange={e => setFilterEligibleOnly(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                Show Only Eligible Looms
              </label>

              {Object.keys(selectedLooms).length > 1 && (
                <button
                  onClick={handleDistributeEvenly}
                  className="px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg font-bold hover:bg-indigo-100 transition-colors"
                >
                  Distribute Evenly Across {Object.keys(selectedLooms).length} Looms
                </button>
              )}
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right">
                <span className="text-slate-500 font-semibold mr-2">Proposed Total:</span>
                <span className="font-black text-sm text-slate-900 dark:text-white">{currentProposedTotal.toLocaleString()} MTR</span>
                {shortfall > 0 && (
                  <span className="ml-3 text-rose-600 font-bold">
                    (Shortfall: {shortfall.toLocaleString()} MTR - Vendor Needed!)
                  </span>
                )}
              </div>

              <button
                onClick={handleConfirmAllocation}
                disabled={submitting || Object.keys(selectedLooms).length === 0}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-black shadow-md flex items-center gap-2 transition-all"
              >
                {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Confirm In-House Allocation
              </button>
            </div>
          </div>

          {/* Candidate Looms Assessment Table */}
          <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
              <h3 className="text-xs font-black uppercase text-slate-700 dark:text-slate-300 tracking-wider">
                Candidate In-House Looms Matrix ({capabilityData.candidate_looms.length} Looms Evaluated)
              </h3>
              <span className="text-[11px] text-slate-500">
                Sorted by Eligibility & Earliest Start Date (FIFO)
              </span>
            </div>

            <div className="overflow-x-auto max-h-[600px]">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="p-3 w-12 text-center">Select</th>
                    <th className="p-3">Loom #</th>
                    <th className="p-3">Type & Shed</th>
                    <th className="p-3">Loom Width</th>
                    <th className="p-3">Frames</th>
                    <th className="p-3">Active Design</th>
                    <th className="p-3">Runout Date</th>
                    <th className="p-3 font-black text-indigo-600">Earliest Start Date</th>
                    <th className="p-3">Rate (M/D)</th>
                    <th className="p-3 text-right">Allocated MTR</th>
                    <th className="p-3 font-black text-emerald-600">Estimated Runout</th>
                    <th className="p-3">Capability Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {capabilityData.candidate_looms
                    .filter((l: any) => !filterEligibleOnly || l.is_eligible)
                    .map((loom: any) => {
                      const isSelected = Boolean(selectedLooms[loom.loom_no]);
                      const allocItem = selectedLooms[loom.loom_no];

                      return (
                        <tr 
                          key={loom.loom_no}
                          className={`transition-colors ${
                            isSelected ? 'bg-indigo-50/60 dark:bg-indigo-950/30' : 
                            loom.is_eligible ? 'hover:bg-slate-50/70 dark:hover:bg-slate-700/20' : 
                            'opacity-60 bg-slate-50/30'
                          }`}
                        >
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              disabled={!loom.is_eligible}
                              checked={isSelected}
                              onChange={() => handleToggleLoom(loom)}
                              className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer disabled:opacity-30"
                            />
                          </td>
                          <td className="p-3 font-mono font-black text-slate-900 dark:text-white">
                            L-{loom.loom_no}
                          </td>
                          <td className="p-3 text-slate-600 dark:text-slate-300">
                            {loom.loom_type} • {loom.shed_name}
                          </td>
                          <td className="p-3 font-medium">
                            {loom.width}
                          </td>
                          <td className="p-3 font-medium">
                            {loom.frame_capacity} F
                          </td>
                          <td className="p-3">
                            {loom.current_running_design ? (
                              <span className="font-bold text-slate-800 dark:text-slate-200">
                                {loom.current_running_design} ({loom.current_running_balance}M)
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">Available (Idle)</span>
                            )}
                          </td>
                          <td className="p-3 text-slate-500 font-mono">
                            {loom.current_runout_date || 'Today'}
                          </td>
                          <td className="p-3 font-mono font-black text-indigo-600 dark:text-indigo-400">
                            {loom.earliest_start_date}
                          </td>
                          <td className="p-3 font-bold text-slate-700 dark:text-slate-300">
                            {loom.daily_prod_rate} M/D
                          </td>
                          <td className="p-2 text-right">
                            {isSelected ? (
                              <input
                                type="number"
                                min="1"
                                value={allocItem.allocated_meters}
                                onChange={e => {
                                  const mtr = Math.max(0, parseFloat(e.target.value) || 0);
                                  const days = Math.max(1, Math.ceil(mtr / (loom.daily_prod_rate || 160)));
                                  const sDate = new Date(allocItem.start_date);
                                  const rDate = new Date(sDate);
                                  rDate.setDate(rDate.getDate() + days);

                                  setSelectedLooms({
                                    ...selectedLooms,
                                    [loom.loom_no]: {
                                      ...allocItem,
                                      allocated_meters: mtr,
                                      runout_date: rDate.toISOString().split('T')[0]
                                    }
                                  });
                                }}
                                className="w-24 px-2 py-1 bg-white dark:bg-slate-900 border border-indigo-300 dark:border-indigo-600 rounded text-right font-black text-indigo-700 dark:text-indigo-300"
                              />
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                          <td className="p-3 font-mono font-black text-emerald-600">
                            {isSelected ? allocItem.runout_date : loom.estimated_completion_date}
                          </td>
                          <td className="p-3">
                            {loom.is_eligible ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                                <CheckCircle2 className="w-3 h-3" /> Eligible
                              </span>
                            ) : (
                              <div className="space-y-0.5">
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-bold">
                                  <XCircle className="w-3 h-3" /> Incompatible
                                </span>
                                <p className="text-[10px] text-rose-600 font-medium max-w-xs">
                                  {loom.failed_reasons.join(', ')}
                                </p>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
