import React, { useState, useEffect } from 'react';
import { 
  Cpu, Layers, Search, Filter, RefreshCw, CheckCircle2, Clock, 
  AlertTriangle, ArrowUpRight, ShieldCheck, Factory, Gauge
} from 'lucide-react';
import { API_BASE_URL } from '../../config';

export default function ToaInHouseCapabilityBoard() {
  const [looms, setLooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedShed, setSelectedShed] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');

  const fetchLoomBoard = async () => {
    setLoading(true);
    try {
      // Fetch in-house looms with running entries and active allocations
      const [loomsRes, allocsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/looms?all=true`),
        fetch(`${API_BASE_URL}/api/total-order-allocation/orders`)
      ]);

      const loomsData = await loomsRes.json();
      const ordersData = await allocsRes.json();

      const allocationsMap: Record<number, any[]> = {};
      if (ordersData.success && Array.isArray(ordersData.data)) {
        ordersData.data.forEach((o: any) => {
          o.allocations?.forEach((a: any) => {
            if (a.allocation_type === 'IN_HOUSE' && a.loom_no) {
              if (!allocationsMap[a.loom_no]) allocationsMap[a.loom_no] = [];
              allocationsMap[a.loom_no].push({
                ibpo: a.ibpo,
                sp_no: o.sp_no,
                meters: a.allocated_meters,
                start_date: a.estimated_start_date,
                runout_date: a.estimated_runout_date
              });
            }
          });
        });
      }

      if (Array.isArray(loomsData)) {
        const enriched = loomsData.map((l: any) => {
          const lre = l.LoomRunEntry;
          const loomAllocs = allocationsMap[l.loom_no] || [];
          return {
            ...l,
            running_design: lre?.design_no_sp_no || null,
            running_balance: lre?.warped_meter || 0,
            daily_prod: lre?.daily_production || 160,
            start_date: lre?.loom_start_date ? new Date(lre.loom_start_date).toLocaleDateString() : null,
            future_allocations: loomAllocs
          };
        });
        setLooms(enriched);
      }
    } catch (err) {
      console.error('Error fetching capability board:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLoomBoard();
  }, []);

  const filtered = looms.filter(l => {
    const matchesSearch = !searchTerm || 
      String(l.loom_no).includes(searchTerm) || 
      (l.running_design && l.running_design.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (l.shed_name && l.shed_name.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesShed = selectedShed === 'ALL' || String(l.shed) === selectedShed || l.shed_name === selectedShed;
    const isRunning = Boolean(l.running_design);
    const matchesStatus = selectedStatus === 'ALL' || 
      (selectedStatus === 'RUNNING' && isRunning) ||
      (selectedStatus === 'AVAILABLE' && !isRunning);

    return matchesSearch && matchesShed && matchesStatus;
  });

  const sheds = Array.from(new Set(looms.map(l => l.shed_name || `Shed ${l.shed || 1}`))).filter(Boolean);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-3 py-0.5 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded-full text-[10px] font-black uppercase tracking-wider">
              In-House Plant Matrix
            </span>
          </div>
          <h2 className="text-xl font-black text-slate-800 dark:text-white tracking-tight">
            In-House Loom Capability Board (224 Looms)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time mechanical specifications, active running designs, future confirmed allocation queue, and earliest available dates.
          </p>
        </div>

        <button
          onClick={fetchLoomBoard}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Board
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <div className="relative min-w-[200px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search Loom #, Design..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-medium focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="font-bold text-slate-500">Shed:</label>
            <select
              value={selectedShed}
              onChange={e => setSelectedShed(e.target.value)}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold"
            >
              <option value="ALL">All Sheds ({looms.length})</option>
              {sheds.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="font-bold text-slate-500">Status:</label>
            <select
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold"
            >
              <option value="ALL">All Statuses</option>
              <option value="RUNNING">Active Running</option>
              <option value="AVAILABLE">Available / Idle</option>
            </select>
          </div>
        </div>

        <div className="text-slate-500 font-bold">
          Showing <span className="text-slate-900 dark:text-white font-black">{filtered.length}</span> of 224 looms
        </div>
      </div>

      {/* Looms Grid Table */}
      <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto max-h-[650px]">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="p-3 w-16 text-center">Loom #</th>
                <th className="p-3">Shed</th>
                <th className="p-3">Type</th>
                <th className="p-3">Width / Reed Space</th>
                <th className="p-3">Frames</th>
                <th className="p-3">Weft Colours</th>
                <th className="p-3">RPM</th>
                <th className="p-3">Current Running Order</th>
                <th className="p-3">Balance MTR</th>
                <th className="p-3">Future TOA Queue</th>
                <th className="p-3 text-center">Availability</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map(l => {
                const isRunning = Boolean(l.running_design);
                const queueCount = l.future_allocations?.length || 0;

                return (
                  <tr key={l.loom_no} className="hover:bg-slate-50/70 dark:hover:bg-slate-700/20 transition-colors">
                    <td className="p-3 text-center font-mono font-black text-indigo-600 dark:text-indigo-400">
                      L-{l.loom_no}
                    </td>
                    <td className="p-3 text-slate-700 dark:text-slate-300 font-bold">
                      {l.shed_name || `Shed ${l.shed || 1}`}
                    </td>
                    <td className="p-3 text-slate-600 dark:text-slate-400 font-medium">
                      {l.loom_type || 'Airjet'}
                    </td>
                    <td className="p-3 font-semibold">
                      {l.width || '190 cm'}
                    </td>
                    <td className="p-3 font-semibold">
                      {l.frame_capacity || 16} Frames
                    </td>
                    <td className="p-3 font-semibold">
                      {l.max_weft_colours || l.weft_colours || 4} Colours
                    </td>
                    <td className="p-3 font-mono font-medium text-slate-500">
                      {l.act_rpm || l.rpm || 650}
                    </td>
                    <td className="p-3">
                      {isRunning ? (
                        <span className="font-bold text-slate-900 dark:text-white">
                          {l.running_design}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">No Active Order</span>
                      )}
                    </td>
                    <td className="p-3 font-mono font-bold">
                      {isRunning ? Number(l.running_balance).toLocaleString() : '-'}
                    </td>
                    <td className="p-3">
                      {queueCount > 0 ? (
                        <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-full font-bold text-[10px]">
                          {queueCount} Queued Orders
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[11px]">Free</span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <span className={`px-2.5 py-0.5 rounded-full font-black text-[10px] ${
                        isRunning ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {isRunning ? 'RUNNING' : 'AVAILABLE'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
