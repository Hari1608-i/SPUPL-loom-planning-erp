import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAppContext } from '../context/AppProvider';
import { calculateLoomRun } from '../utils/calculations';
import {
  AlertTriangle,
  Search,
  CheckCircle2,
  RefreshCw,
  Activity,
  Clock,
  Layers,
  AlertCircle,
  ArrowRight,
  Filter,
  Flame,
  CheckCircle,
  FileSpreadsheet
} from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { API_BASE_URL } from '../config';

interface OperationalAlert {
  id: string;
  category: 'RUNOUT' | 'PRODUCTION_UPDATE' | 'SIZING_WAITING' | 'ORDER_BEAM_WAITING' | 'DESIGN_NOT_PLANNED' | 'BEAM_NOT_PLANNED';
  categoryName: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  unit: string;
  loomNo?: string | number;
  designNo?: string;
  orderNo?: string;
  beamNo?: string;
  date?: string;
  remainingDays?: number;
  description: string;
  actionLabel?: string;
  actionUrl?: string;
}

export default function Alerts() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedUnit, setSelectedUnit] = useState<string>('ALL');
  const [selectedPriority, setSelectedPriority] = useState<string>('ALL');
  const [alerts, setAlerts] = useState<OperationalAlert[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [fetchError, setFetchError] = useState<string | null>(null);

  const { activeRuns, nextPlans } = useAppContext();

  // Fallback local runout alerts if backend offline
  const fallbackRunoutAlerts = useMemo<OperationalAlert[]>(() => {
    return Object.values(activeRuns)
      .map(run => {
        const calc = calculateLoomRun(run as any);
        return { ...run, ...calc };
      })
      .filter(run => {
        const isCritical = run.balanceDays <= 15;
        const hasNextPlan = nextPlans[run.loomNo] && nextPlans[run.loomNo].designNo && nextPlans[run.loomNo].designNo.trim() !== '';
        return isCritical && !hasNextPlan;
      })
      .sort((a, b) => a.expectedRunoutDate.getTime() - b.expectedRunoutDate.getTime())
      .map(run => ({
        id: `local_runout_${run.loomNo}`,
        category: 'RUNOUT' as const,
        categoryName: 'Runout Alert (<= 15 Days)',
        priority: run.balanceDays <= 2 ? ('HIGH' as const) : run.balanceDays <= 7 ? ('MEDIUM' as const) : ('LOW' as const),
        unit: (run as any).unit || (run as any).unit_name || 'Unit I',
        loomNo: run.loomNo,
        designNo: run.designNo,
        orderNo: (run as any).orderNo || (run as any).order_no || '',
        date: run.expectedRunoutDate ? format(run.expectedRunoutDate, 'yyyy-MM-dd') : undefined,
        remainingDays: Math.round(run.balanceDays),
        description: `Loom ${run.loomNo} running ${run.designNo} runs out in ${Math.round(run.balanceDays)} days with net bal ${Math.round(run.netBalanceMeter)}m. No next plan assigned.`,
        actionLabel: 'Set Plan',
        actionUrl: '/plan'
      }));
  }, [activeRuns, nextPlans]);

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/operational-alerts`);
      if (res.ok) {
        const data = await res.json();
        if (data.alerts && Array.isArray(data.alerts)) {
          setAlerts(data.alerts);
          setLastRefreshed(new Date());
          return;
        }
      }
      // If endpoint returned non-ok or unexpected format, fallback
      setAlerts(fallbackRunoutAlerts);
    } catch (err: any) {
      console.warn('Failed to fetch operational alerts, using fallback:', err);
      setFetchError('Live operational notifications could not be retrieved from server. Showing local alerts.');
      setAlerts(fallbackRunoutAlerts);
    } finally {
      setLoading(false);
    }
  }, [fallbackRunoutAlerts]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  // Compute counts by category
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      ALL: alerts.length,
      RUNOUT: 0,
      PRODUCTION_UPDATE: 0,
      SIZING_WAITING: 0,
      ORDER_BEAM_WAITING: 0,
      DESIGN_NOT_PLANNED: 0,
      BEAM_NOT_PLANNED: 0,
    };
    alerts.forEach(a => {
      if (counts[a.category] !== undefined) {
        counts[a.category]++;
      }
    });
    return counts;
  }, [alerts]);

  // Filtered list
  const filteredAlerts = useMemo(() => {
    return alerts.filter(item => {
      // Category filter
      if (selectedCategory !== 'ALL' && item.category !== selectedCategory) {
        return false;
      }
      // Priority filter
      if (selectedPriority !== 'ALL' && item.priority !== selectedPriority) {
        return false;
      }
      // Unit filter
      if (selectedUnit !== 'ALL') {
        const itemUnit = (item.unit || '').toLowerCase().replace(/\s+/g, '');
        const targetUnit = selectedUnit.toLowerCase().replace(/\s+/g, '');
        if (!itemUnit.includes(targetUnit) && !targetUnit.includes(itemUnit)) {
          return false;
        }
      }
      // Search term
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const matches =
          String(item.loomNo || '').toLowerCase().includes(q) ||
          (item.designNo || '').toLowerCase().includes(q) ||
          (item.orderNo || '').toLowerCase().includes(q) ||
          (item.beamNo || '').toLowerCase().includes(q) ||
          (item.unit || '').toLowerCase().includes(q) ||
          (item.description || '').toLowerCase().includes(q) ||
          (item.categoryName || '').toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [alerts, selectedCategory, selectedPriority, selectedUnit, searchTerm]);

  const getPriorityBadge = (priority: 'HIGH' | 'MEDIUM' | 'LOW') => {
    if (priority === 'HIGH') {
      return (
        <span className="inline-flex items-center px-2.5 py-1 text-xs font-black rounded-md bg-red-100 text-red-700 border border-red-300">
          <Flame className="w-3 h-3 mr-1 text-red-600" /> HIGH
        </span>
      );
    }
    if (priority === 'MEDIUM') {
      return (
        <span className="inline-flex items-center px-2.5 py-1 text-xs font-black rounded-md bg-amber-100 text-amber-800 border border-amber-300">
          <Clock className="w-3 h-3 mr-1 text-amber-600" /> MEDIUM
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2.5 py-1 text-xs font-black rounded-md bg-blue-100 text-blue-700 border border-blue-300">
        <AlertCircle className="w-3 h-3 mr-1 text-blue-600" /> LOW
      </span>
    );
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'RUNOUT':
        return <AlertTriangle className="w-4 h-4 text-red-600" />;
      case 'PRODUCTION_UPDATE':
        return <Activity className="w-4 h-4 text-amber-600" />;
      case 'SIZING_WAITING':
        return <Clock className="w-4 h-4 text-purple-600" />;
      case 'ORDER_BEAM_WAITING':
        return <Layers className="w-4 h-4 text-blue-600" />;
      case 'DESIGN_NOT_PLANNED':
        return <FileSpreadsheet className="w-4 h-4 text-indigo-600" />;
      case 'BEAM_NOT_PLANNED':
        return <AlertCircle className="w-4 h-4 text-rose-600" />;
      default:
        return <AlertTriangle className="w-4 h-4 text-gray-600" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-2xl shadow-sm border border-industrial-100 gap-4">
        <div>
          <h1 className="text-2xl font-black text-industrial-900 flex items-center tracking-tight">
            <AlertTriangle className="w-8 h-8 mr-3 text-red-600 p-1.5 bg-red-50 rounded-lg" />
            Centralized Operational Alerts & Notifications
          </h1>
          <p className="text-industrial-500 text-sm mt-2 font-medium">
            Live operational intelligence across Weaving Runouts, Daily Production Updates, Sizing Progress, Beam Allocations, and Loom Planning.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-industrial-400 font-mono">
            Updated: {format(lastRefreshed, 'HH:mm:ss')}
          </span>
          <button
            onClick={fetchAlerts}
            disabled={loading}
            className="flex items-center px-4 py-2 bg-industrial-900 hover:bg-industrial-800 text-white text-xs font-bold rounded-lg shadow-sm transition-all active:scale-95 disabled:opacity-50"
            title="Refresh Operational Alerts"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {fetchError && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-xs font-medium flex items-center">
          <AlertCircle className="w-4 h-4 mr-2 text-amber-600 shrink-0" />
          {fetchError}
        </div>
      )}

      {/* Category Tabs */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
        <button
          onClick={() => setSelectedCategory('ALL')}
          className={`p-3 rounded-xl border text-left transition-all ${
            selectedCategory === 'ALL'
              ? 'bg-industrial-900 text-white border-industrial-900 shadow-md ring-2 ring-industrial-900/20'
              : 'bg-white text-industrial-700 border-industrial-200 hover:bg-industrial-50'
          }`}
        >
          <div className="text-[11px] font-semibold opacity-80 uppercase tracking-wider">All Alerts</div>
          <div className="text-xl font-black mt-1">{categoryCounts.ALL || 0}</div>
        </button>

        <button
          onClick={() => setSelectedCategory('RUNOUT')}
          className={`p-3 rounded-xl border text-left transition-all ${
            selectedCategory === 'RUNOUT'
              ? 'bg-red-600 text-white border-red-600 shadow-md ring-2 ring-red-500/20'
              : 'bg-white text-industrial-700 border-industrial-200 hover:bg-red-50/50'
          }`}
        >
          <div className="text-[11px] font-semibold opacity-80 uppercase tracking-wider flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-400"></span> Runout (&le;15d)
          </div>
          <div className="text-xl font-black mt-1 text-red-600 group-hover:text-red-700" style={{ color: selectedCategory === 'RUNOUT' ? 'white' : undefined }}>
            {categoryCounts.RUNOUT || 0}
          </div>
        </button>

        <button
          onClick={() => setSelectedCategory('PRODUCTION_UPDATE')}
          className={`p-3 rounded-xl border text-left transition-all ${
            selectedCategory === 'PRODUCTION_UPDATE'
              ? 'bg-amber-600 text-white border-amber-600 shadow-md ring-2 ring-amber-500/20'
              : 'bg-white text-industrial-700 border-industrial-200 hover:bg-amber-50/50'
          }`}
        >
          <div className="text-[11px] font-semibold opacity-80 uppercase tracking-wider flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-400"></span> Production Due
          </div>
          <div className="text-xl font-black mt-1" style={{ color: selectedCategory === 'PRODUCTION_UPDATE' ? 'white' : undefined }}>
            {categoryCounts.PRODUCTION_UPDATE || 0}
          </div>
        </button>

        <button
          onClick={() => setSelectedCategory('SIZING_WAITING')}
          className={`p-3 rounded-xl border text-left transition-all ${
            selectedCategory === 'SIZING_WAITING'
              ? 'bg-purple-600 text-white border-purple-600 shadow-md ring-2 ring-purple-500/20'
              : 'bg-white text-industrial-700 border-industrial-200 hover:bg-purple-50/50'
          }`}
        >
          <div className="text-[11px] font-semibold opacity-80 uppercase tracking-wider flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-purple-400"></span> Sizing Wait
          </div>
          <div className="text-xl font-black mt-1" style={{ color: selectedCategory === 'SIZING_WAITING' ? 'white' : undefined }}>
            {categoryCounts.SIZING_WAITING || 0}
          </div>
        </button>

        <button
          onClick={() => setSelectedCategory('ORDER_BEAM_WAITING')}
          className={`p-3 rounded-xl border text-left transition-all ${
            selectedCategory === 'ORDER_BEAM_WAITING'
              ? 'bg-blue-600 text-white border-blue-600 shadow-md ring-2 ring-blue-500/20'
              : 'bg-white text-industrial-700 border-industrial-200 hover:bg-blue-50/50'
          }`}
        >
          <div className="text-[11px] font-semibold opacity-80 uppercase tracking-wider flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-blue-400"></span> Order Beam Wait
          </div>
          <div className="text-xl font-black mt-1" style={{ color: selectedCategory === 'ORDER_BEAM_WAITING' ? 'white' : undefined }}>
            {categoryCounts.ORDER_BEAM_WAITING || 0}
          </div>
        </button>

        <button
          onClick={() => setSelectedCategory('DESIGN_NOT_PLANNED')}
          className={`p-3 rounded-xl border text-left transition-all ${
            selectedCategory === 'DESIGN_NOT_PLANNED'
              ? 'bg-indigo-600 text-white border-indigo-600 shadow-md ring-2 ring-indigo-500/20'
              : 'bg-white text-industrial-700 border-industrial-200 hover:bg-indigo-50/50'
          }`}
        >
          <div className="text-[11px] font-semibold opacity-80 uppercase tracking-wider flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-indigo-400"></span> Unplanned Design
          </div>
          <div className="text-xl font-black mt-1" style={{ color: selectedCategory === 'DESIGN_NOT_PLANNED' ? 'white' : undefined }}>
            {categoryCounts.DESIGN_NOT_PLANNED || 0}
          </div>
        </button>

        <button
          onClick={() => setSelectedCategory('BEAM_NOT_PLANNED')}
          className={`p-3 rounded-xl border text-left transition-all ${
            selectedCategory === 'BEAM_NOT_PLANNED'
              ? 'bg-rose-600 text-white border-rose-600 shadow-md ring-2 ring-rose-500/20'
              : 'bg-white text-industrial-700 border-industrial-200 hover:bg-rose-50/50'
          }`}
        >
          <div className="text-[11px] font-semibold opacity-80 uppercase tracking-wider flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-rose-400"></span> Plan Beam Wait
          </div>
          <div className="text-xl font-black mt-1" style={{ color: selectedCategory === 'BEAM_NOT_PLANNED' ? 'white' : undefined }}>
            {categoryCounts.BEAM_NOT_PLANNED || 0}
          </div>
        </button>
      </div>

      {/* Main Alert Content Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-industrial-100 overflow-hidden flex flex-col">
        {/* Filter bar */}
        <div className="p-4 border-b border-industrial-100 bg-industrial-50/40 flex flex-wrap gap-3 items-center justify-between">
          <div className="flex flex-wrap items-center gap-3 flex-1">
            <div className="relative min-w-[220px] max-w-sm flex-1">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-industrial-400" />
              <input
                type="text"
                placeholder="Search loom, design, order, beam, alert..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs border border-industrial-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-industrial-500/20 focus:border-industrial-500 transition-all bg-white font-medium placeholder:font-normal"
              />
            </div>

            <div className="flex items-center gap-1.5 text-xs text-industrial-600 font-semibold">
              <Filter className="w-3.5 h-3.5 text-industrial-400" />
              <span>Unit:</span>
              <select
                value={selectedUnit}
                onChange={e => setSelectedUnit(e.target.value)}
                className="py-1.5 px-2.5 bg-white border border-industrial-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-industrial-500"
              >
                <option value="ALL">All Units</option>
                <option value="Unit 1">Unit 1</option>
                <option value="Unit 2">Unit 2</option>
                <option value="Unit 3">Unit 3</option>
                <option value="Unit 4">Unit 4</option>
                <option value="Unit 5">Unit 5</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-industrial-600 font-semibold">
              <span>Priority:</span>
              <select
                value={selectedPriority}
                onChange={e => setSelectedPriority(e.target.value)}
                className="py-1.5 px-2.5 bg-white border border-industrial-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-industrial-500"
              >
                <option value="ALL">All Priorities</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </div>
          </div>

          <div className="text-xs text-industrial-700 font-bold flex items-center px-3 py-1.5 bg-white rounded-lg shadow-sm border border-industrial-200">
            Showing <span className="text-industrial-900 font-black mx-1">{filteredAlerts.length}</span> of {alerts.length} notifications
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto flex-1 min-h-[420px]">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead className="bg-industrial-50/70 sticky top-0 shadow-sm z-10">
              <tr className="border-b border-industrial-200">
                <th className="py-3.5 px-4 text-xs font-bold text-industrial-600 uppercase tracking-wider text-center">Priority</th>
                <th className="py-3.5 px-4 text-xs font-bold text-industrial-600 uppercase tracking-wider">Category</th>
                <th className="py-3.5 px-4 text-xs font-bold text-industrial-600 uppercase tracking-wider">Unit</th>
                <th className="py-3.5 px-4 text-xs font-bold text-industrial-600 uppercase tracking-wider">Loom / Ref</th>
                <th className="py-3.5 px-4 text-xs font-bold text-industrial-600 uppercase tracking-wider">Design / Order</th>
                <th className="py-3.5 px-4 text-xs font-bold text-industrial-600 uppercase tracking-wider">Details & Status</th>
                <th className="py-3.5 px-4 text-xs font-bold text-industrial-600 uppercase tracking-wider">Target / Date</th>
                <th className="py-3.5 px-4 text-xs font-bold text-industrial-600 uppercase tracking-wider text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-industrial-100">
              {filteredAlerts.map(alert => (
                <tr key={alert.id} className="hover:bg-industrial-50/40 transition-colors group">
                  <td className="py-3.5 px-4 text-center">
                    {getPriorityBadge(alert.priority)}
                  </td>
                  <td className="py-3.5 px-4 font-semibold text-industrial-800 text-xs">
                    <span className="inline-flex items-center gap-1.5 font-bold">
                      {getCategoryIcon(alert.category)}
                      {alert.categoryName}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-bold text-industrial-700 text-xs">
                    <span className="px-2 py-0.5 rounded bg-industrial-100 text-industrial-800 text-[11px]">
                      {alert.unit || '—'}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-black text-industrial-900 text-sm">
                    {alert.loomNo ? (
                      <span className="text-industrial-900">Loom {alert.loomNo}</span>
                    ) : alert.beamNo ? (
                      <span className="font-mono text-purple-700 text-xs">Beam {alert.beamNo}</span>
                    ) : (
                      <span className="text-industrial-400 font-normal">—</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-xs font-semibold text-industrial-800">
                    <div>{alert.designNo || '—'}</div>
                    {alert.orderNo && (
                      <div className="text-[11px] text-industrial-500 font-mono">IBPO: {alert.orderNo}</div>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-xs text-industrial-700 max-w-md truncate" title={alert.description}>
                    <span className="line-clamp-1">{alert.description}</span>
                  </td>
                  <td className="py-3.5 px-4 text-xs font-medium text-industrial-700">
                    {alert.remainingDays !== undefined ? (
                      <span className={`font-black ${
                        alert.remainingDays <= 2 ? 'text-red-600' : alert.remainingDays <= 7 ? 'text-amber-600' : 'text-industrial-800'
                      }`}>
                        {alert.remainingDays} days left
                      </span>
                    ) : alert.date ? (
                      <span className="font-mono text-industrial-600">{alert.date}</span>
                    ) : (
                      <span className="text-industrial-400">—</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    {alert.actionUrl ? (
                      <Link to={alert.actionUrl}>
                        <button className="inline-flex items-center px-3 py-1 bg-industrial-900 hover:bg-industrial-800 text-white text-xs font-bold rounded-lg shadow-sm transition-all active:scale-95">
                          {alert.actionLabel || 'View'}
                          <ArrowRight className="w-3 h-3 ml-1" />
                        </button>
                      </Link>
                    ) : (
                      <span className="text-industrial-300">—</span>
                    )}
                  </td>
                </tr>
              ))}

              {filteredAlerts.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-industrial-400 bg-gray-50/50">
                    <CheckCircle className="w-16 h-16 mx-auto mb-3 text-green-500 opacity-60" />
                    <p className="text-lg font-bold text-industrial-800">All Clear</p>
                    <p className="text-xs font-medium text-industrial-500 mt-1">
                      {selectedCategory === 'ALL'
                        ? 'No active operational alerts found across all units.'
                        : `No pending alerts under category "${selectedCategory}".`}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
