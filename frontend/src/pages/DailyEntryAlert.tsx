import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Bell, BellRing, CheckCircle2, Clock, AlertTriangle, AlertCircle, 
  Settings, Send, RefreshCw, Smartphone, MessageSquare, PhoneCall, 
  Calendar, Check, X, ShieldCheck, ShieldAlert, Sparkles, Filter, 
  ChevronRight, Edit3, Save, Info, Radio, Zap, ArrowRight, UserCheck,
  Plus, Trash2, Key, CheckCheck, Loader2, RotateCcw
} from 'lucide-react';
import { API_BASE_URL } from '../config';
import { useAuth } from '../context/AuthContext';

interface ScheduleSlot {
  id?: number;
  alert_config_id?: number;
  slot_time: string;
  slot_type: 'NORMAL' | 'RAPID' | 'FINAL';
  is_enabled: boolean;
  display_order?: number;
}

interface AlertConfig {
  id: number;
  department_code: string;
  department_name: string;
  is_active: boolean;
  sender_number: string | null;
  sender_verification_status?: string;
  sender_verified_at?: string | null;
  receiver_number: string | null;
  receiver_number_1?: string | null;
  receiver_number_2?: string | null;
  channel: 'WhatsApp' | 'SMS' | string;
  start_time: string;
  rapid_start_time: string;
  rapid_interval_minutes: number;
  end_time: string;
  sunday_enabled: boolean;
  message_template: string | null;
  final_message_template?: string | null;
  schedules?: ScheduleSlot[];
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
  sender_verification_status?: string;
  receiver_number: string | null;
  receiver_number_1?: string | null;
  receiver_number_2?: string | null;
  messaging_ready: boolean;
  messaging_status: string;
  today_entry: 'COMPLETED' | 'PENDING';
  reminder_status: 'ACTIVE' | 'STOPPED' | 'DISABLED' | 'FINAL_SENT' | 'WAITING' | 'SUNDAY_OFF';
  last_reminder: string;
  next_reminder: string;
  schedules?: ScheduleSlot[];
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
  provider_message_id?: string | null;
  provider_status?: string | null;
  error_message: string | null;
  is_test?: boolean;
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

  // Helper to pick next available slot time that isn't already in the schedule
  const getNextAvailableSlotTime = (schedules?: ScheduleSlot[]) => {
    if (!schedules || schedules.length === 0) return '08:00';
    const existing = new Set(schedules.map(s => s.slot_time));
    for (let h = 8; h <= 21; h++) {
      for (const m of ['00', '15', '30', '45']) {
        const candidate = `${String(h).padStart(2, '0')}:${m}`;
        if (!existing.has(candidate)) return candidate;
      }
    }
    return '11:15';
  };

  // Time Slot Management Modal State (Add / Edit Slot)
  const [slotModalOpen, setSlotModalOpen] = useState<boolean>(false);
  const [editingSlot, setEditingSlot] = useState<ScheduleSlot | null>(null);
  const [modalSlotTime, setModalSlotTime] = useState<string>('08:00');
  const [modalSlotType, setModalSlotType] = useState<'NORMAL' | 'RAPID' | 'FINAL'>('NORMAL');
  const [modalSlotEnabled, setModalSlotEnabled] = useState<boolean>(true);
  const [savingSlot, setSavingSlot] = useState<boolean>(false);
  const [resettingDefaults, setResettingDefaults] = useState<boolean>(false);

  // Sender OTP Verification State
  const [verifyingSender, setVerifyingSender] = useState<boolean>(false);
  const [otpInput, setOtpInput] = useState<string>('');
  const [confirmingOtp, setConfirmingOtp] = useState<boolean>(false);
  const [verificationMessage, setVerificationMessage] = useState<{ text: string; isError: boolean } | null>(null);

  // History logs state
  const [logs, setLogs] = useState<AlertLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState<boolean>(false);
  const [logFilterDept, setLogFilterDept] = useState<string>('ALL');
  const [logFilterStatus, setLogFilterStatus] = useState<string>('ALL');

