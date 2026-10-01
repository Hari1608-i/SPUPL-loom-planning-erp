import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Bell, BellRing, CheckCircle2, Clock, AlertTriangle, AlertCircle, 
  Settings, Send, RefreshCw, Smartphone, MessageSquare, PhoneCall, 
  Calendar, Check, X, ShieldCheck, ShieldAlert, Sparkles, Filter, 
  ChevronRight, Edit3, Save, Info, Radio, Zap, ArrowRight, UserCheck
} from 'lucide-react';
import { API_BASE_URL } from '../config';
import { useAuth } from '../context/AuthContext';

interface AlertConfig {
  id: number;
  department_code: string;
  department_name: string;
  is_active: boolean;
  sender_number: string | null;
  receiver_number: string | null;
  channel: 'WhatsApp' | 'SMS' | string;
  start_time: string;
  rapid_start_time: string;
  rapid_interval_minutes: number;
  end_time: string;
  sunday_enabled: boolean;
  message_template: string | null;
  created_at: string;
  updated_at: string;
}

interface DepartmentStatus {
  id: number;
  department_code: string;
  department_name: string;
  is_active: boolean;
  channel: string;
  sender_number: string | null;
  receiver_number: string | null;
  messaging_ready: boolean;
  messaging_status: string;
  today_entry: 'COMPLETED' | 'PENDING';
  reminder_status: 'ACTIVE' | 'STOPPED' | 'DISABLED' | 'COMPLETED_FOR_DAY' | 'SUNDAY_OFF';
  last_reminder: string;
  last_reminder_time: string | null;
  next_reminder: string;
  completed_at: string | null;
  config: {
    start_time: string;
    rapid_start_time: string;
    rapid_interval_minutes: number;
    end_time: string;
    sunday_enabled: boolean;
    message_template: string | null;
  };
}

interface AlertLog {
  id: number;
  alert_config_id: number | null;
  department_code: string;
  alert_date: string;
  scheduled_time: string;
  sent_at: string;
  channel: string;
  sender_number: string | null;
  receiver_number: string | null;
  status: string;
  message: string | null;
  error_message: string | null;
}

