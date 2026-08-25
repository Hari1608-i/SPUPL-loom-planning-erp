import React, { useState, useEffect } from 'react';
import { 
  AlertCircle, AlertTriangle, CheckCircle2, Clock, ShieldCheck, Search, Filter, 
  RefreshCw, Sparkles, FileText, ArrowRight, Eye, Check, XCircle, ArrowUpRight, 
  Layers, ChevronRight, Activity, Calendar, ShieldAlert
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../config';
import { useAppContext } from '../context/AppProvider';

interface ErpAlertItem {
  id: number;
  alert_code: string;
  department: string;
  order_no?: string | null;
  design_no?: string | null;
  loom_no?: number | null;
  beam_no?: string | null;
  reed_spec?: string | null;
  priority: string;
  message: string;
  reason?: string | null;
  suggested_action?: string | null;
  status: string;
  acknowledged_by?: string | null;
  acknowledged_date?: string | null;
  remarks?: string | null;
  createdAt: string;
}

export default function ErpAlertCenter() {
  const navigate = useNavigate();
  const { refreshData } = useAppContext();

  const [alerts, setAlerts] = useState<ErpAlertItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('OPEN');
  const [dateFilter, setDateFilter] = useState('ALL');

  // Detail Drawer Modal State
  const [selectedAlert, setSelectedAlert] = useState<ErpAlertItem | null>(null);

  const fetchAlerts = async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/erp-alerts`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setAlerts(data);
          setLastUpdated(new Date().toLocaleTimeString());
        }
      } else {
        setFetchError('Unable to refresh alerts. Server returned an error.');
      }
    } catch (e: any) {
      console.error('Failed to fetch ERP alerts', e);
      setFetchError('Unable to refresh alerts. Network or database connectivity issue.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
    refreshData();
    const interval = setInterval(fetchAlerts, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleAcknowledge = async (id: number) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/erp-alerts/${id}/acknowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_name: 'Senior Planner', remarks: 'Acknowledged via Common Alert Center' })
      });
      if (res.ok) {
        await fetchAlerts();
        if (selectedAlert?.id === id) setSelectedAlert(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleResolve = async (id: number) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/erp-alerts/${id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_name: 'Senior Planner', remarks: 'Manually marked as resolved' })
      });
      if (res.ok) {
        await fetchAlerts();
        if (selectedAlert?.id === id) setSelectedAlert(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Target navigation router
  const handleNavigateToTarget = (dept: string) => {
    const d = dept.toUpperCase();
    if (d.includes('BEAM')) navigate('/beam-stock');
    else if (d.includes('REED')) navigate('/reed-stock');
    else if (d.includes('PLAN')) navigate('/plan');
    else if (d.includes('WEAVING') || d.includes('RUNOUT')) navigate('/entry');
    else if (d.includes('DELIVERY') || d.includes('ORDER')) navigate('/orders');
    else navigate('/plan');
  };

  const getTargetButtonLabel = (dept: string) => {
    const d = dept.toUpperCase();
    if (d.includes('BEAM')) return 'GO TO BEAM STOCK';
    if (d.includes('REED')) return 'GO TO REED STOCK';
    if (d.includes('PLAN')) return 'GO TO LOOM PLANNING';
    if (d.includes('WEAVING') || d.includes('RUNOUT')) return 'GO TO MAIN ENTRY';
    if (d.includes('DELIVERY') || d.includes('ORDER')) return 'GO TO ORDER MANAGEMENT';
    return 'GO TO MODULE';
  };

  // Filter calculations
  const filteredAlerts = alerts.filter(a => {
    const q = searchTerm.toLowerCase();
    const matchSearch = (
      (a.alert_code && a.alert_code.toLowerCase().includes(q)) ||
      (a.message && a.message.toLowerCase().includes(q)) ||
      (a.order_no && a.order_no.toLowerCase().includes(q)) ||
      (a.design_no && a.design_no.toLowerCase().includes(q)) ||
      (a.department && a.department.toLowerCase().includes(q)) ||
      (a.loom_no && a.loom_no.toString().includes(q)) ||
      (a.beam_no && a.beam_no.toLowerCase().includes(q))
    );
    if (!matchSearch) return false;

    if (deptFilter !== 'ALL' && a.department.toUpperCase() !== deptFilter.toUpperCase()) return false;
    
    if (priorityFilter !== 'ALL') {
      const p = a.priority.toUpperCase();
      if (priorityFilter === 'CRITICAL' && !p.includes('CRITICAL')) return false;
      if (priorityFilter === 'HIGH' && !p.includes('HIGH')) return false;
      if (priorityFilter === 'MEDIUM' && !p.includes('MEDIUM')) return false;
      if (priorityFilter === 'LOW' && !p.includes('LOW')) return false;
    }

    if (statusFilter !== 'ALL' && a.status.toUpperCase() !== statusFilter.toUpperCase()) return false;

    if (dateFilter !== 'ALL') {
      const created = new Date(a.createdAt);
      const now = new Date();
      if (dateFilter === 'Today') {
        if (created.toDateString() !== now.toDateString()) return false;
      } else if (dateFilter === '7Days') {
        const diffDays = (now.getTime() - created.getTime()) / (1000 * 3600 * 24);
        if (diffDays > 7) return false;
      }
    }

    return true;
  });

  // KPI Metrics
  const criticalCount = alerts.filter(a => a.priority.includes('CRITICAL') && a.status === 'OPEN').length;
  const highCount = alerts.filter(a => a.priority.includes('HIGH') && a.status === 'OPEN').length;
  const mediumCount = alerts.filter(a => a.priority.includes('MEDIUM') && a.status === 'OPEN').length;
  const ackCount = alerts.filter(a => a.status === 'ACKNOWLEDGED').length;
  const openTotal = alerts.filter(a => a.status === 'OPEN').length;
  const loggedTotal = alerts.length;

  const calculateAge = (createdAtStr: string) => {
    const diffMs = Date.now() - new Date(createdAtStr).getTime();
    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHrs < 1) return 'Just now';
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    return `${diffDays}d ago`;
  };

  return (
    <div className="space-y-6 flex flex-col h-full bg-slate-50/70 p-4">
      
      {/* Page Title & Header */}
      <div className="flex flex-wrap justify-between items-center gap-4 bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center tracking-tight">
            <AlertCircle className="w-7 h-7 mr-3 text-red-600 animate-pulse" /> COMMON ALERT CENTER
          </h1>
          <p className="text-slate-500 text-xs mt-1 font-semibold">
            Central Department Alert & Action Hub: <span className="text-blue-700 font-bold">Planning → Beam Stock → Reed → Weaving → Loom Runout → Delivery Risk</span>
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {lastUpdated && (
            <span className="text-[11px] font-bold text-slate-400">
              Last Refreshed: <strong className="text-slate-700">{lastUpdated}</strong>
            </span>
          )}
          <button
            onClick={() => { fetchAlerts(); refreshData(); }}
            className="flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md font-bold text-xs transition-all"
          >
            <RefreshCw className={`w-4 h-4 mr-1.5 ${isLoading ? 'animate-refresh-spin' : ''}`} /> Refresh Alerts
          </button>
        </div>
      </div>

      {/* Main KPI Summary Dashboard Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        
        {/* Critical Open Alerts */}
        <div 
          onClick={() => { setPriorityFilter('CRITICAL'); setStatusFilter('OPEN'); }}
          className={`p-4 rounded-2xl border cursor-pointer transition-all ${
            priorityFilter === 'CRITICAL' && statusFilter === 'OPEN' ? 'bg-red-600 text-white border-red-700 shadow-md scale-[1.02]' : 'bg-white border-red-200 hover:bg-red-50/50 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-black uppercase tracking-wider ${priorityFilter === 'CRITICAL' && statusFilter === 'OPEN' ? 'text-red-100' : 'text-red-600'}`}>Critical Open</span>
            <AlertTriangle className={`w-4 h-4 ${priorityFilter === 'CRITICAL' && statusFilter === 'OPEN' ? 'text-white' : 'text-red-500'}`} />
          </div>
          <div className={`text-2xl font-black mt-2 ${priorityFilter === 'CRITICAL' && statusFilter === 'OPEN' ? 'text-white' : 'text-red-700'}`}>{criticalCount}</div>
        </div>

        {/* High Priority Alerts */}
        <div 
          onClick={() => { setPriorityFilter('HIGH'); setStatusFilter('OPEN'); }}
          className={`p-4 rounded-2xl border cursor-pointer transition-all ${
            priorityFilter === 'HIGH' && statusFilter === 'OPEN' ? 'bg-amber-600 text-white border-amber-700 shadow-md scale-[1.02]' : 'bg-white border-amber-200 hover:bg-amber-50/50 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-black uppercase tracking-wider ${priorityFilter === 'HIGH' && statusFilter === 'OPEN' ? 'text-amber-100' : 'text-amber-600'}`}>High Priority</span>
            <ShieldAlert className={`w-4 h-4 ${priorityFilter === 'HIGH' && statusFilter === 'OPEN' ? 'text-white' : 'text-amber-500'}`} />
          </div>
          <div className={`text-2xl font-black mt-2 ${priorityFilter === 'HIGH' && statusFilter === 'OPEN' ? 'text-white' : 'text-amber-700'}`}>{highCount}</div>
        </div>

        {/* Medium Priority Alerts */}
        <div 
          onClick={() => { setPriorityFilter('MEDIUM'); setStatusFilter('OPEN'); }}
          className={`p-4 rounded-2xl border cursor-pointer transition-all ${
            priorityFilter === 'MEDIUM' && statusFilter === 'OPEN' ? 'bg-blue-600 text-white border-blue-700 shadow-md scale-[1.02]' : 'bg-white border-blue-200 hover:bg-blue-50/50 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-black uppercase tracking-wider ${priorityFilter === 'MEDIUM' && statusFilter === 'OPEN' ? 'text-blue-100' : 'text-blue-600'}`}>Medium Priority</span>
            <Activity className={`w-4 h-4 ${priorityFilter === 'MEDIUM' && statusFilter === 'OPEN' ? 'text-white' : 'text-blue-500'}`} />
          </div>
          <div className={`text-2xl font-black mt-2 ${priorityFilter === 'MEDIUM' && statusFilter === 'OPEN' ? 'text-white' : 'text-blue-700'}`}>{mediumCount}</div>
        </div>

        {/* Acknowledged Alerts */}
        <div 
          onClick={() => { setStatusFilter('ACKNOWLEDGED'); setPriorityFilter('ALL'); }}
          className={`p-4 rounded-2xl border cursor-pointer transition-all ${
            statusFilter === 'ACKNOWLEDGED' ? 'bg-purple-600 text-white border-purple-700 shadow-md scale-[1.02]' : 'bg-white border-purple-200 hover:bg-purple-50/50 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-black uppercase tracking-wider ${statusFilter === 'ACKNOWLEDGED' ? 'text-purple-100' : 'text-purple-600'}`}>Acknowledged</span>
            <CheckCircle2 className={`w-4 h-4 ${statusFilter === 'ACKNOWLEDGED' ? 'text-white' : 'text-purple-500'}`} />
          </div>
          <div className={`text-2xl font-black mt-2 ${statusFilter === 'ACKNOWLEDGED' ? 'text-white' : 'text-purple-700'}`}>{ackCount}</div>
        </div>

        {/* Total Open Alerts */}
        <div 
          onClick={() => { setStatusFilter('OPEN'); setPriorityFilter('ALL'); setDeptFilter('ALL'); }}
          className={`p-4 rounded-2xl border cursor-pointer transition-all ${
            statusFilter === 'OPEN' && priorityFilter === 'ALL' ? 'bg-slate-900 text-white border-slate-950 shadow-md scale-[1.02]' : 'bg-white border-slate-200 hover:bg-slate-100 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-black uppercase tracking-wider ${statusFilter === 'OPEN' && priorityFilter === 'ALL' ? 'text-slate-300' : 'text-slate-600'}`}>Total Open</span>
            <Layers className={`w-4 h-4 ${statusFilter === 'OPEN' && priorityFilter === 'ALL' ? 'text-white' : 'text-slate-500'}`} />
          </div>
          <div className={`text-2xl font-black mt-2 ${statusFilter === 'OPEN' && priorityFilter === 'ALL' ? 'text-white' : 'text-slate-900'}`}>{openTotal}</div>
        </div>

        {/* Total Logged Alerts */}
        <div 
          onClick={() => { setStatusFilter('ALL'); setPriorityFilter('ALL'); setDeptFilter('ALL'); }}
          className={`p-4 rounded-2xl border cursor-pointer transition-all ${
            statusFilter === 'ALL' ? 'bg-emerald-700 text-white border-emerald-800 shadow-md scale-[1.02]' : 'bg-white border-emerald-200 hover:bg-emerald-50/50 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-black uppercase tracking-wider ${statusFilter === 'ALL' ? 'text-emerald-100' : 'text-emerald-700'}`}>Total Logged</span>
            <ShieldCheck className={`w-4 h-4 ${statusFilter === 'ALL' ? 'text-white' : 'text-emerald-600'}`} />
          </div>
          <div className={`text-2xl font-black mt-2 ${statusFilter === 'ALL' ? 'text-white' : 'text-emerald-900'}`}>{loggedTotal}</div>
        </div>
      </div>

      {/* Filter Control Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap justify-between items-center gap-4 text-xs">
        
        {/* Department Tabs */}
        <div className="flex items-center flex-wrap gap-1">
          {['ALL', 'PLANNING', 'BEAM STOCK', 'REED', 'WEAVING', 'RUNOUT', 'DELIVERY', 'SIZING'].map(dept => (
            <button
              key={dept}
              onClick={() => setDeptFilter(dept)}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                deptFilter === dept ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {dept}
            </button>
          ))}
        </div>

        {/* Priority & Status Dropdowns */}
        <div className="flex items-center space-x-3 flex-wrap gap-2">
          
          <select
            value={priorityFilter}
            onChange={e => setPriorityFilter(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 rounded-lg font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="ALL">Priority: ALL</option>
            <option value="CRITICAL">Priority: CRITICAL</option>
            <option value="HIGH">Priority: HIGH</option>
            <option value="MEDIUM">Priority: MEDIUM</option>
            <option value="LOW">Priority: LOW</option>
          </select>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 rounded-lg font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="ALL">Status: ALL</option>
            <option value="OPEN">Status: OPEN</option>
            <option value="ACKNOWLEDGED">Status: ACKNOWLEDGED</option>
            <option value="RESOLVED">Status: RESOLVED</option>
            <option value="DISMISSED">Status: DISMISSED</option>
          </select>

          <select
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 rounded-lg font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="ALL">Date: ALL</option>
            <option value="Today">Date: Today</option>
            <option value="7Days">Date: Last 7 Days</option>
          </select>

          <div className="relative w-56">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search IBPO, design, loom..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </div>
      </div>

      {/* Alert Error State */}
      {fetchError && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-900 rounded-2xl flex items-center justify-between shadow-sm">
          <div className="flex items-center space-x-3">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <span className="font-bold text-xs">{fetchError}</span>
          </div>
          <button 
            onClick={fetchAlerts}
            className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold text-xs shadow-sm flex items-center"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Retry
          </button>
        </div>
      )}

      {/* Main Alert Table Container */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col flex-1">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse whitespace-nowrap text-xs">
            <thead>
              <tr className="bg-slate-900 text-white uppercase text-[10px] font-black border-b border-slate-800">
                <th className="p-3 text-center">#</th>
                <th className="p-3">Code</th>
                <th className="p-3">Department</th>
                <th className="p-3">Priority</th>
                <th className="p-3">Order / IBPO</th>
                <th className="p-3">Design</th>
                <th className="p-3">Loom</th>
                <th className="p-3">Beam</th>
                <th className="p-3">Alert Message</th>
                <th className="p-3">Suggested Action</th>
                <th className="p-3">Age</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {isLoading ? (
                <tr>
                  <td colSpan={13} className="p-12 text-center text-slate-400 font-medium">
                    Loading real-time ERP alerts...
                  </td>
                </tr>
              ) : filteredAlerts.length === 0 ? (
                <tr>
                  <td colSpan={13} className="p-12 text-center space-y-2">
                    <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
                    <div className="text-slate-800 font-black text-sm uppercase">NO ACTIVE ALERTS</div>
                    <div className="text-slate-500 text-xs font-medium">
                      All monitored departments are currently within the planned operating conditions.
                    </div>
                  </td>
                </tr>
              ) : (
                filteredAlerts.map((row, idx) => {
                  const isCritical = row.priority.includes('CRITICAL');
                  const isHigh = row.priority.includes('HIGH');
                  const isMedium = row.priority.includes('MEDIUM');

                  return (
                    <tr key={row.id} className={`hover:bg-slate-50 transition-colors ${
                      row.status === 'RESOLVED' ? 'opacity-60 bg-slate-50/50' : isCritical ? 'bg-red-50/40' : ''
                    }`}>
                      <td className="p-3 text-center text-slate-400 font-mono font-bold">{idx + 1}</td>

                      <td className="p-3 font-mono font-black text-slate-900">
                        <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded font-bold">
                          {row.alert_code}
                        </span>
                      </td>

                      <td className="p-3 font-extrabold text-slate-700 uppercase">
                        <span className="px-2 py-0.5 bg-indigo-50 text-indigo-900 border border-indigo-200 rounded text-[10px]">
                          {row.department}
                        </span>
                      </td>

                      <td className="p-3 font-bold">
                        <span className={`px-2 py-1 rounded text-[10px] font-black uppercase border ${
                          isCritical ? 'bg-red-100 text-red-900 border-red-300' :
                          isHigh ? 'bg-amber-100 text-amber-900 border-amber-300' :
                          isMedium ? 'bg-blue-100 text-blue-900 border-blue-300' : 'bg-slate-100 text-slate-700 border-slate-300'
                        }`}>
                          {row.priority}
                        </span>
                      </td>

                      <td className="p-3 font-black text-slate-900">{row.order_no || '—'}</td>

                      <td className="p-3 font-bold text-blue-700">{row.design_no || '—'}</td>

                      <td className="p-3 font-bold text-slate-800">
                        {row.loom_no ? `Loom ${row.loom_no}` : '—'}
                      </td>

                      <td className="p-3 text-slate-600 font-medium">{row.beam_no || '—'}</td>

                      <td className="p-3 font-bold text-slate-900 max-w-[220px] truncate" title={row.message}>
                        {row.message}
                      </td>

                      <td className="p-3 text-slate-600 font-medium max-w-[200px] truncate" title={row.suggested_action || ''}>
                        {row.suggested_action || '—'}
                      </td>

                      <td className="p-3 text-slate-500 font-bold text-[11px]">
                        {calculateAge(row.createdAt)}
                      </td>

                      <td className="p-3 font-bold">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                          row.status === 'OPEN' ? 'bg-red-100 text-red-900' :
                          row.status === 'ACKNOWLEDGED' ? 'bg-purple-100 text-purple-900' :
                          row.status === 'RESOLVED' ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {row.status}
                        </span>
                      </td>

                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          <button
                            onClick={() => setSelectedAlert(row)}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-[11px] flex items-center transition-all"
                            title="View Alert Details"
                          >
                            <Eye className="w-3.5 h-3.5 mr-1" /> VIEW
                          </button>

                          <button
                            onClick={() => handleNavigateToTarget(row.department)}
                            className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-[11px] flex items-center shadow-sm transition-all"
                          >
                            {getTargetButtonLabel(row.department)} <ArrowUpRight className="w-3 h-3 ml-1" />
                          </button>

                          {row.status === 'OPEN' && (
                            <button
                              onClick={() => handleAcknowledge(row.id)}
                              className="px-2 py-1 bg-purple-100 hover:bg-purple-200 text-purple-900 border border-purple-300 rounded-lg font-bold text-[10px] transition-all"
                              title="Acknowledge Alert"
                            >
                              ACK
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

      {/* Alert Detail Drawer Modal */}
      {selectedAlert && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
            
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
              <div className="flex items-center space-x-3">
                <ShieldAlert className="w-5 h-5 text-red-400" />
                <div>
                  <h3 className="font-black text-base">Alert Details — {selectedAlert.alert_code}</h3>
                  <p className="text-[11px] text-slate-400">{selectedAlert.department} Department • Created {calculateAge(selectedAlert.createdAt)}</p>
                </div>
              </div>
              <button onClick={() => setSelectedAlert(null)} className="text-slate-400 hover:text-white font-bold">✕</button>
            </div>

            <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto text-xs">
              
              {/* Alert Header Badge Row */}
              <div className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-400 font-bold uppercase text-[10px] block">Priority</span>
                  <span className="font-black text-red-700 text-sm">{selectedAlert.priority}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold uppercase text-[10px] block">Current Status</span>
                  <span className="font-black text-indigo-700 text-sm uppercase">{selectedAlert.status}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold uppercase text-[10px] block">Target Loom</span>
                  <span className="font-bold text-slate-900 text-sm">{selectedAlert.loom_no ? `Loom ${selectedAlert.loom_no}` : 'N/A'}</span>
                </div>
              </div>

              {/* Core Information */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-400 font-bold uppercase text-[10px] block">Order / IBPO</span>
                  <span className="font-black text-slate-900">{selectedAlert.order_no || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold uppercase text-[10px] block">Design Specification</span>
                  <span className="font-black text-blue-700">{selectedAlert.design_no || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold uppercase text-[10px] block">Beam Stock No</span>
                  <span className="font-bold text-slate-800">{selectedAlert.beam_no || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold uppercase text-[10px] block">Created Date</span>
                  <span className="font-bold text-slate-800">{new Date(selectedAlert.createdAt).toLocaleString()}</span>
                </div>
              </div>

              {/* Message & Reason */}
              <div className="space-y-3">
                <div>
                  <h4 className="font-bold text-slate-900 uppercase text-[11px] mb-1">Alert Summary</h4>
                  <div className="p-3 bg-red-50 border border-red-200 text-red-950 font-bold rounded-xl">
                    {selectedAlert.message}
                  </div>
                </div>

                {selectedAlert.reason && (
                  <div>
                    <h4 className="font-bold text-slate-900 uppercase text-[11px] mb-1">Root Cause / Reason</h4>
                    <div className="p-3 bg-slate-100 border border-slate-200 text-slate-800 font-medium rounded-xl leading-relaxed">
                      {selectedAlert.reason}
                    </div>
                  </div>
                )}

                {selectedAlert.suggested_action && (
                  <div>
                    <h4 className="font-bold text-slate-900 uppercase text-[11px] mb-1">Recommended Action</h4>
                    <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-950 font-bold rounded-xl">
                      {selectedAlert.suggested_action}
                    </div>
                  </div>
                )}

                {selectedAlert.remarks && (
                  <div>
                    <h4 className="font-bold text-slate-900 uppercase text-[11px] mb-1">Planner / Confirmation Remark</h4>
                    <div className="p-3 bg-amber-50 border border-amber-200 text-amber-950 italic font-medium rounded-xl">
                      "{selectedAlert.remarks}"
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 bg-slate-100 border-t border-slate-200 flex justify-between items-center">
              <button
                onClick={() => setSelectedAlert(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-xl"
              >
                Close Panel
              </button>

              <div className="flex space-x-2">
                {selectedAlert.status === 'OPEN' && (
                  <button
                    onClick={() => handleAcknowledge(selectedAlert.id)}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-sm"
                  >
                    Acknowledge
                  </button>
                )}

                {selectedAlert.status !== 'RESOLVED' && (
                  <button
                    onClick={() => handleResolve(selectedAlert.id)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm"
                  >
                    Resolve Alert
                  </button>
                )}

                <button
                  onClick={() => handleNavigateToTarget(selectedAlert.department)}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md flex items-center"
                >
                  {getTargetButtonLabel(selectedAlert.department)} <ArrowUpRight className="w-4 h-4 ml-1.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
