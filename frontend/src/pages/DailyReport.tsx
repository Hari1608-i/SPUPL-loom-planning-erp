import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Calendar,
  Clock,
  Printer,
  FileSpreadsheet,
  RefreshCw,
  Save,
  Trash2,
  Edit3,
  PlusCircle,
  CheckCircle2,
  AlertCircle,
  Building2,
  User,
  Users,
  ChevronRight,
  ChevronLeft,
  Search,
  BarChart3,
  CalendarDays,
  Activity,
  Info,
  Award,
  Sparkles,
  Link2
} from 'lucide-react';
import XLSX from 'xlsx-js-style';
import { format, parseISO, isValid } from 'date-fns';
import { useAuth } from '../context/AuthContext';
import {
  DEPARTMENTS,
  DepartmentConfig,
  MetricDefinition,
  getDepartmentByCode,
  computePerformanceMark,
  PLANNING_OTT_METRICS
} from '../config/dailyReportConfig';
import { COMPANY_LOGO_DATA_URL } from '../assets/logoDataUrl';

const API_BASE_URL = '';

type ViewMode = 'DAILY' | 'WEEKLY' | 'MONTHLY';

interface EntryRecord {
  id?: number;
  report_date: string;
  department_code: string;
  metric_code: string;
  metric_name: string;
  raw_value?: string;
  target_value?: number;
  actual_value?: number;
  diff_value?: number;
  pct_value?: number;
  department_head?: string;
  mentor?: string;
  performance_mark?: string;
  remarks?: string;
  calculated_value?: string;
}

interface DepartmentMaster {
  department_code: string;
  department_name: string;
  department_head: string;
  mentor: string;
}

// Global Metric Code Aliases mapping across departments and reports
const METRIC_CODE_ALIASES: Record<string, string[]> = {
  // Grey Warehouse
  TOTAL_PRODN_GREIGE: ['GREIGE_PRODUCTION_MTRS', 'GREIGE_PRODN_MTRS'],
  GREIGE_PRODUCTION_MTRS: ['TOTAL_PRODN_GREIGE', 'GREIGE_PRODN_MTRS'],
  GREIGE_PRODN_MTRS: ['TOTAL_PRODN_GREIGE', 'GREIGE_PRODUCTION_MTRS'],
  TOTAL_PRODN_FINISH: ['FINISH_PRODUCTION_MTRS', 'FINISH_PRODN_MTRS'],
  FINISH_PRODUCTION_MTRS: ['TOTAL_PRODN_FINISH', 'FINISH_PRODN_MTRS'],
  FINISH_PRODN_MTRS: ['TOTAL_PRODN_FINISH', 'FINISH_PRODUCTION_MTRS'],
  GREIGE_YD_OUTWARD: ['GREIGE_YD_OUTWARD_MTRS'],
  GREIGE_YD_OUTWARD_MTRS: ['GREIGE_YD_OUTWARD'],

  // Raw Material (GREY & YD)
  GREIGE_TOTAL_ORDERS: ['GREIGE_ORDERS_TOTAL'],
  GREIGE_ORDERS_TOTAL: ['GREIGE_TOTAL_ORDERS'],
  GREIGE_YARN_COMPLETED: ['GREIGE_COMPLETED'],
  GREIGE_COMPLETED: ['GREIGE_YARN_COMPLETED'],
  GREIGE_ONTIME: ['GREIGE_ONTIME'],
  GREIGE_DELAY: ['GREIGE_DELAY'],
  GREIGE_NOT_COMPLETED: ['GREIGE_NOT_COMPLETED'],

  DYED_TOTAL_ORDERS: ['DYED_ORDERS_TOTAL'],
  DYED_ORDERS_TOTAL: ['DYED_TOTAL_ORDERS'],
  DYED_YARN_COMPLETED: ['DYED_COMPLETED'],
  DYED_COMPLETED: ['DYED_YARN_COMPLETED'],
  DYED_ONTIME: ['DYED_ONTIME'],
  DYED_DELAY: ['DYED_DELAY'],
  DYED_NOT_COMPLETED: ['DYED_NOT_COMPLETED'],

  // Greige & Finished Inspection
  INHOUSE_TOTAL_INSPECTED: ['INHOUSE_GREIGE_INSPECTED_MTRS'],
  INHOUSE_GREIGE_INSPECTED_MTRS: ['INHOUSE_TOTAL_INSPECTED'],
  INHOUSE_TOTAL_PASSED: ['INHOUSE_GREIGE_PASSED_MTRS'],
  INHOUSE_GREIGE_PASSED_MTRS: ['INHOUSE_TOTAL_PASSED'],
  INHOUSE_TOTAL_REJECTED: ['INHOUSE_GREIGE_REJECTED_MTRS'],
  INHOUSE_GREIGE_REJECTED_MTRS: ['INHOUSE_TOTAL_REJECTED'],
  VENDOR_TOTAL_INSPECTED: ['VENDOR_GREIGE_INSPECTED_MTRS'],
  VENDOR_GREIGE_INSPECTED_MTRS: ['VENDOR_TOTAL_INSPECTED'],
  VENDOR_TOTAL_PASSED: ['VENDOR_GREIGE_PASSED_MTRS'],
  VENDOR_GREIGE_PASSED_MTRS: ['VENDOR_TOTAL_PASSED'],
  VENDOR_TOTAL_REJECTED: ['VENDOR_GREIGE_REJECTED_MTRS'],
  VENDOR_GREIGE_REJECTED_MTRS: ['VENDOR_TOTAL_REJECTED'],
  FINISHED_INSPECTION_MTRS: ['FINISHED_INSPECTED_MTRS', 'INSPECTION_DAY_MTRS'],
  FINISHED_INSPECTED_MTRS: ['FINISHED_INSPECTION_MTRS', 'INSPECTION_DAY_MTRS'],
  INSPECTION_DAY_MTRS: ['FINISHED_INSPECTION_MTRS', 'FINISHED_INSPECTED_MTRS'],
  SALES_RETURN_MTRS: ['SALES_RETURNS_MTRS'],
  SALES_RETURNS_MTRS: ['SALES_RETURN_MTRS'],
  REJECTION_MTRS: ['TOTAL_REJECTION_MTRS'],
  TOTAL_REJECTION_MTRS: ['REJECTION_MTRS'],
  REWASH_MTRS: ['TOTAL_REWASH_MTRS'],
  TOTAL_REWASH_MTRS: ['REWASH_MTRS'],
  PROC_REWASH_MTRS: ['PROCESSING_REWASH_MTRS'],
  PROCESSING_REWASH_MTRS: ['PROC_REWASH_MTRS'],

  // Processing
  PROC_DELIVERY_INHOUSE_MTRS: ['PROCESSING_DELIVERY_INHOUSE'],
  PROCESSING_DELIVERY_INHOUSE: ['PROC_DELIVERY_INHOUSE_MTRS'],
  PROC_DELIVERY_OUTSIDE_MTRS: ['PROCESSING_DELIVERY_OUTSIDE'],
  PROCESSING_DELIVERY_OUTSIDE: ['PROC_DELIVERY_OUTSIDE_MTRS'],
  NO_OF_DAYS: ['NO_OF_DAYS_PROCESSING', 'PROCESSING_NO_OF_DAYS'],
  PROCESSING_NO_OF_DAYS: ['NO_OF_DAYS'],

  // Outsourcing & Weaving & Sizing & Spinning
  OS_GREIGE_FABRIC_MTRS: ['GREIGE_FABRIC'],
  GREIGE_FABRIC: ['OS_GREIGE_FABRIC_MTRS'],
  OS_YD_FABRIC_MTRS: ['YD_FABRIC'],
  YD_FABRIC: ['OS_YD_FABRIC_MTRS'],
  INHOUSE_KPICKS: ['KPICKS'],
  KPICKS: ['INHOUSE_KPICKS'],
  INHOUSE_MTRS: ['WEAVING_MTRS'],
  WEAVING_MTRS: ['INHOUSE_MTRS'],
  SEC_WARPING_MTRS: ['WARPING_MTRS'],
  WARPING_MTRS: ['SEC_WARPING_MTRS'],
  SPINNING_VSF: ['VSF_PRODUCTION'],
  VSF_PRODUCTION: ['SPINNING_VSF'],
  FLAX_LINEN_MTRS: ['FLAX_LINEN_PRODUCTION'],
  FLAX_LINEN_PRODUCTION: ['FLAX_LINEN_MTRS'],
  VSF_GPS_CMS: ['VSF_GPS'],
  VSF_GPS: ['VSF_GPS_CMS'],
  FLAX_GPS: ['FLAX_GPS'],

  // OTT / OTD Pending Status bidirectional aliases
  OTD_GREIGE_YARN: ['OTT_GREIGE_YARN'],
  OTT_GREIGE_YARN: ['OTD_GREIGE_YARN'],
  OTD_DYED_YARN: ['OTT_DYED_YARN'],
  OTT_DYED_YARN: ['OTD_DYED_YARN'],
  OTD_SIZING: ['OTT_SIZING'],
  OTT_SIZING: ['OTD_SIZING'],
  OTD_GREIGE_WAREHOUSE: ['OTT_GREIGE_WAREHOUSE'],
  OTT_GREIGE_WAREHOUSE: ['OTD_GREIGE_WAREHOUSE'],
  OTD_PROCESSING: ['OTT_PROCESSING'],
  OTT_PROCESSING: ['OTD_PROCESSING'],
  OTD_FINISHED_WAREHOUSE: ['OTT_FINISHED_WAREHOUSE'],
  OTT_FINISHED_WAREHOUSE: ['OTD_FINISHED_WAREHOUSE'],
  OTD_FINAL_DISPATCH: ['OTT_FINAL_DISPATCH'],
  OTT_FINAL_DISPATCH: ['OTD_FINAL_DISPATCH'],
};