export default function DailyEntryAlert() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'STATUS' | 'CONFIG' | 'LOGS'>('STATUS');

  // Live status state
  const [loadingStatus, setLoadingStatus] = useState<boolean>(true);
  const [statusDate, setStatusDate] = useState<string>(() => new Date().toISOString().substring(0, 10));
  const [currentTime, setCurrentTime] = useState<string>('');
  const [isSunday, setIsSunday] = useState<boolean>(false);
  const [departments, setDepartments] = useState<DepartmentStatus[]>([]);

  // Config state
  const [configs, setConfigs] = useState<AlertConfig[]>([]);
  const [editingConfig, setEditingConfig] = useState<AlertConfig | null>(null);
  const [savingConfig, setSavingConfig] = useState<boolean>(false);

  // History logs state
  const [logs, setLogs] = useState<AlertLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState<boolean>(false);
  const [logFilterDept, setLogFilterDept] = useState<string>('ALL');
  const [logFilterStatus, setLogFilterStatus] = useState<string>('ALL');

  // Test modal state
  const [testModalOpen, setTestModalOpen] = useState<boolean>(false);
  const [testDept, setTestDept] = useState<DepartmentStatus | null>(null);
  const [testSender, setTestSender] = useState<string>('');
  const [testReceiver, setTestReceiver] = useState<string>('');
  const [testChannel, setTestChannel] = useState<'WhatsApp' | 'SMS'>('WhatsApp');
  const [testCustomMessage, setTestCustomMessage] = useState<string>('');
  const [sendingTest, setSendingTest] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; error?: string } | null>(null);

  // General toast feedback
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 4500);
  };

  // Fetch Live Status
  const fetchStatus = useCallback(async (showIndicator = true) => {
    if (showIndicator) setLoadingStatus(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/daily-entry-alert/status?date=${statusDate}`);
      const data = await res.json();
      if (data.success) {
        setDepartments(data.departments || []);
        setCurrentTime(data.current_time || '');
        setIsSunday(Boolean(data.is_sunday));
      }
    } catch (err: any) {
      console.error('Failed to fetch alert status:', err);
    } finally {
      setLoadingStatus(false);
    }
  }, [statusDate]);

  // Fetch Configurations
  const fetchConfigs = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/daily-entry-alert/config`);
      const data = await res.json();
      if (data.success) {
        setConfigs(data.configs || []);
      }
    } catch (err: any) {
      console.error('Failed to fetch alert configs:', err);
    }
  }, []);

  // Fetch History Logs
  const fetchLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      let query = `?limit=150`;
      if (logFilterDept !== 'ALL') query += `&department_code=${encodeURIComponent(logFilterDept)}`;
      if (logFilterStatus !== 'ALL') query += `&status=${encodeURIComponent(logFilterStatus)}`;

      const res = await fetch(`${API_BASE_URL}/api/daily-entry-alert/history${query}`);
      const data = await res.json();
      if (data.success) {
        setLogs(data.logs || []);
      }
    } catch (err: any) {
      console.error('Failed to fetch alert logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  }, [logFilterDept, logFilterStatus]);

  // Initial and periodic polling (every 30 seconds for live status)
  useEffect(() => {
    fetchStatus();
    fetchConfigs();
    const interval = setInterval(() => {
      fetchStatus(false);
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus, fetchConfigs]);

  useEffect(() => {
    if (activeTab === 'LOGS') {
      fetchLogs();
    }
  }, [activeTab, fetchLogs]);

  // Save Config Changes
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingConfig) return;
    setSavingConfig(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/daily-entry-alert/config/${editingConfig.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingConfig)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to save configuration');
      }
      showToast(`Configuration updated for ${editingConfig.department_name}`, 'success');
      setEditingConfig(null);
      fetchConfigs();
      fetchStatus(false);
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setSavingConfig(false);
    }
  };

  // Open Test Modal
  const handleOpenTestModal = (dept: DepartmentStatus) => {
    setTestDept(dept);
    setTestSender(dept.sender_number || '');
    setTestReceiver(dept.receiver_number || '');
    setTestChannel((dept.channel as any) || 'WhatsApp');
    setTestCustomMessage('');
    setTestResult(null);
    setTestModalOpen(true);
  };

  // Execute Test Notification
  const handleSendTestMessage = async () => {
    if (!testDept) return;
    if (!testSender.trim() || !testReceiver.trim()) {
      setTestResult({
        success: false,
        message: 'Messaging Disabled - Number not configured',
        error: 'Both Sender Number and Receiver Number are strictly required.'
      });
      return;
    }

    setSendingTest(true);
    setTestResult(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/daily-entry-alert/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          department_code: testDept.department_code,
          channel: testChannel,
          sender_number: testSender,
          receiver_number: testReceiver,
          message: testCustomMessage || undefined
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setTestResult({
          success: false,
          message: data.error || 'Test notification failed',
          error: data.error
        });
      } else {
        setTestResult({
          success: true,
          message: data.message || `Test ${testChannel} sent successfully!`
        });
        showToast(`Test ${testChannel} dispatched to ${testReceiver}`, 'success');
        fetchStatus(false);
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: 'Network or server error sending test notification',
        error: err.message
      });
    } finally {
      setSendingTest(false);
    }
  };

  // Trigger Immediate Check (Manual Scheduler Run)
  const handleTriggerCycleCheck = async () => {
    try {
      showToast('Evaluating scheduled reminder cycle...', 'info');
      const res = await fetch(`${API_BASE_URL}/api/daily-entry-alert/trigger-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (data.success) {
        showToast('Reminder cycle evaluation complete', 'success');
        fetchStatus(false);
        if (activeTab === 'LOGS') fetchLogs();
      }
    } catch (err: any) {
      showToast('Failed to trigger alert cycle: ' + err.message, 'error');
    }
  };

  // Department Counters
  const completedCount = useMemo(() => departments.filter(d => d.today_entry === 'COMPLETED').length, [departments]);
  const pendingCount = useMemo(() => departments.filter(d => d.today_entry === 'PENDING').length, [departments]);
  const activeReminderCount = useMemo(() => departments.filter(d => d.reminder_status === 'ACTIVE').length, [departments]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6 lg:p-8 space-y-6">
      
      {/* ── Toast Notification ── */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border text-sm font-semibold ${
            toast.type === 'success' 
              ? 'bg-emerald-950/90 text-emerald-200 border-emerald-700/60' 
              : toast.type === 'error'
              ? 'bg-red-950/90 text-red-200 border-red-700/60'
              : 'bg-indigo-950/90 text-indigo-200 border-indigo-700/60'
          }`}>
            {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
            {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-red-400" />}
            {toast.type === 'info' && <Info className="w-5 h-5 text-indigo-400" />}
            <span>{toast.text}</span>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-slate-900/80 backdrop-blur border border-slate-800 p-6 rounded-2xl shadow-xl">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-600 via-orange-500 to-amber-400 flex items-center justify-center shadow-lg shadow-orange-500/20 text-white flex-shrink-0">
            <BellRing className="w-7 h-7 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
                Daily Entry Alert
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20">
                Automated Reminders
              </span>
            </div>
            <p className="text-sm text-slate-400 mt-1 max-w-2xl">
              Automatic WhatsApp & SMS reminder engine for pending department daily operational reports with rapid 5-minute alerts and instant completion cutoff.
            </p>
          </div>
        </div>

        {/* Live Controls */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800/80 border border-slate-700/70 text-xs">
            <Clock className="w-4 h-4 text-amber-400" />
            <span className="text-slate-400">Time (IST):</span>
            <span className="font-mono font-bold text-slate-100">{currentTime || '--:--'}</span>
          </div>

          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800/80 border border-slate-700/70 text-xs">
            <Calendar className="w-4 h-4 text-sky-400" />
            <input 
              type="date"
              value={statusDate}
              onChange={(e) => setStatusDate(e.target.value)}
              className="bg-transparent text-slate-100 font-semibold focus:outline-none cursor-pointer"
            />
          </div>

          <button
            onClick={() => fetchStatus(true)}
            title="Refresh status"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition text-xs font-semibold"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingStatus ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={handleTriggerCycleCheck}
            title="Evaluate reminder cycle now"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold text-xs shadow-md transition"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Run Check Now</span>
          </button>
        </div>
      </div>

      {/* ── Status Banner for Sunday ── */}
      {isSunday && (
        <div className="bg-amber-950/40 border border-amber-700/50 rounded-xl p-4 flex items-center gap-3 text-amber-200">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <div className="text-sm">
            <strong className="font-bold">Sunday Schedule Active:</strong> Automated reminder alerts are strictly paused on Sundays per company policy. Normal cycles resume on Monday morning at 08:00 AM.
          </div>
        </div>
      )}

      {/* ── Metric Summary Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Departments</div>
            <div className="text-2xl font-black text-white mt-1">{departments.length}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-800 text-slate-300 flex items-center justify-center">
            <Settings className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Today Completed</div>
            <div className="text-2xl font-black text-emerald-400 mt-1">{completedCount}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-950/60 border border-emerald-800/40 text-emerald-400 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-amber-400 uppercase tracking-wider">Today Pending</div>
            <div className="text-2xl font-black text-amber-400 mt-1">{pendingCount}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-950/60 border border-amber-800/40 text-amber-400 flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-sky-400 uppercase tracking-wider">Reminders Active</div>
            <div className="text-2xl font-black text-sky-400 mt-1">{activeReminderCount}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-sky-950/60 border border-sky-800/40 text-sky-400 flex items-center justify-center">
            <Bell className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* ── Main Navigation Tabs ── */}
      <div className="flex border-b border-slate-800 gap-2">
        <button
          onClick={() => setActiveTab('STATUS')}
          className={`flex items-center gap-2 px-5 py-3 font-bold text-sm border-b-2 transition-all ${
            activeTab === 'STATUS'
              ? 'border-amber-500 text-amber-400 bg-amber-500/10 rounded-t-xl'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Bell className="w-4 h-4" />
          <span>Live Alert Status Screen</span>
          <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
            {departments.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('CONFIG')}
          className={`flex items-center gap-2 px-5 py-3 font-bold text-sm border-b-2 transition-all ${
            activeTab === 'CONFIG'
              ? 'border-amber-500 text-amber-400 bg-amber-500/10 rounded-t-xl'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>Department Configuration</span>
        </button>

        <button
          onClick={() => setActiveTab('LOGS')}
          className={`flex items-center gap-2 px-5 py-3 font-bold text-sm border-b-2 transition-all ${
            activeTab === 'LOGS'
              ? 'border-amber-500 text-amber-400 bg-amber-500/10 rounded-t-xl'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span>Alert Logs & History</span>
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          TAB 1: LIVE ALERT STATUS SCREEN
         ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'STATUS' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
          <div className="p-5 border-b border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span>Department-Wise Live Reminder Monitoring</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                  Date: {statusDate}
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Automatically detects when a department submits today's report in SQL and stops all subsequent reminder dispatches.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/40 text-emerald-300 border border-emerald-800/40 font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Completed: Reminders Stopped
              </span>
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-950/40 text-amber-300 border border-amber-800/40 font-semibold">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                Pending: Rapid Reminders Active
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-950/80 text-slate-400 uppercase text-[11px] font-black border-b border-slate-800 tracking-wider">
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4 text-center">Today's Entry</th>
                  <th className="py-3 px-4 text-center">Reminder Status</th>
                  <th className="py-3 px-4">Last Reminder</th>
                  <th className="py-3 px-4">Next Reminder</th>
                  <th className="py-3 px-4">Channel & Numbers</th>
                  <th className="py-3 px-4 text-center">Config Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {departments.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-500">
                      {loadingStatus ? 'Loading department alert statuses...' : 'No department configurations found.'}
                    </td>
                  </tr>
                ) : (
                  departments.map((dept) => {
                    const isCompleted = dept.today_entry === 'COMPLETED';
                    const isStopped = dept.reminder_status === 'STOPPED';
                    const isDisabled = dept.reminder_status === 'DISABLED';
                    const isSundayOff = dept.reminder_status === 'SUNDAY_OFF';

                    return (
                      <tr 
                        key={dept.department_code}
                        className={`hover:bg-slate-800/40 transition-colors ${
                          isCompleted ? 'bg-emerald-950/5' : 'bg-transparent'
                        }`}
                      >
                        {/* Department */}
                        <td className="py-3 px-4">
                          <div className="font-bold text-white text-sm">
                            {dept.department_name}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {dept.department_code}
                          </div>
                        </td>

                        {/* Today's Entry */}
                        <td className="py-3 px-4 text-center">
                          {isCompleted ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                              COMPLETED
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-amber-500/10 text-amber-400 border border-amber-500/30">
                              <Clock className="w-3.5 h-3.5 animate-pulse" />
                              PENDING
                            </span>
                          )}
                        </td>

                        {/* Reminder Status */}
                        <td className="py-3 px-4 text-center">
                          {isStopped ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700">
                              STOPPED
                            </span>
                          ) : isDisabled ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold bg-slate-800/60 text-slate-500 border border-slate-800">
                              DISABLED
                            </span>
                          ) : isSundayOff ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold bg-amber-950/40 text-amber-400 border border-amber-800/50">
                              SUNDAY OFF
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black bg-red-500/10 text-red-400 border border-red-500/30">
                              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                              ACTIVE
                            </span>
                          )}
                        </td>

                        {/* Last Reminder */}
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-200">
                            {dept.last_reminder}
                          </div>
                          {dept.last_reminder_time && (
                            <div className="text-[10px] text-slate-500">
                              {new Date(dept.last_reminder_time).toLocaleTimeString()}
                            </div>
                          )}
                        </td>

                        {/* Next Reminder */}
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                            {dept.reminder_status === 'ACTIVE' && (
                              <Clock className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                            )}
                            <span>{dept.next_reminder}</span>
                          </div>
                        </td>

                        {/* Channel & Numbers */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                              dept.channel === 'WhatsApp' 
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' 
                                : 'bg-sky-500/10 text-sky-400 border border-sky-500/30'
                            }`}>
                              {dept.channel}
                            </span>
                            {dept.messaging_ready ? (
                              <span className="text-[10px] text-slate-400 font-mono">
                                To: {dept.receiver_number}
                              </span>
                            ) : (
                              <span className="text-[10px] text-red-400 font-semibold flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                No Number Configured
                              </span>
                            )}
                          </div>
                          {dept.sender_number && (
                            <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                              From: {dept.sender_number}
                            </div>
                          )}
                        </td>

                        {/* Config Active/Inactive */}
                        <td className="py-3 px-4 text-center">
                          {dept.is_active ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-950/60 text-emerald-400 border border-emerald-800/40">
                              ACTIVE
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-slate-800 text-slate-500 border border-slate-700">
                              DISABLED
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleOpenTestModal(dept)}
                              title="Send Test Message"
                              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition flex items-center gap-1"
                            >
                              <Send className="w-3 h-3 text-amber-400" />
                              <span>Test</span>
                            </button>
                            <button
                              onClick={() => {
                                const found = configs.find(c => c.department_code === dept.department_code);
                                if (found) setEditingConfig({ ...found });
                                setActiveTab('CONFIG');
                              }}
                              title="Edit Configuration"
                              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-600/10 hover:bg-amber-600/20 text-amber-400 border border-amber-600/30 transition flex items-center gap-1"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>Edit</span>
                            </button>
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
      )}

      {/* ══════════════════════════════════════════════════════════════
          TAB 2: DEPARTMENT CONFIGURATION
         ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'CONFIG' && (
        <div className="space-y-6">
          {/* Edit Form Modal/Drawer if editing */}
          {editingConfig && (
            <div className="bg-slate-900 border-2 border-amber-500/40 rounded-2xl p-6 shadow-2xl space-y-6 animate-in fade-in duration-200">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <Settings className="w-5 h-5 text-amber-400" />
                    <span>Edit Configuration — {editingConfig.department_name}</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Updates will be permanently stored in PostgreSQL and used for all automated reminders.
                  </p>
                </div>
                <button
                  onClick={() => setEditingConfig(null)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveConfig} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  
                  {/* Department Name */}
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                      Department Name
                    </label>
                    <input 
                      type="text"
                      value={editingConfig.department_name}
                      onChange={(e) => setEditingConfig({ ...editingConfig, department_name: e.target.value })}
                      required
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                    />
                  </div>

                  {/* Active / Inactive Switch */}
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                      Reminder Status
                    </label>
                    <select
                      value={editingConfig.is_active ? 'ACTIVE' : 'INACTIVE'}
                      onChange={(e) => setEditingConfig({ ...editingConfig, is_active: e.target.value === 'ACTIVE' })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                    >
                      <option value="ACTIVE">ACTIVE (Participates in reminders)</option>
                      <option value="INACTIVE">DISABLED (No reminders sent)</option>
                    </select>
                  </div>

                  {/* Channel Dropdown */}
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                      Notification Channel
                    </label>
                    <select
                      value={editingConfig.channel}
                      onChange={(e) => setEditingConfig({ ...editingConfig, channel: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                    >
                      <option value="WhatsApp">WhatsApp</option>
                      <option value="SMS">SMS Gateway</option>
                    </select>
                  </div>

                  {/* Sender Number */}
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                      Sender Number
                    </label>
                    <input 
                      type="text"
                      placeholder="e.g. 919876543210"
                      value={editingConfig.sender_number || ''}
                      onChange={(e) => setEditingConfig({ ...editingConfig, sender_number: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none font-mono"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">If blank, messaging will be strictly disabled.</p>
                  </div>

                  {/* Receiver Number */}
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                      Receiver Number (Department Head / Incharge)
                    </label>
                    <input 
                      type="text"
                      placeholder="e.g. 919876543210"
                      value={editingConfig.receiver_number || ''}
                      onChange={(e) => setEditingConfig({ ...editingConfig, receiver_number: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none font-mono"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">Target phone receiving automated reminders.</p>
                  </div>

                  {/* Sunday Enabled Toggle */}
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                      Sunday Reminders
                    </label>
                    <select
                      value={editingConfig.sunday_enabled ? 'TRUE' : 'FALSE'}
                      onChange={(e) => setEditingConfig({ ...editingConfig, sunday_enabled: e.target.value === 'TRUE' })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                    >
                      <option value="FALSE">Excluded (Default: No Sunday reminders)</option>
                      <option value="TRUE">Enabled (Send reminders on Sunday)</option>
                    </select>
                  </div>

                  {/* Start Time */}
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                      Start Time (Normal Reminders)
                    </label>
                    <input 
                      type="text"
                      value={editingConfig.start_time}
                      onChange={(e) => setEditingConfig({ ...editingConfig, start_time: e.target.value })}
                      placeholder="08:00"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none font-mono"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">Default 08:00 AM</p>
                  </div>

                  {/* Rapid Reminder Start */}
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                      Rapid Reminder Start
                    </label>
                    <input 
                      type="text"
                      value={editingConfig.rapid_start_time}
                      onChange={(e) => setEditingConfig({ ...editingConfig, rapid_start_time: e.target.value })}
                      placeholder="10:30"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none font-mono"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">Default 10:30 AM</p>
                  </div>

                  {/* Rapid Interval & Final Time */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                        Interval (Mins)
                      </label>
                      <input 
                        type="number"
                        min="1"
                        max="60"
                        value={editingConfig.rapid_interval_minutes}
                        onChange={(e) => setEditingConfig({ ...editingConfig, rapid_interval_minutes: parseInt(e.target.value, 10) || 5 })}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                        Final Time
                      </label>
                      <input 
                        type="text"
                        value={editingConfig.end_time}
                        onChange={(e) => setEditingConfig({ ...editingConfig, end_time: e.target.value })}
                        placeholder="11:00"
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* Message Template */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                      Message Template
                    </label>
                    <div className="flex items-center gap-1 text-[11px] text-slate-400">
                      <span>Variables:</span>
                      <button 
                        type="button"
                        onClick={() => setEditingConfig({ 
                          ...editingConfig, 
                          message_template: (editingConfig.message_template || '') + ' {DEPARTMENT}' 
                        })}
                        className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 font-mono text-[10px]"
                      >
                        {'{DEPARTMENT}'}
                      </button>
                      <button 
                        type="button"
                        onClick={() => setEditingConfig({ 
                          ...editingConfig, 
                          message_template: (editingConfig.message_template || '') + ' {DATE}' 
                        })}
                        className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 font-mono text-[10px]"
                      >
                        {'{DATE}'}
                      </button>
                      <button 
                        type="button"
                        onClick={() => setEditingConfig({ 
                          ...editingConfig, 
                          message_template: (editingConfig.message_template || '') + ' {NEXT_REMINDER_TIME}' 
                        })}
                        className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 font-mono text-[10px]"
                      >
                        {'{NEXT_REMINDER_TIME}'}
                      </button>
                    </div>
                  </div>
                  <textarea
                    rows={6}
                    value={editingConfig.message_template || ''}
                    onChange={(e) => setEditingConfig({ ...editingConfig, message_template: e.target.value })}
                    placeholder="Enter template with {DEPARTMENT}, {DATE}, and {NEXT_REMINDER_TIME} placeholders..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-white focus:border-amber-500 focus:outline-none font-mono leading-relaxed"
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setEditingConfig(null)}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingConfig}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-slate-950 transition shadow-lg shadow-amber-500/20 disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    <span>{savingConfig ? 'Saving...' : 'Save Configuration'}</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Configs Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white">Department Configurations List</h3>
                <p className="text-xs text-slate-400 mt-0.5">Click any department row or Edit button to modify phone numbers, schedule, or template.</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-950/80 text-slate-400 uppercase text-[11px] font-black border-b border-slate-800 tracking-wider">
                    <th className="py-3 px-4">Department</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4">Channel</th>
                    <th className="py-3 px-4">Sender Phone</th>
                    <th className="py-3 px-4">Receiver Phone</th>
                    <th className="py-3 px-4">Schedule (Normal / Rapid)</th>
                    <th className="py-3 px-4 text-center">Sunday</th>
                    <th className="py-3 px-4 text-right">Edit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 font-medium">
                  {configs.map((c) => (
                    <tr 
                      key={c.id}
                      className="hover:bg-slate-800/40 transition cursor-pointer"
                      onClick={() => setEditingConfig({ ...c })}
                    >
                      <td className="py-3 px-4">
                        <div className="font-bold text-white text-sm">{c.department_name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{c.department_code}</div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {c.is_active ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-950/60 text-emerald-400 border border-emerald-800/40">
                            ACTIVE
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-slate-800 text-slate-500 border border-slate-700">
                            DISABLED
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-200">
                        {c.channel}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-300">
                        {c.sender_number || <span className="text-slate-600 italic">Not set</span>}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-300">
                        {c.receiver_number || <span className="text-slate-600 italic">Not set</span>}
                      </td>
                      <td className="py-3 px-4 text-slate-300">
                        <span>{c.start_time} - {c.rapid_start_time}</span>
                        <span className="text-slate-500 text-[10px] block">Rapid: every {c.rapid_interval_minutes}m to {c.end_time}</span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {c.sunday_enabled ? (
                          <span className="text-amber-400 font-bold">Enabled</span>
                        ) : (
                          <span className="text-slate-500">Excluded</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingConfig({ ...c });
                          }}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                        >
                          Configure
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          TAB 3: ALERT LOGS & HISTORY
         ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'LOGS' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden space-y-4">
          <div className="p-5 border-b border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-amber-400" />
                <span>Alert Execution History & Audit Logs</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Full delivery audit trail with duplicate protection verification and human-readable delivery outcomes.
              </p>
            </div>

            {/* Filter controls */}
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <select
                value={logFilterDept}
                onChange={(e) => setLogFilterDept(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none"
              >
                <option value="ALL">All Departments</option>
                {configs.map(c => (
                  <option key={c.department_code} value={c.department_code}>{c.department_name}</option>
                ))}
              </select>

              <select
                value={logFilterStatus}
                onChange={(e) => setLogFilterStatus(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="SENT">SENT</option>
                <option value="TEST_SENT">TEST_SENT</option>
                <option value="DISABLED">DISABLED (Missing Number)</option>
                <option value="FAILED">FAILED</option>
              </select>

              <button
                onClick={fetchLogs}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold flex items-center gap-1"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingLogs ? 'animate-spin' : ''}`} />
                <span>Filter</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-950/80 text-slate-400 uppercase text-[11px] font-black border-b border-slate-800 tracking-wider">
                  <th className="py-3 px-4">Date & Time</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Slot</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4">Channel</th>
                  <th className="py-3 px-4">Receiver</th>
                  <th className="py-3 px-4">Message / Error Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 font-medium">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500">
                      {loadingLogs ? 'Loading alert history...' : 'No alert logs recorded yet for selected filter.'}
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-200">
                          {log.alert_date}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {new Date(log.sent_at).toLocaleTimeString()}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-bold text-white">
                        {log.department_code}
                      </td>
                      <td className="py-3 px-4 font-mono text-amber-300">
                        {log.scheduled_time}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                          log.status === 'SENT'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : log.status === 'TEST_SENT'
                            ? 'bg-sky-500/10 text-sky-400 border border-sky-500/30'
                            : log.status === 'DISABLED'
                            ? 'bg-slate-800 text-slate-400 border border-slate-700'
                            : 'bg-red-500/10 text-red-400 border border-red-500/30'
                        }`}>
                          {log.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-300 font-semibold">
                        {log.channel}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-300">
                        {log.receiver_number || <span className="text-slate-600">None</span>}
                      </td>
                      <td className="py-3 px-4 max-w-xs truncate text-slate-400" title={log.message || log.error_message || ''}>
                        {log.error_message ? (
                          <span className="text-red-400 font-semibold">{log.error_message}</span>
                        ) : (
                          log.message || '—'
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          TEST MESSAGE MODAL (Section 20)
         ══════════════════════════════════════════════════════════════ */}
      {testModalOpen && testDept && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Send className="w-4 h-4 text-amber-400" />
                  <span>Send Test Notification</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Sends isolated test message. Does NOT modify Daily Report data.
                </p>
              </div>
              <button 
                onClick={() => setTestModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Target Department</label>
                <div className="text-sm font-bold text-white px-3 py-2 bg-slate-950 rounded-xl border border-slate-800">
                  {testDept.department_name} ({testDept.department_code})
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Channel</label>
                  <select
                    value={testChannel}
                    onChange={(e) => setTestChannel(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                  >
                    <option value="WhatsApp">WhatsApp</option>
                    <option value="SMS">SMS Gateway</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Sender Phone</label>
                  <input
                    type="text"
                    value={testSender}
                    onChange={(e) => setTestSender(e.target.value)}
                    placeholder="919876543210"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Receiver Phone</label>
                <input
                  type="text"
                  value={testReceiver}
                  onChange={(e) => setTestReceiver(e.target.value)}
                  placeholder="919876543210"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Custom Message Preview (Optional)</label>
                <textarea
                  rows={4}
                  value={testCustomMessage}
                  onChange={(e) => setTestCustomMessage(e.target.value)}
                  placeholder="Leave empty to use department's standard template..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-mono focus:outline-none"
                />
              </div>

              {testResult && (
                <div className={`p-3 rounded-xl border text-xs font-semibold ${
                  testResult.success 
                    ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300' 
                    : 'bg-red-950/60 border-red-800 text-red-300'
                }`}>
                  <div className="font-bold">{testResult.message}</div>
                  {testResult.error && <div className="text-[11px] opacity-80 mt-0.5">{testResult.error}</div>}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setTestModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                Close
              </button>
              <button
                type="button"
                disabled={sendingTest}
                onClick={handleSendTestMessage}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-slate-950 transition shadow-lg shadow-amber-500/20 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                <span>{sendingTest ? 'Dispatching...' : 'Send Test Notification'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