  // Test modal state
  const [testModalOpen, setTestModalOpen] = useState<boolean>(false);
  const [testDept, setTestDept] = useState<DepartmentStatus | null>(null);
  const [testSender, setTestSender] = useState<string>('');
  const [testReceiver1, setTestReceiver1] = useState<string>('');
  const [testReceiver2, setTestReceiver2] = useState<string>('');
  const [testChannel, setTestChannel] = useState<'WhatsApp' | 'SMS'>('WhatsApp');
  const [testCustomMessage, setTestCustomMessage] = useState<string>('');
  const [sendingTest, setSendingTest] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; results?: any[]; error?: string } | null>(null);

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

  // Fetch Configurations with child schedules
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

  useEffect(() => {
    fetchStatus(true);
    fetchConfigs();
  }, [fetchStatus, fetchConfigs]);

  useEffect(() => {
    if (activeTab === 'LOGS') {
      fetchLogs();
    }
  }, [activeTab, fetchLogs]);

  // Save Configuration (Department Level)
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
      if (data.success) {
        showToast(`Configuration updated for ${editingConfig.department_name}`, 'success');
        setEditingConfig(null);
        fetchConfigs();
        fetchStatus(false);
      } else {
        showToast(`Error: ${data.error || 'Failed to save config'}`, 'error');
      }
    } catch (err: any) {
      showToast(`Network error: ${err.message}`, 'error');
    } finally {
      setSavingConfig(false);
    }
  };

  // Open Edit Modal for a Department
  const handleOpenEditModal = (config: AlertConfig) => {
    setEditingConfig({ ...config });
  };

  // Open Modal to Add a new Time Slot
  const handleOpenAddSlot = () => {
    setEditingSlot(null);
    setModalSlotTime(getNextAvailableSlotTime(editingConfig?.schedules));
    setModalSlotType('NORMAL');
    setModalSlotEnabled(true);
    setSlotModalOpen(true);
  };

  // Open Modal to Edit an existing Time Slot
  const handleOpenEditSlot = (slot: ScheduleSlot) => {
    setEditingSlot(slot);
    setModalSlotTime(slot.slot_time);
    setModalSlotType(slot.slot_type);
    setModalSlotEnabled(slot.is_enabled);
    setSlotModalOpen(true);
  };

  // Save Add/Edit Slot Modal
  const handleSaveSlotModal = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editingConfig) return;

    let cleanTime = modalSlotTime.trim();
    if (/^\d:[0-5]\d(:[0-5]\d)?$/.test(cleanTime)) cleanTime = '0' + cleanTime;
    cleanTime = cleanTime.slice(0, 5);

    const regex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!regex.test(cleanTime)) {
      showToast('Invalid time format. Please use 24-hr HH:mm (e.g. 08:30)', 'error');
      return;
    }

    const isDuplicate = (editingConfig.schedules || []).some(
      s => s.id !== editingSlot?.id && s.slot_time === cleanTime
    );
    if (isDuplicate) {
      showToast('Reminder time already configured.', 'error');
      return;
    }

    setSavingSlot(true);
    try {
      if (editingSlot && editingSlot.id) {
        // EDIT existing slot
        const res = await fetch(`${API_BASE_URL}/api/daily-entry-alert/schedules/${editingSlot.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slot_time: cleanTime,
            slot_type: modalSlotType,
            is_enabled: modalSlotEnabled
          })
        });
        const data = await res.json();
        if (data.success) {
          showToast(`Slot updated to ${cleanTime} (${modalSlotType})`, 'success');
          const updated = (editingConfig.schedules || [])
            .map(s => s.id === editingSlot.id ? { ...s, slot_time: cleanTime, slot_type: modalSlotType, is_enabled: modalSlotEnabled } : s)
            .sort((a, b) => a.slot_time.localeCompare(b.slot_time));
          setEditingConfig({ ...editingConfig, schedules: updated });
          setSlotModalOpen(false);
          fetchConfigs();
          fetchStatus(false);
        } else {
          showToast(data.error || 'Failed to update slot', 'error');
        }
      } else {
        // ADD new slot
        const res = await fetch(`${API_BASE_URL}/api/daily-entry-alert/schedules`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            alert_config_id: editingConfig.id,
            slot_time: cleanTime,
            slot_type: modalSlotType,
            is_enabled: modalSlotEnabled
          })
        });
        const data = await res.json();
        if (data.success) {
          showToast(`Time slot ${cleanTime} added`, 'success');
          const updated = [...(editingConfig.schedules || []), data.schedule].sort((a, b) => a.slot_time.localeCompare(b.slot_time));
          setEditingConfig({ ...editingConfig, schedules: updated });
          setSlotModalOpen(false);
          fetchConfigs();
          fetchStatus(false);
        } else {
          showToast(data.error || 'Failed to add slot', 'error');
        }
      }
    } catch (err: any) {
      showToast(`Error saving slot: ${err.message}`, 'error');
    } finally {
      setSavingSlot(false);
    }
  };

  // Delete Time Slot with confirmation
  const handleDeleteSlot = async (slot: ScheduleSlot) => {
    if (!slot.id || !editingConfig) return;
    if (!window.confirm(`Delete reminder time ${slot.slot_time}?`)) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/daily-entry-alert/schedules/${slot.id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Time slot ${slot.slot_time} deleted`, 'info');
        const updated = (editingConfig.schedules || []).filter(s => s.id !== slot.id);
        setEditingConfig({ ...editingConfig, schedules: updated });
        fetchConfigs();
        fetchStatus(false);
      } else {
        showToast(data.error || 'Failed to delete slot', 'error');
      }
    } catch (err: any) {
      showToast(`Failed to delete slot: ${err.message}`, 'error');
    }
  };

  // Reset to Factory Default Schedule (13 slots: 08:00 to 11:00)
  const handleResetDefaults = async () => {
    if (!editingConfig) return;
    if (!window.confirm(`Reset reminder schedule for ${editingConfig.department_name} to standard default 13 slots (08:00 to 11:00)?`)) return;

    setResettingDefaults(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/daily-entry-alert/schedules/reset-defaults/${editingConfig.id}`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Schedule reset to standard default slots`, 'success');
        const updatedSchedules = data.schedules || [];
        setEditingConfig({ ...editingConfig, schedules: updatedSchedules });
        fetchConfigs();
        fetchStatus(false);
      } else {
        showToast(data.error || 'Failed to reset schedule', 'error');
      }
    } catch (err: any) {
      showToast(`Failed to reset: ${err.message}`, 'error');
    } finally {
      setResettingDefaults(false);
    }
  };

  // Toggle Time Slot Enabled/Disabled
  const handleToggleSlot = async (slotId: number | undefined, currentEnabled: boolean) => {
    if (!slotId || !editingConfig) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/daily-entry-alert/schedules/${slotId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_enabled: !currentEnabled })
      });
      const data = await res.json();
      if (data.success) {
        const updated = (editingConfig.schedules || []).map(s => s.id === slotId ? { ...s, is_enabled: !currentEnabled } : s);
        setEditingConfig({ ...editingConfig, schedules: updated });
        fetchConfigs();
        fetchStatus(false);
      }
    } catch (err: any) {
      showToast('Failed to update slot status', 'error');
    }
  };

  // Change Slot Type
  const handleChangeSlotType = async (slotId: number | undefined, newType: 'NORMAL' | 'RAPID' | 'FINAL') => {
    if (!slotId || !editingConfig) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/daily-entry-alert/schedules/${slotId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot_type: newType })
      });
      const data = await res.json();
      if (data.success) {
        const updated = (editingConfig.schedules || []).map(s => s.id === slotId ? { ...s, slot_type: newType } : s);
        setEditingConfig({ ...editingConfig, schedules: updated });
        fetchConfigs();
      }
    } catch (err: any) {
      showToast('Failed to change slot type', 'error');
    }
  };

  // Start Sender Verification
  const handleStartSenderVerification = async () => {
    if (!editingConfig || !editingConfig.sender_number) {
      showToast('Please enter a sender number first', 'error');
      return;
    }

    setVerifyingSender(true);
    setVerificationMessage(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/daily-entry-alert/sender/verify/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_number: editingConfig.sender_number,
          config_id: editingConfig.id
        })
      });
      const data = await res.json();
      if (data.success) {
        setEditingConfig({ ...editingConfig, sender_verification_status: 'OTP_SENT' });
        setVerificationMessage({ text: data.message || 'OTP sent to sender number. Enter OTP below to complete verification.', isError: false });
        showToast('OTP sent successfully', 'success');
      } else {
        setVerificationMessage({ text: data.error || 'Failed to send OTP', isError: true });
        showToast(data.error || 'Failed to send OTP', 'error');
      }
    } catch (err: any) {
      setVerificationMessage({ text: err.message, isError: true });
    } finally {
      setVerifyingSender(false);
    }
  };

  // Confirm Sender OTP
  const handleConfirmSenderOtp = async () => {
    if (!editingConfig || !editingConfig.sender_number || !otpInput.trim()) {
      showToast('Enter the OTP code received', 'error');
      return;
    }

    setConfirmingOtp(true);
    setVerificationMessage(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/daily-entry-alert/sender/verify/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_number: editingConfig.sender_number,
          otp_code: otpInput.trim(),
          config_id: editingConfig.id
        })
      });
      const data = await res.json();
      if (data.success) {
        setEditingConfig({ 
          ...editingConfig, 
          sender_verification_status: 'VERIFIED',
          sender_verified_at: data.verifiedAt 
        });
        setOtpInput('');
        setVerificationMessage({ text: 'Sender verified successfully with provider!', isError: false });
        showToast('Sender verified successfully!', 'success');
        fetchConfigs();
        fetchStatus(false);
      } else {
        setVerificationMessage({ text: data.error || 'OTP verification failed', isError: true });
        showToast(data.error || 'Verification failed', 'error');
      }
    } catch (err: any) {
      setVerificationMessage({ text: err.message, isError: true });
    } finally {
      setConfirmingOtp(false);
    }
  };

  // Open Test Modal
  const handleOpenTestModal = (dept: DepartmentStatus) => {
    setTestDept(dept);
    setTestSender(dept.sender_number || '');
    setTestReceiver1(dept.receiver_number_1 || dept.receiver_number || '');
    setTestReceiver2(dept.receiver_number_2 || '');
    setTestChannel((dept.channel as any) || 'WhatsApp');
    setTestCustomMessage('');
    setTestResult(null);
    setTestModalOpen(true);
  };

  // Execute Test Notification
  const handleSendTestMessage = async () => {
    if (!testDept) return;
    if (!testSender.trim()) {
      setTestResult({
        success: false,
        message: 'Messaging Disabled - Sender number not configured',
        error: 'Sender number is strictly required.'
      });
      return;
    }
    if (!testReceiver1.trim() && !testReceiver2.trim()) {
      setTestResult({
        success: false,
        message: 'Messaging Disabled - Receiver number not configured',
        error: 'At least one Receiver Number (Receiver 1 or Receiver 2) is required.'
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
          receiver_number_1: testReceiver1,
          receiver_number_2: testReceiver2,
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
          message: data.message || `Test ${testChannel} sent successfully!`,
          results: data.results
        });
        showToast(`Test ${testChannel} dispatched`, 'success');
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
      const res = await fetch(`${API_BASE_URL}/api/daily-entry-alert/run`, {
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
          TAB 1: LIVE STATUS SCREEN
         ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'STATUS' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <span className="font-bold">Department-Wise Live Reminder Monitoring</span>
              <span className="text-xs px-2.5 py-0.5 rounded-md bg-slate-800 font-mono text-slate-400">
                Date: {statusDate}
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs font-semibold">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                Completed: Reminders Stopped
              </span>
              <span className="flex items-center gap-1.5 text-amber-400">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
                Pending: Active Reminders
              </span>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-black uppercase tracking-wider text-[11px]">
                  <th className="py-3.5 px-4">Department</th>
                  <th className="py-3.5 px-4 text-center">Today's Entry</th>
                  <th className="py-3.5 px-4 text-center">Reminder Status</th>
                  <th className="py-3.5 px-4">Last Reminder</th>
                  <th className="py-3.5 px-4">Next Reminder</th>
                  <th className="py-3.5 px-4">Sender Number</th>
                  <th className="py-3.5 px-4">Receiver 1</th>
                  <th className="py-3.5 px-4">Receiver 2</th>
                  <th className="py-3.5 px-4">Channel</th>
                  <th className="py-3.5 px-4 text-center">Config Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {loadingStatus ? (
                  <tr>
                    <td colSpan={11} className="py-12 text-center text-slate-400">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="w-5 h-5 animate-spin text-amber-500" />
                        <span>Loading live department status...</span>
                      </div>
                    </td>
                  </tr>
                ) : departments.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-8 text-center text-slate-400">
                      No department reminder configurations found.
                    </td>
                  </tr>
                ) : (
                  departments.map((dept) => {
                    const isCompleted = dept.today_entry === 'COMPLETED';
                    const hasSender = Boolean(dept.sender_number);
                    const isVerified = dept.sender_verification_status === 'VERIFIED';
                    const r1 = dept.receiver_number_1 || dept.receiver_number;
                    const r2 = dept.receiver_number_2;

                    return (
                      <tr 
                        key={dept.department_code}
                        className="hover:bg-slate-800/40 transition-colors"
                      >
                        {/* Department Name */}
                        <td className="py-3 px-4">
                          <div className="font-bold text-white text-sm">
                            {dept.department_name}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {dept.department_code}
                          </div>
                        </td>

                        {/* Today's Entry */}
                        <td className="py-3 px-4 text-center">
                          {isCompleted ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-950/80 text-emerald-400 border border-emerald-700/50">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>COMPLETED</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-amber-950/80 text-amber-400 border border-amber-700/50 animate-pulse">
                              <Clock className="w-3.5 h-3.5" />
                              <span>PENDING</span>
                            </span>
                          )}
                        </td>

                        {/* Reminder Status */}
                        <td className="py-3 px-4 text-center">
                          <span className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider ${
                            dept.reminder_status === 'ACTIVE'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                              : dept.reminder_status === 'STOPPED'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : dept.reminder_status === 'FINAL_SENT'
                              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                              : 'bg-slate-800 text-slate-400 border border-slate-700'
                          }`}>
                            {dept.reminder_status}
                          </span>
                        </td>

                        {/* Last Reminder */}
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-300">
                          {dept.last_reminder}
                        </td>

                        {/* Next Reminder */}
                        <td className="py-3 px-4 font-mono text-[11px] text-amber-400 font-bold">
                          {dept.next_reminder}
                        </td>

                        {/* Sender Number */}
                        <td className="py-3 px-4">
                          {hasSender ? (
                            <div>
                              <span className="font-mono text-[11px] text-slate-200 block">
                                {dept.sender_number}
                              </span>
                              {isVerified ? (
                                <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase text-emerald-400 bg-emerald-950/60 px-1.5 py-0.2 rounded border border-emerald-800/40">
                                  <ShieldCheck className="w-2.5 h-2.5" />
                                  <span>VERIFIED</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase text-amber-400 bg-amber-950/60 px-1.5 py-0.2 rounded border border-amber-800/40">
                                  <ShieldAlert className="w-2.5 h-2.5" />
                                  <span>NOT VERIFIED</span>
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-500 italic">Not Configured</span>
                          )}
                        </td>

                        {/* Receiver 1 */}
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-300">
                          {r1 || <span className="text-slate-500 italic">None</span>}
                        </td>

                        {/* Receiver 2 */}
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-300">
                          {r2 || <span className="text-slate-500 italic">None</span>}
                        </td>

                        {/* Channel */}
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                            dept.channel === 'WhatsApp' 
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' 
                              : 'bg-sky-500/10 text-sky-400 border border-sky-500/30'
                          }`}>
                            {dept.channel}
                          </span>
                        </td>

                        {/* Config Status */}
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
                    <span>Department Configuration — {editingConfig.department_name}</span>
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

                  {/* Sender Number & OTP Verification UI */}
                  <div className="p-4 bg-slate-950/80 rounded-xl border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                        Sender Number (One per dept)
                      </label>
                      {editingConfig.sender_verification_status === 'VERIFIED' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                          <CheckCheck className="w-3 h-3" />
                          <span>VERIFIED</span>
                        </span>
                      ) : editingConfig.sender_verification_status === 'OTP_SENT' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-sky-400 bg-sky-950/60 px-2 py-0.5 rounded border border-sky-800/40">
                          <Clock className="w-3 h-3" />
                          <span>OTP SENT</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/40">
                          <AlertTriangle className="w-3 h-3" />
                          <span>NOT VERIFIED</span>
                        </span>
                      )}
                    </div>
                    <input 
                      type="text"
                      placeholder="e.g. +919876543210"
                      value={editingConfig.sender_number || ''}
                      onChange={(e) => setEditingConfig({ 
                        ...editingConfig, 
                        sender_number: e.target.value,
                        sender_verification_status: 'NOT_VERIFIED'
                      })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none font-mono"
                    />

                    {/* Sender Verification Flow */}
                    <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center gap-2">
                      {editingConfig.sender_verification_status !== 'VERIFIED' && (
                        <button
                          type="button"
                          onClick={handleStartSenderVerification}
                          disabled={verifyingSender || !editingConfig.sender_number}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs transition disabled:opacity-50"
                        >
                          {verifyingSender ? <Loader2 className="w-3 h-3 animate-spin" /> : <Key className="w-3 h-3" />}
                          <span>Verify Sender</span>
                        </button>
                      )}

                      {editingConfig.sender_verification_status === 'OTP_SENT' && (
                        <div className="flex items-center gap-2 mt-2 w-full">
                          <input 
                            type="text"
                            placeholder="Enter OTP"
                            value={otpInput}
                            onChange={(e) => setOtpInput(e.target.value)}
                            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white font-mono w-28"
                          />
                          <button
                            type="button"
                            onClick={handleConfirmSenderOtp}
                            disabled={confirmingOtp || !otpInput.trim()}
                            className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition disabled:opacity-50"
                          >
                            {confirmingOtp ? 'Verifying...' : 'Confirm OTP'}
                          </button>
                        </div>
                      )}
                    </div>

                    {verificationMessage && (
                      <p className={`text-[11px] font-semibold mt-1 ${verificationMessage.isError ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {verificationMessage.text}
                      </p>
                    )}
                  </div>

                  {/* Receiver Number 1 */}
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                      Receiver Number 1 (Primary Incharge)
                    </label>
                    <input 
                      type="text"
                      placeholder="e.g. +919111111111"
                      value={editingConfig.receiver_number_1 || editingConfig.receiver_number || ''}
                      onChange={(e) => setEditingConfig({ 
                        ...editingConfig, 
                        receiver_number_1: e.target.value,
                        receiver_number: e.target.value 
                      })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none font-mono"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">Primary phone receiving reminders.</p>
                  </div>

                  {/* Receiver Number 2 */}
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                      Receiver Number 2 (Secondary / Backup)
                    </label>
                    <input 
                      type="text"
                      placeholder="e.g. +919222222222"
                      value={editingConfig.receiver_number_2 || ''}
                      onChange={(e) => setEditingConfig({ ...editingConfig, receiver_number_2: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none font-mono"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">Optional second phone also notified in real time.</p>
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
                      value={editingConfig.start_time || '08:00'}
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
                      value={editingConfig.rapid_start_time || '10:30'}
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
                        value={editingConfig.rapid_interval_minutes || 5}
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
                        value={editingConfig.end_time || '11:00'}
                        onChange={(e) => setEditingConfig({ ...editingConfig, end_time: e.target.value })}
                        placeholder="11:00"
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* ── REMINDER TIME SLOTS (Customizable Department Schedule) ── */}
                <div className="p-5 bg-slate-950/90 rounded-2xl border border-slate-800 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                    <div>
                      <h4 className="text-sm font-black text-amber-400 uppercase tracking-wider flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        <span>REMINDER TIME SLOTS</span>
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Configure arbitrary reminder times (e.g. 08:07, 09:13, 10:42). Sorts chronologically with duplicate protection.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {/* Reset to Standard Defaults */}
                      <button
                        type="button"
                        onClick={handleResetDefaults}
                        disabled={resettingDefaults}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition disabled:opacity-50 border border-slate-700"
                        title="Reset this department to standard 13 default slots (08:00 to 11:00)"
                      >
                        <RotateCcw className={`w-3.5 h-3.5 ${resettingDefaults ? 'animate-spin' : ''}`} />
                        <span>Reset 13 Default Slots</span>
                      </button>

                      {/* + ADD TIME SLOT button */}
                      <button
                        type="button"
                        onClick={handleOpenAddSlot}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold text-xs shadow-lg shadow-amber-500/20 transition"
                      >
                        <Plus className="w-4 h-4" />
                        <span>+ ADD TIME SLOT</span>
                      </button>
                    </div>
                  </div>

                  {/* Configured Slots Table (Section 5) */}
                  <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 font-black uppercase tracking-wider text-[11px]">
                          <th className="py-2.5 px-4">Time</th>
                          <th className="py-2.5 px-4">Type</th>
                          <th className="py-2.5 px-4 text-center">Status</th>
                          <th className="py-2.5 px-4 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono">
                        {(editingConfig.schedules && editingConfig.schedules.length > 0) ? (
                          editingConfig.schedules.map((slot) => {
                            const [h, m] = slot.slot_time.split(':').map(Number);
                            const ampm = h >= 12 ? 'PM' : 'AM';
                            const displayH = h % 12 === 0 ? 12 : h % 12;
                            const display12 = `${String(displayH).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;

                            return (
                              <tr key={slot.id || slot.slot_time} className="hover:bg-slate-900/40 transition">
                                <td className="py-2.5 px-4">
                                  <span className="font-bold text-white text-sm">{slot.slot_time}</span>
                                  <span className="text-slate-400 text-xs ml-2 font-sans">({display12})</span>
                                </td>
                                <td className="py-2.5 px-4">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                                    slot.slot_type === 'FINAL' 
                                      ? 'bg-purple-950 text-purple-300 border border-purple-800/60' 
                                      : slot.slot_type === 'RAPID'
                                      ? 'bg-amber-950 text-amber-300 border border-amber-800/60'
                                      : 'bg-slate-800 text-slate-300 border border-slate-700'
                                  }`}>
                                    {slot.slot_type}
                                  </span>
                                </td>
                                <td className="py-2.5 px-4 text-center font-sans">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleSlot(slot.id, slot.is_enabled)}
                                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold cursor-pointer transition ${
                                      slot.is_enabled
                                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60 hover:bg-emerald-900/60'
                                        : 'bg-slate-900 text-slate-500 border border-slate-800 hover:bg-slate-800'
                                    }`}
                                    title="Click to toggle ENABLED / DISABLED"
                                  >
                                    {slot.is_enabled ? 'ENABLED' : 'DISABLED'}
                                  </button>
                                </td>
                                <td className="py-2.5 px-4 text-right font-sans">
                                  <div className="flex items-center justify-end gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleOpenEditSlot(slot)}
                                      className="px-2.5 py-1 rounded-lg bg-amber-600/10 hover:bg-amber-600/20 text-amber-400 border border-amber-600/30 text-xs font-bold transition flex items-center gap-1"
                                    >
                                      <Edit3 className="w-3 h-3" />
                                      <span>Edit</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteSlot(slot)}
                                      className="px-2.5 py-1 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-800/40 text-xs font-bold transition flex items-center gap-1"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                      <span>Delete</span>
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={4} className="py-5 text-center text-xs text-slate-400 italic">
                              No reminder time slots configured. Click "+ ADD TIME SLOT" to add one.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Inline Add / Edit Time Slot Modal (Section 6 & 7) */}
                {slotModalOpen && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
                    <div className="bg-slate-900 border-2 border-amber-500/40 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-5">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                        <h4 className="text-base font-bold text-white flex items-center gap-2">
                          <Clock className="w-4 h-4 text-amber-400" />
                          <span>{editingSlot ? `Edit Time Slot (${editingSlot.slot_time})` : 'Add Time Slot'}</span>
                        </h4>
                        <button
                          type="button"
                          onClick={() => setSlotModalOpen(false)}
                          className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>

                      <div className="space-y-4">
                        {/* TIME */}
                        <div>
                          <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                            Time (24-hr HH:mm)
                          </label>
                          <input 
                            type="time" 
                            value={modalSlotTime} 
                            onChange={(e) => setModalSlotTime(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-mono focus:border-amber-500 focus:outline-none"
                            required
                          />
                          <p className="text-[10px] text-slate-500 mt-1">Enter any valid time (e.g. 08:07, 09:13, 10:42, 11:00).</p>
                        </div>

                        {/* SLOT TYPE */}
                        <div>
                          <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                            Slot Type
                          </label>
                          <select
                            value={modalSlotType}
                            onChange={(e) => setModalSlotType(e.target.value as any)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                          >
                            <option value="NORMAL">NORMAL (Regular reminder)</option>
                            <option value="RAPID">RAPID (Escalation reminder)</option>
                            <option value="FINAL">FINAL (Last reminder of the day)</option>
                          </select>
                        </div>

                        {/* ENABLED */}
                        <div>
                          <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                            Status
                          </label>
                          <select
                            value={modalSlotEnabled ? 'ON' : 'OFF'}
                            onChange={(e) => setModalSlotEnabled(e.target.value === 'ON')}
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                          >
                            <option value="ON">ENABLED (Active in reminders)</option>
                            <option value="OFF">DISABLED (Paused / ignored by reminders)</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                        <button
                          type="button"
                          onClick={() => setSlotModalOpen(false)}
                          className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveSlotModal()}
                          disabled={savingSlot}
                          className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-black bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white shadow-lg shadow-orange-500/20 transition disabled:opacity-50"
                        >
                          {savingSlot ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                          <span>{savingSlot ? 'Saving...' : 'Save'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Message Templates */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                      Standard Reminder Message Template
                    </label>
                    <textarea 
                      rows={4}
                      value={editingConfig.message_template || ''}
                      onChange={(e) => setEditingConfig({ ...editingConfig, message_template: e.target.value })}
                      placeholder="Use {DEPARTMENT}, {DATE}, {NEXT_REMINDER_TIME}"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-200 font-mono focus:border-amber-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                      Final Reminder Message Template
                    </label>
                    <textarea 
                      rows={4}
                      value={editingConfig.final_message_template || ''}
                      onChange={(e) => setEditingConfig({ ...editingConfig, final_message_template: e.target.value })}
                      placeholder="Template used for the FINAL scheduled slot"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-200 font-mono focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setEditingConfig(null)}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingConfig}
                    className="flex items-center gap-1.5 px-6 py-2 rounded-xl text-xs font-black bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white shadow-lg shadow-orange-500/20 transition disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    <span>{savingConfig ? 'Saving to Database...' : 'Save Configuration'}</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Department Configuration Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {configs.map((config) => {
              const r1 = config.receiver_number_1 || config.receiver_number;
              const r2 = config.receiver_number_2;
              const isVerified = config.sender_verification_status === 'VERIFIED';
              const enabledSlotsCount = (config.schedules || []).filter(s => s.is_enabled).length;

              return (
                <div 
                  key={config.department_code}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4 hover:border-slate-700 transition"
                >
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                    <div>
                      <h4 className="font-bold text-white text-base">{config.department_name}</h4>
                      <span className="text-[10px] text-slate-500 font-mono">{config.department_code}</span>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                      config.is_active 
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60' 
                        : 'bg-slate-800 text-slate-500'
                    }`}>
                      {config.is_active ? 'ACTIVE' : 'DISABLED'}
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Channel:</span>
                      <span className="font-semibold text-slate-200">{config.channel}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Sender Number:</span>
                      <div className="text-right">
                        <span className="font-mono text-slate-200">{config.sender_number || '—'}</span>
                        {config.sender_number && (
                          <span className={`block text-[9px] font-black uppercase ${isVerified ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {isVerified ? '✓ Verified' : '⚠ Verification Required'}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Receiver 1:</span>
                      <span className="font-mono text-slate-200">{r1 || '—'}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Receiver 2:</span>
                      <span className="font-mono text-slate-200">{r2 || '—'}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Configured Slots:</span>
                      <span className="font-bold text-amber-400">{enabledSlotsCount} Active Slots</span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                    <button
                      onClick={() => {
                        const targetDept = departments.find(d => d.department_code === config.department_code);
                        if (targetDept) handleOpenTestModal(targetDept);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition flex items-center gap-1.5"
                    >
                      <Send className="w-3.5 h-3.5 text-amber-400" />
                      <span>Test</span>
                    </button>

                    <button
                      onClick={() => handleOpenEditModal(config)}
                      className="px-4 py-1.5 rounded-xl bg-amber-600/10 hover:bg-amber-600/20 text-amber-400 border border-amber-600/30 text-xs font-bold transition flex items-center gap-1.5"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit Config & Slots</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          TAB 3: ALERT LOGS & HISTORY
         ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'LOGS' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-4 rounded-2xl">
            <div className="flex items-center gap-3">
              <Filter className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold text-slate-300 uppercase">Filters:</span>

              <select
                value={logFilterDept}
                onChange={(e) => setLogFilterDept(e.target.value)}
                className="bg-slate-950 border border-slate-700 text-xs rounded-lg px-2.5 py-1.5 text-slate-200"
              >
                <option value="ALL">All Departments</option>
                {configs.map(c => (
                  <option key={c.department_code} value={c.department_code}>{c.department_name}</option>
                ))}
              </select>

              <select
                value={logFilterStatus}
                onChange={(e) => setLogFilterStatus(e.target.value)}
                className="bg-slate-950 border border-slate-700 text-xs rounded-lg px-2.5 py-1.5 text-slate-200"
              >
                <option value="ALL">All Delivery Statuses</option>
                <option value="SENT">SENT</option>
                <option value="FAILED">FAILED</option>
                <option value="DISABLED">DISABLED</option>
                <option value="TEST_SENT">TEST SENT</option>
                <option value="DUPLICATE_BLOCKED">DUPLICATE BLOCKED</option>
              </select>
            </div>

            <button
              onClick={fetchLogs}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingLogs ? 'animate-spin' : ''}`} />
              <span>Refresh Logs</span>
            </button>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-black uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Scheduled Slot</th>
                  <th className="py-3 px-4">Channel</th>
                  <th className="py-3 px-4">Sender Number</th>
                  <th className="py-3 px-4">Receiver Number</th>
                  <th className="py-3 px-4">Provider Message ID</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4">Details / Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {loadingLogs ? (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-slate-400">
                      Loading delivery logs...
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-400">
                      No reminder logs recorded for the selected criteria.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-800/40">
                      <td className="py-2.5 px-4 font-mono text-[11px] text-slate-400">
                        {new Date(log.sent_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>
                      <td className="py-2.5 px-4 font-bold text-white">
                        {log.department_code}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-amber-400">
                        {log.scheduled_time}
                      </td>
                      <td className="py-2.5 px-4">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          log.channel === 'WhatsApp' ? 'text-emerald-400 bg-emerald-950/60' : 'text-sky-400 bg-sky-950/60'
                        }`}>
                          {log.channel}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 font-mono text-[11px] text-slate-300">
                        {log.sender_number || '—'}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-[11px] text-slate-300">
                        {log.receiver_number || '—'}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-[10px] text-slate-400">
                        {log.provider_message_id || '—'}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                          log.status === 'SENT' || log.status === 'TEST_SENT'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/40'
                            : log.status === 'FAILED'
                            ? 'bg-rose-950 text-rose-400 border border-rose-800/40'
                            : 'bg-slate-800 text-slate-400'
                        }`}>
                          {log.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-slate-400 max-w-xs truncate">
                        {log.error_message || (log.is_test ? 'Manual Test Message' : 'Automated Reminder')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Test Message Modal ── */}
      {testModalOpen && testDept && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl animate-in fade-in duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Send className="w-4 h-4 text-amber-400" />
                <span>Dispatch Test Message — {testDept.department_name}</span>
              </h3>
              <button 
                onClick={() => setTestModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Sender Number</label>
                <input 
                  type="text"
                  value={testSender}
                  onChange={(e) => setTestSender(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono"
                  placeholder="+91XXXXXXXXXX"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Receiver Number 1 (Primary)</label>
                <input 
                  type="text"
                  value={testReceiver1}
                  onChange={(e) => setTestReceiver1(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono"
                  placeholder="+91XXXXXXXXXX"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Receiver Number 2 (Secondary)</label>
                <input 
                  type="text"
                  value={testReceiver2}
                  onChange={(e) => setTestReceiver2(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono"
                  placeholder="Optional +91XXXXXXXXXX"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Channel</label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-200">
                    <input 
                      type="radio" 
                      name="test_channel" 
                      value="WhatsApp" 
                      checked={testChannel === 'WhatsApp'}
                      onChange={() => setTestChannel('WhatsApp')}
                      className="text-amber-500"
                    />
                    <span>WhatsApp</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-slate-200">
                    <input 
                      type="radio" 
                      name="test_channel" 
                      value="SMS" 
                      checked={testChannel === 'SMS'}
                      onChange={() => setTestChannel('SMS')}
                      className="text-amber-500"
                    />
                    <span>SMS Gateway</span>
                  </label>
                </div>
              </div>

              {testResult && (
                <div className={`p-3 rounded-xl border ${
                  testResult.success ? 'bg-emerald-950/70 border-emerald-700 text-emerald-200' : 'bg-rose-950/70 border-rose-700 text-rose-200'
                }`}>
                  <div className="font-bold flex items-center gap-2">
                    {testResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-rose-400" />}
                    <span>{testResult.message}</span>
                  </div>
                  {testResult.error && (
                    <p className="text-[11px] mt-1 opacity-90">{testResult.error}</p>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setTestModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleSendTestMessage}
                disabled={sendingTest}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white flex items-center gap-2 transition disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{sendingTest ? 'Sending Test...' : 'Send Test Notification'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
