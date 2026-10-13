import React, { useState, useEffect } from 'react';
import { 
  Building2, CheckCircle2, XCircle, Clock, Calendar, Check, 
  AlertTriangle, RefreshCw, ArrowRight, UserCheck, ShieldCheck, Factory
} from 'lucide-react';
import { API_BASE_URL } from '../../config';

interface ToaVendorAllocationProps {
  initialIbpo?: string;
  onAllocationConfirmed?: (ibpo: string) => void;
  onNavigateToVendorMaster?: () => void;
}

export default function ToaVendorAllocation({ 
  initialIbpo, 
  onAllocationConfirmed,
  onNavigateToVendorMaster
}: ToaVendorAllocationProps) {
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedIbpo, setSelectedIbpo] = useState<string>(initialIbpo || '');
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [loadingCapability, setLoadingCapability] = useState(false);
  const [capabilityData, setCapabilityData] = useState<any>(null);
  const [selectedVendorLooms, setSelectedVendorLooms] = useState<Record<number, { vendor_id: number; allocated_meters: number; start_date: string; runout_date: string; daily_rate: number }>>({});
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setLoadingOrders(true);
    fetch(`${API_BASE_URL}/api/total-order-allocation/orders`)
      .then(res => res.json())
      .then(json => {
        if (json.success) {
          setOrders(json.data || []);
          if (!selectedIbpo && json.data.length > 0) {
            const firstPending = json.data.find((o: any) => o.status === 'PENDING' || o.unallocated_meters > 0);
            if (firstPending) setSelectedIbpo(firstPending.ibpo);
            else setSelectedIbpo(json.data[0].ibpo);
          }
        }
      })
      .finally(() => setLoadingOrders(false));
  }, []);

  useEffect(() => {
    if (!selectedIbpo) {
      setCapabilityData(null);
      setSelectedVendorLooms({});
      return;
    }

    setLoadingCapability(true);
    setNotification(null);
    setSelectedVendorLooms({});

    fetch(`${API_BASE_URL}/api/total-order-allocation/capability/vendor/${selectedIbpo}`)
      .then(res => res.json())
      .then(json => {
        if (json.success) {
          setCapabilityData(json.data);
        } else {
          setNotification({ type: 'error', message: json.error || 'Failed to check vendor capability' });
        }
      })
      .catch(err => setNotification({ type: 'error', message: err.message }))
      .finally(() => setLoadingCapability(false));
  }, [selectedIbpo]);

  const handleToggleLoom = (vendorId: number, loom: any) => {
    if (!loom.is_eligible) return;

    setSelectedVendorLooms(prev => {
      const updated = { ...prev };
      if (updated[loom.id]) {
        delete updated[loom.id];
      } else {
        const remaining = capabilityData?.remaining_to_allocate || 0;
        const currentTotal = Object.values(updated).reduce((acc: number, item: any) => acc + (item.allocated_meters || 0), 0);
        const unallocated = Math.max(0, remaining - currentTotal);
        const days = Math.max(1, Math.ceil(unallocated / (loom.avg_daily_prod || 150)));
        const startDate = new Date(loom.earliest_start_date);
        const runoutDate = new Date(startDate);
        runoutDate.setDate(runoutDate.getDate() + days);

        updated[loom.id] = {
          vendor_id: vendorId,
          allocated_meters: unallocated,
          start_date: loom.earliest_start_date,
          runout_date: runoutDate.toISOString().split('T')[0],
          daily_rate: loom.avg_daily_prod
        };
      }
      return updated;
    });
  };

  const handleConfirmVendorAllocation = async () => {
    const allocationsList = Object.entries(selectedVendorLooms).map(([loomId, data]) => ({
      vendor_id: data.vendor_id,
      vendor_loom_id: parseInt(loomId),
      allocated_meters: data.allocated_meters,
      estimated_start_date: data.start_date,
      estimated_runout_date: data.runout_date,
      avg_daily_prod: data.daily_rate
    })).filter(a => a.allocated_meters > 0);

    if (allocationsList.length === 0) {
      setNotification({ type: 'error', message: 'Please select at least one eligible vendor loom with meters > 0' });
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
          allocation_type: 'VENDOR',
          allocations: allocationsList
        })
      });
      const json = await res.json();
      if (json.success) {
        setNotification({ type: 'success', message: `Vendor Allocation confirmed for ${selectedIbpo} successfully!` });
        if (onAllocationConfirmed) onAllocationConfirmed(selectedIbpo);
      } else {
        setNotification({ type: 'error', message: json.error || 'Failed to confirm vendor allocation' });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Network error' });
    } finally {
      setSubmitting(false);
    }
  };

  const currentProposedTotal = Object.values(selectedVendorLooms).reduce((acc: number, item: any) => acc + (Number(item.allocated_meters) || 0), 0);
  const remainingReq = capabilityData?.remaining_to_allocate || 0;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-3 py-0.5 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-800 rounded-full text-[10px] font-black uppercase tracking-wider">
              Vendor Allocation Stream
            </span>
          </div>
          <h2 className="text-xl font-black text-slate-800 dark:text-white tracking-tight">
            Vendor Loom Allocation & Capacity Matching
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Dedicated vendor stream. Verifies vendor loom specifications without merging or mixing into in-house loom masters.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {onNavigateToVendorMaster && (
            <button
              onClick={onNavigateToVendorMaster}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
            >
              <Factory className="w-3.5 h-3.5 text-purple-600" />
              Manage Vendor Masters
            </button>
          )}

          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-500 whitespace-nowrap">Order:</label>
            <select
              value={selectedIbpo}
              onChange={e => setSelectedIbpo(e.target.value)}
              className="px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-purple-600 focus:outline-none focus:border-purple-500 min-w-[200px]"
            >
              {orders.map(o => (
                <option key={o.id} value={o.ibpo}>
                  {o.ibpo} • {o.sp_no} • {Number(o.order_qty).toLocaleString()} M ({o.status})
                </option>
              ))}
            </select>
          </div>
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
          <RefreshCw className="w-6 h-6 animate-spin text-purple-600" />
          <span className="text-xs font-bold">Scanning registered Vendor Loom Masters...</span>
        </div>
      )}

      {capabilityData && !loadingCapability && (
        <>
          {/* Order Summary Card */}
          <div className="bg-gradient-to-r from-slate-900 via-purple-950 to-slate-900 text-white p-6 rounded-3xl shadow-xl border border-slate-800">
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4 text-xs">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase">IBPO</p>
                <p className="text-base font-black text-purple-400 font-mono mt-0.5">{capabilityData.order.ibpo}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase">SP NO / Design</p>
                <p className="text-sm font-bold text-white mt-0.5">{capabilityData.order.sp_no}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase">GREY REQ (MTR)</p>
                <p className="text-sm font-black text-white mt-0.5">{Number(capabilityData.order.order_qty).toLocaleString()} M</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Balance To Allocate</p>
                <p className="text-sm font-black text-amber-400 mt-0.5">{Number(capabilityData.remaining_to_allocate).toLocaleString()} M</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Proposed Vendor MTR</p>
                <p className="text-sm font-black text-purple-300 mt-0.5">{currentProposedTotal.toLocaleString()} M</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Unallocated</p>
                <p className="text-sm font-black text-rose-400 mt-0.5">{Math.max(0, remainingReq - currentProposedTotal).toLocaleString()} M</p>
              </div>
            </div>
          </div>

          {/* Vendors & Their Looms */}
          {capabilityData.vendors.length === 0 ? (
            <div className="bg-white dark:bg-slate-800 p-12 rounded-3xl border border-slate-200 dark:border-slate-700 text-center space-y-3">
              <Building2 className="w-12 h-12 text-slate-300 mx-auto" />
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">No Vendor Looms Registered</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                No vendors or vendor loom masters found. Open Vendor Loom Master to register vendors and bulk create their loom records.
              </p>
              {onNavigateToVendorMaster && (
                <button
                  onClick={onNavigateToVendorMaster}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-md"
                >
                  + Add Vendor & Looms
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {capabilityData.vendors.map((vendor: any) => (
                <div key={vendor.vendor_id} className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                  <div className="p-4 bg-purple-50/40 dark:bg-purple-950/20 border-b border-purple-100 dark:border-purple-900/30 flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                    <div>
                      <h3 className="text-sm font-black text-slate-800 dark:text-white flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-purple-600" />
                        {vendor.vendor_name} {vendor.vendor_code ? `(${vendor.vendor_code})` : ''}
                      </h3>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Declared: {vendor.total_declared_looms} Looms • Configured: {vendor.actual_looms_count} Looms • Suitable: {vendor.eligible_looms_count} Looms
                      </p>
                    </div>

                    <div className="text-xs font-bold text-purple-700 dark:text-purple-300">
                      Contact: {vendor.contact_person || 'N/A'} {vendor.phone ? `(${vendor.phone})` : ''}
                    </div>
                  </div>

                  {vendor.looms.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400">
                      No individual loom records configured for this vendor.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50 dark:bg-slate-900 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-700">
                            <th className="p-2.5 w-12 text-center">Select</th>
                            <th className="p-2.5">Loom ID</th>
                            <th className="p-2.5">Type</th>
                            <th className="p-2.5">Width</th>
                            <th className="p-2.5">Frames</th>
                            <th className="p-2.5 font-black text-purple-600">Earliest Start Date</th>
                            <th className="p-2.5">Daily Prod</th>
                            <th className="p-2.5 text-right">Allocated MTR</th>
                            <th className="p-2.5 font-black text-emerald-600">Estimated Runout</th>
                            <th className="p-2.5">Suitability</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {vendor.looms.map((loom: any) => {
                            const isSelected = Boolean(selectedVendorLooms[loom.id]);
                            const allocItem = selectedVendorLooms[loom.id];

                            return (
                              <tr 
                                key={loom.id}
                                className={`transition-colors ${
                                  isSelected ? 'bg-purple-50/70 dark:bg-purple-950/30' : 
                                  loom.is_eligible ? 'hover:bg-slate-50/60 dark:hover:bg-slate-700/20' : 
                                  'opacity-50'
                                }`}
                              >
                                <td className="p-2.5 text-center">
                                  <input
                                    type="checkbox"
                                    disabled={!loom.is_eligible}
                                    checked={isSelected}
                                    onChange={() => handleToggleLoom(vendor.vendor_id, loom)}
                                    className="rounded text-purple-600 focus:ring-purple-500 cursor-pointer disabled:opacity-30"
                                  />
                                </td>
                                <td className="p-2.5 font-mono font-black text-slate-900 dark:text-white">
                                  {loom.loom_no}
                                </td>
                                <td className="p-2.5 text-slate-600 dark:text-slate-300 font-medium">
                                  {loom.loom_type}
                                </td>
                                <td className="p-2.5 font-medium">
                                  {loom.width}
                                </td>
                                <td className="p-2.5 font-medium">
                                  {loom.frame_capacity} F
                                </td>
                                <td className="p-2.5 font-mono font-black text-purple-600 dark:text-purple-400">
                                  {loom.earliest_start_date}
                                </td>
                                <td className="p-2.5 font-bold">
                                  {loom.avg_daily_prod} M/D
                                </td>
                                <td className="p-1.5 text-right">
                                  {isSelected ? (
                                    <input
                                      type="number"
                                      min="1"
                                      value={allocItem.allocated_meters}
                                      onChange={e => {
                                        const mtr = Math.max(0, parseFloat(e.target.value) || 0);
                                        const days = Math.max(1, Math.ceil(mtr / (loom.avg_daily_prod || 150)));
                                        const sDate = new Date(allocItem.start_date);
                                        const rDate = new Date(sDate);
                                        rDate.setDate(rDate.getDate() + days);

                                        setSelectedVendorLooms({
                                          ...selectedVendorLooms,
                                          [loom.id]: {
                                            ...allocItem,
                                            allocated_meters: mtr,
                                            runout_date: rDate.toISOString().split('T')[0]
                                          }
                                        });
                                      }}
                                      className="w-24 px-2 py-1 bg-white dark:bg-slate-900 border border-purple-300 dark:border-purple-600 rounded text-right font-black text-purple-700 dark:text-purple-300"
                                    />
                                  ) : (
                                    <span className="text-slate-400">-</span>
                                  )}
                                </td>
                                <td className="p-2.5 font-mono font-black text-emerald-600">
                                  {isSelected ? allocItem.runout_date : loom.estimated_completion_date}
                                </td>
                                <td className="p-2.5">
                                  {loom.is_eligible ? (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                                      <CheckCircle2 className="w-3 h-3" /> Compatible
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-bold">
                                      <XCircle className="w-3 h-3" /> Incompatible
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}

              <div className="flex justify-end pt-4">
                <button
                  onClick={handleConfirmVendorAllocation}
                  disabled={submitting || Object.keys(selectedVendorLooms).length === 0}
                  className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl text-xs font-black shadow-md flex items-center gap-2 transition-all"
                >
                  {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Confirm Vendor Allocation ({currentProposedTotal.toLocaleString()} MTR)
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
