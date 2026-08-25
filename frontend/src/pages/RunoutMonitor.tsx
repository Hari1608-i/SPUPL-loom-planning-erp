import React, { useState, useMemo, useEffect } from 'react';
import { calculateLoomRun, formatBalanceDays, formatRunoutDate } from '../utils/calculations';

import { Activity, AlertTriangle, ArrowRight, CheckCircle2, ShieldCheck, Clock, RefreshCw, Search, X } from 'lucide-react';
import { format } from 'date-fns';
import { useAppContext } from '../context/AppProvider';
import { API_BASE_URL } from '../config';

export default function RunoutMonitor() {
  const { activeRuns, rawNextPlans, looms, designs, reeds, beams, productionLogs, refreshData } = useAppContext();
  const [searchTerm, setSearchTerm] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filterDelay, setFilterDelay] = useState('ALL');
  const [confirmModalData, setConfirmModalData] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    refreshData();
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshData();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const monitorData = useMemo(() => {
    const runs = Object.values(activeRuns);
    return runs
      .map(run => {
        const loom = looms.find(l => l.loomNo === run.loomNo);
        const design = designs.find(d => d.designNo === run.designNo);
        const plan = rawNextPlans.find(p => p.loom_no === run.loomNo && p.status !== 'CANCELLED' && p.status !== 'COMPLETED');
        const nextDesignNo = plan ? plan.next_design : '';
        const nextDesign = nextDesignNo ? designs.find(d => d.designNo === nextDesignNo) : null;

        // Current Design Session Daily Logs Filter
        const loomLogs = (productionLogs || [])
          .filter((l: any) => {
            if (l.loom_no !== run.loomNo) return false;
            if (run.designNo && l.design_no && l.design_no.trim().toLowerCase() !== run.designNo.trim().toLowerCase()) return false;
            const logDateStr = format(new Date(l.date || l.createdAt || new Date()), 'yyyy-MM-dd');
            const startStr = run.loomStartDate ? format(new Date(run.loomStartDate), 'yyyy-MM-dd') : '1970-01-01';
            return logDateStr >= startStr;
          })
          .map((l: any) => l.produced_meter);

        const totalProducedMtr = loomLogs.reduce((sum: number, val: number) => sum + (val || 0), 0);

        const calc = calculateLoomRun({
          loomStartDate: run.loomStartDate ? new Date(run.loomStartDate) : new Date(),
          warpedMeter: run.warpedMeter || 0,
          dailyProduction: totalProducedMtr,
          crimpPercent: design ? design.crimpPercent : 0,
        });

        // Next Reed & Beam check
        const reqReedCount = nextDesign ? String(nextDesign.reedCount) : '';
        const matchingReed = reqReedCount ? reeds.find(r => r.reed_count === reqReedCount && (r.status === 'Available' || r.available_qty > 0)) : null;
        const matchingBeam = nextDesignNo ? beams.find(b => b.design_no === nextDesignNo && (b.status === 'Available' || b.available_meter > 0)) : null;

        const reedStatus = matchingReed ? 'AVAILABLE' : (plan && plan.reserved_reed_no ? 'RESERVED' : (nextDesignNo ? 'REQUIRED' : '—'));
        const beamStatus = matchingBeam ? 'READY' : (plan && plan.reserved_beam_no ? 'RESERVED' : (nextDesignNo ? 'REQUIRED' : '—'));
        const sizingStatus = matchingBeam ? 'COMPLETED' : (nextDesignNo ? 'RUNNING' : '—');

        const expectedStart = calc.expectedRunoutDate;
        const expectedFinish = new Date(expectedStart.getTime() + 10 * 24 * 60 * 60 * 1000);
        const delayStatus = calc.balanceDays <= 2 ? 'URGENT' : (calc.balanceDays <= 6 ? 'HIGH PRIORITY' : 'ON TIME');

        let actionStatus = 'SAFE';
        let actionColor = 'text-green-700 bg-green-50 border-green-200';

        if (plan && plan.status === 'CONFIRMED') {
          actionStatus = 'CONFIRMED & READY';
          actionColor = 'text-blue-700 bg-blue-50 border-blue-200 font-bold';
        } else if (calc.balanceDays <= 2) {
          actionStatus = 'URGENT PLAN (<= 2 Days)';
          actionColor = 'text-red-800 bg-red-100 font-black border-red-300 animate-pulse';
        } else if (calc.balanceDays <= 6) {
          actionStatus = 'ALERT: SIZING & REED (<= 6 Days)';
          actionColor = 'text-amber-800 bg-amber-100 font-bold border-amber-300';
        } else if (calc.balanceDays <= 15) {
          actionStatus = 'NEXT PLAN REQUIRED';
          actionColor = 'text-orange-700 bg-orange-50 font-bold border-orange-200';
        }

        // Runout condition satisfied
        const isRunoutReady = (run.warpedMeter > 0 && totalProducedMtr >= run.warpedMeter) || calc.balanceDays <= 0 || calc.netBalanceMeter <= 0;

        return {
          loomNo: run.loomNo,
          currentDesign: run.designNo,
          producedMeter: totalProducedMtr,
          warpedMeter: run.warpedMeter,
          netBalanceMeter: calc.netBalanceMeter,
          balanceDays: calc.balanceDays,
          expectedRunoutDate: calc.expectedRunoutDate,
          nextDesign: nextDesignNo || '—',
          nextLoom: run.loomNo,
          requiredReed: reqReedCount || '—',
          reedStatus,
          requiredBeam: nextDesign ? (nextDesign.beamType || 'Standard') : '—',
          beamStatus,
          sizingStatus,
          expectedStart,
          expectedFinish,
          delayStatus,
          actionStatus,
          actionColor,
          plan,
          isRunoutReady
        };
      })
      .sort((a, b) => a.expectedRunoutDate.getTime() - b.expectedRunoutDate.getTime());
  }, [activeRuns, looms, designs, rawNextPlans, reeds, beams, productionLogs]);

  const filteredData = useMemo(() => {
    return monitorData.filter(d => {
      const q = searchTerm.toLowerCase().trim();
      const matchSearch = !q || (
        d.loomNo.toString().includes(q) ||
        d.currentDesign.toLowerCase().includes(q) ||
        d.nextDesign.toLowerCase().includes(q)
      );
      if (!matchSearch) return false;
      if (filterDelay === 'URGENT' && d.delayStatus !== 'URGENT') return false;
      if (filterDelay === 'HIGH PRIORITY' && d.delayStatus !== 'HIGH PRIORITY') return false;
      if (filterDelay === 'ON TIME' && d.delayStatus !== 'ON TIME') return false;
      return true;
    });
  }, [monitorData, searchTerm, filterDelay]);

  const criticalCount = monitorData.filter(d => d.balanceDays <= 2).length;
  const alertCount = monitorData.filter(d => d.balanceDays > 2 && d.balanceDays <= 6).length;
  const readyCount = monitorData.filter(d => d.plan && d.plan.status === 'CONFIRMED').length;

  const handleConfirmRunout = async () => {
    if (!confirmModalData) return;
    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/confirm-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loomNo: confirmModalData.loomNo,
          nextDesign: confirmModalData.nextDesign,
          startDate: format(new Date(), 'yyyy-MM-dd'),
          warpMeter: confirmModalData.plan?.planned_warp_meter || 1800,
          dailyProduction: 0,
          beamNo: confirmModalData.plan?.reserved_beam_no,
          setNo: confirmModalData.plan?.reserved_set_no,
          beamId: confirmModalData.plan?.reserved_beam_id
        })
      });

      if (response.ok) {
        await refreshData();
        setConfirmModalData(null);
      } else {
        alert('Failed to confirm runout. Please try again.');
      }
    } catch (e) {
      console.error('Failed to confirm runout:', e);
      alert('Error connecting to backend server.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 flex flex-col h-full bg-slate-50/70 p-4">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-4 bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center tracking-tight">
            <Activity className="w-6 h-6 mr-3 text-red-600" /> Runout Monitor & Requirements Confirmation Sheet
          </h1>
          <p className="text-slate-500 text-sm mt-1 font-medium">
            Search by Design No & Confirm Loom Plans: <strong>Loom → Current Design → Runout → Next Design → Reed → Beam → Sizing</strong>
          </p>
        </div>

        <button
          onClick={handleRefresh}
          className="flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md font-bold text-xs transition-all"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} /> {isRefreshing ? 'Refreshing...' : 'Refresh Requirements Data'}
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-red-200 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-red-600 uppercase">Urgent Runout (≤ 2 Days)</div>
            <div className="text-2xl font-black text-red-700 mt-1">{criticalCount} Looms</div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-red-50 text-red-600 flex items-center justify-center font-bold">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-amber-600 uppercase">Next Plan Alerts (≤ 6 Days)</div>
            <div className="text-2xl font-black text-amber-700 mt-1">{alertCount} Looms</div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-emerald-600 uppercase">Confirmed Plans</div>
            <div className="text-2xl font-black text-emerald-700 mt-1">{readyCount} Looms</div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-blue-200 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-blue-600 uppercase">Active Running Looms</div>
            <div className="text-2xl font-black text-blue-900 mt-1">{monitorData.length} Looms</div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <Activity className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Design Search & Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap justify-between items-center gap-4 text-xs">
        <div className="flex items-center space-x-3">
          <span className="font-bold text-slate-500 uppercase">Filter Status:</span>
          {['ALL', 'URGENT', 'HIGH PRIORITY', 'ON TIME'].map(st => (
            <button
              key={st}
              onClick={() => setFilterDelay(st)}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                filterDelay === st ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        <div className="relative w-80">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search Design No (e.g. SP26/620-23122), Loom..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-xl outline-none font-bold text-indigo-900 focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Full 15-Column Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex-1 overflow-hidden flex flex-col">
        <div className="overflow-auto custom-scrollbar flex-1">
          <table className="w-full text-left border-collapse whitespace-nowrap text-xs">
            <thead className="bg-slate-900 text-white font-bold sticky top-0 z-20 shadow-sm">
              <tr className="border-b border-slate-700">
                <th className="py-3 px-3">Loom</th>
                <th className="py-3 px-3">Current Design</th>
                <th className="py-3 px-3 text-right">Net Balance</th>
                <th className="py-3 px-3 text-right">Expected Runout</th>
                <th className="py-3 px-3">Next Design</th>
                <th className="py-3 px-3 text-center">Next Loom</th>
                <th className="py-3 px-3 text-center">Required Reed</th>
                <th className="py-3 px-3 text-center">Reed Status</th>
                <th className="py-3 px-3 text-center">Required Beam</th>
                <th className="py-3 px-3 text-center">Beam Status</th>
                <th className="py-3 px-3 text-center">Sizing Status</th>
                <th className="py-3 px-3 text-center">Expected Start</th>
                <th className="py-3 px-3 text-center">Expected Finish</th>
                <th className="py-3 px-3 text-center">Delay Status</th>
                <th className="py-3 px-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={15} className="py-12 text-center text-slate-400 font-bold">
                    No matching designs found for "{searchTerm}".
                  </td>
                </tr>
              ) : (
                filteredData.map(r => (
                  <tr key={r.loomNo} className="hover:bg-indigo-50/50 transition-colors">
                    <td className="py-2.5 px-3 font-black text-indigo-900 bg-indigo-50/30">Loom {r.loomNo}</td>
                    <td className="py-2.5 px-3 font-bold text-slate-800">{r.currentDesign}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800">{Math.round(r.netBalanceMeter)} M</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-red-700">
                      <div>{formatRunoutDate(r.expectedRunoutDate)}</div>
                      <div className="text-[10px] text-red-600 font-extrabold">{formatBalanceDays(r.balanceDays)}</div>
                    </td>
                    <td className="py-2.5 px-3 font-bold text-indigo-800">{r.nextDesign}</td>
                    <td className="py-2.5 px-3 text-center font-bold text-slate-700">{r.nextLoom}</td>
                    <td className="py-2.5 px-3 text-center font-medium text-slate-700">{r.requiredReed}</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                        r.reedStatus === 'AVAILABLE' || r.reedStatus === 'RESERVED' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {r.reedStatus}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center font-medium text-slate-700">{r.requiredBeam}</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                        r.beamStatus === 'READY' || r.beamStatus === 'RESERVED' ? 'bg-emerald-100 text-emerald-800' : 'bg-purple-100 text-purple-800'
                      }`}>
                        {r.beamStatus}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center font-semibold text-slate-800">{r.sizingStatus}</td>
                    <td className="py-2.5 px-3 text-center font-mono text-slate-700">{formatRunoutDate(r.expectedStart)}</td>
                    <td className="py-2.5 px-3 text-center font-mono text-slate-700">{formatRunoutDate(r.expectedFinish)}</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                        r.delayStatus === 'ON TIME' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {r.delayStatus}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {r.isRunoutReady ? (
                        <button
                          onClick={() => setConfirmModalData(r)}
                          title="Confirm runout and complete current design session"
                          className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg font-black text-[11px] inline-flex items-center gap-1 shadow-sm transition-all cursor-pointer animate-pulse"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>CONFIRM RUNOUT</span>
                        </button>
                      ) : r.nextDesign !== '—' ? (
                        <button
                          disabled
                          title="Runout condition not reached yet"
                          className="px-3 py-1 bg-slate-200 dark:bg-slate-700 text-slate-500 rounded-lg font-black text-[11px] inline-flex items-center gap-1 cursor-not-allowed opacity-60"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>RUNOUT PENDING</span>
                        </button>
                      ) : (
                        <span className="text-[10px] font-bold text-slate-400">NO NEXT PLAN</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Safety Runout Confirmation Dialog */}
      {confirmModalData && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5 text-red-600">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="text-base font-black tracking-tight text-slate-900">Confirm Loom Runout</h3>
              </div>
              <button 
                onClick={() => setConfirmModalData(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl space-y-2 text-xs text-slate-700 font-medium border border-slate-200">
              <div className="flex justify-between">
                <span className="font-bold text-slate-500">Loom No:</span>
                <span className="font-black text-indigo-900">Loom {confirmModalData.loomNo}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold text-slate-500">Current Design:</span>
                <span className="font-bold text-slate-800">{confirmModalData.currentDesign}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold text-slate-500">Expected Runout:</span>
                <span className="font-bold text-red-700">{formatRunoutDate(confirmModalData.expectedRunoutDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold text-slate-500">Net Balance:</span>
                <span className="font-bold text-red-600">{Math.round(confirmModalData.netBalanceMeter)} M</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2 mt-2">
                <span className="font-bold text-slate-500">Promoted Next Design:</span>
                <span className="font-black text-emerald-700">{confirmModalData.nextDesign !== '—' ? confirmModalData.nextDesign : 'None (Awaiting Next Plan)'}</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed">
              Confirming runout will close the current design session, archive its complete production history to Completed History, {confirmModalData.nextDesign !== '—' ? <>promote <strong>{confirmModalData.nextDesign}</strong> as Current Running Design, and reset new session production to <strong>0 M</strong>.</> : <>and set loom state to Runout Completed (Awaiting Next Plan).</>}
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmModalData(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
              >
                CANCEL
              </button>
              <button
                onClick={handleConfirmRunout}
                disabled={isSubmitting}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black shadow-md transition-all flex items-center gap-1.5"
              >
                {isSubmitting ? 'Processing...' : 'CONFIRM RUNOUT'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