export default function DailyReport() {
  const { user } = useAuth();

  // Navigation & Mode
  const [viewMode, setViewMode] = useState<ViewMode>('DAILY');

  const [selectedDeptCode, setSelectedDeptCode] = useState<string>('SIZING');

  // ── DATE CONTROL 1: ENTRY DATE (Controls ONLY Department Data Entry) ──
  const [entryDate, setEntryDate] = useState<string>('2026-08-26');
  // selectedDate is aliased to entryDate for seamless compatibility with all existing entry logic
  const selectedDate = entryDate;

  const setSelectedDate = useCallback((newDate: string) => {
    if (!newDate) return;
    setEntryDate(newDate);
    // Clear daily entries and form inputs so new date starts fresh with NO cross-date data leakage
    setDailyEntries({});
    setFormInputs({});
    setEditedTargets({});
    setIsEditingSaved(false);
    setDeptRemarks('');
  }, []);

  // ── DATE CONTROL 2: PRINT DATE RANGE (Controls ONLY Print / Print Preview) ──
  const [printFromDate, setPrintFromDate] = useState<string>('2026-08-26');
  const [printToDate, setPrintToDate] = useState<string>('2026-08-26');
  const [printEntries, setPrintEntries] = useState<Record<string, EntryRecord> | null>(null);
  const [cumulativeEntries, setCumulativeEntries] = useState<Record<string, EntryRecord> | null>(null);
  const [printMonthlySummaries, setPrintMonthlySummaries] = useState<any[] | null>(null);
  const [printDepartmentMasters, setPrintDepartmentMasters] = useState<Record<string, { head: string; mentor: string }> | null>(null);
  const [printDateLabel, setPrintDateLabel] = useState<string>('');

  const [historyDates, setHistoryDates] = useState<{ date: string; count: number }[]>([]);

  // Department Masters (Heads & Mentors stored in SQL)
  const [departmentMasters, setDepartmentMasters] = useState<Record<string, { head: string; mentor: string }>>({});

  // Loading & Feedback
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Daily entries map: metric_code -> EntryRecord
  const [dailyEntries, setDailyEntries] = useState<Record<string, EntryRecord>>({});

  // Form editable states for active department:
  // metric_code -> string (Empty for new dates! NO auto-fill!)
  const [formInputs, setFormInputs] = useState<Record<string, string>>({});
  // metric_code -> target number (editable)
  const [editedTargets, setEditedTargets] = useState<Record<string, number>>({});
  const [deptRemarks, setDeptRemarks] = useState<string>('');

  // Suppress browser print header title "SPUPL LOOM SYSTEM" during printing
  useEffect(() => {
    let savedTitle = '';
    const onBeforePrint = () => {
      savedTitle = document.title;
      document.title = '';
    };
    const onAfterPrint = () => {
      document.title = savedTitle || 'SPUPL LOOM SYSTEM';
    };
    window.addEventListener('beforeprint', onBeforePrint);
    window.addEventListener('afterprint', onAfterPrint);
    return () => {
      window.removeEventListener('beforeprint', onBeforePrint);
      window.removeEventListener('afterprint', onAfterPrint);
    };
  }, []);

  // Dedicated Print Report Data Fetcher (Synchronizes Print Preview & Excel for selected Print Dates)
  const fetchPrintReportData = useCallback(async (fromDate: string, toDate: string) => {
    if (!fromDate || !toDate) return;
    if (fromDate > toDate) return;
    try {
      // Clear stale print entries and monthly summaries immediately
      setPrintEntries({});
      setPrintMonthlySummaries(null);

      // AS ON DATE: Strictly the daily entry of toDate only (never cumulative, never fallback)
      const url = `${API_BASE_URL}/api/daily-report?date=${toDate}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();

      const pMap: Record<string, EntryRecord> = {};
      (data.entries || []).forEach((e: EntryRecord) => {
        pMap[e.metric_code] = e;
      });
      setPrintEntries(pMap);

      if (data.departmentMasters) {
        const mMasters: Record<string, { head: string; mentor: string }> = {};
        data.departmentMasters.forEach((m: DepartmentMaster) => {
          mMasters[m.department_code] = { head: m.department_head, mentor: m.mentor };
        });
        setPrintDepartmentMasters(mMasters);
      }

      // UP TO DATE: Month-to-Date cumulative (from 1st of toDate's month through toDate)
      const monthStr = toDate.substring(0, 7);
      const mRes = await fetch(`${API_BASE_URL}/api/daily-report/monthly?month=${monthStr}&endDate=${toDate}`);
      if (mRes.ok) {
        const mData = await mRes.json();
        setPrintMonthlySummaries(mData?.summary || []);
      }

      setCumulativeEntries(null);

      let pDateStr = '';
      const fParts = fromDate.split('-');
      const tParts = toDate.split('-');
      const fStr = fParts.length === 3 ? `${fParts[2]}-${fParts[1]}-${fParts[0]}` : fromDate;
      const tStr = tParts.length === 3 ? `${tParts[2]}-${tParts[1]}-${tParts[0]}` : toDate;
      pDateStr = fromDate === toDate ? fStr : `${fStr} to ${tStr}`;
      setPrintDateLabel(pDateStr);
    } catch (err: any) {
      console.error('Error loading print report data:', err);
    }
  }, []);

  // Automatically keep Print Preview synchronized whenever Print Date Range changes
  useEffect(() => {
    fetchPrintReportData(printFromDate, printToDate);
  }, [printFromDate, printToDate, fetchPrintReportData]);

  // Dedicated Print Report Handler (Uses ONLY PRINT DATE controls without touching Entry Date)
  const handlePrintReport = useCallback(async () => {
    if (!printFromDate || !printToDate) {
      setFeedbackMessage({ type: 'error', text: 'Please select valid Print Dates.' });
      return;
    }
    if (printFromDate > printToDate) {
      setFeedbackMessage({
        type: 'error',
        text: 'FROM DATE cannot be greater than TO DATE. Please select a valid date range.'
      });
      return;
    }
    setLoading(true);
    try {
      await fetchPrintReportData(printFromDate, printToDate);
      setTimeout(() => {
        const originalTitle = document.title;
        document.title = '';
        window.print();
        setTimeout(() => {
          document.title = originalTitle || 'SPUPL LOOM SYSTEM';
        }, 1500);
      }, 200);
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err.message || 'Failed to prepare print report' });
    } finally {
      setLoading(false);
    }
  }, [printFromDate, printToDate, fetchPrintReportData]);

  // Editable Head & Mentor states for active department
  const [editHeadMentorMode, setEditHeadMentorMode] = useState<boolean>(false);
  const [headInput, setHeadInput] = useState<string>('');
  const [mentorInput, setMentorInput] = useState<string>('');

  // Explicit edit mode for saved record (Rule 7, 11)
  const [isEditingSaved, setIsEditingSaved] = useState<boolean>(false);

  // Target edit toggle mode (Rule 8)
  const [editTargetsMode, setEditTargetsMode] = useState<boolean>(false);

  // Weekly & Monthly states
  const [weeklyStartDate, setWeeklyStartDate] = useState<string>('2026-08-20');
  const [weeklyEndDate, setWeeklyEndDate] = useState<string>('2026-08-26');
  const [weeklyData, setWeeklyData] = useState<any[]>([]);
  const [weeklyDates, setWeeklyDates] = useState<string[]>([]);
  const [deptFilter, setDeptFilter] = useState<string>('ALL');

  const [selectedMonth, setSelectedMonth] = useState<string>('2026-08');
  const [monthlySummaries, setMonthlySummaries] = useState<any[]>([]);

  // Search filter in table views
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Role / Department Access Control
  const userRole = (user?.role || '').toUpperCase();
  const userDept = (user?.department || '').toUpperCase();
  const isAdminOrManager = useMemo(() => {
    return (
      userRole === 'ADMIN' ||
      userRole === 'ADMINISTRATOR' ||
      userRole === 'SYSTEM ADMINISTRATOR' ||
      userRole === 'SUPERADMIN' ||
      userRole === 'PLANNING_MANAGER' ||
      userRole === 'MANAGEMENT'
    );
  }, [userRole]);

  // Restrict or pre-select department based on logged-in user
  useEffect(() => {
    if (!isAdminOrManager && userDept) {
      const match = DEPARTMENTS.find(
        d => d.code.toUpperCase() === userDept || userDept.includes(d.code.toUpperCase())
      );
      if (match) {
        setSelectedDeptCode(match.code);
      }
    }
  }, [userDept, isAdminOrManager]);

  // Active department configuration
  const currentDept = useMemo(() => {
    return getDepartmentByCode(selectedDeptCode) || DEPARTMENTS[0];
  }, [selectedDeptCode]);

  // Effective Head & Mentor for current department
  const currentHead = useMemo(() => {
    if (headInput) return headInput;
    const master = departmentMasters[currentDept.code];
    if (master?.head) return master.head;
    return currentDept.head || 'N/A';
  }, [headInput, departmentMasters, currentDept]);

  const currentMentor = useMemo(() => {
    if (mentorInput) return mentorInput;
    const master = departmentMasters[currentDept.code];
    if (master?.mentor) return master.mentor;
    return currentDept.mentor || 'N/A';
  }, [mentorInput, departmentMasters, currentDept]);

  // Check if current department has saved entries for selectedDate in SQL
  const isCurrentDeptSaved = useMemo(() => {
    return currentDept.rawMetrics.some(m => {
      const entry = dailyEntries[m.code];
      return entry !== undefined && entry.actual_value !== null && entry.actual_value !== undefined;
    });
  }, [currentDept, dailyEntries]);

  // Fetch History Dates on load
  const fetchHistoryDates = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/daily-report/history-dates`);
      if (res.ok) {
        const data = await res.json();
        setHistoryDates(data.dates || []);
      }
    } catch (err) {
      console.error('Failed to fetch history dates:', err);
    }
  }, []);

  useEffect(() => {
    fetchHistoryDates();
  }, [fetchHistoryDates]);

  // Fetch Daily Data from SQL for the selected date
  const fetchDailyData = useCallback(async (date: string) => {
    setLoading(true);
    setFeedbackMessage(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/daily-report?date=${date}`);
      if (!res.ok) throw new Error('Failed to fetch daily report from database');
      const data = await res.json();

      const entriesMap: Record<string, EntryRecord> = {};
      const inputsMap: Record<string, string> = {};
      const targetsMap: Record<string, number> = {};
      const mastersMap: Record<string, { head: string; mentor: string }> = {};

      // Store department masters from backend
      (data.departmentMasters || []).forEach((m: DepartmentMaster) => {
        mastersMap[m.department_code] = { head: m.department_head, mentor: m.mentor };
      });
      setDepartmentMasters(mastersMap);

      let savedDeptRemarks = '';
      let savedDeptHead = '';
      let savedDeptMentor = '';

      (data.entries || []).forEach((e: EntryRecord) => {
        const isExactDept = e.department_code === selectedDeptCode;
        if (!entriesMap[e.metric_code] || isExactDept) {
          entriesMap[e.metric_code] = e;
        }
        if (!inputsMap[e.metric_code] || isExactDept) {
          if (e.actual_value !== null && e.actual_value !== undefined) {
            inputsMap[e.metric_code] = String(e.actual_value);
          } else if (e.raw_value !== null && e.raw_value !== undefined && e.raw_value !== '') {
            inputsMap[e.metric_code] = String(e.raw_value);
          }
        }

        if (!targetsMap[e.metric_code] || isExactDept) {
          if (e.target_value !== null && e.target_value !== undefined) {
            targetsMap[e.metric_code] = e.target_value;
          }
        }

        const isMatchDept = isExactDept ||
          (selectedDeptCode === 'HRD' && e.department_code === 'HRD_TRANSPORT') ||
          (selectedDeptCode === 'TRANSPORT' && e.department_code === 'HRD_TRANSPORT');

        if (isMatchDept) {
          if (e.remarks && (!savedDeptRemarks || isExactDept)) savedDeptRemarks = e.remarks;
          if (e.department_head && (!savedDeptHead || isExactDept)) savedDeptHead = e.department_head;
          if (e.mentor && (!savedDeptMentor || isExactDept)) savedDeptMentor = e.mentor;
        }
      });

      setDailyEntries(entriesMap);
      // For any metric not in SQL, inputsMap[metric.code] will be undefined -> starts EMPTY!
      setFormInputs(inputsMap);
      setEditedTargets(targetsMap);
      setDeptRemarks(savedDeptRemarks);

      // Set head and mentor inputs
      const defaultMaster = mastersMap[selectedDeptCode];
      setHeadInput(savedDeptHead || defaultMaster?.head || currentDept.head || '');
      setMentorInput(savedDeptMentor || defaultMaster?.mentor || currentDept.mentor || '');

      // Load monthly summary data in background for instant print availability
      const monthStr = date.substring(0, 7);
      fetch(`${API_BASE_URL}/api/daily-report/monthly?month=${monthStr}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (d?.summary) setMonthlySummaries(d.summary);
        })
        .catch(() => {});

      setCumulativeEntries(null);
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err.message || 'Error loading report' });
    } finally {
      setLoading(false);
    }
  }, [selectedDeptCode, currentDept]);

  useEffect(() => {
    fetchDailyData(selectedDate);
  }, [selectedDate, selectedDeptCode, fetchDailyData]);

  // Fetch Weekly Data
  const fetchWeeklyData = useCallback(async () => {
    setLoading(true);
    setFeedbackMessage(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/daily-report/weekly?startDate=${weeklyStartDate}&endDate=${weeklyEndDate}`);
      if (!res.ok) throw new Error('Failed to fetch weekly report');
      const data = await res.json();
      setWeeklyData(data.matrix || []);
      setWeeklyDates(data.dates || []);
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err.message || 'Error loading weekly report' });
    } finally {
      setLoading(false);
    }
  }, [weeklyStartDate, weeklyEndDate]);

  useEffect(() => {
    if (viewMode === 'WEEKLY') {
      fetchWeeklyData();
    }
  }, [viewMode, fetchWeeklyData]);

  // Fetch Monthly Data
  const fetchMonthlyData = useCallback(async () => {
    setLoading(true);
    setFeedbackMessage(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/daily-report/monthly?month=${selectedMonth}`);
      if (!res.ok) throw new Error('Failed to fetch monthly report');
      const data = await res.json();
      setMonthlySummaries(data.summary || []);
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err.message || 'Error loading monthly report' });
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    if (viewMode === 'MONTHLY') {
      fetchMonthlyData();
    }
  }, [viewMode, fetchMonthlyData]);

  // Handle Date Navigation: Previous Date / Next Date
  const handleStepDate = (days: number) => {
    const d = new Date(selectedDate);
    if (isNaN(d.getTime())) return;
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const newDateStr = `${y}-${m}-${day}`;
    setSelectedDate(newDateStr);
  };

  // Live Calculations for current active department
  const liveCalculations = useMemo(() => {
    if (!currentDept || !currentDept.calculate) return {};
    const raw: Record<string, any> = {};
    currentDept.rawMetrics.forEach((m: MetricDefinition) => {
      const inputVal = formInputs[m.code];
      // If empty string or undefined, do not inject fake defaults for actual production metrics!
      if (inputVal !== undefined && inputVal !== '') {
        raw[m.code] = parseFloat(inputVal) || inputVal;
      } else {
        raw[m.code] = m.defaultValue !== undefined ? m.defaultValue : '';
      }
    });
    return currentDept.calculate(raw);
  }, [currentDept, formInputs]);

  // Department overall performance mark
  const departmentPerformance = useMemo(() => {
    // Find primary metric with target
    const primaryMetric = currentDept.rawMetrics.find(m => {
      const target = editedTargets[m.code] !== undefined ? editedTargets[m.code] : m.target;
      return target !== undefined && target > 0;
    });

    if (!primaryMetric) return 'N/A';

    const target = editedTargets[primaryMetric.code] !== undefined ? editedTargets[primaryMetric.code] : primaryMetric.target;
    const actualStr = formInputs[primaryMetric.code];
    if (actualStr === undefined || actualStr === '') return 'NOT ENTERED';

    const actual = parseFloat(actualStr);
    if (isNaN(actual)) return 'NOT ENTERED';
    const pct = target && target > 0 ? (actual / target) * 100 : 0;
    return computePerformanceMark(target, actual, pct);
  }, [currentDept, formInputs, editedTargets]);

  // Input change handler
  const handleInputChange = (metricCode: string, val: string) => {
    setFormInputs(prev => ({ ...prev, [metricCode]: val }));
  };

  // Target change handler
  const handleTargetChange = (metricCode: string, val: string) => {
    const num = parseFloat(val);
    setEditedTargets(prev => ({ ...prev, [metricCode]: isNaN(num) ? 0 : num }));
  };

  // Save Department Entries
  const handleSaveDepartment = async () => {
    // Prompt 25: ENTRY DATE must always represent one specific working/report date.
    if (!selectedDate || !selectedDate.trim()) {
      setFeedbackMessage({
        type: 'error',
        text: 'Please select Entry Date.'
      });
      return;
    }

    // Validation before saving (Rule 50: Do not save NaN or Infinity)
    for (const m of currentDept.rawMetrics) {
      const rawVal = formInputs[m.code];
      if (m.type === 'number' && rawVal !== undefined && rawVal !== '') {
        const num = Number(rawVal);
        if (isNaN(num) || !isFinite(num)) {
          setFeedbackMessage({
            type: 'error',
            text: `Validation error: "${m.name}" must be a valid number. Cannot save NaN or invalid text.`
          });
          return;
        }
      }
      const targetVal = editedTargets[m.code];
      if (targetVal !== undefined && targetVal !== null) {
        if (isNaN(Number(targetVal)) || !isFinite(Number(targetVal))) {
          setFeedbackMessage({
            type: 'error',
            text: `Validation error: Target for "${m.name}" must be a valid number.`
          });
          return;
        }
      }
    }

    setSaving(true);
    setSaveSuccess(false);
    setFeedbackMessage(null);
    try {
      const metricsToSave = currentDept.rawMetrics.map((m: MetricDefinition) => {
        const rawVal = formInputs[m.code] !== undefined ? formInputs[m.code] : '';
        const numVal = m.type === 'number' ? (rawVal !== '' ? parseFloat(rawVal) : null) : null;
        const targetVal = editedTargets[m.code] !== undefined ? editedTargets[m.code] : (m.target || 0);

        let diffVal: number | null = null;
        let pctVal: number | null = null;
        if (targetVal > 0 && numVal !== null) {
          diffVal = Number((numVal - targetVal).toFixed(2));
          pctVal = Number(((numVal / targetVal) * 100).toFixed(2));
        }

        const perfMark = computePerformanceMark(targetVal, numVal !== null ? numVal : undefined, pctVal || 0);

        return {
          metric_code: m.code,
          metric_name: m.name,
          raw_value: String(rawVal),
          actual_value: numVal,
          target_value: targetVal,
          diff_value: diffVal,
          pct_value: pctVal,
          performance_mark: perfMark,
          remarks: m.type === 'textarea' ? rawVal : (deptRemarks || '')
        };
      });

      const payload = {
        report_date: selectedDate,
        department_code: currentDept.code,
        department_head: currentHead,
        mentor: currentMentor,
        remarks: deptRemarks,
        entered_by: user?.employeeName || user?.username || 'ADMIN',
        metrics: metricsToSave
      };

      const res = await fetch(`${API_BASE_URL}/api/daily-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to save daily entries');
      }

      setSaveSuccess(true);
      setEditHeadMentorMode(false);
      setEditTargetsMode(false);
      setIsEditingSaved(false);
      setFeedbackMessage({
        type: 'success',
        text: `Daily Report for ${currentDept.name} on ${selectedDate} saved permanently to SQL!`
      });
      setTimeout(() => setSaveSuccess(false), 3500);

      // Immediately re-read from SQL to refresh all displays
      await fetchDailyData(selectedDate);
      await fetchHistoryDates();
      if (selectedDate >= printFromDate && selectedDate <= printToDate) {
        await fetchPrintReportData(printFromDate, printToDate);
      }
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err.message || 'Failed to save entries' });
    } finally {
      setSaving(false);
    }
  };

  // Delete Department Entry with Confirmation
  const handleDeleteDepartment = async () => {
    if (!window.confirm(`Delete Daily Report entry for ${currentDept.name} on ${selectedDate}?\n\nThis will permanently delete ONLY this department's record for this date.`)) {
      return;
    }

    setDeleting(true);
    setFeedbackMessage(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/daily-report?date=${selectedDate}&department=${currentDept.code}`, {
        method: 'DELETE'
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to delete daily report entry');
      }

      setFeedbackMessage({
        type: 'success',
        text: `Deleted Daily Report entry for ${currentDept.name} on ${selectedDate}.`
      });

      // Clear local input fields for current department
      setFormInputs(prev => {
        const updated = { ...prev };
        currentDept.rawMetrics.forEach(m => delete updated[m.code]);
        return updated;
      });
      setDeptRemarks('');
      setIsEditingSaved(false);

      // Immediately re-read from SQL
      await fetchDailyData(selectedDate);
      await fetchHistoryDates();
      if (selectedDate >= printFromDate && selectedDate <= printToDate) {
        await fetchPrintReportData(printFromDate, printToDate);
      }
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err.message || 'Failed to delete entry' });
    } finally {
      setDeleting(false);
    }
  };

  // Re-Entry Handler (Rule 10): Clears input context and advances date for a clean new entry
  const handleReEntry = () => {
    handleStepDate(1);
    setFormInputs({});
    setDeptRemarks('');
    setIsEditingSaved(false);
    setEditTargetsMode(false);
    setFeedbackMessage({
      type: 'success',
      text: `Switched ${currentDept.name} to next date. If no saved record exists, fields start empty for fresh data entry.`
    });
  };

  // Export to Excel (Uses the same prepared report data as Print Report)
  const handleExportExcel = async () => {
    if (!printFromDate || !printToDate) {
      setFeedbackMessage({ type: 'error', text: 'Please select valid Print Dates.' });
      return;
    }
    if (printFromDate > printToDate) {
      setFeedbackMessage({
        type: 'error',
        text: 'FROM DATE cannot be greater than TO DATE. Please select a valid date range.'
      });
      return;
    }

    setLoading(true);
    try {
      // AS ON DATE: Strictly the daily entry of printToDate only (never cumulative, never fallback)
      const url = `${API_BASE_URL}/api/daily-report?date=${printToDate}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch report data for Excel export');
      const data = await res.json();

      const pMap: Record<string, EntryRecord> = {};
      (data.entries || []).forEach((e: EntryRecord) => {
        pMap[e.metric_code] = e;
      });

      const mastersMap: Record<string, { head: string; mentor: string }> = {};
      (data.departmentMasters || []).forEach((m: DepartmentMaster) => {
        mastersMap[m.department_code] = { head: m.department_head, mentor: m.mentor };
      });

      // UP TO DATE: Month-to-Date cumulative (from 1st of printToDate's month through printToDate)
      const monthStr = printToDate.substring(0, 7);
      let mSummaries: any[] = [];
      const mRes = await fetch(`${API_BASE_URL}/api/daily-report/monthly?month=${monthStr}&endDate=${printToDate}`);
      if (mRes.ok) {
        const mData = await mRes.json();
        if (mData.summary) mSummaries = mData.summary;
      }

      const getVal = (code: string, fallback: any = '') => {
        const aliases = [code, ...(METRIC_CODE_ALIASES[code] || [])];
        for (const c of aliases) {
          const e = pMap[c];
          if (e?.actual_value !== null && e?.actual_value !== undefined) {
            return e.actual_value;
          }
          if (e?.raw_value !== null && e?.raw_value !== undefined && e?.raw_value !== '') {
            return e.raw_value;
          }
        }
        return fallback;
      };

      const getNum = (code: string): number | null => {
        const aliases = [code, ...(METRIC_CODE_ALIASES[code] || [])];
        for (const c of aliases) {
          const e = pMap[c];
          if (e?.actual_value !== null && e?.actual_value !== undefined) {
            return Number(e.actual_value);
          }
        }
        return null;
      };

      const getAsOnVal = (code: string, fallback: any = '') => {
        return getVal(code, fallback);
      };

      const getAsOnNum = (code: string): number | null => {
        return getNum(code);
      };

      const calcNoOfDaysExcel = (stock: number | null | undefined): string => {
        if (stock === null || stock === undefined || isNaN(stock)) return '';
        if (stock === 0) return '0.0';
        return (stock / 30000).toFixed(1);
      };

      const wb = XLSX.utils.book_new();

      const fParts = printFromDate.split('-');
      const tParts = printToDate.split('-');
      const fStr = fParts.length === 3 ? `${fParts[2]}-${fParts[1]}-${fParts[0]}` : printFromDate;
      const tStr = tParts.length === 3 ? `${tParts[2]}-${tParts[1]}-${tParts[0]}` : printToDate;
      const dateRangeLabel = printFromDate === printToDate ? fStr : `${fStr} to ${tStr}`;

      // ── STYLING DEFINITIONS (MATCHES PRINT PREVIEW) ──
      const borderThin = {
        top: { style: 'thin', color: { rgb: '333333' } },
        bottom: { style: 'thin', color: { rgb: '333333' } },
        left: { style: 'thin', color: { rgb: '333333' } },
        right: { style: 'thin', color: { rgb: '333333' } }
      };

      const styleHdrYellow = {
        font: { name: 'Arial', sz: 8.5, bold: true, color: { rgb: '000000' } },
        fill: { fgColor: { rgb: 'FEF08A' } },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        border: borderThin
      };

      const styleHdrYellowLeft = {
        font: { name: 'Arial', sz: 8.5, bold: true, color: { rgb: '000000' } },
        fill: { fgColor: { rgb: 'FEF08A' } },
        alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
        border: borderThin
      };

      const styleCellCenter = {
        font: { name: 'Arial', sz: 7.5, color: { rgb: '000000' } },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        border: borderThin
      };

      const styleCellCenterBold = {
        font: { name: 'Arial', sz: 7.5, bold: true, color: { rgb: '000000' } },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        border: borderThin
      };

      const styleCellLeft = {
        font: { name: 'Arial', sz: 7.5, color: { rgb: '000000' } },
        alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
        border: borderThin
      };

      const styleCellLeftBold = {
        font: { name: 'Arial', sz: 7.5, bold: true, color: { rgb: '000000' } },
        alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
        border: borderThin
      };

      const styleHdrOrange = {
        font: { name: 'Arial', sz: 7.5, bold: true, color: { rgb: 'C2410C' } },
        fill: { fgColor: { rgb: 'FDE2D2' } },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        border: borderThin
      };

      const styleHdrOrangeLeft = {
        font: { name: 'Arial', sz: 7.5, bold: true, color: { rgb: 'C2410C' } },
        fill: { fgColor: { rgb: 'FDE2D2' } },
        alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
        border: borderThin
      };

      const styleCellDiffPos = {
        font: { name: 'Arial', sz: 7.5, bold: true, color: { rgb: '047857' } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: borderThin
      };

      const styleCellDiffNeg = {
        font: { name: 'Arial', sz: 7.5, bold: true, color: { rgb: 'B91C1C' } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: borderThin
      };

      const setCell = (ws: any, r: number, c: number, val: any, style?: any) => {
        const cellRef = XLSX.utils.encode_cell({ r, c });
        const isNum = typeof val === 'number';
        const cell: any = {
          v: val === null || val === undefined ? '' : val,
          t: isNum ? 'n' : 's'
        };
        if (style) cell.s = style;
        ws[cellRef] = cell;
      };

      const applyMergeWithBorders = (ws: any, sRow: number, sCol: number, eRow: number, eCol: number, baseStyle?: any) => {
        for (let r = sRow; r <= eRow; r++) {
          for (let c = sCol; c <= eCol; c++) {
            const cellRef = XLSX.utils.encode_cell({ r, c });
            if (!ws[cellRef]) {
              ws[cellRef] = { v: '', t: 's', s: baseStyle || styleCellCenter };
            } else if (baseStyle) {
              ws[cellRef].s = { ...(ws[cellRef].s || {}), ...baseStyle };
            }
          }
        }
      };

      // ── SHEET 1: FULL PLANT SNAPSHOT (PAGE 1) — 10-COLUMN LAYOUT MATCHING PRINT PREVIEW ──
      const ws1: any = {};
      const merges1: any[] = [];
      let r1 = 0;

      // Header Row 0: Company Name & Date
      setCell(ws1, r1, 0, 'SANTHI PROCESSING UNIT PVT. LTD.', {
        font: { name: 'Arial', sz: 12, bold: true, color: { rgb: '000000' } },
        alignment: { horizontal: 'left', vertical: 'center' }
      });
      merges1.push({ s: { r: r1, c: 0 }, e: { r: r1, c: 6 } });
      applyMergeWithBorders(ws1, r1, 0, r1, 6);

      setCell(ws1, r1, 7, `DATE: ${dateRangeLabel}`, {
        font: { name: 'Arial', sz: 8.5, bold: true, color: { rgb: '000000' } },
        fill: { fgColor: { rgb: 'FEF08A' } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: borderThin
      });
      merges1.push({ s: { r: r1, c: 7 }, e: { r: r1, c: 9 } });
      applyMergeWithBorders(ws1, r1, 7, r1, 9, styleHdrYellow);
      r1++;

      // Header Row 1: Subtitle & Page No
      setCell(ws1, r1, 0, 'FULL PLANT OPERATIONAL SNAPSHOT & DAILY PRODUCTION STATUS', {
        font: { name: 'Arial', sz: 9, bold: true, color: { rgb: '222222' } },
        alignment: { horizontal: 'left', vertical: 'center' }
      });
      merges1.push({ s: { r: r1, c: 0 }, e: { r: r1, c: 6 } });
      applyMergeWithBorders(ws1, r1, 0, r1, 6);

      setCell(ws1, r1, 7, 'Page 1 of 2', {
        font: { name: 'Arial', sz: 7.5, bold: true, color: { rgb: '555555' } },
        alignment: { horizontal: 'center', vertical: 'center' }
      });
      merges1.push({ s: { r: r1, c: 7 }, e: { r: r1, c: 9 } });
      applyMergeWithBorders(ws1, r1, 7, r1, 9);
      r1++;

      // Header Row 2: Table Columns
      setCell(ws1, r1, 0, 'S.NO', styleHdrYellow);
      setCell(ws1, r1, 1, 'DEPT', styleHdrYellow);
      setCell(ws1, r1, 2, 'HEADS', styleHdrYellow);
      setCell(ws1, r1, 3, 'MENTOR', styleHdrYellow);
      setCell(ws1, r1, 4, 'DETAILS', styleHdrYellow);
      setCell(ws1, r1, 5, 'DESCRIPTION', styleHdrYellow);
      merges1.push({ s: { r: r1, c: 5 }, e: { r: r1, c: 9 } });
      applyMergeWithBorders(ws1, r1, 5, r1, 9, styleHdrYellow);
      r1++;

      // 1. PLANNING (Rows 3-7)
      const planItems = [
        { label: 'CURRENT ORDER STATUS', val: getVal('CURRENT_ORDER_STATUS') },
        { label: 'CRITICAL ORDERS', val: getVal('CRITICAL_ORDERS') },
        { label: 'FAST TRACK ORDER', val: getVal('FAST_TRACK_ORDERS') },
        { label: 'Reproduction Order', val: getVal('REPRODUCTION_ORDERS') },
        { label: 'NEW ORDERS', val: getVal('NEW_ORDERS') }
      ];
      const pStart = r1;
      planItems.forEach((p, idx) => {
        const curR = pStart + idx;
        if (idx === 0) {
          setCell(ws1, curR, 0, 1, styleCellCenterBold);
          setCell(ws1, curR, 1, 'PLANNING', styleCellCenterBold);
          setCell(ws1, curR, 2, mastersMap['PLANNING']?.head || 'BALAMURALI', styleCellCenterBold);
          setCell(ws1, curR, 3, mastersMap['PLANNING']?.mentor || 'MANIKANDAN', styleCellCenterBold);
        }
        setCell(ws1, curR, 4, p.label, styleCellLeftBold);
        setCell(ws1, curR, 5, p.val, styleCellLeft);
        merges1.push({ s: { r: curR, c: 5 }, e: { r: curR, c: 9 } });
        applyMergeWithBorders(ws1, curR, 5, curR, 9, styleCellLeft);
      });
      merges1.push({ s: { r: pStart, c: 0 }, e: { r: pStart + 4, c: 0 } });
      applyMergeWithBorders(ws1, pStart, 0, pStart + 4, 0, styleCellCenterBold);
      merges1.push({ s: { r: pStart, c: 1 }, e: { r: pStart + 4, c: 1 } });
      applyMergeWithBorders(ws1, pStart, 1, pStart + 4, 1, styleCellCenterBold);
      merges1.push({ s: { r: pStart, c: 2 }, e: { r: pStart + 4, c: 2 } });
      applyMergeWithBorders(ws1, pStart, 2, pStart + 4, 2, styleCellCenterBold);
      merges1.push({ s: { r: pStart, c: 3 }, e: { r: pStart + 4, c: 3 } });
      applyMergeWithBorders(ws1, pStart, 3, pStart + 4, 3, styleCellCenterBold);
      r1 += 5;

      // 2. SIZING (4 rows)
      const dydN = getNum('DYED_YARN_STOCK_KGS');
      const gryN = getNum('GREY_YARN_STOCK_KGS');
      const sizingTotal = (dydN !== null || gryN !== null) ? ((dydN || 0) + (gryN || 0)) : null;
      const sStart = r1;
      setCell(ws1, sStart, 0, 2, styleCellCenterBold);
      setCell(ws1, sStart, 1, 'SIZING', styleCellCenterBold);
      setCell(ws1, sStart, 2, mastersMap['SIZING']?.head || 'GUNASEKARAN', styleCellCenterBold);
      setCell(ws1, sStart, 3, mastersMap['SIZING']?.mentor || 'SENTHIL', styleCellCenterBold);
      setCell(ws1, sStart, 4, '', styleHdrYellow);
      setCell(ws1, sStart, 5, 'QTY', styleHdrYellow);
      setCell(ws1, sStart, 6, 'NO OF DAYS', styleHdrYellow);
      setCell(ws1, sStart, 7, 'REMARKS', styleHdrYellow);
      merges1.push({ s: { r: sStart, c: 7 }, e: { r: sStart, c: 9 } });
      applyMergeWithBorders(ws1, sStart, 7, sStart, 9, styleHdrYellow);

      const sizingRows = [
        { label: 'DYED YARN STOCK', q: dydN },
        { label: 'GRY YARN STOCK', q: gryN },
        { label: 'TOTAL', q: sizingTotal, isBold: true }
      ];
      sizingRows.forEach((sr, idx) => {
        const curR = sStart + 1 + idx;
        setCell(ws1, curR, 4, sr.label, sr.isBold ? styleCellLeftBold : styleCellLeft);
        setCell(ws1, curR, 5, sr.q !== null ? sr.q : '', sr.isBold ? styleCellCenterBold : styleCellCenter);
        setCell(ws1, curR, 6, '', styleCellCenter);
        setCell(ws1, curR, 7, '', styleCellCenter);
        merges1.push({ s: { r: curR, c: 7 }, e: { r: curR, c: 9 } });
        applyMergeWithBorders(ws1, curR, 7, curR, 9, styleCellCenter);
      });
      merges1.push({ s: { r: sStart, c: 0 }, e: { r: sStart + 3, c: 0 } });
      applyMergeWithBorders(ws1, sStart, 0, sStart + 3, 0, styleCellCenterBold);
      merges1.push({ s: { r: sStart, c: 1 }, e: { r: sStart + 3, c: 1 } });
      applyMergeWithBorders(ws1, sStart, 1, sStart + 3, 1, styleCellCenterBold);
      merges1.push({ s: { r: sStart, c: 2 }, e: { r: sStart + 3, c: 2 } });
      applyMergeWithBorders(ws1, sStart, 2, sStart + 3, 2, styleCellCenterBold);
      merges1.push({ s: { r: sStart, c: 3 }, e: { r: sStart + 3, c: 3 } });
      applyMergeWithBorders(ws1, sStart, 3, sStart + 3, 3, styleCellCenterBold);
      r1 += 4;

      // 3. WEAVING (7 rows)
      const wStart = r1;
      setCell(ws1, wStart, 0, 3, styleCellCenterBold);
      setCell(ws1, wStart, 1, 'WEAVING', styleCellCenterBold);
      setCell(ws1, wStart, 2, mastersMap['WEAVING']?.head || 'GUNASEKARAN', styleCellCenterBold);
      setCell(ws1, wStart, 3, mastersMap['WEAVING']?.mentor || 'GUNASEKARAN', styleCellCenterBold);
      setCell(ws1, wStart, 4, '', styleHdrYellow);
      setCell(ws1, wStart, 5, 'ON DATE', styleHdrYellow);
      setCell(ws1, wStart, 6, 'UP TO DATE', styleHdrYellow);
      setCell(ws1, wStart, 7, 'REMARKS', styleHdrYellow);
      merges1.push({ s: { r: wStart, c: 7 }, e: { r: wStart, c: 9 } });
      applyMergeWithBorders(ws1, wStart, 7, wStart, 9, styleHdrYellow);

      const effU = mSummaries.find(m => m.metric_code === 'EFFICIENCY_PCT')?.monthlyAverage;
      const utiU = mSummaries.find(m => m.metric_code === 'UTILISATION_PCT')?.monthlyAverage;
      const ueU  = mSummaries.find(m => m.metric_code === 'UE_PCT')?.monthlyAverage;
      const knotU = mSummaries.find(m => m.metric_code === 'NO_OF_KNOTTINGS')?.monthlyTotal;
      const sortU = mSummaries.find(m => m.metric_code === 'NO_OF_SORT_CHANGES')?.monthlyTotal;
      const stopU = mSummaries.find(m => m.metric_code === 'FULL_LOOM_STOPPAGE')?.monthlyTotal;

      const formatPctExcel = (val: any) => {
        if (val === null || val === undefined || val === '') return '';
        const s = String(val).trim();
        if (!s || s === '-' || s === 'NA' || s === 'N/A') return '';
        return s.endsWith('%') ? s : `${s}%`;
      };

      const weavingRows = [
        { label: 'EFFICIENCY%', onDate: formatPctExcel(getVal('EFFICIENCY_PCT')), upto: effU !== undefined && effU !== null ? `${Number(effU).toFixed(0)}%` : '' },
        { label: 'UTILISATION%', onDate: formatPctExcel(getVal('UTILISATION_PCT')), upto: utiU !== undefined && utiU !== null ? `${Number(utiU).toFixed(0)}%` : '' },
        { label: 'UE%', onDate: formatPctExcel(getVal('UE_PCT')), upto: ueU !== undefined && ueU !== null ? `${Number(ueU).toFixed(0)}%` : '' },
        { label: 'NO OF KNOTTINGS', onDate: getVal('NO_OF_KNOTTINGS'), upto: knotU !== null && knotU !== undefined ? knotU : '' },
        { label: 'NO OF SORT CHANGES', onDate: getVal('NO_OF_SORT_CHANGES'), upto: sortU !== null && sortU !== undefined ? sortU : '' },
        { label: 'NO OF FULL LOOM STOPPAGE', onDate: getVal('FULL_LOOM_STOPPAGE'), upto: stopU !== null && stopU !== undefined ? stopU : '' }
      ];
      weavingRows.forEach((wr, idx) => {
        const curR = wStart + 1 + idx;
        setCell(ws1, curR, 4, wr.label, styleCellLeftBold);
        setCell(ws1, curR, 5, wr.onDate, styleCellCenter);
        setCell(ws1, curR, 6, wr.upto, styleCellCenter);
        setCell(ws1, curR, 7, '', styleCellCenter);
        merges1.push({ s: { r: curR, c: 7 }, e: { r: curR, c: 9 } });
        applyMergeWithBorders(ws1, curR, 7, curR, 9, styleCellCenter);
      });
      merges1.push({ s: { r: wStart, c: 0 }, e: { r: wStart + 6, c: 0 } });
      applyMergeWithBorders(ws1, wStart, 0, wStart + 6, 0, styleCellCenterBold);
      merges1.push({ s: { r: wStart, c: 1 }, e: { r: wStart + 6, c: 1 } });
      applyMergeWithBorders(ws1, wStart, 1, wStart + 6, 1, styleCellCenterBold);
      merges1.push({ s: { r: wStart, c: 2 }, e: { r: wStart + 6, c: 2 } });
      applyMergeWithBorders(ws1, wStart, 2, wStart + 6, 2, styleCellCenterBold);
      merges1.push({ s: { r: wStart, c: 3 }, e: { r: wStart + 6, c: 3 } });
      applyMergeWithBorders(ws1, wStart, 3, wStart + 6, 3, styleCellCenterBold);
      r1 += 7;

      // 4. GREIGE INSPECTION (20 rows)
      const inInspU = mSummaries.find(m => m.metric_code === 'INHOUSE_TOTAL_INSPECTED' || m.metric_code === 'INHOUSE_GREIGE_INSPECTED_MTRS')?.monthlyTotal ?? null;
      const inPassU = mSummaries.find(m => m.metric_code === 'INHOUSE_TOTAL_PASSED'    || m.metric_code === 'INHOUSE_GREIGE_PASSED_MTRS')?.monthlyTotal ?? null;
      const inRejU  = mSummaries.find(m => m.metric_code === 'INHOUSE_TOTAL_REJECTED'  || m.metric_code === 'INHOUSE_GREIGE_REJECTED_MTRS')?.monthlyTotal ?? null;
      const inRejPctU = (inInspU && inInspU > 0 && inRejU !== null) ? ((inRejU / inInspU) * 100).toFixed(2) + '%' : '';

      const vnInspU = mSummaries.find(m => m.metric_code === 'VENDOR_TOTAL_INSPECTED'  || m.metric_code === 'VENDOR_GREIGE_INSPECTED_MTRS')?.monthlyTotal ?? null;
      const vnPassU = mSummaries.find(m => m.metric_code === 'VENDOR_TOTAL_PASSED'    || m.metric_code === 'VENDOR_GREIGE_PASSED_MTRS')?.monthlyTotal ?? null;
      const vnRejU  = mSummaries.find(m => m.metric_code === 'VENDOR_TOTAL_REJECTED'  || m.metric_code === 'VENDOR_GREIGE_REJECTED_MTRS')?.monthlyTotal ?? null;
      const vnRejPctU = (vnInspU && vnInspU > 0 && vnRejU !== null) ? ((vnRejU / vnInspU) * 100).toFixed(2) + '%' : '';

      const washTotU = mSummaries.find(m => m.metric_code === 'WASHING_TOTAL_MTRS')?.monthlyTotal ?? null;
      const washPassU = mSummaries.find(m => m.metric_code === 'WASHING_TOTAL_PASSED')?.monthlyTotal ?? null;
      const washRejU = mSummaries.find(m => m.metric_code === 'WASHING_TOTAL_REJECTED')?.monthlyTotal ?? null;
      const washRejPctU = (washTotU && washTotU > 0 && washRejU !== null) ? ((washRejU / washTotU) * 100).toFixed(2) + '%' : '';

      const hasAnyInspU = (inInspU !== null || vnInspU !== null || washTotU !== null);
      const totInspU = hasAnyInspU ? ((inInspU || 0) + (vnInspU || 0) + (washTotU || 0)) : null;
      const hasAnyPassU = (inPassU !== null || vnPassU !== null || washPassU !== null);
      const totPassU = hasAnyPassU ? ((inPassU || 0) + (vnPassU || 0) + (washPassU || 0)) : null;
      const hasAnyRejU = (inRejU !== null || vnRejU !== null || washRejU !== null);
      const totRejU = hasAnyRejU ? ((inRejU || 0) + (vnRejU || 0) + (washRejU || 0)) : null;
      const rejPctU = (totInspU && totInspU > 0 && totRejU !== null) ? ((totRejU / totInspU) * 100).toFixed(2) + '%' : '';

      const finInspU = mSummaries.find(m => m.metric_code === 'FINISHED_INSPECTION_MTRS' || m.metric_code === 'FINISHED_INSPECTED_MTRS' || m.metric_code === 'FINISH_PRODN_MTRS')?.monthlyTotal ?? null;
      const procRejU = mSummaries.find(m => m.metric_code === 'PROCESSING_REJECTION_MTRS')?.monthlyTotal ?? null;
      const procRejPctU = (finInspU && finInspU > 0 && procRejU !== null) ? ((procRejU / finInspU) * 100).toFixed(2) + '%' : '';
      const venRejU = mSummaries.find(m => m.metric_code === 'VENDOR_REJECTION_MTRS')?.monthlyTotal ?? null;
      const venRejPctU = (finInspU && finInspU > 0 && venRejU !== null) ? ((venRejU / finInspU) * 100).toFixed(2) + '%' : '';
      const weavRejU = mSummaries.find(m => m.metric_code === 'WEAVING_REJECTION_MTRS')?.monthlyTotal ?? null;
      const weavRejPctU = (finInspU && finInspU > 0 && weavRejU !== null) ? ((weavRejU / finInspU) * 100).toFixed(2) + '%' : '';
      const hasAnyRejFinU = (procRejU !== null || venRejU !== null || weavRejU !== null);
      const totRejFinU = hasAnyRejFinU ? ((procRejU || 0) + (venRejU || 0) + (weavRejU || 0)) : null;
      const realPctU = (finInspU && finInspU > 0 && totRejFinU !== null) ? (Math.max(0, 100 - (totRejFinU / finInspU) * 100)).toFixed(2) + '%' : '';

      const procRewU = mSummaries.find(m => m.metric_code === 'PROCESSING_REWASH_MTRS' || m.metric_code === 'PROC_REWASH_MTRS')?.monthlyTotal ?? null;
      const procRewPctU = (finInspU && finInspU > 0 && procRewU !== null) ? ((procRewU / finInspU) * 100).toFixed(2) + '%' : '';
      const venRewU = mSummaries.find(m => m.metric_code === 'VENDOR_REWASH_MTRS')?.monthlyTotal ?? null;
      const venRewPctU = (finInspU && finInspU > 0 && venRewU !== null) ? ((venRewU / finInspU) * 100).toFixed(2) + '%' : '';
      const hasAnyRewFinU = (procRewU !== null || venRewU !== null);
      const totRewFinU = hasAnyRewFinU ? ((procRewU || 0) + (venRewU || 0)) : null;

      // Cumulative "AS ON DATE" values (Month Start -> Selected Report Date)
      const inInspAsOn = getAsOnNum('INHOUSE_TOTAL_INSPECTED') ?? getAsOnNum('INHOUSE_GREIGE_INSPECTED_MTRS');
      const inPassAsOn = getAsOnNum('INHOUSE_TOTAL_PASSED') ?? getAsOnNum('INHOUSE_GREIGE_PASSED_MTRS');
      const inRejAsOn = getAsOnNum('INHOUSE_TOTAL_REJECTED') ?? getAsOnNum('INHOUSE_GREIGE_REJECTED_MTRS');
      const inRejPctAsOn = (inInspAsOn && inInspAsOn > 0 && inRejAsOn !== null) ? ((inRejAsOn / inInspAsOn) * 100).toFixed(2) + '%' : (inInspAsOn !== null && inRejAsOn === 0 ? '0.00%' : '');

      const vnInspAsOn = getAsOnNum('VENDOR_TOTAL_INSPECTED') ?? getAsOnNum('VENDOR_GREIGE_INSPECTED_MTRS');
      const vnPassAsOn = getAsOnNum('VENDOR_TOTAL_PASSED') ?? getAsOnNum('VENDOR_GREIGE_PASSED_MTRS');
      const vnRejAsOn = getAsOnNum('VENDOR_TOTAL_REJECTED') ?? getAsOnNum('VENDOR_GREIGE_REJECTED_MTRS');
      const vnRejPctAsOn = (vnInspAsOn && vnInspAsOn > 0 && vnRejAsOn !== null) ? ((vnRejAsOn / vnInspAsOn) * 100).toFixed(2) + '%' : (vnInspAsOn !== null && vnRejAsOn === 0 ? '0.00%' : '');

      const washTotAsOn = getAsOnNum('WASHING_TOTAL_MTRS');
      const washPassAsOn = getAsOnNum('WASHING_TOTAL_PASSED');
      const washRejAsOn = getAsOnNum('WASHING_TOTAL_REJECTED');
      const washRejPctAsOn = (washTotAsOn && washTotAsOn > 0 && washRejAsOn !== null) ? ((washRejAsOn / washTotAsOn) * 100).toFixed(2) + '%' : (washTotAsOn !== null && washRejAsOn === 0 ? '0.00%' : '');

      const hasAnyInspAsOn = (inInspAsOn !== null || vnInspAsOn !== null || washTotAsOn !== null);
      const totInspAsOn = hasAnyInspAsOn ? ((inInspAsOn || 0) + (vnInspAsOn || 0) + (washTotAsOn || 0)) : null;
      const hasAnyPassAsOn = (inPassAsOn !== null || vnPassAsOn !== null || washPassAsOn !== null);
      const totPassAsOn = hasAnyPassAsOn ? ((inPassAsOn || 0) + (vnPassAsOn || 0) + (washPassAsOn || 0)) : null;
      const hasAnyRejAsOn = (inRejAsOn !== null || vnRejAsOn !== null || washRejAsOn !== null);
      const totRejAsOn = hasAnyRejAsOn ? ((inRejAsOn || 0) + (vnRejAsOn || 0) + (washRejAsOn || 0)) : null;
      const rejPctAsOn = (totInspAsOn && totInspAsOn > 0 && totRejAsOn !== null) ? ((totRejAsOn / totInspAsOn) * 100).toFixed(2) + '%' : (totInspAsOn !== null && totRejAsOn === 0 ? '0.00%' : '');

      const finInspAsOn = getAsOnNum('FINISHED_INSPECTION_MTRS') ?? getAsOnNum('FINISHED_INSPECTED_MTRS') ?? getAsOnNum('FINISH_PRODN_MTRS');
      const procRejAsOn = getAsOnNum('PROCESSING_REJECTION_MTRS');
      const procRejPctAsOn = (finInspAsOn && finInspAsOn > 0 && procRejAsOn !== null) ? ((procRejAsOn / finInspAsOn) * 100).toFixed(2) + '%' : (finInspAsOn !== null && procRejAsOn === 0 ? '0.00%' : '');
      const venRejAsOn = getAsOnNum('VENDOR_REJECTION_MTRS');
      const venRejPctAsOn = (finInspAsOn && finInspAsOn > 0 && venRejAsOn !== null) ? ((venRejAsOn / finInspAsOn) * 100).toFixed(2) + '%' : (finInspAsOn !== null && venRejAsOn === 0 ? '0.00%' : '');
      const weavRejAsOn = getAsOnNum('WEAVING_REJECTION_MTRS');
      const weavRejPctAsOn = (finInspAsOn && finInspAsOn > 0 && weavRejAsOn !== null) ? ((weavRejAsOn / finInspAsOn) * 100).toFixed(2) + '%' : (finInspAsOn !== null && weavRejAsOn === 0 ? '0.00%' : '');
      const hasAnyRejFinAsOn = (procRejAsOn !== null || venRejAsOn !== null || weavRejAsOn !== null);
      const totRejFinAsOn = hasAnyRejFinAsOn ? ((procRejAsOn || 0) + (venRejAsOn || 0) + (weavRejAsOn || 0)) : null;
      const realPctAsOn = (finInspAsOn && finInspAsOn > 0 && totRejFinAsOn !== null) ? (Math.max(0, 100 - (totRejFinAsOn / finInspAsOn) * 100)).toFixed(2) + '%' : '';

      const procRewAsOn = getAsOnNum('PROCESSING_REWASH_MTRS') ?? getAsOnNum('PROC_REWASH_MTRS');
      const procRewPctAsOn = (finInspAsOn && finInspAsOn > 0 && procRewAsOn !== null) ? ((procRewAsOn / finInspAsOn) * 100).toFixed(2) + '%' : (finInspAsOn !== null && procRewAsOn === 0 ? '0.00%' : '');
      const venRewAsOn = getAsOnNum('VENDOR_REWASH_MTRS');
      const venRewPctAsOn = (finInspAsOn && finInspAsOn > 0 && venRewAsOn !== null) ? ((venRewAsOn / finInspAsOn) * 100).toFixed(2) + '%' : (finInspAsOn !== null && venRewAsOn === 0 ? '0.00%' : '');
      const hasAnyRewFinAsOn = (procRewAsOn !== null || venRewAsOn !== null);
      const totRewFinAsOn = hasAnyRewFinAsOn ? ((procRewAsOn || 0) + (venRewAsOn || 0)) : null;

      const salesRetAsOn = getAsOnNum('SALES_RETURN_MTRS') ?? getAsOnNum('SALES_RETURNS_MTRS');

      const giRowPairs = [
        { leftLabel: 'INHOUSE - TOTAL MTRS INSPECTED', leftAsOn: inInspAsOn !== null ? inInspAsOn : '', leftUpto: inInspU !== null ? inInspU : '', rightLabel: 'FINISHED INSPECTION MTRS', rightAsOn: finInspAsOn !== null ? finInspAsOn : '', rightUpto: finInspU !== null ? finInspU : '' },
        { leftLabel: 'INHOUSE - TOTAL MTRS PASSED', leftAsOn: inPassAsOn !== null ? inPassAsOn : '', leftUpto: inPassU !== null ? inPassU : '', rightLabel: 'REALISATION%', rightAsOn: realPctAsOn, rightUpto: realPctU },
        { leftLabel: 'INHOUSE - TOTAL MTRS REJECTED', leftAsOn: inRejAsOn !== null ? inRejAsOn : '', leftUpto: inRejU !== null ? inRejU : '', rightLabel: 'PROCESSING REJECTION MTRS', rightAsOn: procRejAsOn !== null ? procRejAsOn : '', rightUpto: procRejU !== null ? procRejU : '' },
        { leftLabel: 'INHOUSE - REJECTION %', leftAsOn: inRejPctAsOn, leftUpto: inRejPctU, rightLabel: 'REJECTION%', rightAsOn: procRejPctAsOn, rightUpto: procRejPctU },
        { leftLabel: 'VENDOR - TOTAL MTRS INSPECTED', leftAsOn: vnInspAsOn !== null ? vnInspAsOn : '', leftUpto: vnInspU !== null ? vnInspU : '', rightLabel: 'VENDOR REJECTION MTRS', rightAsOn: venRejAsOn !== null ? venRejAsOn : '', rightUpto: venRejU !== null ? venRejU : '' },
        { leftLabel: 'VENDOR - TOTAL MTRS PASSED', leftAsOn: vnPassAsOn !== null ? vnPassAsOn : '', leftUpto: vnPassU !== null ? vnPassU : '', rightLabel: 'REJECTION%', rightAsOn: venRejPctAsOn, rightUpto: venRejPctU },
        { leftLabel: 'VENDOR - TOTAL MTRS REJECTED', leftAsOn: vnRejAsOn !== null ? vnRejAsOn : '', leftUpto: vnRejU !== null ? vnRejU : '', rightLabel: 'WEAVING REJECTION MTRS', rightAsOn: weavRejAsOn !== null ? weavRejAsOn : '', rightUpto: weavRejU !== null ? weavRejU : '' },
        { leftLabel: 'VENDOR - REJECTION %', leftAsOn: vnRejPctAsOn, leftUpto: vnRejPctU, rightLabel: 'REJECTION %', rightAsOn: weavRejPctAsOn, rightUpto: weavRejPctU },
        { leftLabel: '', leftAsOn: '', leftUpto: '', rightLabel: 'TOTAL', rightAsOn: totRejFinAsOn !== null ? totRejFinAsOn : '', rightUpto: totRejFinU !== null ? totRejFinU : '', isRightBold: true },
        { leftLabel: 'WASHING-TOTAL MTRS', leftAsOn: washTotAsOn !== null ? washTotAsOn : '', leftUpto: washTotU !== null ? washTotU : '', rightLabel: 'PROCESSING REWASH MTRS', rightAsOn: procRewAsOn !== null ? procRewAsOn : '', rightUpto: procRewU !== null ? procRewU : '' },
        { leftLabel: 'WASHING-TOTAL PASSED', leftAsOn: washPassAsOn !== null ? washPassAsOn : '', leftUpto: washPassU !== null ? washPassU : '', rightLabel: 'REWASH%', rightAsOn: procRewPctAsOn, rightUpto: procRewPctU },
        { leftLabel: 'WASHING-TOTAL MTRS REJECTED', leftAsOn: washRejAsOn !== null ? washRejAsOn : '', leftUpto: washRejU !== null ? washRejU : '', rightLabel: 'VENDOR REWASH MTRS', rightAsOn: venRewAsOn !== null ? venRewAsOn : '', rightUpto: venRewU !== null ? venRewU : '' },
        { leftLabel: 'WASHING-REJECTION%', leftAsOn: washRejPctAsOn, leftUpto: washRejPctU, rightLabel: 'REWASH%', rightAsOn: venRewPctAsOn, rightUpto: venRewPctU },
        { leftLabel: '', leftAsOn: '', leftUpto: '', rightLabel: 'TOTAL', rightAsOn: totRewFinAsOn !== null ? totRewFinAsOn : '', rightUpto: totRewFinU !== null ? totRewFinU : '', isRightBold: true },
        { leftLabel: 'TOTAL MTRS INSPECTED', leftAsOn: totInspAsOn !== null ? totInspAsOn : '', leftUpto: totInspU !== null ? totInspU : '', rightLabel: 'SALES RETURNS', rightAsOn: salesRetAsOn !== null ? salesRetAsOn : '', rightUpto: '', isLeftBold: true },
        { leftLabel: 'TOTAL MTRS PASSED', leftAsOn: totPassAsOn !== null ? totPassAsOn : '', leftUpto: totPassU !== null ? totPassU : '', rightLabel: '', rightAsOn: '', rightUpto: '', isLeftBold: true },
        { leftLabel: 'TOTAL MTRS REJECTED', leftAsOn: totRejAsOn !== null ? totRejAsOn : '', leftUpto: totRejU !== null ? totRejU : '', rightLabel: 'REMARKS', rightAsOn: '', rightUpto: '', isLeftBold: true, isRightHeader: true },
        { leftLabel: 'REJECTION %', leftAsOn: rejPctAsOn, leftUpto: rejPctU, rightLabel: '', rightAsOn: '', rightUpto: '', isLeftBold: true },
      ];

      const giStart = r1;
      setCell(ws1, giStart, 0, 4, styleCellCenterBold);
      setCell(ws1, giStart, 1, 'GREIGE INSPECTION', styleCellCenterBold);
      setCell(ws1, giStart, 2, mastersMap['GREIGE_INSPECTION']?.head || 'GUNASEKARAN', styleCellCenterBold);
      setCell(ws1, giStart, 3, mastersMap['GREIGE_INSPECTION']?.mentor || 'M.RAMESH', styleCellCenterBold);
      setCell(ws1, giStart, 4, 'GREIGE FABRIC', styleHdrYellow);
      merges1.push({ s: { r: giStart, c: 4 }, e: { r: giStart, c: 6 } });
      applyMergeWithBorders(ws1, giStart, 4, giStart, 6, styleHdrYellow);

      setCell(ws1, giStart, 7, 'FINISHED FABRIC', styleHdrYellow);
      merges1.push({ s: { r: giStart, c: 7 }, e: { r: giStart, c: 9 } });
      applyMergeWithBorders(ws1, giStart, 7, giStart, 9, styleHdrYellow);
      r1++;

      setCell(ws1, r1, 4, 'DETAILS', styleHdrYellow);
      setCell(ws1, r1, 5, 'AS ON DATE', styleHdrYellow);
      setCell(ws1, r1, 6, 'UP TO DATE', styleHdrYellow);
      setCell(ws1, r1, 7, 'DETAILS', styleHdrYellow);
      setCell(ws1, r1, 8, 'AS ON DATE', styleHdrYellow);
      setCell(ws1, r1, 9, 'UP TO DATE', styleHdrYellow);
      r1++;

      giRowPairs.forEach((r, idx) => {
        const curR = r1 + idx;
        setCell(ws1, curR, 4, r.leftLabel, r.isLeftBold ? styleCellLeftBold : styleCellLeft);
        setCell(ws1, curR, 5, r.leftAsOn, r.isLeftBold ? styleCellCenterBold : styleCellCenter);
        setCell(ws1, curR, 6, r.leftUpto, r.isLeftBold ? styleCellCenterBold : styleCellCenter);
        setCell(ws1, curR, 7, r.rightLabel, r.isRightHeader ? styleHdrYellow : (r.isRightBold ? styleCellLeftBold : styleCellLeft));
        setCell(ws1, curR, 8, r.rightAsOn, r.isRightBold ? styleCellCenterBold : styleCellCenter);
        setCell(ws1, curR, 9, r.rightUpto, r.isRightBold ? styleCellCenterBold : styleCellCenter);
      });
      const giTotalRows = 2 + giRowPairs.length;
      merges1.push({ s: { r: giStart, c: 0 }, e: { r: giStart + giTotalRows - 1, c: 0 } });
      applyMergeWithBorders(ws1, giStart, 0, giStart + giTotalRows - 1, 0, styleCellCenterBold);
      merges1.push({ s: { r: giStart, c: 1 }, e: { r: giStart + giTotalRows - 1, c: 1 } });
      applyMergeWithBorders(ws1, giStart, 1, giStart + giTotalRows - 1, 1, styleCellCenterBold);
      merges1.push({ s: { r: giStart, c: 2 }, e: { r: giStart + giTotalRows - 1, c: 2 } });
      applyMergeWithBorders(ws1, giStart, 2, giStart + giTotalRows - 1, 2, styleCellCenterBold);
      merges1.push({ s: { r: giStart, c: 3 }, e: { r: giStart + giTotalRows - 1, c: 3 } });
      applyMergeWithBorders(ws1, giStart, 3, giStart + giTotalRows - 1, 3, styleCellCenterBold);
      r1 += giRowPairs.length;

      // 5. MENDING (11 rows)
      const wIn_asOn = getAsOnNum('WEAVING_INHOUSE_MTRS');
      const wVen_asOn = getAsOnNum('WEAVING_VENDOR_MTRS');
      const totW_asOn = (wIn_asOn !== null || wVen_asOn !== null) ? ((wIn_asOn || 0) + (wVen_asOn || 0)) : null;

      const yIn_asOn = getAsOnNum('YARN_INHOUSE_MTRS');
      const yVen_asOn = getAsOnNum('YARN_VENDOR_MTRS');
      const totY_asOn = (yIn_asOn !== null || yVen_asOn !== null) ? ((yIn_asOn || 0) + (yVen_asOn || 0)) : null;

      const sIn_asOn = getAsOnNum('SIZING_INHOUSE_MTRS');
      const sVen_asOn = getAsOnNum('SIZING_VENDOR_MTRS');
      const p_asOn = getAsOnNum('PROCESSING_MTRS');
      const hasAnyMendAsOn = (totW_asOn !== null || totY_asOn !== null || sIn_asOn !== null || sVen_asOn !== null || p_asOn !== null);
      const grand_asOn = hasAnyMendAsOn ? ((totW_asOn || 0) + (totY_asOn || 0) + (sIn_asOn || 0) + (sVen_asOn || 0) + (p_asOn || 0)) : null;

      const wIn_u = mSummaries.find(m => m.metric_code === 'WEAVING_INHOUSE_MTRS')?.monthlyTotal ?? null;
      const wVen_u = mSummaries.find(m => m.metric_code === 'WEAVING_VENDOR_MTRS')?.monthlyTotal ?? null;
      const totW_u = (wIn_u !== null || wVen_u !== null) ? ((wIn_u || 0) + (wVen_u || 0)) : null;

      const yIn_u = mSummaries.find(m => m.metric_code === 'YARN_INHOUSE_MTRS')?.monthlyTotal ?? null;
      const yVen_u = mSummaries.find(m => m.metric_code === 'YARN_VENDOR_MTRS')?.monthlyTotal ?? null;
      const totY_u = (yIn_u !== null || yVen_u !== null) ? ((yIn_u || 0) + (yVen_u || 0)) : null;

      const sIn_u = mSummaries.find(m => m.metric_code === 'SIZING_INHOUSE_MTRS')?.monthlyTotal ?? null;
      const sVen_u = mSummaries.find(m => m.metric_code === 'SIZING_VENDOR_MTRS')?.monthlyTotal ?? null;
      const p_u = mSummaries.find(m => m.metric_code === 'PROCESSING_MTRS')?.monthlyTotal ?? null;
      const hasAnyMendU = (totW_u !== null || totY_u !== null || sIn_u !== null || sVen_u !== null || p_u !== null);
      const grand_u = hasAnyMendU ? ((totW_u || 0) + (totY_u || 0) + (sIn_u || 0) + (sVen_u || 0) + (p_u || 0)) : null;

      const calcMendPctExcel = (val: number | null, base: number | null): string => {
        if (val === null || base === null || base <= 0) return '';
        return ((val / base) * 100).toFixed(2) + '%';
      };

      const mendingRows = [
        { label: 'WEAVING- (INHOUSE)', asOn: wIn_asOn, upto: wIn_u, pct: calcMendPctExcel(wIn_asOn, inInspAsOn) },
        { label: 'WEAVING-(VENDOR)', asOn: wVen_asOn, upto: wVen_u, pct: calcMendPctExcel(wVen_asOn, vnInspAsOn) },
        { label: 'TOTAL', asOn: totW_asOn, upto: totW_u, pct: calcMendPctExcel(totW_asOn, totInspAsOn), isBold: true },
        { label: 'YARN-(INHOUSE)', asOn: yIn_asOn, upto: yIn_u, pct: calcMendPctExcel(yIn_asOn, inInspAsOn) },
        { label: 'YARN-(VENDOR)', asOn: yVen_asOn, upto: yVen_u, pct: calcMendPctExcel(yVen_asOn, vnInspAsOn) },
        { label: 'TOTAL', asOn: totY_asOn, upto: totY_u, pct: calcMendPctExcel(totY_asOn, totInspAsOn), isBold: true },
        { label: 'SIZING - (INHOUSE)', asOn: sIn_asOn, upto: sIn_u, pct: calcMendPctExcel(sIn_asOn, inInspAsOn) },
        { label: 'SIZING - (VENDOR)', asOn: sVen_asOn, upto: sVen_u, pct: calcMendPctExcel(sVen_asOn, vnInspAsOn) },
        { label: 'PROCESSING', asOn: p_asOn, upto: p_u, pct: calcMendPctExcel(p_asOn, finInspAsOn) },
        { label: 'TOTAL', asOn: grand_asOn, upto: grand_u, pct: calcMendPctExcel(grand_asOn, totInspAsOn), isBold: true }
      ];

      const mStart = r1;
      setCell(ws1, mStart, 0, 5, styleCellCenterBold);
      setCell(ws1, mStart, 1, 'MENDING', styleCellCenterBold);
      setCell(ws1, mStart, 2, mastersMap['MENDING']?.head || 'GUNASEKARAN', styleCellCenterBold);
      setCell(ws1, mStart, 3, mastersMap['MENDING']?.mentor || 'MATHESHWARAN', styleCellCenterBold);
      setCell(ws1, mStart, 4, '', styleHdrYellow);
      setCell(ws1, mStart, 5, 'AS ON DATE', styleHdrYellow);
      setCell(ws1, mStart, 6, 'UP TO DATE', styleHdrYellow);
      setCell(ws1, mStart, 7, '%', styleHdrYellow);
      setCell(ws1, mStart, 8, '', styleHdrYellow);
      setCell(ws1, mStart, 9, '', styleHdrYellow);
      merges1.push({ s: { r: mStart, c: 7 }, e: { r: mStart, c: 9 } });
      applyMergeWithBorders(ws1, mStart, 7, mStart, 9, styleHdrYellow);

      mendingRows.forEach((mr, idx) => {
        const curR = mStart + 1 + idx;
        setCell(ws1, curR, 4, mr.label, mr.isBold ? styleCellLeftBold : styleCellLeft);
        setCell(ws1, curR, 5, mr.asOn !== null ? mr.asOn : '', mr.isBold ? styleCellCenterBold : styleCellCenter);
        setCell(ws1, curR, 6, mr.upto !== null ? mr.upto : '', mr.isBold ? styleCellCenterBold : styleCellCenter);
        setCell(ws1, curR, 7, mr.pct, mr.isBold ? styleCellCenterBold : styleCellCenter);
        setCell(ws1, curR, 8, '', styleCellCenter);
        setCell(ws1, curR, 9, '', styleCellCenter);
        merges1.push({ s: { r: curR, c: 7 }, e: { r: curR, c: 9 } });
        applyMergeWithBorders(ws1, curR, 7, curR, 9, mr.isBold ? styleCellCenterBold : styleCellCenter);
      });
      merges1.push({ s: { r: mStart, c: 0 }, e: { r: mStart + 10, c: 0 } });
      applyMergeWithBorders(ws1, mStart, 0, mStart + 10, 0, styleCellCenterBold);
      merges1.push({ s: { r: mStart, c: 1 }, e: { r: mStart + 10, c: 1 } });
      applyMergeWithBorders(ws1, mStart, 1, mStart + 10, 1, styleCellCenterBold);
      merges1.push({ s: { r: mStart, c: 2 }, e: { r: mStart + 10, c: 2 } });
      applyMergeWithBorders(ws1, mStart, 2, mStart + 10, 2, styleCellCenterBold);
      merges1.push({ s: { r: mStart, c: 3 }, e: { r: mStart + 10, c: 3 } });
      applyMergeWithBorders(ws1, mStart, 3, mStart + 10, 3, styleCellCenterBold);
      r1 += 11;

      // 6. PROCESSING (Stock with NO OF DAYS + OTD Table) (8 rows)
      const gStock = getNum('GREIGE_FABRIC_STOCK_MTRS');
      const ydStock = getNum('YARN_DYED_FABRIC_STOCK_MTRS');
      const totStock = (gStock !== null || ydStock !== null) ? ((gStock || 0) + (ydStock || 0)) : null;

      const curDateColHdr = (() => {
        if (!printToDate) return 'On Date';
        const parts = printToDate.split('-');
        if (parts.length === 3) {
          const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          const mIdx = parseInt(parts[1], 10) - 1;
          return `${parts[2]}-${months[mIdx] || parts[1]}`;
        }
        return printToDate;
      })();

      const otdItems = [
        { dept: 'Greige Yarn', d1: getVal('OTT_GREIGE_YARN') || getVal('OTD_GREIGE_YARN') || '', d2: '' },
        { dept: 'Dyed Yarn', d1: getVal('OTT_DYED_YARN') || getVal('OTD_DYED_YARN') || '', d2: '' },
        { dept: 'Sizing', d1: getVal('OTT_SIZING') || getVal('OTD_SIZING') || '', d2: '' },
        { dept: 'Greige WareHouse', d1: getVal('OTT_GREIGE_WAREHOUSE') || getVal('OTD_GREIGE_WAREHOUSE') || '', d2: '' },
        { dept: 'Processing', d1: getVal('OTT_PROCESSING') || getVal('OTD_PROCESSING') || '', d2: '' },
        { dept: 'Finished WareHouse', d1: getVal('OTT_FINISHED_WAREHOUSE') || getVal('OTD_FINISHED_WAREHOUSE') || '', d2: '' },
        { dept: 'Final Dispatch', d1: getVal('OTT_FINAL_DISPATCH') || getVal('OTD_FINAL_DISPATCH') || '', d2: '' },
      ];

      const prStart = r1;
      setCell(ws1, prStart, 0, 6, styleCellCenterBold);
      setCell(ws1, prStart, 1, 'PROCESSING', styleCellCenterBold);
      setCell(ws1, prStart, 2, mastersMap['PROCESSING']?.head || 'NATESAN', styleCellCenterBold);
      setCell(ws1, prStart, 3, mastersMap['PROCESSING']?.mentor || 'NATESAN', styleCellCenterBold);
      setCell(ws1, prStart, 4, '', styleHdrYellow);
      setCell(ws1, prStart, 5, 'QTY', styleHdrYellow);
      setCell(ws1, prStart, 6, 'NO OF DAYS', styleHdrYellow);
      setCell(ws1, prStart, 7, 'Departments Wise Pending', styleHdrOrangeLeft);
      setCell(ws1, prStart, 8, curDateColHdr, styleHdrOrange);
      setCell(ws1, prStart, 9, '-', styleHdrOrange);

      const savedNoOfDays = getVal('NO_OF_DAYS');
      const dispTotalDaysExcel = (savedNoOfDays !== undefined && savedNoOfDays !== null && savedNoOfDays !== '') ? savedNoOfDays : (totStock !== null ? calcNoOfDaysExcel(totStock) : '');

      const procStockRows = [
        { label: 'GREIGE FABRIC STOCK', q: gStock !== null ? gStock : '', d: calcNoOfDaysExcel(gStock) },
        { label: 'YARN DYED FABRIC STOCK', q: ydStock !== null ? ydStock : '', d: calcNoOfDaysExcel(ydStock) },
        { label: 'TOTAL', q: totStock !== null ? totStock : '', d: dispTotalDaysExcel, isBold: true }
      ];

      for (let i = 0; i < 7; i++) {
        const curR = prStart + 1 + i;
        if (i < 3) {
          const ps = procStockRows[i];
          setCell(ws1, curR, 4, ps.label, ps.isBold ? styleCellLeftBold : styleCellLeft);
          setCell(ws1, curR, 5, ps.q, ps.isBold ? styleCellCenterBold : styleCellCenter);
          setCell(ws1, curR, 6, ps.d, ps.isBold ? styleCellCenterBold : styleCellCenter);
        } else {
          setCell(ws1, curR, 4, '', styleCellLeft);
          setCell(ws1, curR, 5, '', styleCellCenter);
          setCell(ws1, curR, 6, '', styleCellCenter);
        }
        const otd = otdItems[i];
        setCell(ws1, curR, 7, otd.dept, styleCellLeftBold);
        setCell(ws1, curR, 8, otd.d1, styleCellCenter);
        setCell(ws1, curR, 9, otd.d2, styleCellCenter);
      }

      merges1.push({ s: { r: prStart, c: 0 }, e: { r: prStart + 7, c: 0 } });
      applyMergeWithBorders(ws1, prStart, 0, prStart + 7, 0, styleCellCenterBold);
      merges1.push({ s: { r: prStart, c: 1 }, e: { r: prStart + 7, c: 1 } });
      applyMergeWithBorders(ws1, prStart, 1, prStart + 7, 1, styleCellCenterBold);
      merges1.push({ s: { r: prStart, c: 2 }, e: { r: prStart + 7, c: 2 } });
      applyMergeWithBorders(ws1, prStart, 2, prStart + 7, 2, styleCellCenterBold);
      merges1.push({ s: { r: prStart, c: 3 }, e: { r: prStart + 7, c: 3 } });
      applyMergeWithBorders(ws1, prStart, 3, prStart + 7, 3, styleCellCenterBold);
      r1 += 8;

      // 7. RAW MATERIAL (6 rows)
      const gTot = getAsOnVal('GREIGE_TOTAL_ORDERS');
      const gComp = getAsOnVal('GREIGE_YARN_COMPLETED');
      const gNot = getAsOnVal('GREIGE_NOT_COMPLETED');
      const gOn = getAsOnVal('GREIGE_ONTIME');
      const gDel = getAsOnVal('GREIGE_DELAY');

      const dTot = getAsOnVal('DYED_TOTAL_ORDERS');
      const dComp = getAsOnVal('DYED_YARN_COMPLETED');
      const dNot = getAsOnVal('DYED_NOT_COMPLETED');
      const dOn = getAsOnVal('DYED_ONTIME');
      const dDel = getAsOnVal('DYED_DELAY');

      const rmStart = r1;
      setCell(ws1, rmStart, 0, 7, styleCellCenterBold);
      setCell(ws1, rmStart, 1, 'RAW MATERIAL', styleCellCenterBold);
      setCell(ws1, rmStart, 2, mastersMap['RAW_MATERIAL']?.head || 'VENKAT', styleCellCenterBold);
      setCell(ws1, rmStart, 3, mastersMap['RAW_MATERIAL']?.mentor || 'MOHANA /CHANDRU', styleCellCenterBold);
      setCell(ws1, rmStart, 4, '', styleHdrYellow);
      setCell(ws1, rmStart, 5, 'GREY', styleHdrYellow);
      setCell(ws1, rmStart, 6, 'YD', styleHdrYellow);
      setCell(ws1, rmStart, 7, '', styleHdrYellow);
      merges1.push({ s: { r: rmStart, c: 7 }, e: { r: rmStart, c: 9 } });
      applyMergeWithBorders(ws1, rmStart, 7, rmStart, 9, styleHdrYellow);

      const rmRows = [
        { label: 'TOTAL NO OF ORDERS', v1: gTot, v2: dTot },
        { label: 'YARN COMPLETED',     v1: gComp, v2: dComp },
        { label: 'NOT COMPLETED',      v1: gNot, v2: dNot },
        { label: 'ONTIME',             v1: gOn, v2: dOn },
        { label: 'DELAY',              v1: gDel, v2: dDel },
      ];
      rmRows.forEach((rm, idx) => {
        const curR = rmStart + 1 + idx;
        setCell(ws1, curR, 4, rm.label, styleCellLeftBold);
        setCell(ws1, curR, 5, rm.v1, styleCellCenter);
        setCell(ws1, curR, 6, rm.v2, styleCellCenter);
        setCell(ws1, curR, 7, '', styleCellCenter);
        merges1.push({ s: { r: curR, c: 7 }, e: { r: curR, c: 9 } });
        applyMergeWithBorders(ws1, curR, 7, curR, 9, styleCellCenter);
      });
      merges1.push({ s: { r: rmStart, c: 0 }, e: { r: rmStart + 5, c: 0 } });
      applyMergeWithBorders(ws1, rmStart, 0, rmStart + 5, 0, styleCellCenterBold);
      merges1.push({ s: { r: rmStart, c: 1 }, e: { r: rmStart + 5, c: 1 } });
      applyMergeWithBorders(ws1, rmStart, 1, rmStart + 5, 1, styleCellCenterBold);
      merges1.push({ s: { r: rmStart, c: 2 }, e: { r: rmStart + 5, c: 2 } });
      applyMergeWithBorders(ws1, rmStart, 2, rmStart + 5, 2, styleCellCenterBold);
      merges1.push({ s: { r: rmStart, c: 3 }, e: { r: rmStart + 5, c: 3 } });
      applyMergeWithBorders(ws1, rmStart, 3, rmStart + 5, 3, styleCellCenterBold);
      r1 += 6;

      // 8. GREY WAREHOUSE (4 rows)
      const gwProdnG = getAsOnNum('TOTAL_PRODN_GREIGE');
      const gwProdnF = getAsOnNum('TOTAL_PRODN_FINISH');
      const gwOut = getAsOnNum('GREIGE_YD_OUTWARD');

      const gwProdnG_u = mSummaries.find(m => m.metric_code === 'TOTAL_PRODN_GREIGE' || m.metric_code === 'GREIGE_PRODUCTION_MTRS' || m.metric_code === 'GREIGE_PRODN_MTRS')?.monthlyTotal ?? null;
      const gwProdnF_u = mSummaries.find(m => m.metric_code === 'TOTAL_PRODN_FINISH' || m.metric_code === 'FINISH_PRODUCTION_MTRS' || m.metric_code === 'FINISH_PRODN_MTRS')?.monthlyTotal ?? null;
      const gwOut_u = mSummaries.find(m => m.metric_code === 'GREIGE_YD_OUTWARD' || m.metric_code === 'GREIGE_YD_OUTWARD_MTRS')?.monthlyTotal ?? null;

      const gwStart = r1;
      setCell(ws1, gwStart, 0, 8, styleCellCenterBold);
      setCell(ws1, gwStart, 1, 'GREY WAREHOUSE', styleCellCenterBold);
      setCell(ws1, gwStart, 2, mastersMap['GREY_WAREHOUSE']?.head || 'GUNASEKARAN', styleCellCenterBold);
      setCell(ws1, gwStart, 3, mastersMap['GREY_WAREHOUSE']?.mentor || 'M.RAMESH / VIVEK', styleCellCenterBold);
      setCell(ws1, gwStart, 4, '', styleHdrYellow);
      setCell(ws1, gwStart, 5, 'AS ON DATE', styleHdrYellow);
      setCell(ws1, gwStart, 6, 'UP TO DATE', styleHdrYellow);
      setCell(ws1, gwStart, 7, '', styleHdrYellow);
      merges1.push({ s: { r: gwStart, c: 7 }, e: { r: gwStart, c: 9 } });
      applyMergeWithBorders(ws1, gwStart, 7, gwStart, 9, styleHdrYellow);

      const gwRows = [
        { label: 'TOTAL PRODN-GREIGE', asOn: gwProdnG !== null ? gwProdnG : '', upto: gwProdnG_u !== null ? gwProdnG_u : '' },
        { label: 'TOTAL PRODN-FINISH', asOn: gwProdnF !== null ? gwProdnF : '', upto: gwProdnF_u !== null ? gwProdnF_u : '' },
        { label: 'GREIGE & YD OUTWARD', asOn: gwOut !== null ? gwOut : '', upto: gwOut_u !== null ? gwOut_u : '' },
      ];
      gwRows.forEach((gw, idx) => {
        const curR = gwStart + 1 + idx;
        setCell(ws1, curR, 4, gw.label, styleCellLeftBold);
        setCell(ws1, curR, 5, gw.asOn, styleCellCenter);
        setCell(ws1, curR, 6, gw.upto, styleCellCenter);
        setCell(ws1, curR, 7, '', styleCellCenter);
        merges1.push({ s: { r: curR, c: 7 }, e: { r: curR, c: 9 } });
        applyMergeWithBorders(ws1, curR, 7, curR, 9, styleCellCenter);
      });
      merges1.push({ s: { r: gwStart, c: 0 }, e: { r: gwStart + 3, c: 0 } });
      applyMergeWithBorders(ws1, gwStart, 0, gwStart + 3, 0, styleCellCenterBold);
      merges1.push({ s: { r: gwStart, c: 1 }, e: { r: gwStart + 3, c: 1 } });
      applyMergeWithBorders(ws1, gwStart, 1, gwStart + 3, 1, styleCellCenterBold);
      merges1.push({ s: { r: gwStart, c: 2 }, e: { r: gwStart + 3, c: 2 } });
      applyMergeWithBorders(ws1, gwStart, 2, gwStart + 3, 2, styleCellCenterBold);
      merges1.push({ s: { r: gwStart, c: 3 }, e: { r: gwStart + 3, c: 3 } });
      applyMergeWithBorders(ws1, gwStart, 3, gwStart + 3, 3, styleCellCenterBold);
      r1 += 4;

      // 9. HRD (5 rows)
      const engStr = getNum('ENGAGED_STRENGTH');
      const excess = (engStr !== null && engStr !== undefined) ? (engStr - 510) : null;
      const newJoiners = getNum('NO_OF_NEW_JOINERS');
      const hrdOthers = getNum('HRD_OTHERS') ?? getNum('OTHERS_MANPOWER');

      const hrdRows = [
        { label: 'APPROVED STRENGTH', val: 510, isBold: false },
        { label: 'ENGAGED STRENGTH',  val: engStr !== null ? engStr : '', isBold: false },
        { label: 'EXCESS',            val: excess !== null ? excess : '', isBold: true },
        { label: 'NO OF NEW JOINERS', val: newJoiners !== null ? newJoiners : '', isBold: false },
        { label: 'OTHERS',            val: hrdOthers !== null ? hrdOthers : '', isBold: false },
      ];
      const hStart = r1;
      hrdRows.forEach((hr, idx) => {
        const curR = hStart + idx;
        if (idx === 0) {
          setCell(ws1, curR, 0, 9, styleCellCenterBold);
          setCell(ws1, curR, 1, 'HRD', styleCellCenterBold);
          setCell(ws1, curR, 2, mastersMap['HRD']?.head || 'JAYANTH', styleCellCenterBold);
          setCell(ws1, curR, 3, mastersMap['HRD']?.mentor || 'MOHAN', styleCellCenterBold);
        }
        setCell(ws1, curR, 4, hr.label, hr.isBold ? styleCellLeftBold : styleCellLeft);
        setCell(ws1, curR, 5, hr.val, hr.isBold ? styleCellCenterBold : styleCellCenter);
        setCell(ws1, curR, 6, '', styleCellCenter);
        merges1.push({ s: { r: curR, c: 6 }, e: { r: curR, c: 9 } });
        applyMergeWithBorders(ws1, curR, 6, curR, 9, styleCellCenter);
      });
      merges1.push({ s: { r: hStart, c: 0 }, e: { r: hStart + 4, c: 0 } });
      applyMergeWithBorders(ws1, hStart, 0, hStart + 4, 0, styleCellCenterBold);
      merges1.push({ s: { r: hStart, c: 1 }, e: { r: hStart + 4, c: 1 } });
      applyMergeWithBorders(ws1, hStart, 1, hStart + 4, 1, styleCellCenterBold);
      merges1.push({ s: { r: hStart, c: 2 }, e: { r: hStart + 4, c: 2 } });
      applyMergeWithBorders(ws1, hStart, 2, hStart + 4, 2, styleCellCenterBold);
      merges1.push({ s: { r: hStart, c: 3 }, e: { r: hStart + 4, c: 3 } });
      applyMergeWithBorders(ws1, hStart, 3, hStart + 4, 3, styleCellCenterBold);
      r1 += 5;

      // Footer Row
      setCell(ws1, r1, 0, 'Santhi Processing Unit Pvt. Ltd. — Confidential Factory Production Report', {
        font: { name: 'Arial', sz: 7, italic: true, color: { rgb: '555555' } },
        alignment: { horizontal: 'left', vertical: 'center' }
      });
      merges1.push({ s: { r: r1, c: 0 }, e: { r: r1, c: 6 } });
      applyMergeWithBorders(ws1, r1, 0, r1, 6);

      setCell(ws1, r1, 7, 'Page 1 of 2', {
        font: { name: 'Arial', sz: 7, bold: true, color: { rgb: '555555' } },
        alignment: { horizontal: 'center', vertical: 'center' }
      });
      merges1.push({ s: { r: r1, c: 7 }, e: { r: r1, c: 9 } });
      applyMergeWithBorders(ws1, r1, 7, r1, 9);
      r1++;

      ws1['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: r1 - 1, c: 9 } });
      ws1['!merges'] = merges1;
      ws1['!cols'] = [
        { wch: 5 }, { wch: 14 }, { wch: 15 }, { wch: 16 }, { wch: 28 },
        { wch: 14 }, { wch: 14 }, { wch: 28 }, { wch: 14 }, { wch: 14 }
      ];
      ws1['!pageSetup'] = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 1 };
      ws1['!margins'] = { left: 0.25, right: 0.25, top: 0.25, bottom: 0.25, header: 0.1, footer: 0.1 };

      XLSX.utils.book_append_sheet(wb, ws1, 'Plant_Snapshot');

      // ── SHEET 2: EXECUTIVE SUMMARY (PAGE 2) ──
      const ws2: any = {};
      const merges2: any[] = [];
      let r2 = 0;

      // Header Row 0: Company Name & Date
      setCell(ws2, r2, 0, 'SANTHI PROCESSING UNIT PVT. LTD.', {
        font: { name: 'Arial', sz: 12, bold: true, color: { rgb: '000000' } },
        alignment: { horizontal: 'left', vertical: 'center' }
      });
      merges2.push({ s: { r: r2, c: 0 }, e: { r: r2, c: 11 } });
      applyMergeWithBorders(ws2, r2, 0, r2, 11);

      setCell(ws2, r2, 12, `DATE: ${dateRangeLabel}`, {
        font: { name: 'Arial', sz: 8.5, bold: true, color: { rgb: '000000' } },
        fill: { fgColor: { rgb: 'FEF08A' } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: borderThin
      });
      merges2.push({ s: { r: r2, c: 12 }, e: { r: r2, c: 15 } });
      applyMergeWithBorders(ws2, r2, 12, r2, 15, {
        font: { name: 'Arial', sz: 8.5, bold: true, color: { rgb: '000000' } },
        fill: { fgColor: { rgb: 'FEF08A' } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: borderThin
      });
      r2++;

      // Header Row 1: Subtitle & Page No
      setCell(ws2, r2, 0, 'DAILY MEETING PRODUCTION TARGETS — EXECUTIVE SUMMARY', {
        font: { name: 'Arial', sz: 9, bold: true, color: { rgb: '222222' } },
        alignment: { horizontal: 'left', vertical: 'center' }
      });
      merges2.push({ s: { r: r2, c: 0 }, e: { r: r2, c: 11 } });
      applyMergeWithBorders(ws2, r2, 0, r2, 11);

      setCell(ws2, r2, 12, 'Page 2 of 2', {
        font: { name: 'Arial', sz: 7.5, bold: true, color: { rgb: '555555' } },
        alignment: { horizontal: 'center', vertical: 'center' }
      });
      merges2.push({ s: { r: r2, c: 12 }, e: { r: r2, c: 15 } });
      applyMergeWithBorders(ws2, r2, 12, r2, 15);
      r2++;

      // Header Row 2: Monthly Target Lacs Bar
      setCell(ws2, r2, 0, 'Monthly Target Lacs', styleHdrYellowLeft);
      merges2.push({ s: { r: r2, c: 0 }, e: { r: r2, c: 1 } });
      applyMergeWithBorders(ws2, r2, 0, r2, 1, styleHdrYellowLeft);

      setCell(ws2, r2, 2, '18.70', styleHdrYellow);
      setCell(ws2, r2, 3, '13.72', styleHdrYellow);
      setCell(ws2, r2, 4, '4.98', styleHdrYellow);
      setCell(ws2, r2, 5, '0.60', styleHdrYellow);
      setCell(ws2, r2, 6, '0.44', styleHdrYellow);
      setCell(ws2, r2, 7, '0.16', styleHdrYellow);

      setCell(ws2, r2, 8, 'Avg/Day', styleHdrYellow);
      merges2.push({ s: { r: r2, c: 8 }, e: { r: r2, c: 9 } });
      applyMergeWithBorders(ws2, r2, 8, r2, 9, styleHdrYellow);

      setCell(ws2, r2, 10, 'UP TO DATE / DAY / AVG', styleHdrYellow);
      merges2.push({ s: { r: r2, c: 10 }, e: { r: r2, c: 15 } });
      applyMergeWithBorders(ws2, r2, 10, r2, 15, styleHdrYellow);
      r2++;

      // Header Row 3: 16 Table Column Headers
      const p2Headers = [
        'S.NO', 'DEPARTMENT', 'HEAD', 'MENTOR', 'NAME',
        'TARGET', 'ACTUAL', 'DIFF', '%', 'PERF',
        'UPTO DATE', 'AVERAGE', 'DEVI', '%', '% AVG', 'RANK'
      ];
      for (let c = 0; c < 16; c++) {
        setCell(ws2, r2, c, p2Headers[c], styleHdrYellow);
      }
      r2++;

      // 30 Daily Meeting Rows
      const tableStartRow = r2;
      dailyMeetingRows.forEach((r, idx) => {
        const curRow = tableStartRow + idx;
        const target = getNum(r.code + '_TARGET') ?? (r.defaultTarget > 0 ? r.defaultTarget : null);
        const actual = getNum(r.code);
        const diff = (actual !== null && target !== null) ? (actual - target) : null;
        const pct = (actual !== null && target && target > 0) ? `${Math.round((actual / target) * 100)}%` : '';
        const codesToTry = [r.code, ...(METRIC_CODE_ALIASES[r.code] || [])];
        const upto = mSummaries.find(m => codesToTry.includes(m.metric_code))?.monthlyTotal ?? null;
        const avg = upto !== null ? Math.round(upto / 31) : null;
        const devi = (avg !== null && target !== null) ? (avg - target) : null;
        const deviPct = (avg !== null && target && target > 0) ? `${Math.round(((avg - target) / target) * 100)}%` : '';

        // Determine perf style if department overall perf color exists
        const perfColorHex = r.overallPerfColor ? r.overallPerfColor.replace('#', '').toUpperCase() : 'FFFFFF';
        const perfStyle = {
          font: { name: 'Arial', sz: 7.5, bold: true, color: { rgb: '000000' } },
          fill: { fgColor: { rgb: perfColorHex } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: borderThin
        };

        // Col 0: S.NO
        setCell(ws2, curRow, 0, r.sno !== undefined ? r.sno : '', styleCellCenterBold);
        // Col 1: DEPARTMENT
        setCell(ws2, curRow, 1, r.dept || '', styleCellCenterBold);
        // Col 2: HEAD
        setCell(ws2, curRow, 2, r.head || '', styleCellCenterBold);
        // Col 3: MENTOR
        setCell(ws2, curRow, 3, r.mentor || '', styleCellCenterBold);
        // Col 4: NAME
        setCell(ws2, curRow, 4, r.name, styleCellCenterBold);
        // Col 5: TARGET
        setCell(ws2, curRow, 5, target !== null ? target : '', styleCellCenter);
        // Col 6: ACTUAL
        setCell(ws2, curRow, 6, actual !== null ? actual : '', styleCellCenter);
        // Col 7: DIFF (colored green / red)
        const diffStyle = diff !== null && diff > 0 ? styleCellDiffPos : (diff !== null && diff < 0 ? styleCellDiffNeg : styleCellCenter);
        setCell(ws2, curRow, 7, diff !== null ? (diff > 0 ? `+${diff}` : diff) : '', diffStyle);
        // Col 8: %
        setCell(ws2, curRow, 8, pct, styleCellCenter);
        // Col 9: PERF
        setCell(ws2, curRow, 9, r.perfScore > 0 ? r.perfScore : '', styleCellCenter);
        // Col 10: UPTO DATE
        setCell(ws2, curRow, 10, upto !== null ? upto : '', styleCellCenter);
        // Col 11: AVERAGE
        setCell(ws2, curRow, 11, avg !== null ? avg : '', styleCellCenter);
        // Col 12: DEVI (colored green / red)
        const deviStyle = devi !== null && devi > 0 ? styleCellDiffPos : (devi !== null && devi < 0 ? styleCellDiffNeg : styleCellCenter);
        setCell(ws2, curRow, 12, devi !== null ? (devi > 0 ? `+${devi}` : devi) : '', deviStyle);
        // Col 13: %
        setCell(ws2, curRow, 13, deviPct, styleCellCenter);
        // Col 14: % AVG
        setCell(ws2, curRow, 14, r.deptPctAvg || '', perfStyle);
        // Col 15: RANK
        setCell(ws2, curRow, 15, r.overallPerfScore !== undefined ? r.overallPerfScore : '', perfStyle);

        // Apply vertical merges where specified in dailyMeetingRows
        if (r.snoRowSpan && r.snoRowSpan > 1) {
          merges2.push({ s: { r: curRow, c: 0 }, e: { r: curRow + r.snoRowSpan - 1, c: 0 } });
          applyMergeWithBorders(ws2, curRow, 0, curRow + r.snoRowSpan - 1, 0, styleCellCenterBold);
        }
        if (r.deptRowSpan && r.deptRowSpan > 1) {
          merges2.push({ s: { r: curRow, c: 1 }, e: { r: curRow + r.deptRowSpan - 1, c: 1 } });
          applyMergeWithBorders(ws2, curRow, 1, curRow + r.deptRowSpan - 1, 1, styleCellCenterBold);
        }
        if (r.headRowSpan && r.headRowSpan > 1) {
          merges2.push({ s: { r: curRow, c: 2 }, e: { r: curRow + r.headRowSpan - 1, c: 2 } });
          applyMergeWithBorders(ws2, curRow, 2, curRow + r.headRowSpan - 1, 2, styleCellCenterBold);
        }
        if (r.mentorRowSpan && r.mentorRowSpan > 1) {
          merges2.push({ s: { r: curRow, c: 3 }, e: { r: curRow + r.mentorRowSpan - 1, c: 3 } });
          applyMergeWithBorders(ws2, curRow, 3, curRow + r.mentorRowSpan - 1, 3, styleCellCenterBold);
        }
        if (r.overallPerfRowSpan && r.overallPerfRowSpan > 1) {
          merges2.push({ s: { r: curRow, c: 14 }, e: { r: curRow + r.overallPerfRowSpan - 1, c: 14 } });
          applyMergeWithBorders(ws2, curRow, 14, curRow + r.overallPerfRowSpan - 1, 14, perfStyle);

          merges2.push({ s: { r: curRow, c: 15 }, e: { r: curRow + r.overallPerfRowSpan - 1, c: 15 } });
          applyMergeWithBorders(ws2, curRow, 15, curRow + r.overallPerfRowSpan - 1, 15, perfStyle);
        }
      });
      r2 += dailyMeetingRows.length;

      // Signatory Row
      setCell(ws2, r2, 0, 'PREPARED BY: _____________________', styleCellLeftBold);
      merges2.push({ s: { r: r2, c: 0 }, e: { r: r2, c: 3 } });
      applyMergeWithBorders(ws2, r2, 0, r2, 3, styleCellLeftBold);

      setCell(ws2, r2, 4, 'CHECKED BY: _____________________', styleCellLeftBold);
      merges2.push({ s: { r: r2, c: 4 }, e: { r: r2, c: 7 } });
      applyMergeWithBorders(ws2, r2, 4, r2, 7, styleCellLeftBold);

      setCell(ws2, r2, 8, 'FACTORY MANAGER: _____________________', styleCellLeftBold);
      merges2.push({ s: { r: r2, c: 8 }, e: { r: r2, c: 11 } });
      applyMergeWithBorders(ws2, r2, 8, r2, 11, styleCellLeftBold);

      setCell(ws2, r2, 12, 'MANAGING DIRECTOR: _____________________', styleCellLeftBold);
      merges2.push({ s: { r: r2, c: 12 }, e: { r: r2, c: 15 } });
      applyMergeWithBorders(ws2, r2, 12, r2, 15, styleCellLeftBold);
      r2++;

      // Footer Row
      setCell(ws2, r2, 0, 'Santhi Processing Unit Pvt. Ltd. — Confidential Factory Production Report', {
        font: { name: 'Arial', sz: 7, italic: true, color: { rgb: '555555' } },
        alignment: { horizontal: 'left', vertical: 'center' }
      });
      merges2.push({ s: { r: r2, c: 0 }, e: { r: r2, c: 11 } });
      applyMergeWithBorders(ws2, r2, 0, r2, 11);

      setCell(ws2, r2, 12, 'Page 2 of 2', {
        font: { name: 'Arial', sz: 7, bold: true, color: { rgb: '555555' } },
        alignment: { horizontal: 'center', vertical: 'center' }
      });
      merges2.push({ s: { r: r2, c: 12 }, e: { r: r2, c: 15 } });
      applyMergeWithBorders(ws2, r2, 12, r2, 15);
      r2++;

      ws2['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: r2 - 1, c: 15 } });
      ws2['!merges'] = merges2;
      ws2['!cols'] = [
        { wch: 5 }, { wch: 14 }, { wch: 15 }, { wch: 15 }, { wch: 25 },
        { wch: 9 }, { wch: 9 }, { wch: 9 }, { wch: 8 }, { wch: 6 },
        { wch: 11 }, { wch: 9 }, { wch: 9 }, { wch: 7 }, { wch: 8 }, { wch: 6 }
      ];
      ws2['!pageSetup'] = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 1 };
      ws2['!margins'] = { left: 0.25, right: 0.25, top: 0.25, bottom: 0.25, header: 0.1, footer: 0.1 };

      XLSX.utils.book_append_sheet(wb, ws2, 'Executive_Summary');

      XLSX.writeFile(wb, `SPUPL_Daily_Report_${printFromDate === printToDate ? printFromDate : `${printFromDate}_to_${printToDate}`}.xlsx`);

      setFeedbackMessage({
        type: 'success',
        text: `Excel Report exported successfully for ${dateRangeLabel}!`
      });
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err.message || 'Failed to export Excel report' });
    } finally {
      setLoading(false);
    }
  };

  // Helper for performance mark badge styling
  const getPerfBadgeClass = (mark: string) => {
    switch (mark) {
      case 'EXCELLENT':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800';
      case 'GOOD':
        return 'bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-800';
      case 'ON PLAN':
        return 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800';
      case 'BELOW TARGET':
        return 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800';
      case 'CRITICAL':
        return 'bg-red-200 text-red-900 border-red-400 dark:bg-red-950 dark:text-red-300 dark:border-red-800 animate-pulse';
      case 'NOT ENTERED':
        return 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
      default:
        return 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
    }
  };

  // Helper for formatted date in DD-MM-YYYY format
  const formattedDate = useMemo(() => {
    if (!selectedDate) return '';
    const parts = selectedDate.split('-');
    if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
    return selectedDate;
  }, [selectedDate]);

  // Helper to read metric text/string or number
  // Rules 12, 28, 29: If no data, return empty string. Explicit 0 returns '0'.
  const getMetricVal = useCallback((code: string, fallback: any = '') => {
    const entry = dailyEntries[code];
    if (entry?.actual_value !== null && entry?.actual_value !== undefined) {
      return typeof entry.actual_value === 'number' ? entry.actual_value.toLocaleString('en-IN') : String(entry.actual_value);
    }
    if (entry?.raw_value !== null && entry?.raw_value !== undefined && entry?.raw_value !== '') {
      return entry.raw_value;
    }
    const formVal = formInputs[code];
    if (formVal !== undefined && formVal !== '') {
      const n = Number(formVal);
      return isNaN(n) ? formVal : n.toLocaleString('en-IN');
    }
    return fallback;
  }, [dailyEntries, formInputs]);

  // Helper to read metric numeric value (returns null if not entered)
  const getMetricNum = useCallback((code: string): number | null => {
    const entry = dailyEntries[code];
    if (entry?.actual_value !== null && entry?.actual_value !== undefined) {
      return Number(entry.actual_value);
    }
    const formVal = formInputs[code];
    if (formVal !== undefined && formVal !== '' && !isNaN(Number(formVal))) {
      return Number(formVal);
    }
    return null;
  }, [dailyEntries, formInputs]);

  // ── DEPARTMENT FIELD MAPPING HELPER (Feeds into Final Inspection) ──
  // Source 1: HRD / TRANSPORT -> SALES RETURN, RE-PRODUCTION, REJECTION, RE-WASH
  // Source 2: PROCESSING / DYEING -> DYEING & PRINTING
  const getMappedFinalInspectionVal = useCallback((type: 'SALES_RETURN' | 'REPRODUCTION' | 'REJECTION' | 'REWASH' | 'DYEING_PRINTING') => {
    switch (type) {
      case 'SALES_RETURN': {
        const e = dailyEntries['SALES_RETURN_MTRS'] || dailyEntries['SALES_RETURNS_MTRS'];
        if (e?.actual_value !== null && e?.actual_value !== undefined) return e.actual_value;
        const f = formInputs['SALES_RETURN_MTRS'] || formInputs['SALES_RETURNS_MTRS'];
        if (f !== undefined && f !== '' && !isNaN(Number(f))) return Number(f);
        return null;
      }
      case 'REPRODUCTION': {
        const e = dailyEntries['REPRODUCTION_MTRS'];
        if (e?.actual_value !== null && e?.actual_value !== undefined) return e.actual_value;
        const f = formInputs['REPRODUCTION_MTRS'];
        if (f !== undefined && f !== '' && !isNaN(Number(f))) return Number(f);
        return null;
      }
      case 'REJECTION': {
        const e = dailyEntries['REJECTION_MTRS'];
        if (e?.actual_value !== null && e?.actual_value !== undefined) return e.actual_value;
        const f = formInputs['REJECTION_MTRS'];
        if (f !== undefined && f !== '' && !isNaN(Number(f))) return Number(f);
        return null;
      }
      case 'REWASH': {
        const e = dailyEntries['REWASH_MTRS'];
        if (e?.actual_value !== null && e?.actual_value !== undefined) return e.actual_value;
        const f = formInputs['REWASH_MTRS'];
        if (f !== undefined && f !== '' && !isNaN(Number(f))) return Number(f);
        return null;
      }
      case 'DYEING_PRINTING': {
        const e = dailyEntries['DYEING_PRINTING_MTRS'];
        if (e?.actual_value !== null && e?.actual_value !== undefined) return e.actual_value;
        const f = formInputs['DYEING_PRINTING_MTRS'];
        if (f !== undefined && f !== '' && !isNaN(Number(f))) return Number(f);
        return null;
      }
      default:
        return null;
    }
  }, [dailyEntries, formInputs]);

  // ── DEDICATED PRINT DATA ACCESSORS (Decoupled from Entry Date) ──
  const effectivePrintEntries = printEntries || {};
  const effectivePrintMasters = printDepartmentMasters || departmentMasters;
  const effectivePrintMonthly = (printMonthlySummaries !== null) ? printMonthlySummaries : (monthlySummaries || []);
  const effectivePrintDate = printDateLabel || formattedDate;

  // Note: METRIC_CODE_ALIASES is declared globally at top level above DailyReport component

  const getPrintMetricVal = useCallback((code: string, fallback: any = '') => {
    const codesToTry = [code, ...(METRIC_CODE_ALIASES[code] || [])];
    for (const c of codesToTry) {
      const entry = effectivePrintEntries[c];
      if (entry?.actual_value !== null && entry?.actual_value !== undefined) {
        return typeof entry.actual_value === 'number' ? entry.actual_value.toLocaleString('en-IN') : String(entry.actual_value);
      }
      if (entry?.raw_value !== null && entry?.raw_value !== undefined && entry?.raw_value !== '') {
        return entry.raw_value;
      }
    }
    return fallback;
  }, [effectivePrintEntries, METRIC_CODE_ALIASES]);

  const getPrintMetricNum = useCallback((code: string): number | null => {
    const codesToTry = [code, ...(METRIC_CODE_ALIASES[code] || [])];
    for (const c of codesToTry) {
      const entry = effectivePrintEntries[c];
      if (entry?.actual_value !== null && entry?.actual_value !== undefined) {
        return Number(entry.actual_value);
      }
    }
    return null;
  }, [effectivePrintEntries, METRIC_CODE_ALIASES]);

  // Dedicated AS ON DATE Accessors: In SPUPL Daily Report, "AS ON DATE" represents the date-specific daily entry value for the selected report date.
  // It must strictly return the print/daily entry value (or null if blank), never cumulative month totals.
  const getAsOnMetricVal = useCallback((code: string, fallback: any = '') => {
    return getPrintMetricVal(code, fallback);
  }, [getPrintMetricVal]);

  const getAsOnMetricNum = useCallback((code: string): number | null => {
    return getPrintMetricNum(code);
  }, [getPrintMetricNum]);

  // Helper to calculate Processing Stock "NO OF DAYS" based on 30,000 meters/day planned consumption
  const calcNoOfDays = useCallback((stock: number | null | undefined): string => {
    if (stock === null || stock === undefined || isNaN(stock)) return '';
    if (stock === 0) return '0.0';
    return (stock / 30000).toFixed(1);
  }, []);

  // Helper for Daily Meeting 30 rows calculation
  // Rules 12, 13, 27, 28, 29: Distinguish null/blank from 0, NO #DIV/0!
  const getDailyMeetingStats = useCallback((metricCode: string, defaultTarget: number) => {
    const codesToTry = [metricCode, ...(METRIC_CODE_ALIASES[metricCode] || [])];
    let entry: EntryRecord | undefined;
    for (const c of codesToTry) {
      if (dailyEntries[c]) {
        entry = dailyEntries[c];
        break;
      }
    }

    let formVal: string | undefined;
    for (const c of codesToTry) {
      if (formInputs[c] !== undefined && formInputs[c] !== '') {
        formVal = formInputs[c];
        break;
      }
    }

    let act: number | null = null;
    let actEntered = false;
    if (entry?.actual_value !== null && entry?.actual_value !== undefined) {
      act = Number(entry.actual_value);
      actEntered = true;
    } else if (formVal !== undefined && formVal !== '' && !isNaN(Number(formVal))) {
      act = Number(formVal);
      actEntered = true;
    }

    let target: number | null = null;
    for (const c of codesToTry) {
      if (editedTargets[c] !== undefined && editedTargets[c] !== null) {
        target = editedTargets[c];
        break;
      } else if (dailyEntries[c]?.target_value !== null && dailyEntries[c]?.target_value !== undefined) {
        target = Number(dailyEntries[c].target_value);
        break;
      }
    }
    if (target === null) {
      if (defaultTarget !== undefined && defaultTarget !== null && defaultTarget > 0) {
        target = defaultTarget;
      } else if (defaultTarget === 0) {
        target = null;
      }
    }

    let diff: number | null = null;
    let pctStr = '';

    if (actEntered && act !== null && target !== null && target > 0) {
      diff = act - target;
      const p = Math.round(((act - target) / target) * 100);
      pctStr = `${p}%`;
    }

    const mSummary = monthlySummaries.find(s => codesToTry.includes(s.metric_code));
    const uptoDate = mSummary?.monthlyTotal !== undefined && mSummary.monthlyTotal !== null
      ? mSummary.monthlyTotal
      : (actEntered && act !== null ? act : null);
    const avg = mSummary?.monthlyAverage !== undefined && mSummary.monthlyAverage !== null
      ? mSummary.monthlyAverage
      : (actEntered && act !== null ? act : null);

    let devi: number | null = null;
    let deviPct = '';
    if (avg !== null && target !== null && target > 0) {
      devi = avg - target;
      const dp = Math.round((devi / target) * 100);
      deviPct = `${dp}%`;
    }

    return { target, act, actEntered, diff, pctStr, uptoDate, avg, devi, deviPct };
  }, [dailyEntries, formInputs, editedTargets, monthlySummaries, METRIC_CODE_ALIASES]);

  // Page 2 cell renderers ensuring blanks remain blank and explicit 0 renders 0
  const renderTargetCell = (t: number | null | undefined) => {
    if (t === null || t === undefined) return '';
    if (t === 0) return '0';
    return t.toLocaleString('en-IN');
  };

  const renderActualCell = (a: number | null | undefined, entered: boolean) => {
    if (!entered || a === null || a === undefined) return '';
    if (a === 0) return '0';
    return a.toLocaleString('en-IN');
  };

  const renderDiffCell = (d: number | null | undefined) => {
    if (d === null || d === undefined) return '';
    if (d === 0) return '0';
    return d > 0 ? `+${d.toLocaleString('en-IN')}` : d.toLocaleString('en-IN');
  };

  const renderDeviCell = (d: number | null | undefined) => {
    if (d === null || d === undefined) return '';
    if (d === 0) return '0';
    return d > 0 ? `+${d.toLocaleString('en-IN')}` : d.toLocaleString('en-IN');
  };

  const renderPctCell = (p: string | null | undefined) => {
    if (!p || p === '#DIV/0!' || p === 'NA' || p === 'N/A' || p === '-' || p.includes('NaN')) return '';
    return p;
  };

  const renderNumCell = (n: number | null | undefined) => {
    if (n === null || n === undefined || isNaN(n)) return '';
    if (n === 0) return '0';
    return n.toLocaleString('en-IN');
  };

  // 30 Daily Meeting Rows matching Reference Image 1 exactly
  const dailyMeetingRows = useMemo(() => [
    // 1. DISPATCH
    { sno: 1, snoRowSpan: 2, dept: 'DISPATCH', deptRowSpan: 2, head: 'MR.M.RAMESH', headRowSpan: 4, mentor: 'MR.JEGAN', mentorRowSpan: 2, name: 'DESPATCH', code: 'DESPATCH_MTRS', defaultTarget: 77950, perfScore: 9, deptPctAvg: '-41%', overallPerfScore: 4, overallPerfColor: '#fde2d2', overallPerfRowSpan: 4 },
    { name: 'PACKING', code: 'PACKING_MTRS', defaultTarget: 77950, perfScore: 1 },
    // 2. INSPECTION
    { sno: 2, snoRowSpan: 2, dept: 'INSPECTION', deptRowSpan: 2, mentor: 'MR.M.RAMESH', mentorRowSpan: 2, name: 'INSPECTION/DAY', code: 'INSPECTION_DAY_MTRS', defaultTarget: 77950, perfScore: 2 },
    { name: 'FABRIC (PURCHASE)', code: 'FABRIC_PURCHASE_MTRS', defaultTarget: 30000, perfScore: 10 },
    // 3. PROC/DYEING
    { sno: 1, snoRowSpan: 1, dept: 'PROC/DYEING', deptRowSpan: 5, head: 'MR.NATESAN', headRowSpan: 5, mentor: 'MR.NATESAN', mentorRowSpan: 4, name: 'PINNING', code: 'PINNING_MTRS', defaultTarget: 0, perfScore: 0, deptPctAvg: '-18.6%', overallPerfScore: 3, overallPerfColor: '#d5edd5', overallPerfRowSpan: 5 },
    { sno: 2, snoRowSpan: 1, name: 'REPROCESS', code: 'REPROCESS_MTRS', defaultTarget: 0, perfScore: 0 },
    { sno: 3, snoRowSpan: 2, name: 'PROCESSING DELIVERY INHOUSE', code: 'PROC_DELIVERY_INHOUSE_MTRS', defaultTarget: 35000, perfScore: 3 },
    { name: 'PROCESSING DELIVERY OUTSIDE', code: 'PROC_DELIVERY_OUTSIDE_MTRS', defaultTarget: 0, perfScore: 0 },
    { sno: 1, snoRowSpan: 1, mentor: 'MR.GANESH', mentorRowSpan: 1, name: 'DYEING & PRINTING', code: 'DYEING_PRINTING_MTRS', defaultTarget: 50000, perfScore: 1 },
    // 4. GREY WARE HOUSE
    { sno: 1, snoRowSpan: 3, dept: 'GREY WARE HOUSE', deptRowSpan: 3, head: 'MR.GUNASEKARAN', headRowSpan: 12, mentor: 'MR.M.RAMESH', mentorRowSpan: 3, name: 'TOTAL PRODN-GREIGE', code: 'GREIGE_PRODN_MTRS', defaultTarget: 75000, perfScore: 6, deptPctAvg: '8.77%', overallPerfScore: 1, overallPerfColor: '#d3e4f7', overallPerfRowSpan: 12 },
    { name: 'TOTAL PRODN-FINISH', code: 'FINISH_PRODN_MTRS', defaultTarget: 0, perfScore: 0 },
    { name: 'GREIGE & YD OUTWARD', code: 'GREIGE_YD_OUTWARD_MTRS', defaultTarget: 80000, perfScore: 1 },
    // 5. OUT SOURCING
    { sno: 2, snoRowSpan: 2, dept: 'OUT SOURCING', deptRowSpan: 2, mentor: 'MR.MADHESH', mentorRowSpan: 2, name: 'GREIGE FABRIC', code: 'OS_GREIGE_FABRIC_MTRS', defaultTarget: 15000, perfScore: 1 },
    { name: 'YD FABRIC', code: 'OS_YD_FABRIC_MTRS', defaultTarget: 15000, perfScore: 1 },
    // 6. WEAVING
    { sno: 3, snoRowSpan: 2, dept: 'WEAVING', deptRowSpan: 2, mentor: 'MR.GUNASEKARAN', mentorRowSpan: 2, name: 'INHOUSE (KPICKS)', code: 'INHOUSE_KPICKS', defaultTarget: 155739, perfScore: 8 },
    { name: 'INHOUSE (MTRS) AVG PICK 59.1', code: 'INHOUSE_MTRS', defaultTarget: 68400, perfScore: 6 },
    // 7. SIZING
    { sno: 4, snoRowSpan: 5, dept: 'SIZING', deptRowSpan: 5, mentor: 'MR.SENTHIL', mentorRowSpan: 5, name: 'SIZING', code: 'SIZING_MTRS', defaultTarget: 40000, perfScore: 1 },
    { name: 'SEC WARPING', code: 'SEC_WARPING_MTRS', defaultTarget: 4000, perfScore: 4 },
    { name: 'SAMPLE', code: 'SAMPLE_BEAMS', defaultTarget: 4, perfScore: 0 },
    { name: 'RE-WINDING PRODUCTION (KGS)', code: 'REWINDING_KGS', defaultTarget: 600, perfScore: 1 },
    { name: 'REMNANTS GENERATION', code: 'REMNANTS_KGS', defaultTarget: 0, perfScore: 0 },
    // 8. SPINNING
    { sno: 1, snoRowSpan: 1, dept: 'SPINNING', deptRowSpan: 4, head: 'MR.VENKATESHWARAN', headRowSpan: 4, mentor: 'MR.VENKATESHWARAN', mentorRowSpan: 4, name: 'VSF', code: 'SPINNING_VSF', defaultTarget: 0, perfScore: 0, deptPctAvg: '-3%', overallPerfScore: 2, overallPerfColor: '#fdf0c2', overallPerfRowSpan: 4 },
    { sno: 2, snoRowSpan: 1, name: 'FLAX, LINEN & OTHERS', code: 'FLAX_LINEN_MTRS', defaultTarget: 3500, perfScore: 7 },
    { sno: 3, snoRowSpan: 1, name: 'VSF GPS (CMS)', code: 'VSF_GPS_CMS', defaultTarget: 135, perfScore: 0 },
    { sno: 4, snoRowSpan: 1, name: 'FLAX GPS', code: 'FLAX_GPS', defaultTarget: 140, perfScore: 1 },
    // 9. ANCILLARY & LOGISTICS
    { sno: 1, snoRowSpan: 1, dept: 'SALE & RETURN', deptRowSpan: 1, name: 'SALE & RETURN', code: 'SALES_RETURN_MTRS', defaultTarget: 0, perfScore: 0 },
    { sno: 2, snoRowSpan: 1, dept: 'REPRODUCTION', deptRowSpan: 1, name: 'REPRODUCTION', code: 'REPRODUCTION_MTRS', defaultTarget: 0, perfScore: 0 },
    { sno: 3, snoRowSpan: 1, dept: 'REJECTION', deptRowSpan: 1, name: 'WEAVING- 0, PROCESSING - 0 VENDOR -574', code: 'REJECTION_MTRS', defaultTarget: 0, perfScore: 0 },
    { sno: 4, snoRowSpan: 1, dept: 'REWASH', deptRowSpan: 1, name: 'VENDOR - 76. PROCESSING -376', code: 'REWASH_MTRS', defaultTarget: 0, perfScore: 0 },
    { sno: 5, snoRowSpan: 1, dept: 'TRANSPORT', deptRowSpan: 1, head: 'MR.SARAVANAN', headRowSpan: 1, name: 'TRANSPORT', code: 'TRANSPORT_TRIPS', defaultTarget: 45, perfScore: 1 }
  ], []);

  // Pre-calculate cell rendering flags so every row produces exactly 16 columns
  const preparedDailyMeetingRows = useMemo(() => {
    let headCovered = 0;
    let mentorCovered = 0;
    let perfCovered = 0;

    return dailyMeetingRows.map((r) => {
      // HEAD column
      let renderHead: 'SPAN' | 'EMPTY' | 'SKIP' = 'SKIP';
      if (r.head) {
        renderHead = 'SPAN';
        headCovered = (r.headRowSpan || 1) - 1;
      } else if (headCovered > 0) {
        renderHead = 'SKIP';
        headCovered--;
      } else {
        renderHead = 'EMPTY';
      }

      // MENTOR column
      let renderMentor: 'SPAN' | 'EMPTY' | 'SKIP' = 'SKIP';
      if (r.mentor) {
        renderMentor = 'SPAN';
        mentorCovered = (r.mentorRowSpan || 1) - 1;
      } else if (mentorCovered > 0) {
        renderMentor = 'SKIP';
        mentorCovered--;
      } else {
        renderMentor = 'EMPTY';
      }

      // % AVG & RANK columns
      let renderPerf: 'SPAN' | 'EMPTY' | 'SKIP' = 'SKIP';
      if (r.deptPctAvg || r.overallPerfScore !== undefined) {
        renderPerf = 'SPAN';
        perfCovered = (r.overallPerfRowSpan || 1) - 1;
      } else if (perfCovered > 0) {
        renderPerf = 'SKIP';
        perfCovered--;
      } else {
        renderPerf = 'EMPTY';
      }

      return {
        ...r,
        renderHead,
        renderMentor,
        renderPerf
      };
    });
  }, [dailyMeetingRows]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1700px] mx-auto space-y-6">

                  {/* ── PRINT-ONLY STYLES: EXACT 2-PAGE A4 LANDSCAPE ENGINE ── */}
      <style>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 0;
          }
          html, body {
            width: 297mm !important;
            height: 210mm !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #000000 !important;
            font-family: Arial, Calibri, sans-serif !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* 4. HIDE ALL NORMAL WEBPAGE UI DURING PRINT */
          body * {
            visibility: hidden;
          }

          .daily-report-print-root,
          .daily-report-print-root * {
            visibility: visible;
          }

          /* Remove all layout chrome from document flow */
          aside,
          header,
          nav,
          .print-watermark-logo,
          .print-hidden,
          .print\\:hidden {
            display: none !important;
            visibility: hidden !important;
            height: 0 !important;
            overflow: hidden !important;
          }

          /* Reset all ancestor containers */
          #root,
          #root > div,
          main,
          .app-container,
          .flex-1 {
            display: block !important;
            position: static !important;
            width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
          }

          /* 31. DEDICATED PRINT ROOT */
          .daily-report-print-root {
            display: block !important;
            position: static !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
          }

          /* 5. PREVENT EXTRA PAGES: EXACTLY 2 CONTAINERS */
          .daily-report-print-page {
            width: 283mm !important;
            margin: 0 auto !important;
            box-sizing: border-box !important;
            position: relative !important;
            background: #ffffff !important;
            padding-top: 3.5mm !important;
            padding-bottom: 3.5mm !important;
            padding-left: 0 !important;
            padding-right: 0 !important;
          }

          .daily-report-print-page.page-1 {
            height: auto !important;
            min-height: 0 !important;
            max-height: 202mm !important;
            overflow: visible !important;
            display: block !important;
            page-break-after: always !important;
            break-after: page !important;
            page-break-before: avoid !important;
            break-before: avoid !important;
          }

          .daily-report-print-page.page-2 {
            height: 200mm !important;
            max-height: 200mm !important;
            min-height: 195mm !important;
            overflow: hidden !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            page-break-before: always !important;
            break-before: page !important;
            page-break-after: auto !important;
            break-after: auto !important;
          }

          /* =========================================================
             EXCEL-STYLE CLEAN BORDER SYSTEM (NO DUPLICATES / NO THICK LINES)
             ========================================================= */
          table.p1-table, table.p2-table {
            width: 100% !important;
            border-collapse: collapse !important;
            border-spacing: 0 !important;
            table-layout: fixed !important;
            border: 0.6pt solid #222 !important;
            box-shadow: none !important;
            margin: 0 !important;
          }

          table.p1-table th, table.p1-table td,
          table.p2-table th, table.p2-table td {
            border: 0.45pt solid #333 !important;
            box-shadow: none !important;
            box-sizing: border-box !important;
            vertical-align: middle !important;
            overflow-wrap: anywhere !important;
            word-break: normal !important;
            white-space: normal !important;
            color: #000000 !important;
          }

          table.p1-table th, table.p2-table th {
            background-color: #fef08a !important;
            font-weight: bold !important;
            border: 0.6pt solid #222 !important;
            line-height: 1.1 !important;
          }

          table.p1-table th {
            font-size: 6.8pt !important;
            padding: 1.5px 2px !important;
          }

          table.p1-table td {
            font-size: 5.6pt !important;
            line-height: 1.05 !important;
            padding: 0.3px 1.5px !important;
          }

          table.p2-table th {
            font-size: 6.8pt !important;
            padding: 2px 2px !important;
          }

          table.p2-table td {
            font-size: 6.4pt !important;
            line-height: 1.1 !important;
            padding: 1px 2px !important;
            text-align: center !important;
          }

          .p-merged-center {
            text-align: center !important;
            vertical-align: middle !important;
            font-weight: bold !important;
          }

          .p-center { text-align: center !important; vertical-align: middle !important; }
          .p-left   { text-align: left !important; }
          .p-right  { text-align: right !important; }
          .p-bold   { font-weight: bold !important; }

          /* =========================================================
             NESTED SUB-TABLES: ELIMINATE STACKED PERIMETER BORDERS
             ========================================================= */
          .p-sub-table, .p-gi-table, .p-otd-table {
            width: 100% !important;
            height: auto !important;
            border-collapse: collapse !important;
            border-spacing: 0 !important;
            table-layout: fixed !important;
            border: none !important;
            box-shadow: none !important;
            margin: 0 !important;
          }

          /* Single-row sub-tables (Sizing, Weaving, Mending, Raw Material) */
          .p-sub-table td, .p-sub-table th {
            border-top: none !important;
            border-bottom: none !important;
            border-right: none !important;
            border-left: 0.45pt solid #333 !important;
            padding: 0.25px 1.2px !important;
            font-size: 5.4pt !important;
            line-height: 1.04 !important;
            box-shadow: none !important;
          }
          .p-sub-table td:first-child, .p-sub-table th:first-child {
            border-left: none !important;
          }

          /* Multi-row sub-table in Processing: interior horizontal rows */
          table.p-sub-table tr:not(:first-child) td {
            border-top: 0.45pt solid #333 !important;
          }
          table.p-sub-table tr:first-child td,
          table.p-sub-table thead tr th {
            border-top: none !important;
          }
          table.p-sub-table tr:last-child td {
            border-bottom: none !important;
          }

          /* Greige Inspection multi-row sub-table (.p-gi-table) */
          .p-gi-table th, .p-gi-table td {
            border: 0.45pt solid #333 !important;
            padding: 0.25px 1.2px !important;
            font-size: 5.4pt !important;
            line-height: 1.04 !important;
            box-shadow: none !important;
          }
          .p-gi-table thead tr:first-child th {
            border-top: none !important;
          }
          .p-gi-table tbody tr:last-child td {
            border-bottom: none !important;
          }
          .p-gi-table th:first-child, .p-gi-table td:first-child {
            border-left: none !important;
          }
          .p-gi-table th:last-child, .p-gi-table td:last-child {
            border-right: none !important;
          }

          /* OTD Pending Status nested sub-table (.p-otd-table) */
          .p-otd-table th, .p-otd-table td {
            border: 0.45pt solid #333 !important;
            padding: 0.25px 1.2px !important;
            font-size: 5.4pt !important;
            line-height: 1.04 !important;
            box-shadow: none !important;
          }
          .p-otd-table thead tr:first-child th {
            border-top: none !important;
          }
          .p-otd-table tbody tr:last-child td {
            border-bottom: none !important;
          }
          .p-otd-table th:first-child, .p-otd-table td:first-child {
            border-left: none !important;
          }
          .p-otd-table th:last-child, .p-otd-table td:last-child {
            border-right: none !important;
          }

          .p-page-hdr {
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            border-bottom: 0.6pt solid #222 !important;
            padding-bottom: 1.5px !important;
            margin-bottom: 2px !important;
          }
          .p-page-hdr-logo {
            height: 22px !important;
            width: auto !important;
            object-fit: contain !important;
          }
          .p-page-hdr-co {
            font-size: 10.5pt !important;
            font-weight: bold !important;
            letter-spacing: 0.5px !important;
            line-height: 1.1 !important;
          }
          .p-page-hdr-sub {
            font-size: 7.2pt !important;
            font-weight: bold !important;
            color: #222 !important;
            line-height: 1.1 !important;
          }
          .p-page-hdr-date {
            font-size: 7.2pt !important;
            font-weight: bold !important;
            background: #fef08a !important;
            padding: 1px 5px !important;
            border: 0.5pt solid #222 !important;
            display: inline-block !important;
          }
          .p-page-hdr-pgno {
            font-size: 6.5pt !important;
            font-weight: bold !important;
            margin-top: 1px !important;
          }
          .p-page-ftr {
            display: flex !important;
            justify-content: space-between !important;
            border-top: 0.6pt solid #222 !important;
            padding-top: 1.5px !important;
            margin-top: 1.5px !important;
            font-size: 6.2pt !important;
            font-weight: bold !important;
          }
          .p2-signatory {
            display: flex !important;
            justify-content: space-between !important;
            border-top: 0.6pt solid #222 !important;
            margin-top: 2px !important;
            padding-top: 2px !important;
            font-size: 6.2pt !important;
            font-weight: bold !important;
          }
        }
      `}</style>

      {/* ── 31. DEDICATED PRINT ROOT (Hidden on screen, visible only during print) ── */}
      <div className="hidden print:block daily-report-print-root">

        {/* ================================================
            PAGE 1: FULL PLANT SNAPSHOT (MATCHES IMAGE 4)
            ================================================ */}
        <div className="daily-report-print-page page-1">
          <div className="p-page-hdr">
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <img src={COMPANY_LOGO_DATA_URL} alt="SPUPL" className="p-page-hdr-logo" />
              <div>
                <div className="p-page-hdr-co">SANTHI PROCESSING UNIT PVT. LTD.</div>
                <div className="p-page-hdr-sub">FULL PLANT OPERATIONAL SNAPSHOT &amp; DAILY PRODUCTION STATUS</div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="p-page-hdr-date">DATE: {effectivePrintDate}</div>
              <div className="p-page-hdr-pgno">Page 1 of 2</div>
            </div>
          </div>

          <table className="p1-table">
            <colgroup>
              <col style={{ width: '3.0%' }} />
              <col style={{ width: '8.0%' }} />
              <col style={{ width: '8.0%' }} />
              <col style={{ width: '9.0%' }} />
              <col style={{ width: '15.0%' }} />
              <col style={{ width: '57.0%' }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ textAlign: 'center' }}>S.NO</th>
                <th style={{ textAlign: 'center' }}>DEPT</th>
                <th style={{ textAlign: 'center' }}>HEADS</th>
                <th style={{ textAlign: 'center' }}>MENTOR</th>
                <th style={{ textAlign: 'left' }}>DETAILS</th>
                <th style={{ textAlign: 'left' }}>DESCRIPTION</th>
              </tr>
            </thead>
            <tbody>
              {/* 1. PLANNING */}
              <tr>
                <td rowSpan={5} className="p-center p-bold">1</td>
                <td rowSpan={5} className="p-merged-center">PLANNING</td>
                <td rowSpan={5} className="p-merged-center">{effectivePrintMasters['PLANNING']?.head || 'BALAMURALI'}</td>
                <td rowSpan={5} className="p-merged-center">{effectivePrintMasters['PLANNING']?.mentor || 'MANIKANDAN'}</td>
                <td className="p-left p-bold">CURRENT ORDER STATUS</td>
                <td className="p-left">{getPrintMetricVal('CURRENT_ORDER_STATUS') || ''}</td>
              </tr>
              <tr><td className="p-left p-bold">CRITICAL ORDERS</td><td className="p-left">{getPrintMetricVal('CRITICAL_ORDERS') || ''}</td></tr>
              <tr><td className="p-left p-bold">FAST TRACK ORDER</td><td className="p-left">{getPrintMetricVal('FAST_TRACK_ORDERS') || ''}</td></tr>
              <tr><td className="p-left p-bold">Reproduction Order</td><td className="p-left">{getPrintMetricVal('REPRODUCTION_ORDERS') || ''}</td></tr>
              <tr><td className="p-left p-bold">NEW ORDERS</td><td className="p-left">{getPrintMetricVal('NEW_ORDERS') || ''}</td></tr>

              {/* 2. SIZING */}
              {(() => {
                const dydN = getPrintMetricNum('DYED_YARN_STOCK_KGS');
                const gryN = getPrintMetricNum('GREY_YARN_STOCK_KGS');
                const total = (dydN !== null || gryN !== null) ? ((dydN || 0) + (gryN || 0)) : null;
                return (
                  <>
                    <tr>
                      <td rowSpan={4} className="p-center p-bold">2</td>
                      <td rowSpan={4} className="p-merged-center">SIZING</td>
                      <td rowSpan={4} className="p-merged-center">{effectivePrintMasters['SIZING']?.head || 'GUNASEKARAN'}</td>
                      <td rowSpan={4} className="p-merged-center">{effectivePrintMasters['SIZING']?.mentor || 'SENTHIL'}</td>
                      <td className="p-left p-bold" style={{ backgroundColor: '#fef08a' }}></td>
                      <td style={{ padding: 0 }}>
                        <table className="p-sub-table">
                          <colgroup><col style={{ width: '33.3%' }} /><col style={{ width: '33.3%' }} /><col style={{ width: '33.4%' }} /></colgroup>
                          <thead>
                            <tr>
                              <th style={{ backgroundColor: '#fef08a', textAlign: 'center', fontWeight: 'bold' }}>QTY</th>
                              <th style={{ backgroundColor: '#fef08a', textAlign: 'center', fontWeight: 'bold' }}>NO OF DAYS</th>
                              <th style={{ backgroundColor: '#fef08a', textAlign: 'center', fontWeight: 'bold' }}>REMARKS</th>
                            </tr>
                          </thead>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td className="p-left p-bold">DYED YARN STOCK</td>
                      <td style={{ padding: 0 }}>
                        <table className="p-sub-table">
                          <colgroup><col style={{ width: '33.3%' }} /><col style={{ width: '33.3%' }} /><col style={{ width: '33.4%' }} /></colgroup>
                          <tbody>
                            <tr>
                              <td className="p-center">{renderNumCell(dydN)}</td>
                              <td className="p-center"></td>
                              <td className="p-center"></td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td className="p-left p-bold">GRY YARN STOCK</td>
                      <td style={{ padding: 0 }}>
                        <table className="p-sub-table">
                          <colgroup><col style={{ width: '33.3%' }} /><col style={{ width: '33.3%' }} /><col style={{ width: '33.4%' }} /></colgroup>
                          <tbody>
                            <tr>
                              <td className="p-center">{renderNumCell(gryN)}</td>
                              <td className="p-center"></td>
                              <td className="p-center"></td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td className="p-left p-bold">TOTAL</td>
                      <td style={{ padding: 0 }}>
                        <table className="p-sub-table">
                          <colgroup><col style={{ width: '33.3%' }} /><col style={{ width: '33.3%' }} /><col style={{ width: '33.4%' }} /></colgroup>
                          <tbody>
                            <tr>
                              <td className="p-center p-bold">{renderNumCell(total)}</td>
                              <td className="p-center"></td>
                              <td className="p-center"></td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  </>
                );
              })()}

              {/* 3. WEAVING */}
              <tr>
                <td rowSpan={7} className="p-center p-bold">3</td>
                <td rowSpan={7} className="p-merged-center">WEAVING</td>
                <td rowSpan={7} className="p-merged-center">{effectivePrintMasters['WEAVING']?.head || 'GUNASEKARAN'}</td>
                <td rowSpan={7} className="p-merged-center">{effectivePrintMasters['WEAVING']?.mentor || 'GUNASEKARAN'}</td>
                <td className="p-left p-bold" style={{ backgroundColor: '#fef08a' }}></td>
                <td style={{ padding: 0 }}>
                  <table className="p-sub-table">
                    <colgroup><col style={{ width: '33.3%' }} /><col style={{ width: '33.3%' }} /><col style={{ width: '33.4%' }} /></colgroup>
                    <thead>
                      <tr>
                        <th style={{ backgroundColor: '#fef08a', textAlign: 'center', fontWeight: 'bold' }}>ON DATE</th>
                        <th style={{ backgroundColor: '#fef08a', textAlign: 'center', fontWeight: 'bold' }}>UP TO DATE</th>
                        <th style={{ backgroundColor: '#fef08a', textAlign: 'center', fontWeight: 'bold' }}>REMARKS</th>
                      </tr>
                    </thead>
                  </table>
                </td>
              </tr>
              {(() => {
                const effN = getPrintMetricNum('EFFICIENCY_PCT');
                const utiN = getPrintMetricNum('UTILISATION_PCT');
                const ueN  = getPrintMetricNum('UE_PCT');
                const knotN = getPrintMetricNum('NO_OF_KNOTTINGS');
                const sortN = getPrintMetricNum('NO_OF_SORT_CHANGES');
                const stopN = getPrintMetricNum('FULL_LOOM_STOPPAGE');

                const effU = effectivePrintMonthly.find(m => m.metric_code === 'EFFICIENCY_PCT')?.monthlyTotal;
                const utiU = effectivePrintMonthly.find(m => m.metric_code === 'UTILISATION_PCT')?.monthlyTotal;
                const ueU  = effectivePrintMonthly.find(m => m.metric_code === 'UE_PCT')?.monthlyTotal;
                const knotU = effectivePrintMonthly.find(m => m.metric_code === 'NO_OF_KNOTTINGS')?.monthlyTotal;
                const sortU = effectivePrintMonthly.find(m => m.metric_code === 'NO_OF_SORT_CHANGES')?.monthlyTotal;
                const stopU = effectivePrintMonthly.find(m => m.metric_code === 'FULL_LOOM_STOPPAGE')?.monthlyTotal;

                const weavingRows = [
                  { label: 'EFFICIENCY%', onDate: effN !== null ? `${effN}%` : '', upto: (effU !== undefined && effU !== null) ? `${effU}%` : '' },
                  { label: 'UTILISATION%', onDate: utiN !== null ? `${utiN}%` : '', upto: (utiU !== undefined && utiU !== null) ? `${utiU}%` : '' },
                  { label: 'UE%', onDate: ueN !== null ? `${ueN}%` : '', upto: (ueU !== undefined && ueU !== null) ? `${ueU}%` : '' },
                  { label: 'NO OF KNOTTINGS', onDate: renderNumCell(knotN), upto: renderNumCell(knotU) },
                  { label: 'NO OF SORT CHANGES', onDate: renderNumCell(sortN), upto: renderNumCell(sortU) },
                  { label: 'NO OF FULL LOOM STOPPAGE', onDate: renderNumCell(stopN), upto: renderNumCell(stopU) },
                ];

                return weavingRows.map((wRow, wIdx) => (
                  <tr key={wIdx}>
                    <td className="p-left p-bold">{wRow.label}</td>
                    <td style={{ padding: 0 }}>
                      <table className="p-sub-table">
                        <colgroup><col style={{ width: '33.3%' }} /><col style={{ width: '33.3%' }} /><col style={{ width: '33.4%' }} /></colgroup>
                        <tbody>
                          <tr>
                            <td className="p-center">{wRow.onDate}</td>
                            <td className="p-center">{wRow.upto}</td>
                            <td className="p-center"></td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                ));
              })()}

              {/* 4. GREIGE INSPECTION (50/50 side-by-side matching Image 4) */}
              {(() => {
                // Monthly summaries for UP TO DATE column
                const inInspU = effectivePrintMonthly.find(m => m.metric_code === 'INHOUSE_TOTAL_INSPECTED' || m.metric_code === 'INHOUSE_GREIGE_INSPECTED_MTRS')?.monthlyTotal;
                const inPassU = effectivePrintMonthly.find(m => m.metric_code === 'INHOUSE_TOTAL_PASSED'    || m.metric_code === 'INHOUSE_GREIGE_PASSED_MTRS')?.monthlyTotal;
                const inRejU  = effectivePrintMonthly.find(m => m.metric_code === 'INHOUSE_TOTAL_REJECTED'  || m.metric_code === 'INHOUSE_GREIGE_REJECTED_MTRS')?.monthlyTotal;
                const inRejPctU = (inInspU && inInspU > 0 && inRejU !== undefined && inRejU !== null) ? ((inRejU / inInspU) * 100).toFixed(2) + '%' : '';

                const vnInspU = effectivePrintMonthly.find(m => m.metric_code === 'VENDOR_TOTAL_INSPECTED'  || m.metric_code === 'VENDOR_GREIGE_INSPECTED_MTRS')?.monthlyTotal;
                const vnPassU = effectivePrintMonthly.find(m => m.metric_code === 'VENDOR_TOTAL_PASSED'    || m.metric_code === 'VENDOR_GREIGE_PASSED_MTRS')?.monthlyTotal;
                const vnRejU  = effectivePrintMonthly.find(m => m.metric_code === 'VENDOR_TOTAL_REJECTED'  || m.metric_code === 'VENDOR_GREIGE_REJECTED_MTRS')?.monthlyTotal;
                const vnRejPctU = (vnInspU && vnInspU > 0 && vnRejU !== undefined && vnRejU !== null) ? ((vnRejU / vnInspU) * 100).toFixed(2) + '%' : '';

                const washTotU = effectivePrintMonthly.find(m => m.metric_code === 'WASHING_TOTAL_MTRS')?.monthlyTotal;
                const washPassU = effectivePrintMonthly.find(m => m.metric_code === 'WASHING_TOTAL_PASSED')?.monthlyTotal;
                const washRejU = effectivePrintMonthly.find(m => m.metric_code === 'WASHING_TOTAL_REJECTED')?.monthlyTotal;
                const washRejPctU = (washTotU && washTotU > 0 && washRejU !== undefined && washRejU !== null) ? ((washRejU / washTotU) * 100).toFixed(2) + '%' : '';

                const hasAnyInspU = (inInspU !== undefined && inInspU !== null) || (vnInspU !== undefined && vnInspU !== null) || (washTotU !== undefined && washTotU !== null);
                const totInspU = hasAnyInspU ? ((inInspU || 0) + (vnInspU || 0) + (washTotU || 0)) : null;
                const hasAnyPassU = (inPassU !== undefined && inPassU !== null) || (vnPassU !== undefined && vnPassU !== null) || (washPassU !== undefined && washPassU !== null);
                const totPassU = hasAnyPassU ? ((inPassU || 0) + (vnPassU || 0) + (washPassU || 0)) : null;
                const hasAnyRejU = (inRejU !== undefined && inRejU !== null) || (vnRejU !== undefined && vnRejU !== null) || (washRejU !== undefined && washRejU !== null);
                const totRejU = hasAnyRejU ? ((inRejU || 0) + (vnRejU || 0) + (washRejU || 0)) : null;
                const rejPctU = (totInspU && totInspU > 0 && totRejU !== null) ? ((totRejU / totInspU) * 100).toFixed(2) + '%' : '';

                // Finished Fabric Monthly
                const finInspU = effectivePrintMonthly.find(m => m.metric_code === 'FINISHED_INSPECTION_MTRS' || m.metric_code === 'FINISHED_INSPECTED_MTRS' || m.metric_code === 'FINISH_PRODN_MTRS')?.monthlyTotal;
                const procRejU = effectivePrintMonthly.find(m => m.metric_code === 'PROCESSING_REJECTION_MTRS')?.monthlyTotal;
                const procRejPctU = (finInspU && finInspU > 0 && procRejU !== undefined && procRejU !== null) ? ((procRejU / finInspU) * 100).toFixed(2) + '%' : '';
                const venRejU = effectivePrintMonthly.find(m => m.metric_code === 'VENDOR_REJECTION_MTRS')?.monthlyTotal;
                const venRejPctU = (finInspU && finInspU > 0 && venRejU !== undefined && venRejU !== null) ? ((venRejU / finInspU) * 100).toFixed(2) + '%' : '';
                const weavRejU = effectivePrintMonthly.find(m => m.metric_code === 'WEAVING_REJECTION_MTRS')?.monthlyTotal;
                const weavRejPctU = (finInspU && finInspU > 0 && weavRejU !== undefined && weavRejU !== null) ? ((weavRejU / finInspU) * 100).toFixed(2) + '%' : '';
                const hasAnyFinRejU = (procRejU !== undefined && procRejU !== null) || (venRejU !== undefined && venRejU !== null) || (weavRejU !== undefined && weavRejU !== null);
                const totRejFinU = hasAnyFinRejU ? ((procRejU || 0) + (venRejU || 0) + (weavRejU || 0)) : null;
                const realPctU = (finInspU && finInspU > 0 && totRejFinU !== null) ? (Math.max(0, 100 - (totRejFinU / finInspU) * 100)).toFixed(2) + '%' : '';

                const procRewU = effectivePrintMonthly.find(m => m.metric_code === 'PROCESSING_REWASH_MTRS' || m.metric_code === 'PROC_REWASH_MTRS')?.monthlyTotal;
                const procRewPctU = (finInspU && finInspU > 0 && procRewU !== undefined && procRewU !== null) ? ((procRewU / finInspU) * 100).toFixed(2) + '%' : '';
                const venRewU = effectivePrintMonthly.find(m => m.metric_code === 'VENDOR_REWASH_MTRS')?.monthlyTotal;
                const venRewPctU = (finInspU && finInspU > 0 && venRewU !== undefined && venRewU !== null) ? ((venRewU / finInspU) * 100).toFixed(2) + '%' : '';
                const hasAnyRewFinU = (procRewU !== undefined && procRewU !== null) || (venRewU !== undefined && venRewU !== null);
                const totRewFinU = hasAnyRewFinU ? ((procRewU || 0) + (venRewU || 0)) : null;

                // Cumulative "AS ON DATE" values (Month Start -> Selected Report Date)
                const inInspAsOn = getAsOnMetricNum('INHOUSE_TOTAL_INSPECTED') ?? getAsOnMetricNum('INHOUSE_GREIGE_INSPECTED_MTRS');
                const inPassAsOn = getAsOnMetricNum('INHOUSE_TOTAL_PASSED') ?? getAsOnMetricNum('INHOUSE_GREIGE_PASSED_MTRS');
                const inRejAsOn = getAsOnMetricNum('INHOUSE_TOTAL_REJECTED') ?? getAsOnMetricNum('INHOUSE_GREIGE_REJECTED_MTRS');
                const inRejPctAsOn = (inInspAsOn && inInspAsOn > 0 && inRejAsOn !== null) ? ((inRejAsOn / inInspAsOn) * 100).toFixed(2) + '%' : '';

                const vnInspAsOn = getAsOnMetricNum('VENDOR_TOTAL_INSPECTED') ?? getAsOnMetricNum('VENDOR_GREIGE_INSPECTED_MTRS');
                const vnPassAsOn = getAsOnMetricNum('VENDOR_TOTAL_PASSED') ?? getAsOnMetricNum('VENDOR_GREIGE_PASSED_MTRS');
                const vnRejAsOn = getAsOnMetricNum('VENDOR_TOTAL_REJECTED') ?? getAsOnMetricNum('VENDOR_GREIGE_REJECTED_MTRS');
                const vnRejPctAsOn = (vnInspAsOn && vnInspAsOn > 0 && vnRejAsOn !== null) ? ((vnRejAsOn / vnInspAsOn) * 100).toFixed(2) + '%' : '';

                const washTotAsOn = getAsOnMetricNum('WASHING_TOTAL_MTRS');
                const washPassAsOn = getAsOnMetricNum('WASHING_TOTAL_PASSED');
                const washRejAsOn = getAsOnMetricNum('WASHING_TOTAL_REJECTED');
                const washRejPctAsOn = (washTotAsOn && washTotAsOn > 0 && washRejAsOn !== null) ? ((washRejAsOn / washTotAsOn) * 100).toFixed(2) + '%' : '';

                const hasAnyInspAsOn = inInspAsOn !== null || vnInspAsOn !== null || washTotAsOn !== null;
                const totInspAsOn = hasAnyInspAsOn ? ((inInspAsOn || 0) + (vnInspAsOn || 0) + (washTotAsOn || 0)) : null;
                const hasAnyPassAsOn = inPassAsOn !== null || vnPassAsOn !== null || washPassAsOn !== null;
                const totPassAsOn = hasAnyPassAsOn ? ((inPassAsOn || 0) + (vnPassAsOn || 0) + (washPassAsOn || 0)) : null;
                const hasAnyRejAsOn = inRejAsOn !== null || vnRejAsOn !== null || washRejAsOn !== null;
                const totRejAsOn = hasAnyRejAsOn ? ((inRejAsOn || 0) + (vnRejAsOn || 0) + (washRejAsOn || 0)) : null;
                const rejPctAsOn = (totInspAsOn && totInspAsOn > 0 && totRejAsOn !== null) ? ((totRejAsOn / totInspAsOn) * 100).toFixed(2) + '%' : '';

                // Finished Fabric AS ON DATE
                const finInspAsOn = getAsOnMetricNum('FINISHED_INSPECTION_MTRS') ?? getAsOnMetricNum('FINISHED_INSPECTED_MTRS') ?? getAsOnMetricNum('FINISH_PRODN_MTRS');
                const procRejAsOn = getAsOnMetricNum('PROCESSING_REJECTION_MTRS');
                const procRejPctAsOn = (finInspAsOn && finInspAsOn > 0 && procRejAsOn !== null) ? ((procRejAsOn / finInspAsOn) * 100).toFixed(2) + '%' : '';
                const venRejAsOn = getAsOnMetricNum('VENDOR_REJECTION_MTRS');
                const venRejPctAsOn = (finInspAsOn && finInspAsOn > 0 && venRejAsOn !== null) ? ((venRejAsOn / finInspAsOn) * 100).toFixed(2) + '%' : '';
                const weavRejAsOn = getAsOnMetricNum('WEAVING_REJECTION_MTRS');
                const weavRejPctAsOn = (finInspAsOn && finInspAsOn > 0 && weavRejAsOn !== null) ? ((weavRejAsOn / finInspAsOn) * 100).toFixed(2) + '%' : '';
                const hasAnyFinRejAsOn = procRejAsOn !== null || venRejAsOn !== null || weavRejAsOn !== null;
                const totRejFinAsOn = hasAnyFinRejAsOn ? ((procRejAsOn || 0) + (venRejAsOn || 0) + (weavRejAsOn || 0)) : null;
                const realPctAsOn = (finInspAsOn && finInspAsOn > 0 && totRejFinAsOn !== null) ? (Math.max(0, 100 - (totRejFinAsOn / finInspAsOn) * 100)).toFixed(2) + '%' : '';

                const procRewAsOn = getAsOnMetricNum('PROCESSING_REWASH_MTRS') ?? getAsOnMetricNum('PROC_REWASH_MTRS');
                const procRewPctAsOn = (finInspAsOn && finInspAsOn > 0 && procRewAsOn !== null) ? ((procRewAsOn / finInspAsOn) * 100).toFixed(2) + '%' : '';
                const venRewAsOn = getAsOnMetricNum('VENDOR_REWASH_MTRS');
                const venRewPctAsOn = (finInspAsOn && finInspAsOn > 0 && venRewAsOn !== null) ? ((venRewAsOn / finInspAsOn) * 100).toFixed(2) + '%' : '';
                const hasAnyRewFinAsOn = procRewAsOn !== null || venRewAsOn !== null;
                const totRewFinAsOn = hasAnyRewFinAsOn ? ((procRewAsOn || 0) + (venRewAsOn || 0)) : null;

                const salesRetAsOn = getAsOnMetricNum('SALES_RETURN_MTRS') ?? getAsOnMetricNum('SALES_RETURNS_MTRS');

                const giRowPairs = [
                  { leftLabel: 'INHOUSE - TOTAL MTRS INSPECTED', leftAsOn: renderNumCell(inInspAsOn), leftUpto: renderNumCell(inInspU), rightLabel: 'FINISHED INSPECTION MTRS', rightAsOn: renderNumCell(finInspAsOn), rightUpto: renderNumCell(finInspU) },
                  { leftLabel: 'INHOUSE - TOTAL MTRS PASSED', leftAsOn: renderNumCell(inPassAsOn), leftUpto: renderNumCell(inPassU), rightLabel: 'REALISATION%', rightAsOn: realPctAsOn, rightUpto: realPctU },
                  { leftLabel: 'INHOUSE - TOTAL MTRS REJECTED', leftAsOn: renderNumCell(inRejAsOn), leftUpto: renderNumCell(inRejU), rightLabel: 'PROCESSING REJECTION MTRS', rightAsOn: renderNumCell(procRejAsOn), rightUpto: renderNumCell(procRejU) },
                  { leftLabel: 'INHOUSE - REJECTION %', leftAsOn: inRejPctAsOn, leftUpto: inRejPctU, rightLabel: 'REJECTION%', rightAsOn: procRejPctAsOn, rightUpto: procRejPctU },
                  { leftLabel: 'VENDOR - TOTAL MTRS INSPECTED', leftAsOn: renderNumCell(vnInspAsOn), leftUpto: renderNumCell(vnInspU), rightLabel: 'VENDOR REJECTION MTRS', rightAsOn: renderNumCell(venRejAsOn), rightUpto: renderNumCell(venRejU) },
                  { leftLabel: 'VENDOR - TOTAL MTRS PASSED', leftAsOn: renderNumCell(vnPassAsOn), leftUpto: renderNumCell(vnPassU), rightLabel: 'REJECTION%', rightAsOn: venRejPctAsOn, rightUpto: venRejPctU },
                  { leftLabel: 'VENDOR - TOTAL MTRS REJECTED', leftAsOn: renderNumCell(vnRejAsOn), leftUpto: renderNumCell(vnRejU), rightLabel: 'WEAVING REJECTION MTRS', rightAsOn: renderNumCell(weavRejAsOn), rightUpto: renderNumCell(weavRejU) },
                  { leftLabel: 'VENDOR - REJECTION %', leftAsOn: vnRejPctAsOn, leftUpto: vnRejPctU, rightLabel: 'REJECTION %', rightAsOn: weavRejPctAsOn, rightUpto: weavRejPctU },
                  { leftLabel: '', leftAsOn: '', leftUpto: '', rightLabel: 'TOTAL', rightAsOn: renderNumCell(totRejFinAsOn), rightUpto: renderNumCell(totRejFinU), isRightBold: true },
                  { leftLabel: 'WASHING-TOTAL MTRS', leftAsOn: renderNumCell(washTotAsOn), leftUpto: renderNumCell(washTotU), rightLabel: 'PROCESSING REWASH MTRS', rightAsOn: renderNumCell(procRewAsOn), rightUpto: renderNumCell(procRewU) },
                  { leftLabel: 'WASHING-TOTAL PASSED', leftAsOn: renderNumCell(washPassAsOn), leftUpto: renderNumCell(washPassU), rightLabel: 'REWASH%', rightAsOn: procRewPctAsOn, rightUpto: procRewPctU },
                  { leftLabel: 'WASHING-TOTAL MTRS REJECTED', leftAsOn: renderNumCell(washRejAsOn), leftUpto: renderNumCell(washRejU), rightLabel: 'VENDOR REWASH MTRS', rightAsOn: renderNumCell(venRewAsOn), rightUpto: renderNumCell(venRewU) },
                  { leftLabel: 'WASHING-REJECTION%', leftAsOn: washRejPctAsOn, leftUpto: washRejPctU, rightLabel: 'REWASH%', rightAsOn: venRewPctAsOn, rightUpto: venRewPctU },
                  { leftLabel: '', leftAsOn: '', leftUpto: '', rightLabel: 'TOTAL', rightAsOn: renderNumCell(totRewFinAsOn), rightUpto: renderNumCell(totRewFinU), isRightBold: true },
                  { leftLabel: 'TOTAL MTRS INSPECTED', leftAsOn: renderNumCell(totInspAsOn), leftUpto: renderNumCell(totInspU), rightLabel: 'SALES RETURNS', rightAsOn: renderNumCell(salesRetAsOn), rightUpto: '-' },
                  { leftLabel: 'TOTAL MTRS PASSED', leftAsOn: renderNumCell(totPassAsOn), leftUpto: renderNumCell(totPassU), rightLabel: '', rightAsOn: '', rightUpto: '' },
                  { leftLabel: 'TOTAL MTRS REJECTED', leftAsOn: renderNumCell(totRejAsOn), leftUpto: renderNumCell(totRejU), rightLabel: 'REMARKS', rightAsOn: '', rightUpto: '', isRightHeader: true },
                  { leftLabel: 'REJECTION %', leftAsOn: rejPctAsOn, leftUpto: rejPctU, rightLabel: '', rightAsOn: '', rightUpto: '' },
                ];

                return (
                  <tr>
                    <td className="p-center p-bold">4</td>
                    <td className="p-merged-center">GREIGE INSPECTION</td>
                    <td className="p-merged-center">{effectivePrintMasters['GREIGE_INSPECTION']?.head || 'GUNASEKARAN'}</td>
                    <td className="p-merged-center">{effectivePrintMasters['GREIGE_INSPECTION']?.mentor || 'M.RAMESH'}</td>
                    <td colSpan={2} style={{ padding: 0 }}>
                      <table className="p-gi-table">
                        <colgroup>
                          <col style={{ width: '21.0%' }} />
                          <col style={{ width: '14.5%' }} />
                          <col style={{ width: '14.5%' }} />
                          <col style={{ width: '21.0%' }} />
                          <col style={{ width: '14.5%' }} />
                          <col style={{ width: '14.5%' }} />
                        </colgroup>
                        <thead>
                          <tr>
                            <th colSpan={3} style={{ backgroundColor: '#fef08a', textAlign: 'center', fontWeight: 'bold' }}>GREIGE FABRIC</th>
                            <th colSpan={3} style={{ backgroundColor: '#fef08a', textAlign: 'center', fontWeight: 'bold' }}>FINISHED FABRIC</th>
                          </tr>
                          <tr>
                            <th style={{ textAlign: 'left', backgroundColor: '#fef08a' }}>DETAILS</th>
                            <th style={{ textAlign: 'center', backgroundColor: '#fef08a' }}>AS ON DATE</th>
                            <th style={{ textAlign: 'center', backgroundColor: '#fef08a' }}>UP TO DATE</th>
                            <th style={{ textAlign: 'left', backgroundColor: '#fef08a' }}>DETAILS</th>
                            <th style={{ textAlign: 'center', backgroundColor: '#fef08a' }}>AS ON DATE</th>
                            <th style={{ textAlign: 'center', backgroundColor: '#fef08a' }}>UP TO DATE</th>
                          </tr>
                        </thead>
                        <tbody>
                          {giRowPairs.map((r, i) => (
                            <tr key={i}>
                              <td className="p-left p-bold">{r.leftLabel}</td>
                              <td className="p-center">{r.leftAsOn}</td>
                              <td className="p-center">{r.leftUpto}</td>
                              <td className={`p-left ${r.isRightBold ? 'p-bold' : ''} ${r.isRightHeader ? 'p-bold p-center' : ''}`}>{r.rightLabel}</td>
                              <td className={`p-center ${r.isRightBold ? 'p-bold' : ''}`}>{r.rightAsOn}</td>
                              <td className={`p-center ${r.isRightBold ? 'p-bold' : ''}`}>{r.rightUpto}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                );
              })()}

              {/* 5. MENDING (11 rows matching Image 4) */}
              {(() => {
                const inInspAsOn = getAsOnMetricNum('INHOUSE_TOTAL_INSPECTED') ?? getAsOnMetricNum('INHOUSE_GREIGE_INSPECTED_MTRS');
                const vnInspAsOn = getAsOnMetricNum('VENDOR_TOTAL_INSPECTED') ?? getAsOnMetricNum('VENDOR_GREIGE_INSPECTED_MTRS');
                const washTotAsOn = getAsOnMetricNum('WASHING_TOTAL_MTRS');
                const hasAnyInspAsOn = inInspAsOn !== null || vnInspAsOn !== null || washTotAsOn !== null;
                const totInspAsOn = hasAnyInspAsOn ? ((inInspAsOn || 0) + (vnInspAsOn || 0) + (washTotAsOn || 0)) : null;

                const wIn_asOn = getAsOnMetricNum('WEAVING_INHOUSE_MTRS');
                const wVen_asOn = getAsOnMetricNum('WEAVING_VENDOR_MTRS');
                const totW_asOn = (wIn_asOn !== null || wVen_asOn !== null) ? ((wIn_asOn || 0) + (wVen_asOn || 0)) : null;

                const yIn_asOn = getAsOnMetricNum('YARN_INHOUSE_MTRS');
                const yVen_asOn = getAsOnMetricNum('YARN_VENDOR_MTRS');
                const totY_asOn = (yIn_asOn !== null || yVen_asOn !== null) ? ((yIn_asOn || 0) + (yVen_asOn || 0)) : null;

                const sIn_asOn = getAsOnMetricNum('SIZING_INHOUSE_MTRS');
                const sVen_asOn = getAsOnMetricNum('SIZING_VENDOR_MTRS');
                const p_asOn = getAsOnMetricNum('PROCESSING_MTRS');
                const hasAnyMendAsOn = (totW_asOn !== null) || (totY_asOn !== null) || (sIn_asOn !== null) || (sVen_asOn !== null) || (p_asOn !== null);
                const grand_asOn = hasAnyMendAsOn ? ((totW_asOn || 0) + (totY_asOn || 0) + (sIn_asOn || 0) + (sVen_asOn || 0) + (p_asOn || 0)) : null;

                const wIn_u = effectivePrintMonthly.find(m => m.metric_code === 'WEAVING_INHOUSE_MTRS')?.monthlyTotal;
                const wVen_u = effectivePrintMonthly.find(m => m.metric_code === 'WEAVING_VENDOR_MTRS')?.monthlyTotal;
                const totW_u = (wIn_u !== undefined || wVen_u !== undefined) ? ((wIn_u || 0) + (wVen_u || 0)) : null;

                const yIn_u = effectivePrintMonthly.find(m => m.metric_code === 'YARN_INHOUSE_MTRS')?.monthlyTotal;
                const yVen_u = effectivePrintMonthly.find(m => m.metric_code === 'YARN_VENDOR_MTRS')?.monthlyTotal;
                const totY_u = (yIn_u !== undefined || yVen_u !== undefined) ? ((yIn_u || 0) + (yVen_u || 0)) : null;

                const sIn_u = effectivePrintMonthly.find(m => m.metric_code === 'SIZING_INHOUSE_MTRS')?.monthlyTotal;
                const sVen_u = effectivePrintMonthly.find(m => m.metric_code === 'SIZING_VENDOR_MTRS')?.monthlyTotal;
                const p_u = effectivePrintMonthly.find(m => m.metric_code === 'PROCESSING_MTRS')?.monthlyTotal;
                const hasAnyMendU = (totW_u !== null) || (totY_u !== null) || (sIn_u !== undefined) || (sVen_u !== undefined) || (p_u !== undefined);
                const grand_u = hasAnyMendU ? ((totW_u || 0) + (totY_u || 0) + (sIn_u || 0) + (sVen_u || 0) + (p_u || 0)) : null;

                const calcMendPct = (val: number | null | undefined, denom: number | null | undefined) => {
                  if (val !== null && val !== undefined && denom && denom > 0) {
                    return ((val / denom) * 100).toFixed(2) + '%';
                  }
                  return '';
                };

                const mendingRows = [
                  { label: 'WEAVING- (INHOUSE)', asOn: renderNumCell(wIn_asOn), upto: renderNumCell(wIn_u), pct: calcMendPct(wIn_asOn, inInspAsOn) },
                  { label: 'WEAVING-(VENDOR)', asOn: renderNumCell(wVen_asOn), upto: renderNumCell(wVen_u), pct: calcMendPct(wVen_asOn, vnInspAsOn) },
                  { label: 'TOTAL', asOn: renderNumCell(totW_asOn), upto: renderNumCell(totW_u), pct: calcMendPct(totW_asOn, totInspAsOn), isBold: true },
                  { label: 'YARN-(INHOUSE)', asOn: renderNumCell(yIn_asOn), upto: renderNumCell(yIn_u), pct: calcMendPct(yIn_asOn, inInspAsOn) },
                  { label: 'YARN-(VENDOR)', asOn: renderNumCell(yVen_asOn), upto: renderNumCell(yVen_u), pct: calcMendPct(yVen_asOn, vnInspAsOn) },
                  { label: 'TOTAL', asOn: renderNumCell(totY_asOn), upto: renderNumCell(totY_u), pct: calcMendPct(totY_asOn, totInspAsOn), isBold: true },
                  { label: 'SIZING - (INHOUSE)', asOn: renderNumCell(sIn_asOn), upto: renderNumCell(sIn_u), pct: calcMendPct(sIn_asOn, inInspAsOn) },
                  { label: 'SIZING - (VENDOR)', asOn: renderNumCell(sVen_asOn), upto: renderNumCell(sVen_u), pct: calcMendPct(sVen_asOn, vnInspAsOn) },
                  { label: 'PROCESSING', asOn: renderNumCell(p_asOn), upto: renderNumCell(p_u), pct: calcMendPct(p_asOn, totInspAsOn) },
                  { label: 'TOTAL', asOn: renderNumCell(grand_asOn), upto: renderNumCell(grand_u), pct: calcMendPct(grand_asOn, totInspAsOn), isBold: true }
                ];

                return (
                  <>
                    <tr>
                      <td rowSpan={11} className="p-center p-bold">5</td>
                      <td rowSpan={11} className="p-merged-center">MENDING</td>
                      <td rowSpan={11} className="p-merged-center">{effectivePrintMasters['MENDING']?.head || 'GUNASEKARAN'}</td>
                      <td rowSpan={11} className="p-merged-center">{effectivePrintMasters['MENDING']?.mentor || 'MATHESHWARAN'}</td>
                      <td className="p-left p-bold" style={{ backgroundColor: '#fef08a' }}></td>
                      <td style={{ padding: 0 }}>
                        <table className="p-sub-table">
                          <colgroup><col style={{ width: '34%' }} /><col style={{ width: '33%' }} /><col style={{ width: '33%' }} /></colgroup>
                          <thead>
                            <tr>
                              <th style={{ backgroundColor: '#fef08a', textAlign: 'center', fontWeight: 'bold' }}>AS ON DATE</th>
                              <th style={{ backgroundColor: '#fef08a', textAlign: 'center', fontWeight: 'bold' }}>UP TO DATE</th>
                              <th style={{ backgroundColor: '#fef08a', textAlign: 'center', fontWeight: 'bold' }}>%</th>
                            </tr>
                          </thead>
                        </table>
                      </td>
                    </tr>
                    {mendingRows.map((mRow, mIdx) => (
                      <tr key={mIdx}>
                        <td className={`p-left ${mRow.isBold ? 'p-bold' : ''}`}>{mRow.label}</td>
                        <td style={{ padding: 0 }}>
                          <table className="p-sub-table">
                            <colgroup><col style={{ width: '34%' }} /><col style={{ width: '33%' }} /><col style={{ width: '33%' }} /></colgroup>
                            <tbody>
                              <tr>
                                <td className={`p-center ${mRow.isBold ? 'p-bold' : ''}`}>{mRow.asOn}</td>
                                <td className={`p-center ${mRow.isBold ? 'p-bold' : ''}`}>{mRow.upto}</td>
                                <td className={`p-center ${mRow.isBold ? 'p-bold' : ''}`}>{mRow.pct}</td>
                              </tr>
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    ))}
                  </>
                );
              })()}

              {/* 6. PROCESSING & OTD PENDING STATUS */}
              {(() => {
                const gStock = getPrintMetricNum('GREIGE_FABRIC_STOCK_MTRS');
                const ydStock = getPrintMetricNum('YARN_DYED_FABRIC_STOCK_MTRS');
                const totStock = (gStock !== null || ydStock !== null) ? ((gStock || 0) + (ydStock || 0)) : null;
                const savedNoOfDays = getPrintMetricVal('NO_OF_DAYS');
                const dispTotalDays = (savedNoOfDays !== undefined && savedNoOfDays !== null && savedNoOfDays !== '') ? savedNoOfDays : (totStock !== null ? calcNoOfDays(totStock) : '');

                const reportDateObj = parseISO(printToDate || selectedDate);
                const curDateColHdr = isValid(reportDateObj) ? format(reportDateObj, 'dd-MMM') : (printToDate || selectedDate);

                const getOtdVal = (code: string) => {
                  return getPrintMetricVal(code) || (METRIC_CODE_ALIASES[code] ? getPrintMetricVal(METRIC_CODE_ALIASES[code][0]) : '');
                };

                const otdItems = [
                  { dept: 'Greige Yarn', d1: getOtdVal('OTD_GREIGE_YARN'), d2: '' },
                  { dept: 'Dyed Yarn', d1: getOtdVal('OTD_DYED_YARN'), d2: '' },
                  { dept: 'Sizing', d1: getOtdVal('OTD_SIZING'), d2: '' },
                  { dept: 'Greige WareHouse', d1: getOtdVal('OTD_GREIGE_WAREHOUSE'), d2: '' },
                  { dept: 'Processing', d1: getOtdVal('OTD_PROCESSING'), d2: '' },
                  { dept: 'Finished WareHouse', d1: getOtdVal('OTD_FINISHED_WAREHOUSE'), d2: '' },
                  { dept: 'Final Dispatch', d1: getOtdVal('OTD_FINAL_DISPATCH'), d2: '' },
                ];

                return (
                  <>
                    {/* Row 6: PROCESSING */}
                    <tr>
                      <td className="p-center p-bold">6</td>
                      <td className="p-merged-center">PROCESSING</td>
                      <td className="p-merged-center">{effectivePrintMasters['PROCESSING']?.head || 'NATESAN'}</td>
                      <td className="p-merged-center">{effectivePrintMasters['PROCESSING']?.mentor || 'NATESAN'}</td>
                      <td colSpan={2} style={{ padding: 0 }}>
                        <table className="p-sub-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <colgroup>
                            <col style={{ width: '22%' }} />
                            <col style={{ width: '19%' }} />
                            <col style={{ width: '18%' }} />
                            <col style={{ width: '41.0%' }} />
                          </colgroup>
                          <thead>
                            <tr>
                              <th style={{ backgroundColor: '#fef08a', textAlign: 'left', fontWeight: 'bold' }}></th>
                              <th style={{ backgroundColor: '#fef08a', textAlign: 'center', fontWeight: 'bold' }}>QTY</th>
                              <th style={{ backgroundColor: '#fef08a', textAlign: 'center', fontWeight: 'bold' }}>NO OF DAYS</th>
                              <th style={{ backgroundColor: '#fef08a', textAlign: 'center', fontWeight: 'bold' }}>OTD PENDING STATUS</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td className="p-left p-bold">GREIGE FABRIC STOCK</td>
                              <td className="p-center">{renderNumCell(gStock)}</td>
                              <td className="p-center">{gStock !== null ? calcNoOfDays(gStock) : ''}</td>
                              <td rowSpan={3} style={{ padding: 0, verticalAlign: 'top' }}>
                                <table className="p-otd-table">
                                  <colgroup>
                                    <col style={{ width: '52%' }} />
                                    <col style={{ width: '24%' }} />
                                    <col style={{ width: '24%' }} />
                                  </colgroup>
                                  <thead>
                                    <tr>
                                      <th style={{ backgroundColor: '#fde2d2', textAlign: 'left', color: '#c2410c' }}>Departments Wise Pending</th>
                                      <th style={{ backgroundColor: '#fde2d2', textAlign: 'center', color: '#c2410c' }}>{curDateColHdr}</th>
                                      <th style={{ backgroundColor: '#fde2d2', textAlign: 'center', color: '#c2410c' }}>-</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {otdItems.map((otd, oi) => (
                                      <tr key={oi}>
                                        <td className="p-left p-bold">{otd.dept}</td>
                                        <td className="p-center">{otd.d1}</td>
                                        <td className="p-center">{otd.d2}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                            <tr>
                              <td className="p-left p-bold">YARN DYED FABRIC STOCK</td>
                              <td className="p-center">{renderNumCell(ydStock)}</td>
                              <td className="p-center">{ydStock !== null ? calcNoOfDays(ydStock) : ''}</td>
                            </tr>
                            <tr>
                              <td className="p-left p-bold">TOTAL</td>
                              <td className="p-center p-bold">{renderNumCell(totStock)}</td>
                              <td className="p-center p-bold">{dispTotalDays}</td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>

                    {/* Row 7: RAW MATERIAL */}
                    {(() => {
                      const gTot = getAsOnMetricVal('GREIGE_TOTAL_ORDERS') || getPrintMetricVal('GREIGE_TOTAL_ORDERS') || '';
                      const gComp = getAsOnMetricVal('GREIGE_YARN_COMPLETED') || getPrintMetricVal('GREIGE_YARN_COMPLETED') || '';
                      const gNot = getAsOnMetricVal('GREIGE_NOT_COMPLETED') || getPrintMetricVal('GREIGE_NOT_COMPLETED') || '';
                      const gOn = getAsOnMetricVal('GREIGE_ONTIME') || getPrintMetricVal('GREIGE_ONTIME') || '';
                      const gDel = getAsOnMetricVal('GREIGE_DELAY') || getPrintMetricVal('GREIGE_DELAY') || '';

                      const dTot = getAsOnMetricVal('DYED_TOTAL_ORDERS') || getPrintMetricVal('DYED_TOTAL_ORDERS') || '';
                      const dComp = getAsOnMetricVal('DYED_YARN_COMPLETED') || getPrintMetricVal('DYED_YARN_COMPLETED') || '';
                      const dNot = getAsOnMetricVal('DYED_NOT_COMPLETED') || getPrintMetricVal('DYED_NOT_COMPLETED') || '';
                      const dOn = getAsOnMetricVal('DYED_ONTIME') || getPrintMetricVal('DYED_ONTIME') || '';
                      const dDel = getAsOnMetricVal('DYED_DELAY') || getPrintMetricVal('DYED_DELAY') || '';

                      const rmRows = [
                        { label: 'TOTAL NO OF ORDERS', v1: gTot, v2: dTot },
                        { label: 'YARN COMPLETED',     v1: gComp, v2: dComp },
                        { label: 'NOT COMPLETED',      v1: gNot, v2: dNot },
                        { label: 'ONTIME',             v1: gOn, v2: dOn },
                        { label: 'DELAY',              v1: gDel, v2: dDel },
                      ];

                      return (
                        <>
                          <tr>
                            <td rowSpan={6} className="p-center p-bold">7</td>
                            <td rowSpan={6} className="p-merged-center">RAW MATERIAL</td>
                            <td rowSpan={6} className="p-merged-center">{effectivePrintMasters['RAW_MATERIAL']?.head || 'VENKAT'}</td>
                            <td rowSpan={6} className="p-merged-center">{effectivePrintMasters['RAW_MATERIAL']?.mentor || 'MOHANA /CHANDRU'}</td>
                            <td className="p-left p-bold" style={{ backgroundColor: '#fef08a' }}></td>
                            <td style={{ padding: 0 }}>
                              <table className="p-sub-table">
                                <colgroup><col style={{ width: '50%' }} /><col style={{ width: '50%' }} /></colgroup>
                                <thead>
                                  <tr>
                                    <th style={{ backgroundColor: '#fef08a', textAlign: 'center', fontWeight: 'bold' }}>GREY</th>
                                    <th style={{ backgroundColor: '#fef08a', textAlign: 'center', fontWeight: 'bold' }}>YD</th>
                                  </tr>
                                </thead>
                              </table>
                            </td>
                          </tr>
                          {rmRows.map((rm, rIdx) => (
                            <tr key={rIdx}>
                              <td className="p-left p-bold">{rm.label}</td>
                              <td style={{ padding: 0 }}>
                                <table className="p-sub-table">
                                  <colgroup><col style={{ width: '50%' }} /><col style={{ width: '50%' }} /></colgroup>
                                  <tbody>
                                    <tr>
                                      <td className="p-center">{rm.v1}</td>
                                      <td className="p-center">{rm.v2}</td>
                                    </tr>
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          ))}
                        </>
                      );
                    })()}

                    {/* Row 8: GREY WAREHOUSE */}
                    {(() => {
                      const gwProdnG = getAsOnMetricNum('TOTAL_PRODN_GREIGE');
                      const gwProdnF = getAsOnMetricNum('TOTAL_PRODN_FINISH');
                      const gwOut = getAsOnMetricNum('GREIGE_YD_OUTWARD');

                      const gwProdnG_u = effectivePrintMonthly.find(m => m.metric_code === 'TOTAL_PRODN_GREIGE' || m.metric_code === 'GREIGE_PRODUCTION_MTRS' || m.metric_code === 'GREIGE_PRODN_MTRS')?.monthlyTotal;
                      const gwProdnF_u = effectivePrintMonthly.find(m => m.metric_code === 'TOTAL_PRODN_FINISH' || m.metric_code === 'FINISH_PRODUCTION_MTRS' || m.metric_code === 'FINISH_PRODN_MTRS')?.monthlyTotal;
                      const gwOut_u = effectivePrintMonthly.find(m => m.metric_code === 'GREIGE_YD_OUTWARD' || m.metric_code === 'GREIGE_YD_OUTWARD_MTRS')?.monthlyTotal;

                      const gwRows = [
                        { label: 'TOTAL PRODN-GREIGE', asOn: renderNumCell(gwProdnG), upto: renderNumCell(gwProdnG_u) },
                        { label: 'TOTAL PRODN-FINISH', asOn: renderNumCell(gwProdnF), upto: renderNumCell(gwProdnF_u) },
                        { label: 'GREIGE & YD OUTWARD', asOn: renderNumCell(gwOut), upto: renderNumCell(gwOut_u) },
                      ];

                      return (
                        <>
                          <tr>
                            <td rowSpan={4} className="p-center p-bold">8</td>
                            <td rowSpan={4} className="p-merged-center">GREY WAREHOUSE</td>
                            <td rowSpan={4} className="p-merged-center">{effectivePrintMasters['GREY_WAREHOUSE']?.head || 'GUNASEKARAN'}</td>
                            <td rowSpan={4} className="p-merged-center">{effectivePrintMasters['GREY_WAREHOUSE']?.mentor || 'M.RAMESH / VIVEK'}</td>
                            <td className="p-left p-bold" style={{ backgroundColor: '#fef08a' }}></td>
                            <td style={{ padding: 0 }}>
                              <table className="p-sub-table">
                                <colgroup><col style={{ width: '50%' }} /><col style={{ width: '50%' }} /></colgroup>
                                <thead>
                                  <tr>
                                    <th style={{ backgroundColor: '#fef08a', textAlign: 'center', fontWeight: 'bold' }}>AS ON DATE</th>
                                    <th style={{ backgroundColor: '#fef08a', textAlign: 'center', fontWeight: 'bold' }}>UP TO DATE</th>
                                  </tr>
                                </thead>
                              </table>
                            </td>
                          </tr>
                          {gwRows.map((gw, gIdx) => (
                            <tr key={gIdx}>
                              <td className="p-left p-bold">{gw.label}</td>
                              <td style={{ padding: 0 }}>
                                <table className="p-sub-table">
                                  <colgroup><col style={{ width: '50%' }} /><col style={{ width: '50%' }} /></colgroup>
                                  <tbody>
                                    <tr>
                                      <td className="p-center">{gw.asOn}</td>
                                      <td className="p-center">{gw.upto}</td>
                                    </tr>
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          ))}
                        </>
                      );
                    })()}

                    {/* Row 9: HRD (matching Image 4) */}
                    {(() => {
                      const engStr = getPrintMetricNum('ENGAGED_STRENGTH');
                      const excess = (engStr !== null && engStr !== undefined) ? (engStr - 510) : null;
                      const joiners = getPrintMetricVal('NO_OF_NEW_JOINERS') || '';
                      const others = getPrintMetricVal('HRD_OTHERS') || '';

                      const hrRows = [
                        { label: 'APPROVED STRENGTH', val: '510', isBold: false },
                        { label: 'ENGAGED STRENGTH',  val: renderNumCell(engStr), isBold: false },
                        { label: 'EXCESS',            val: excess !== null ? ((excess > 0 ? '+' : '') + renderNumCell(excess)) : '', isBold: true },
                        { label: 'NO OF NEW JOINERS', val: joiners, isBold: false },
                        { label: 'OTHERS',            val: others, isBold: false },
                      ];

                      return (
                        <>
                          {hrRows.map((hr, hIdx) => (
                            <tr key={hIdx}>
                              {hIdx === 0 && (
                                <>
                                  <td rowSpan={5} className="p-center p-bold">9</td>
                                  <td rowSpan={5} className="p-merged-center">HRD</td>
                                  <td rowSpan={5} className="p-merged-center">{effectivePrintMasters['HRD']?.head || 'JAYANTH'}</td>
                                  <td rowSpan={5} className="p-merged-center">{effectivePrintMasters['HRD']?.mentor || 'MOHAN'}</td>
                                </>
                              )}
                              <td className="p-left p-bold">{hr.label}</td>
                              <td className={`p-center ${hr.isBold ? 'p-bold' : ''}`}>{hr.val}</td>
                            </tr>
                          ))}
                        </>
                      );
                    })()}
                  </>
                );
              })()}
            </tbody>
          </table>

          <div className="p-page-ftr">
            <div>Santhi Processing Unit Pvt. Ltd. — Confidential Factory Production Report</div>
            <div>Page 1 of 2</div>
          </div>
        </div>

        {/* ================================================
            PAGE 2: DAILY MEETING PRODUCTION TARGETS — EXECUTIVE SUMMARY
            ================================================ */}
        <div className="daily-report-print-page page-2">
          <div className="p-page-hdr">
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <img src={COMPANY_LOGO_DATA_URL} alt="SPUPL" className="p-page-hdr-logo" />
              <div>
                <div className="p-page-hdr-co">SANTHI PROCESSING UNIT PVT. LTD.</div>
                <div className="p-page-hdr-sub">DAILY MEETING PRODUCTION TARGETS — EXECUTIVE SUMMARY</div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="p-page-hdr-date">DATE: {effectivePrintDate}</div>
              <div className="p-page-hdr-pgno">Page 2 of 2</div>
            </div>
          </div>

          <table className="p2-table" style={{ flex: '1 1 auto' }}>
            <colgroup>
              <col style={{ width: '2.5%' }} />
              <col style={{ width: '8.0%' }} />
              <col style={{ width: '8.5%' }} />
              <col style={{ width: '8.5%' }} />
              <col style={{ width: '15.0%' }} />
              <col style={{ width: '5.5%' }} />
              <col style={{ width: '5.5%' }} />
              <col style={{ width: '5.5%' }} />
              <col style={{ width: '4.5%' }} />
              <col style={{ width: '4.5%' }} />
              <col style={{ width: '7.5%' }} />
              <col style={{ width: '6.5%' }} />
              <col style={{ width: '6.5%' }} />
              <col style={{ width: '4.5%' }} />
              <col style={{ width: '4.5%' }} />
              <col style={{ width: '3.0%' }} />
            </colgroup>
            <thead>
              <tr style={{ height: '14px', backgroundColor: '#fef08a' }}>
                <th colSpan={2} style={{ textAlign: 'left', backgroundColor: '#fef08a', paddingLeft: '4px' }}>Monthly Target Lacs</th>
                <th colSpan={1} style={{ textAlign: 'center', backgroundColor: '#fef08a' }}>18.70</th>
                <th colSpan={1} style={{ textAlign: 'center', backgroundColor: '#fef08a' }}>13.72</th>
                <th colSpan={1} style={{ textAlign: 'center', backgroundColor: '#fef08a' }}>4.98</th>
                <th colSpan={1} style={{ textAlign: 'center', backgroundColor: '#fef08a' }}>0.60</th>
                <th colSpan={1} style={{ textAlign: 'center', backgroundColor: '#fef08a' }}>0.44</th>
                <th colSpan={1} style={{ textAlign: 'center', backgroundColor: '#fef08a' }}>0.16</th>
                <th colSpan={2} style={{ textAlign: 'center', backgroundColor: '#fef08a' }}>Avg/Day</th>
                <th colSpan={6} style={{ textAlign: 'center', backgroundColor: '#fef08a' }}>UP TO DATE / DAY / AVG</th>
              </tr>
              <tr>
                <th>S.NO</th>
                <th>DEPARTMENT</th>
                <th>HEAD</th>
                <th>MENTOR</th>
                <th>NAME</th>
                <th>TARGET</th>
                <th>ACTUAL</th>
                <th>DIFF</th>
                <th>%</th>
                <th>PERF</th>
                <th>UPTO DATE</th>
                <th>AVERAGE</th>
                <th>DEVI</th>
                <th>%</th>
                <th>% AVG</th>
                <th>RANK</th>
              </tr>
            </thead>
            <tbody>
              {preparedDailyMeetingRows.map((r, i) => {
                const target = getPrintMetricNum(r.code + '_TARGET') ?? r.defaultTarget;
                const actual = getPrintMetricNum(r.code);
                const diff = (actual !== null && target !== null) ? (actual - target) : null;
                const pct = (actual !== null && target && target > 0) ? Math.round((actual / target) * 100) + '%' : '';
                const codesToTry = [r.code, ...(METRIC_CODE_ALIASES[r.code] || [])];
                const upto = effectivePrintMonthly.find(m => codesToTry.includes(m.metric_code))?.monthlyTotal;
                const avg = upto !== undefined ? Math.round(upto / 31) : null;
                const devi = (avg !== null && target !== null) ? (avg - target) : null;
                const deviPct = (avg !== null && target && target > 0) ? Math.round(((avg - target) / target) * 100) + '%' : '';

                return (
                  <tr key={i}>
                    {r.sno !== undefined && (
                      <td rowSpan={r.snoRowSpan || 1} className="p-center p-bold">{r.sno}</td>
                    )}
                    {r.dept && (
                      <td rowSpan={r.deptRowSpan || 1} className="p-merged-center">{r.dept}</td>
                    )}
                    {r.renderHead === 'SPAN' && (
                      <td rowSpan={r.headRowSpan || 1} className="p-merged-center">{r.head}</td>
                    )}
                    {r.renderHead === 'EMPTY' && (
                      <td className="p-center"></td>
                    )}
                    {r.renderMentor === 'SPAN' && (
                      <td rowSpan={r.mentorRowSpan || 1} className="p-merged-center">{r.mentor}</td>
                    )}
                    {r.renderMentor === 'EMPTY' && (
                      <td className="p-center"></td>
                    )}
                    <td className="p-center p-bold">{r.name}</td>
                    <td className="p-center">{renderNumCell(target)}</td>
                    <td className="p-center">{renderNumCell(actual)}</td>
                    <td className="p-center" style={{ color: diff !== null && diff < 0 ? '#b91c1c' : diff !== null && diff > 0 ? '#047857' : undefined }}>
                      {diff !== null ? ((diff > 0 ? '+' : '') + renderNumCell(diff)) : ''}
                    </td>
                    <td className="p-center">{renderPctCell(pct)}</td>
                    <td className="p-center">{r.perfScore > 0 ? r.perfScore : ''}</td>
                    <td className="p-center">{renderNumCell(upto)}</td>
                    <td className="p-center">{renderNumCell(avg)}</td>
                    <td className="p-center" style={{ color: devi !== null && devi < 0 ? '#b91c1c' : devi !== null && devi > 0 ? '#047857' : undefined }}>
                      {devi !== null ? ((devi > 0 ? '+' : '') + renderNumCell(devi)) : ''}
                    </td>
                    <td className="p-center">{renderPctCell(deviPct)}</td>
                    {r.renderPerf === 'SPAN' && (
                      <>
                        <td
                          rowSpan={r.overallPerfRowSpan || 1}
                          className="p-center p-bold"
                          style={{ backgroundColor: r.overallPerfColor || '#ffffff', verticalAlign: 'middle' }}
                        >
                          {r.deptPctAvg}
                        </td>
                        <td
                          rowSpan={r.overallPerfRowSpan || 1}
                          className="p-center p-bold"
                          style={{ backgroundColor: r.overallPerfColor || '#ffffff', verticalAlign: 'middle' }}
                        >
                          {r.overallPerfScore}
                        </td>
                      </>
                    )}
                    {r.renderPerf === 'EMPTY' && (
                      <>
                        <td className="p-center"></td>
                        <td className="p-center"></td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="p2-signatory">
            <span>PREPARED BY: _____________________</span>
            <span>CHECKED BY: _____________________</span>
            <span>FACTORY MANAGER: _____________________</span>
            <span>MANAGING DIRECTOR: _____________________</span>
          </div>
          <div className="p-page-ftr">
            <div>Santhi Processing Unit Pvt. Ltd. — Confidential Factory Production Report</div>
            <div>Page 2 of 2</div>
          </div>
        </div>

      </div>

      {/* ── INTERACTIVE SCREEN UI (Hidden when printing) ── */}
      <div className="space-y-6 print:hidden">
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
          {/* Top Header Row */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl text-white shadow-md">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight uppercase">
                  Daily &amp; Periodic Operational Reports
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
                  Department-wise daily data entry with permanent SQL storage, live calculations, and unified print / Excel reporting
                </p>
              </div>
            </div>
          </div>

          {/* ── TWO INDEPENDENT DATE CONTROLS & UNIFIED REPORT ACTIONS ── */}
          <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-700/60 grid grid-cols-1 lg:grid-cols-12 gap-4">
            
            {/* ── SECTION A: ENTRY DATE (DATA ENTRY ONLY) ── */}
            <div className="lg:col-span-6 p-4 bg-slate-50/80 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span className="text-xs font-black text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                    ENTRY DATE
                  </span>
                  <span className="text-[10px] text-slate-400 font-bold hidden sm:inline">
                    (Data Entry Only)
                  </span>
                </div>
                <div className="text-[11px] font-bold text-slate-400 dark:text-slate-500">
                  Active: <span className="text-indigo-600 dark:text-indigo-400 font-black">{formattedDate}</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Stepper with Date input */}
                <div className="flex items-center bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl p-1 shadow-2xs">
                  <button
                    onClick={() => handleStepDate(-1)}
                    className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg transition-colors"
                    title="Previous Entry Date"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <input
                    type="date"
                    value={selectedDate}
                    onChange={e => setSelectedDate(e.target.value)}
                    className="px-2 bg-transparent text-xs font-black text-slate-900 dark:text-slate-100 outline-none cursor-pointer"
                    title="Controls Department Data Entry Only"
                  />

                  <button
                    onClick={() => handleStepDate(1)}
                    className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg transition-colors"
                    title="Next Entry Date"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Jump to Saved History Dates (NO 'metrics logged' text!) */}
                {historyDates.length > 0 && (
                  <select
                    value={selectedDate}
                    onChange={e => setSelectedDate(e.target.value)}
                    className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none shadow-2xs"
                  >
                    <option value="" disabled>Jump to Saved Date...</option>
                    {historyDates.map(h => (
                      <option key={h.date} value={h.date}>
                        {h.date}
                      </option>
                    ))}
                  </select>
                )}

                {/* Reload */}
                <button
                  onClick={() => fetchDailyData(selectedDate)}
                  className="p-2 bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-600 rounded-xl transition-colors shadow-2xs"
                  title="Reload from SQL for Entry Date"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
                </button>

                {/* Re-Entry (New Date) */}
                <button
                  onClick={handleReEntry}
                  className="flex items-center gap-1.5 px-3 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800 rounded-xl text-xs font-black transition-all shadow-2xs"
                  title="Advance to next date with empty fields for clean data entry"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Re-Entry</span>
                </button>
              </div>
            </div>

            {/* ── SECTION B: PRINT DATE & ACTIONS (REPORT & EXCEL ONLY) ── */}
            <div className="lg:col-span-6 p-4 bg-gradient-to-r from-indigo-50/70 via-slate-50/60 to-purple-50/60 dark:from-indigo-950/20 dark:via-slate-900/40 dark:to-purple-950/20 border border-indigo-200/80 dark:border-indigo-800/60 rounded-2xl space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Printer className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span className="text-xs font-black text-indigo-950 dark:text-indigo-200 uppercase tracking-wider">
                    PRINT DATE RANGE
                  </span>
                  <span className="text-[10px] text-slate-500 font-bold hidden sm:inline">
                    (Print &amp; Excel Export Only)
                  </span>
                </div>
                {printFromDate > printToDate && (
                  <span className="text-[10px] font-bold text-rose-600 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    FROM &gt; TO
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {/* From Date */}
                  <div className="flex items-center gap-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl px-2.5 py-1.5 shadow-2xs">
                    <span className="text-[10px] font-black text-slate-500 uppercase">FROM:</span>
                    <input
                      type="date"
                      value={printFromDate}
                      onChange={e => setPrintFromDate(e.target.value)}
                      className="bg-transparent text-xs font-black text-slate-900 dark:text-slate-100 outline-none cursor-pointer"
                      title="Print Report Start Date"
                    />
                  </div>

                  {/* To Date */}
                  <div className="flex items-center gap-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl px-2.5 py-1.5 shadow-2xs">
                    <span className="text-[10px] font-black text-slate-500 uppercase">TO:</span>
                    <input
                      type="date"
                      value={printToDate}
                      onChange={e => setPrintToDate(e.target.value)}
                      className="bg-transparent text-xs font-black text-slate-900 dark:text-slate-100 outline-none cursor-pointer"
                      title="Print Report End Date"
                    />
                  </div>
                </div>

                {/* Exactly ONE Export Excel & Exactly ONE Print Report Action */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleExportExcel}
                    disabled={loading || printFromDate > printToDate}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-xs font-black shadow-sm transition-all"
                    title="Export complete report to Excel based on selected print date range"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>Export Excel</span>
                  </button>

                  <button
                    onClick={handlePrintReport}
                    disabled={loading || printFromDate > printToDate}
                    className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-xs font-black shadow-sm transition-all"
                    title="Generate and print 2-Page Daily Report for selected print date range"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Print Report</span>
                  </button>
                </div>
              </div>
            </div>

          </div>

        {/* Status / Feedback Banner */}
        {feedbackMessage && (
          <div className={`mt-4 p-3 rounded-xl border flex items-center justify-between gap-2 text-xs font-bold animate-fade-in ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
              : 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800'
          }`}>
            <div className="flex items-center gap-2">
              {feedbackMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600" />
              ) : (
                <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600" />
              )}
              <span>{feedbackMessage.text}</span>
            </div>
            <button
              onClick={() => setFeedbackMessage(null)}
              className="text-[10px] font-black underline opacity-70 hover:opacity-100"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          DAILY REPORT & DEPARTMENT-WISE FLOOR DATA ENTRY
         ══════════════════════════════════════════════════════════════════════ */}
      <div className="space-y-6">

          {/* Department Horizontal Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin print:hidden">
            {DEPARTMENTS.map(dept => {
              const hasSaved = dept.rawMetrics.some(m => {
                const e = dailyEntries[m.code];
                return e !== undefined && e.actual_value !== null && e.actual_value !== undefined;
              });
              const isSelected = selectedDeptCode === dept.code;
              const isUserDepartment = userDept === dept.code;

              return (
                <button
                  key={dept.code}
                  onClick={() => setSelectedDeptCode(dept.code)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
                    isSelected
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-200 dark:shadow-none'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>{dept.name}</span>
                  {hasSaved ? (
                    <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" title="Saved in SQL" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" title="No saved record (New Entry)" />
                  )}
                  {isUserDepartment && (
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-200 text-indigo-900 font-black">
                      YOUR DEPT
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Active Department Entry & Calculation Card */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden print:shadow-none print:border-none">
            
            {/* Department Banner Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-indigo-300">
                  <Building2 className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-black tracking-tight">{currentDept.name}</h2>

                    {/* Edit button when saved */}
                    {isCurrentDeptSaved && (
                      <button
                        onClick={() => setIsEditingSaved(v => !v)}
                        className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black transition-all border ${
                          isEditingSaved
                            ? 'bg-amber-400 text-slate-950 border-amber-500 shadow-sm'
                            : 'bg-white/10 hover:bg-white/20 text-white border-white/20'
                        }`}
                        title="Edit saved record for this department and date"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>{isEditingSaved ? 'Close Edit' : 'Edit'}</span>
                      </button>
                    )}

                    {/* Performance Mark Badge */}
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border flex items-center gap-1 ${getPerfBadgeClass(departmentPerformance)}`}>
                      <Award className="w-3 h-3" />
                      <span>PERFORMANCE: {departmentPerformance}</span>
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5 font-medium">{currentDept.description}</p>
                </div>
              </div>

              {/* Editable Head & Mentor Block */}
              <div className="flex items-center gap-4 bg-white/5 px-4 py-2.5 rounded-xl border border-white/10 text-xs">
                {editHeadMentorMode ? (
                  <div className="flex items-center gap-3">
                    <div>
                      <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">Edit Head:</label>
                      <input
                        type="text"
                        value={headInput}
                        onChange={e => setHeadInput(e.target.value)}
                        placeholder="Department Head"
                        className="px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs font-bold text-white outline-none w-32"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">Edit Mentor:</label>
                      <input
                        type="text"
                        value={mentorInput}
                        onChange={e => setMentorInput(e.target.value)}
                        placeholder="Mentor Name"
                        className="px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs font-bold text-white outline-none w-32"
                      />
                    </div>
                    <button
                      onClick={() => setEditHeadMentorMode(false)}
                      className="mt-3 px-2 py-1 bg-indigo-600 text-white rounded text-[10px] font-bold"
                    >
                      Done
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-5">
                    <div>
                      <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">Department Head</span>
                      <span className="font-bold text-white flex items-center gap-1.5 mt-0.5">
                        <User className="w-3 h-3 text-indigo-400" />
                        {currentHead}
                      </span>
                    </div>
                    <div className="w-px h-8 bg-white/10" />
                    <div>
                      <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">Mentor</span>
                      <span className="font-bold text-white flex items-center gap-1.5 mt-0.5">
                        <Users className="w-3 h-3 text-purple-400" />
                        {currentMentor}
                      </span>
                    </div>
                    <button
                      onClick={() => setEditHeadMentorMode(true)}
                      className="p-1 text-slate-400 hover:text-white rounded hover:bg-white/10"
                      title="Edit Department Head & Mentor"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Entry Form + Live Calculations Grid */}
            <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">

              {/* Left Form: Raw Inputs ONLY (No auto-fill!) */}
              <div className="lg:col-span-7 space-y-5">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
                  <div>
                    <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                      1. Daily Floor Data Entry
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Enter today's exact raw floor counts. Input fields start EMPTY for new dates. No auto-filled values.
                    </p>
                  </div>

                  {/* Target Edit Toggle */}
                  <button
                    onClick={() => setEditTargetsMode(v => !v)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      editTargetsMode
                        ? 'bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-950 dark:text-amber-300'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                    title="Toggle editable target values"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>{editTargetsMode ? 'Close Target Edit' : 'Edit Targets'}</span>
                  </button>
                </div>

                <div className="space-y-4">
                  {currentDept.code === 'PLANNING' ? (
                    <div className="space-y-5">
                      {/* Section A: Order Status & Critical Allocations */}
                      <div className="space-y-3.5">
                        <div className="flex items-center gap-2 pb-1 border-b border-slate-200 dark:border-slate-700">
                          <FileSpreadsheet className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                          <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                            Order Status & Critical Tracking
                          </h4>
                        </div>
                        {currentDept.rawMetrics.filter(m => !m.code.startsWith('OTT_')).map((metric: MetricDefinition) => {
                          const val = formInputs[metric.code] !== undefined ? formInputs[metric.code] : '';
                          return (
                            <div
                              key={metric.code}
                              className="bg-slate-50 dark:bg-slate-900/50 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors"
                            >
                              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 block mb-1.5">
                                {metric.name}
                              </label>
                              <textarea
                                rows={2}
                                value={val}
                                onChange={e => handleInputChange(metric.code, e.target.value)}
                                placeholder={metric.placeholder || `Enter ${metric.name}...`}
                                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-xs font-medium text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                              />
                            </div>
                          );
                        })}
                      </div>

                      {/* Section B: OTT PENDING STATUS (DEPARTMENT-WISE PENDING ORDERS) */}
                      <div className="p-4 bg-gradient-to-r from-amber-50/80 via-orange-50/50 to-amber-50/80 dark:from-amber-950/20 dark:via-orange-950/20 dark:to-amber-950/20 rounded-xl border border-amber-200 dark:border-amber-800/60 space-y-3">
                        <div className="flex items-center justify-between border-b border-amber-200 dark:border-amber-800/40 pb-2">
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                            <div>
                              <h4 className="text-xs font-black text-amber-950 dark:text-amber-200 uppercase tracking-wider">
                                OTT PENDING STATUS (DEPARTMENT-WISE PENDING ORDERS)
                              </h4>
                              <p className="text-[10px] text-amber-800 dark:text-amber-400">
                                Enter pending order/lot counts for each stage as of {selectedDate}
                              </p>
                            </div>
                          </div>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-200/80 dark:bg-amber-900/80 text-amber-900 dark:text-amber-200">
                            7 STAGES
                          </span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 pt-1">
                          {PLANNING_OTT_METRICS.map(ott => {
                            const val = formInputs[ott.code] !== undefined ? formInputs[ott.code] : '';
                            return (
                              <div key={ott.code} className="bg-white dark:bg-slate-800 p-2.5 rounded-lg border border-amber-200/80 dark:border-slate-700 shadow-xs">
                                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-200 block truncate" title={ott.name}>
                                  {ott.name}
                                </label>
                                <div className="mt-1 relative">
                                  <input
                                    type="number"
                                    step="any"
                                    value={val}
                                    onChange={e => handleInputChange(ott.code, e.target.value)}
                                    placeholder="0"
                                    className="w-full px-2 py-1 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-amber-500"
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      {(currentDept.code === 'PROCESSING_DYEING'
                        ? currentDept.rawMetrics.filter(m => !m.code.startsWith('OTD_') && !m.code.startsWith('OTT_') && m.code !== 'DYEING_PRINTING_MTRS')
                        : currentDept.rawMetrics
                      ).map((metric: MetricDefinition) => {
                        const val = formInputs[metric.code] !== undefined ? formInputs[metric.code] : '';
                        const effectiveTarget = editedTargets[metric.code] !== undefined
                          ? editedTargets[metric.code]
                          : (metric.target || 0);

                        return (
                          <div
                            key={metric.code}
                            className="bg-slate-50 dark:bg-slate-900/50 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors"
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                <span>{metric.name}</span>
                                {metric.unit && (
                                  <span className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-800 rounded text-[10px] font-semibold text-slate-600 dark:text-slate-400">
                                    {metric.unit}
                                  </span>
                                )}
                              </label>

                              {/* Target Pill / Input */}
                              {editTargetsMode ? (
                                <div className="flex items-center gap-1">
                                  <span className="text-[10px] font-bold text-slate-400">Target:</span>
                                  <input
                                    type="number"
                                    value={effectiveTarget}
                                    onChange={e => handleTargetChange(metric.code, e.target.value)}
                                    className="w-24 px-2 py-0.5 bg-white dark:bg-slate-800 border border-amber-400 rounded text-xs font-bold text-amber-700 dark:text-amber-300 outline-none"
                                  />
                                </div>
                              ) : (
                                effectiveTarget > 0 && (
                                  <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 px-2 py-0.5 rounded-md border border-indigo-100 dark:border-indigo-900">
                                    Target: {effectiveTarget.toLocaleString()} {metric.unit}
                                  </span>
                                )
                              )}
                            </div>

                            {metric.type === 'textarea' ? (
                              <textarea
                                rows={2}
                                value={val}
                                onChange={e => handleInputChange(metric.code, e.target.value)}
                                placeholder={metric.placeholder || `Enter ${metric.name}...`}
                                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-xs font-medium text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                              />
                            ) : (
                              <div className="relative">
                                <input
                                  type="number"
                                  step="any"
                                  value={val}
                                  onChange={e => handleInputChange(metric.code, e.target.value)}
                                  placeholder={metric.placeholder || `Enter actual ${metric.unit ? `(${metric.unit})` : 'value'}...`}
                                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-xs font-bold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                                {metric.unit && (
                                  <span className="absolute right-3 top-2 text-xs font-bold text-slate-400 pointer-events-none">
                                    {metric.unit}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </>
                  )}

                  {/* Daily Remarks Box */}
                  <div className="bg-slate-50 dark:bg-slate-900/50 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700">
                    <label className="text-xs font-bold text-slate-800 dark:text-slate-200 block mb-1">
                      Daily Department Remarks / Observations:
                    </label>
                    <textarea
                      rows={2}
                      value={deptRemarks}
                      onChange={e => setDeptRemarks(e.target.value)}
                      placeholder="Enter daily remarks, stoppage reasons, or handover notes..."
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-xs font-medium text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Save, Delete, Re-Entry Action Footer */}
                <div className="pt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-700">
                  <div className="flex items-center gap-2">
                    {saveSuccess && (
                      <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800 animate-fade-in">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Saved to SQL!</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Delete button only if record exists */}
                    {isCurrentDeptSaved && (
                      <button
                        onClick={handleDeleteDepartment}
                        disabled={deleting}
                        className="flex items-center gap-1.5 px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200 dark:border-rose-800 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                        title="Delete only this date & department record"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>{deleting ? 'Deleting...' : 'Delete Entry'}</span>
                      </button>
                    )}

                    {/* Save / Update Button */}
                    <button
                      onClick={handleSaveDepartment}
                      disabled={saving}
                      className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-md shadow-indigo-200 dark:shadow-none transition-all disabled:opacity-50"
                    >
                      <Save className="w-4 h-4" />
                      <span>
                        {saving
                          ? 'Saving to SQL...'
                          : isCurrentDeptSaved
                          ? `Update ${currentDept.name} Entry`
                          : `Save ${currentDept.name} Entry`}
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Panel: Real-Time Calculated Performance & Metrics */}
              <div className="lg:col-span-5 bg-slate-50 dark:bg-slate-900/60 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                        2. Live Auto-Calculations
                      </h3>
                    </div>

                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${getPerfBadgeClass(departmentPerformance)}`}>
                      {departmentPerformance}
                    </span>
                  </div>

                  {currentDept.calculatedMetrics.length === 0 ? (
                    <div className="p-8 text-center text-slate-400">
                      <Info className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-xs font-semibold">Floor metrics recorded directly.</p>
                      <p className="text-[11px] mt-1 text-slate-500">No additional formula outputs for this department.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {currentDept.calculatedMetrics.map((calc: MetricDefinition) => {
                        const calculatedVal = liveCalculations[calc.code];
                        const isPct = calc.unit === '%';
                        const isDiff = calc.code.includes('DIFF') || calc.code.includes('SHORTAGE');

                        let colorClass = 'text-slate-800 dark:text-slate-200';
                        let bgClass = 'bg-white dark:bg-slate-800';

                        if (isPct) {
                          if (calculatedVal >= 100) {
                            colorClass = 'text-emerald-700 dark:text-emerald-400 font-black';
                            bgClass = 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800';
                          } else if (calculatedVal >= 80) {
                            colorClass = 'text-amber-700 dark:text-amber-400 font-black';
                            bgClass = 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800';
                          } else {
                            colorClass = 'text-rose-700 dark:text-rose-400 font-black';
                            bgClass = 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800';
                          }
                        } else if (isDiff) {
                          if (calculatedVal >= 0) {
                            colorClass = 'text-emerald-700 dark:text-emerald-400 font-black';
                            bgClass = 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800';
                          } else {
                            colorClass = 'text-rose-700 dark:text-rose-400 font-black';
                            bgClass = 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800';
                          }
                        }

                        return (
                          <div
                            key={calc.code}
                            className={`p-3.5 rounded-xl border ${bgClass} transition-all shadow-xs`}
                          >
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block truncate" title={calc.name}>
                              {calc.name}
                            </span>
                            <div className="flex items-baseline justify-between mt-1">
                              <span className={`text-lg ${colorClass}`}>
                                {calculatedVal !== undefined && calculatedVal !== null && calculatedVal !== ''
                                  ? (typeof calculatedVal === 'number' ? calculatedVal.toLocaleString() : calculatedVal)
                                  : '—'}
                              </span>
                              {calc.unit && (
                                <span className="text-[10px] font-bold text-slate-400">
                                  {calc.unit}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="mt-6 p-3.5 bg-indigo-50/60 dark:bg-indigo-950/30 rounded-xl border border-indigo-100 dark:border-indigo-900 text-[11px] text-indigo-900 dark:text-indigo-300">
                  <span className="font-black">Auto-Calculation Engine:</span> Derived values (difference, achievement %, shortages, and performance mark) update automatically from your manual actual inputs.
                </div>
              </div>

            </div>
          </div>

          {/* ── FULL PLANT SNAPSHOT — DATE: [SELECTED DATE] ── */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <span>FULL PLANT SNAPSHOT — DATE: {selectedDate}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                    SQL Real-Time Source
                  </span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Unified departmental actuals, targets, variance, achievement %, and performance marks for {selectedDate}
                </p>
              </div>

              <div className="text-xs text-slate-400 font-bold">
                13 Factory Departments
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-900 text-white uppercase tracking-wider font-black text-[10px]">
                  <tr>
                    <th className="px-4 py-3 border-r border-slate-800">Department</th>
                    <th className="px-3 py-3 border-r border-slate-800">Head</th>
                    <th className="px-3 py-3 border-r border-slate-800">Mentor</th>
                    <th className="px-4 py-3 border-r border-slate-800 min-w-[160px]">Metric Name</th>
                    <th className="px-3 py-3 border-r border-slate-800 text-right">Daily Target</th>
                    <th className="px-4 py-3 border-r border-slate-800 text-right bg-slate-800">Actual Entry</th>
                    <th className="px-2 py-3 border-r border-slate-800 text-center">Unit</th>
                    <th className="px-3 py-3 border-r border-slate-800 text-right">Difference</th>
                    <th className="px-3 py-3 border-r border-slate-800 text-right">Achievement %</th>
                    <th className="px-3 py-3 border-r border-slate-800 text-center">Performance</th>
                    <th className="px-3 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {DEPARTMENTS.flatMap(dept => {
                    const master = departmentMasters[dept.code];
                    return dept.rawMetrics.map((m, idx) => {
                      const entry = dailyEntries[m.code];
                      const hasSaved = entry !== undefined && entry.actual_value !== null && entry.actual_value !== undefined;
                      const act = hasSaved ? entry.actual_value : (formInputs[m.code] ? parseFloat(formInputs[m.code]) : null);
                      const target = entry?.target_value !== undefined && entry?.target_value !== null
                        ? entry.target_value
                        : (editedTargets[m.code] !== undefined ? editedTargets[m.code] : (m.target || 0));

                      const hasTarget = target > 0;
                      const diff = hasTarget && act !== null && act !== undefined ? act - target : null;
                      const ach = hasTarget && act !== null && act !== undefined ? Number(((act / target) * 100).toFixed(1)) : null;

                      const head = entry?.department_head || master?.head || dept.head;
                      const mentor = entry?.mentor || master?.mentor || dept.mentor;
                      const perfMark = entry?.performance_mark || (act !== null && act !== undefined ? computePerformanceMark(target, act, ach || 0) : 'NOT ENTERED');

                      if (searchQuery && !m.name.toLowerCase().includes(searchQuery.toLowerCase()) && !dept.name.toLowerCase().includes(searchQuery.toLowerCase())) {
                        return null;
                      }

                      return (
                        <tr key={`${dept.code}_${m.code}`} className="hover:bg-slate-50/80 dark:hover:bg-slate-700/50 transition-colors">
                          <td className="px-4 py-2.5 font-bold text-slate-800 dark:text-slate-200 border-r border-slate-100 dark:border-slate-800">
                            {idx === 0 ? dept.name : ''}
                          </td>
                          <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300 font-semibold border-r border-slate-100 dark:border-slate-800">
                            {idx === 0 ? head : ''}
                          </td>
                          <td className="px-3 py-2.5 text-slate-500 font-medium border-r border-slate-100 dark:border-slate-800">
                            {idx === 0 ? mentor : ''}
                          </td>
                          <td className="px-4 py-2.5 font-semibold text-slate-700 dark:text-slate-300 border-r border-slate-100 dark:border-slate-800">
                            {m.name}
                          </td>
                          <td className="px-3 py-2.5 text-right font-medium text-slate-500 border-r border-slate-100 dark:border-slate-800">
                            {hasTarget ? target.toLocaleString() : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-right font-bold text-slate-900 dark:text-slate-100 bg-slate-50/50 dark:bg-slate-900/30 border-r border-slate-100 dark:border-slate-800">
                            {act !== null && act !== undefined
                              ? (typeof act === 'number' ? act.toLocaleString() : act)
                              : (entry?.raw_value || '—')}
                          </td>
                          <td className="px-2 py-2.5 text-center text-slate-400 text-[10px] border-r border-slate-100 dark:border-slate-800">
                            {m.unit || '—'}
                          </td>
                          <td className={`px-3 py-2.5 text-right font-bold border-r border-slate-100 dark:border-slate-800 ${
                            diff === null ? 'text-slate-300' : diff >= 0 ? 'text-emerald-600' : 'text-rose-600'
                          }`}>
                            {diff !== null ? (diff > 0 ? `+${diff.toLocaleString()}` : diff.toLocaleString()) : '—'}
                          </td>
                          <td className={`px-3 py-2.5 text-right font-bold border-r border-slate-100 dark:border-slate-800 ${
                            ach === null ? 'text-slate-300' : ach >= 100 ? 'text-emerald-600' : ach >= 80 ? 'text-amber-600' : 'text-rose-600'
                          }`}>
                            {ach !== null ? `${ach}%` : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-center border-r border-slate-100 dark:border-slate-800">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black border ${getPerfBadgeClass(perfMark)}`}>
                              {perfMark}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            {hasSaved ? (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                LOGGED
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                                NOT ENTERED
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    });
                  })}
                </tbody>
              </table>
            </div>
          </div>

        </div>



      </div>
    </div>
  );
}
