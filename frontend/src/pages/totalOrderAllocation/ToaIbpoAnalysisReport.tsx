import React, { useState, useEffect } from 'react';
import { 
  FileText, Search, Printer, Download, RefreshCw, CheckCircle2, 
  Clock, Calendar, Factory, Building2, TrendingUp, Layers, AlertCircle
} from 'lucide-react';
import { API_BASE_URL } from '../../config';

interface ToaIbpoAnalysisReportProps {
  initialIbpo?: string;
}

export default function ToaIbpoAnalysisReport({ initialIbpo }: ToaIbpoAnalysisReportProps) {
  const [searchIbpo, setSearchIbpo] = useState(initialIbpo || '');
  const [orderData, setOrderData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchReport = async (ibpoToFetch: string) => {
    if (!ibpoToFetch.trim()) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE_URL}/api/total-order-allocation/orders/${ibpoToFetch.trim()}`);
      const json = await res.json();
      if (json.success) {
        setOrderData(json.data);
      } else {
        setError(json.error || `Order ${ibpoToFetch} not found`);
        setOrderData(null);
      }
    } catch (err: any) {
      setError(err.message);
      setOrderData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialIbpo) {
      fetchReport(initialIbpo);
    }
  }, [initialIbpo]);

  const handlePrint = () => {
    window.print();
  };

  const o = orderData;

  return (
    <div className="space-y-6">
      {/* Search & Actions Bar (Hidden during print) */}
      <div className="print:hidden bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-800 dark:text-white tracking-tight">
            Individual IBPO Lifecycle & Order Analysis Report
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Full audit history: Order details, capability matches, start/runout dates, daily actual production, variance & closure.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Enter IBPO..."
              value={searchIbpo}
              onChange={e => setSearchIbpo(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && fetchReport(searchIbpo)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono font-bold focus:outline-none focus:border-indigo-500"
            />
          </div>
          <button
            onClick={() => fetchReport(searchIbpo)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center gap-1.5"
          >
            <Search className="w-3.5 h-3.5" />
            Analyze
          </button>
          {o && (
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              Print Report
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center p-12 text-slate-500">
          <RefreshCw className="w-6 h-6 animate-spin text-indigo-600 mr-2" />
          <span className="text-xs font-bold">Compiling IBPO audit trail and analysis...</span>
        </div>
      )}

      {error && (
        <div className="p-6 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-xs font-bold">
          {error}
        </div>
      )}

      {/* Printable Report Sheet */}
      {o && !loading && (
        <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-6 print:border-none print:shadow-none print:p-0">
          {/* Header Section */}
          <div className="border-b-2 border-slate-900 dark:border-slate-600 pb-4 flex justify-between items-start">
            <div>
              <p className="text-[11px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">
                SANTHI PROCESSING UNIT PVT LTD • WEAVING DIVISION
              </p>
              <h1 className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                IBPO Lifecycle Analysis Report: {o.ibpo}
              </h1>
              <p className="text-xs text-slate-500">
                Design: {o.sp_no} • Customer: {o.customer || 'General'} • Order Type: {o.order_type}
              </p>
            </div>

            <div className="text-right">
              <span className={`inline-block px-3 py-1 rounded-full text-xs font-black uppercase ${
                o.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' :
                o.status === 'IN_PRODUCTION' ? 'bg-blue-100 text-blue-800' :
                'bg-purple-100 text-purple-800'
              }`}>
                {o.status}
              </span>
              <p className="text-[10px] text-slate-400 mt-1 font-mono">
                Received: {o.received_date ? new Date(o.received_date).toLocaleDateString() : '-'}
              </p>
            </div>
          </div>

          {/* Metric Highlights */}
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase">Ordered (MTR)</p>
              <p className="text-base font-black text-slate-900 dark:text-white mt-0.5">{Number(o.order_qty).toLocaleString()} M</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase">Allocated (MTR)</p>
              <p className="text-base font-black text-indigo-600 mt-0.5">{Number(o.total_allocated).toLocaleString()} M</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase">Produced to Date</p>
              <p className="text-base font-black text-emerald-600 mt-0.5">{Number(o.total_produced).toLocaleString()} M ({o.completion_pct}%)</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase">Balance to Weave</p>
              <p className="text-base font-black text-rose-600 mt-0.5">{Math.max(0, o.balance_to_weave).toLocaleString()} M</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase">In-House Produced</p>
              <p className="text-sm font-black text-slate-700 dark:text-slate-300 mt-0.5">{Number(o.in_house_produced).toLocaleString()} M</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase">Vendor Produced</p>
              <p className="text-sm font-black text-purple-600 mt-0.5">{Number(o.vendor_produced).toLocaleString()} M</p>
            </div>
          </div>

          {/* Technical Specifications */}
          <div className="space-y-2">
            <h3 className="text-xs font-black uppercase text-slate-600 dark:text-slate-400 tracking-wider">
              Technical Specifications & Compatibility Profile
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3 text-xs p-4 rounded-xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800">
              <div>
                <span className="text-slate-400 block text-[10px]">Width:</span>
                <span className="font-bold">{o.width || o.design_details?.greige_width || 'Standard'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Frames:</span>
                <span className="font-bold">{o.frames || o.design_details?.frames || 'Standard'} F</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Weft Colours:</span>
                <span className="font-bold">{o.weft_colours || o.design_details?.weft_colours || '1'} Clr</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">PPI:</span>
                <span className="font-bold">{o.ppi || o.design_details?.ppi || '66'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Reed Count:</span>
                <span className="font-bold">{o.reed_count || o.design_details?.reed_count || 'Standard'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Product Group:</span>
                <span className="font-bold">{o.product_group || 'Normal'}</span>
              </div>
            </div>
          </div>

          {/* Confirmed Allocations Section */}
          <div className="space-y-2">
            <h3 className="text-xs font-black uppercase text-slate-600 dark:text-slate-400 tracking-wider">
              Confirmed Loom Allocations ({o.allocations?.length || 0})
            </h3>
            {o.allocations?.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No loom allocations confirmed yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 dark:bg-slate-900 font-bold border-b">
                    <tr>
                      <th className="p-2.5">Stream</th>
                      <th className="p-2.5">Loom #</th>
                      <th className="p-2.5">Facility / Vendor</th>
                      <th className="p-2.5 text-right">Allocated MTR</th>
                      <th className="p-2.5">Start Date</th>
                      <th className="p-2.5">Runout Date</th>
                      <th className="p-2.5">Days Taken</th>
                      <th className="p-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {o.allocations.map((a: any) => (
                      <tr key={a.id}>
                        <td className="p-2.5 font-bold">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] ${
                            a.allocation_type === 'IN_HOUSE' ? 'bg-indigo-100 text-indigo-700' : 'bg-purple-100 text-purple-700'
                          }`}>
                            {a.allocation_type}
                          </span>
                        </td>
                        <td className="p-2.5 font-mono font-bold">
                          {a.loom_no ? `L-${a.loom_no}` : (a.vendorLoom?.loom_no || `V-${a.vendor_loom_id}`)}
                        </td>
                        <td className="p-2.5 text-slate-600 dark:text-slate-300">
                          {a.vendor ? a.vendor.vendor_name : 'SPUPL In-House Weaving'}
                        </td>
                        <td className="p-2.5 text-right font-black">
                          {Number(a.allocated_meters).toLocaleString()} M
                        </td>
                        <td className="p-2.5 font-mono text-indigo-600 dark:text-indigo-400">
                          {new Date(a.estimated_start_date).toLocaleDateString()}
                        </td>
                        <td className="p-2.5 font-mono text-emerald-600">
                          {new Date(a.estimated_runout_date).toLocaleDateString()}
                        </td>
                        <td className="p-2.5">{a.days_taken} Days</td>
                        <td className="p-2.5 font-bold text-slate-700">{a.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Daily Actual Production Logs */}
          <div className="space-y-2">
            <h3 className="text-xs font-black uppercase text-slate-600 dark:text-slate-400 tracking-wider">
              Daily Weaving Production Logs ({o.productionLogs?.length || 0})
            </h3>
            {o.productionLogs?.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No production logs recorded yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 max-h-60">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 font-bold border-b">
                    <tr>
                      <th className="p-2.5">Date</th>
                      <th className="p-2.5">Stream</th>
                      <th className="p-2.5">Loom #</th>
                      <th className="p-2.5 text-right">Produced Meters</th>
                      <th className="p-2.5">Entered By</th>
                      <th className="p-2.5">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {o.productionLogs.map((p: any) => (
                      <tr key={p.id}>
                        <td className="p-2.5 font-bold">{new Date(p.production_date).toLocaleDateString()}</td>
                        <td className="p-2.5">{p.allocation_type}</td>
                        <td className="p-2.5 font-mono">{p.loom_no ? `L-${p.loom_no}` : (p.vendor_loom_id ? `V-${p.vendor_loom_id}` : '-')}</td>
                        <td className="p-2.5 text-right font-black text-emerald-600">{Number(p.produced_meter).toLocaleString()} M</td>
                        <td className="p-2.5 text-slate-500">{p.entered_by}</td>
                        <td className="p-2.5 text-slate-500">{p.remarks || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Completion & Closure Audit Card */}
          {o.completionReview && (
            <div className="p-5 bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-2xl space-y-2 text-xs">
              <h3 className="font-black text-emerald-900 dark:text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Final Order Completion & Closure Audit Details
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                <div>
                  <span className="text-slate-500 block text-[10px]">Closed By:</span>
                  <span className="font-black text-slate-800 dark:text-white">{o.completionReview.closed_by}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Closed Timestamp:</span>
                  <span className="font-bold">{new Date(o.completionReview.closed_at).toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Final Variance:</span>
                  <span className="font-black text-emerald-700">
                    {o.completionReview.variance_meter} M ({o.completionReview.variance_pct.toFixed(2)}%)
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Authorization:</span>
                  <span className="font-bold">
                    {o.completionReview.is_approved ? `Authorized by ${o.completionReview.approved_by || o.completionReview.closed_by}` : 'Standard (Within 3%)'}
                  </span>
                </div>
              </div>
              {o.completionReview.approval_reason && (
                <p className="text-[11px] text-slate-600 dark:text-slate-300 pt-1 border-t border-emerald-200/50">
                  <strong>Explanation:</strong> {o.completionReview.approval_reason}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
