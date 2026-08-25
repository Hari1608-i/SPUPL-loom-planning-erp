import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  ChevronLeft, ChevronRight, LayoutDashboard, Scissors, PenTool, Database,
  Calendar, History as HistoryIcon, PieChart, AlertCircle, ListTodo, Activity,
  ListOrdered, Cpu, Package, Palette, Users, LogOut, Search, Bell, Moon, Sun,
  User as UserIcon, ClipboardList, ChevronDown, Layers, CheckCircle,
  ShieldAlert, AlertTriangle, X, ArrowUpRight, RefreshCw
} from 'lucide-react';
import { format } from 'date-fns';
import { API_BASE_URL } from '../../config';
import { COMPANY_LOGO_DATA_URL } from '../../assets/logoDataUrl';

/* ─── Sidebar helpers ─────────────────────────────────────────────── */

const SidebarItem = ({
  to, icon: Icon, label, menuName, isCollapsed, badgeCount
}: {
  to: string; icon: any; label: string; menuName: string; isCollapsed: boolean; badgeCount?: number;
}) => {
  const location = useLocation();
  const { hasMenuPermission } = useAuth();
  if (!hasMenuPermission(menuName)) return null;
  const isActive = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));
  return (
    <Link
      to={to}
      title={isCollapsed ? label : undefined}
      className={`flex items-center px-4 py-3 mb-1 rounded-xl transition-all duration-200 group ${
        isActive
          ? 'bg-spu-secondary text-white shadow-md'
          : 'text-slate-400 hover:bg-slate-800 hover:text-white'
      }`}
    >
      <Icon className={`w-5 h-5 flex-shrink-0 ${isCollapsed ? 'mx-auto' : 'mr-3'} ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-spu-accent'}`} />
      {!isCollapsed && <span className="font-semibold text-sm truncate flex-1">{label}</span>}
      {badgeCount && badgeCount > 0 ? (
        <span className={`ml-auto bg-red-600 text-white font-black text-[10px] px-2 py-0.5 rounded-full shadow-sm ${isCollapsed ? 'absolute -top-1 -right-1' : ''}`}>
          {badgeCount}
        </span>
      ) : null}
    </Link>
  );
};

const SidebarGroup = ({
  title, children, isCollapsed,
}: {
  title: string; children: React.ReactNode; isCollapsed: boolean;
}) => (
  <div className="mb-6">
    {!isCollapsed && (
      <h2 className="px-4 text-[11px] font-black text-slate-500 uppercase tracking-widest mb-3 select-none">
        {title}
      </h2>
    )}
    {isCollapsed && <div className="px-4 mb-2 border-t border-slate-800 pt-4" />}
    {children}
  </div>
);

/* ─── Notification Bell Panel ─────────────────────────────────────── */

interface AlertItem {
  id: number;
  alert_code: string;
  department: string;
  priority: string;
  message: string;
  suggested_action?: string;
  status: string;
  createdAt: string;
}

function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastFetched, setLastFetched] = useState<string>('');
  const panelRef = useRef<HTMLDivElement>(null);

  // Track cleared/dismissed alert IDs locally so they don't show up in the bell dropdown,
  // but remain in the global system/Alert Center until resolved.
  const [clearedAlertIds, setClearedAlertIds] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem('spu_cleared_alert_ids');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const visibleAlerts = alerts.filter(a => !clearedAlertIds.includes(a.id));
  const openCount = visibleAlerts.filter(a => a.status === 'OPEN').length;
  const criticalCount = visibleAlerts.filter(a => a.status === 'OPEN' && a.priority.includes('CRITICAL')).length;
  const highCount = visibleAlerts.filter(a => a.status === 'OPEN' && a.priority.includes('HIGH')).length;

  const handleClearAll = () => {
    const currentIds = alerts.map(a => a.id);
    const newCleared = Array.from(new Set([...clearedAlertIds, ...currentIds]));
    setClearedAlertIds(newCleared);
    localStorage.setItem('spu_cleared_alert_ids', JSON.stringify(newCleared));
  };

  const handleClearItem = (id: number) => {
    const newCleared = Array.from(new Set([...clearedAlertIds, id]));
    setClearedAlertIds(newCleared);
    localStorage.setItem('spu_cleared_alert_ids', JSON.stringify(newCleared));
  };

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/erp-alerts`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          // Sort: CRITICAL first, then HIGH, then others; only OPEN
          const sorted = data
            .filter((a: AlertItem) => a.status === 'OPEN')
            .sort((a: AlertItem, b: AlertItem) => {
              const rank = (p: string) =>
                p.includes('CRITICAL') ? 0 : p.includes('HIGH') ? 1 : p.includes('MEDIUM') ? 2 : 3;
              return rank(a.priority) - rank(b.priority);
            });
          setAlerts(sorted);
          setLastFetched(new Date().toLocaleTimeString());

          // Clean up clearedAlertIds that are no longer present in open system alerts
          // to keep localStorage size optimized.
          const openIds = new Set(data.filter((a: AlertItem) => a.status === 'OPEN').map((a: AlertItem) => a.id));
          setClearedAlertIds((prev) => {
            const cleaned = prev.filter((id) => openIds.has(id));
            if (cleaned.length !== prev.length) {
              localStorage.setItem('spu_cleared_alert_ids', JSON.stringify(cleaned));
            }
            return cleaned;
          });
        }
      }
    } catch (e) {
      // silent
    } finally {
      setLoading(false);
    }
  };

  // Auto-fetch on mount and every 20s
  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 20000);
    return () => clearInterval(interval);
  }, []);

  // Fetch again when panel opens
  useEffect(() => {
    if (open) fetchAlerts();
  }, [open]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const getPriorityStyle = (priority: string) => {
    if (priority.includes('CRITICAL')) return { dot: 'bg-red-500', badge: 'bg-red-100 text-red-800 border-red-300', strip: 'border-l-red-500' };
    if (priority.includes('HIGH')) return { dot: 'bg-amber-500', badge: 'bg-amber-100 text-amber-800 border-amber-300', strip: 'border-l-amber-500' };
    if (priority.includes('MEDIUM')) return { dot: 'bg-blue-500', badge: 'bg-blue-100 text-blue-800 border-blue-300', strip: 'border-l-blue-500' };
    return { dot: 'bg-slate-400', badge: 'bg-slate-100 text-slate-700 border-slate-300', strip: 'border-l-slate-400' };
  };

  const getAge = (createdAt: string) => {
    const diffMs = Date.now() - new Date(createdAt).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return `${Math.floor(diffHrs / 24)}d ago`;
  };

  const getDeptIcon = (dept: string) => {
    const d = dept.toUpperCase();
    if (d.includes('BEAM')) return '📦';
    if (d.includes('REED')) return '🔧';
    if (d.includes('WEAVING') || d.includes('RUNOUT')) return '🏭';
    if (d.includes('PLAN')) return '📋';
    if (d.includes('DELIVERY') || d.includes('ORDER')) return '🚚';
    return '⚠️';
  };

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell Button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="View Notifications"
        className={`p-2 rounded-full relative transition-all duration-200 ${
          open
            ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300'
            : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-300'
        }`}
      >
        <Bell className={`w-5 h-5 ${openCount > 0 ? 'animate-[wiggle_1s_ease-in-out_infinite]' : ''}`} />

        {/* Badge: Red with count when alerts exist, hidden when 0 */}
        {openCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-600 text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-md px-1 leading-none">
            {openCount > 99 ? '99+' : openCount}
          </span>
        )}
      </button>

      {/* Notification Dropdown Panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-[380px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl z-50 overflow-hidden">

          {/* Panel Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-slate-900 text-white">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-amber-400" />
              <span className="font-black text-sm tracking-tight">Notifications</span>
              {openCount > 0 && (
                <span className="bg-red-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                  {openCount} OPEN
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchAlerts}
                title="Refresh"
                className="p-1 hover:bg-slate-700 rounded-lg transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="p-1 hover:bg-slate-700 rounded-lg transition-colors"
              >
                <X className="w-3.5 h-3.5 text-slate-400" />
              </button>
            </div>
          </div>

          {/* Quick Summary Row */}
          {openCount > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
              {criticalCount > 0 && (
                <span className="flex items-center gap-1 text-[11px] font-black text-red-700 bg-red-100 border border-red-300 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 bg-red-600 rounded-full inline-block" />
                  {criticalCount} Critical
                </span>
              )}
              {highCount > 0 && (
                <span className="flex items-center gap-1 text-[11px] font-black text-amber-700 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 bg-amber-500 rounded-full inline-block" />
                  {highCount} High
                </span>
              )}
              {lastFetched && (
                <span className="ml-auto text-[10px] text-slate-400 font-medium">
                  Updated {lastFetched}
                </span>
              )}
            </div>
          )}

          {/* Alert List */}
          <div className="max-h-[360px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700">
            {loading && visibleAlerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                <RefreshCw className="w-6 h-6 animate-spin mb-2" />
                <span className="text-xs font-medium">Loading alerts...</span>
              </div>
            ) : visibleAlerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-emerald-500" />
                </div>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200">All Clear!</p>
                <p className="text-xs text-slate-400 text-center px-4">
                  No open alerts at this time. All departments are operating normally.
                </p>
              </div>
            ) : (
              visibleAlerts.slice(0, 8).map((alert) => {
                const style = getPriorityStyle(alert.priority);
                return (
                  <div
                    key={alert.id}
                    className={`flex gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer border-l-4 ${style.strip}`}
                    onClick={() => { setOpen(false); navigate('/erp-alerts'); }}
                  >
                    {/* Priority dot + dept icon */}
                    <div className="flex flex-col items-center gap-1 pt-0.5 flex-shrink-0">
                      <span className="text-base leading-none">{getDeptIcon(alert.department)}</span>
                      <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-1">
                        <p className="text-xs font-bold text-slate-900 dark:text-white leading-snug truncate flex-1">
                          {alert.message}
                        </p>
                        <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                          <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">
                            {getAge(alert.createdAt)}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleClearItem(alert.id);
                            }}
                            className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                            title="Dismiss notification"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border uppercase ${style.badge}`}>
                          {alert.priority.replace(' PRIORITY', '')}
                        </span>
                        <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded uppercase">
                          {alert.department}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">
                          {alert.alert_code}
                        </span>
                      </div>
                      {alert.suggested_action && (
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-tight truncate">
                          → {alert.suggested_action}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })
            )}

            {/* "More alerts" indicator */}
            {visibleAlerts.length > 8 && (
              <div className="px-4 py-2 bg-amber-50 border-t border-amber-100 text-center">
                <span className="text-xs font-bold text-amber-700">
                  +{visibleAlerts.length - 8} more alerts in Alert Center
                </span>
              </div>
            )}
          </div>

          {/* Panel Footer */}
          <div className="border-t border-slate-200 dark:border-slate-700 px-4 py-3 bg-slate-50 dark:bg-slate-900 flex items-center justify-between">
            <span className="text-[11px] text-slate-400 font-medium">
              {openCount === 0 ? 'No open alerts' : `${openCount} alert${openCount !== 1 ? 's' : ''} require attention`}
            </span>
            <div className="flex items-center gap-3">
              {openCount > 0 && (
                <button
                  onClick={handleClearAll}
                  className="text-xs font-black text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 transition-colors"
                >
                  Clear All
                </button>
              )}
              <button
                onClick={() => { setOpen(false); navigate('/erp-alerts'); }}
                className="flex items-center gap-1 text-xs font-black text-indigo-700 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-200 transition-colors"
              >
                View All <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Main Layout ─────────────────────────────────────────────────── */

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('spuTheme') === 'dark' ||
      (!localStorage.getItem('spuTheme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [openAlertCount, setOpenAlertCount] = useState<number>(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  /* Fetch Open Critical + High Alerts count for sidebar badge */
  useEffect(() => {
    const fetchBadge = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/erp-alerts`);
        if (res.ok) {
          const alerts = await res.json();
          if (Array.isArray(alerts)) {
            const urgentCount = alerts.filter((a: any) => a.status === 'OPEN' && (a.priority.includes('CRITICAL') || a.priority.includes('HIGH'))).length;
            setOpenAlertCount(urgentCount);
          }
        }
      } catch (e) {
        // silent catch
      }
    };
    fetchBadge();
    const interval = setInterval(fetchBadge, 20000);
    return () => clearInterval(interval);
  }, []);

  /* Apply dark class to <html> whenever isDarkMode changes */
  useEffect(() => {
    const root = document.documentElement;
    if (isDarkMode) {
      root.classList.add('dark');
      localStorage.setItem('spuTheme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('spuTheme', 'light');
    }
  }, [isDarkMode]);

  /* Close dropdown on outside click */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowUserDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = () => {
    setShowUserDropdown(false);
    logout();
  };

  return (
    <div className="flex h-screen overflow-hidden font-sans bg-spu-background dark:bg-slate-900 text-slate-900 dark:text-slate-100">

      {/* ── Sidebar ── */}
      <aside className={`bg-spu-sidebar text-white flex flex-col shadow-2xl z-30 transition-all duration-300 ${isCollapsed ? 'w-20' : 'w-72'}`}>

        {/* Logo */}
        <div className={`h-16 flex items-center border-b border-slate-800/50 ${isCollapsed ? 'justify-center px-2' : 'px-4'}`}>
          <div className="bg-white p-1.5 rounded-xl shadow-lg flex items-center justify-center max-w-full overflow-hidden">
            <img
              src={isCollapsed ? "/logo-icon.png" : "/logo.png"}
              alt="Santhi Processing Unit Logo"
              className={isCollapsed ? "h-8 w-auto object-contain" : "h-9 w-auto object-contain max-w-[200px]"}
            />
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden p-4 custom-scrollbar">
          <SidebarGroup title="Dashboards" isCollapsed={isCollapsed}>
            <SidebarItem to="/"                    icon={LayoutDashboard} label="Executive Dashboard"       menuName="Executive Dashboard"       isCollapsed={isCollapsed} />
            <SidebarItem to="/visual"              icon={PieChart}        label="Analytics"                  menuName="Analytics"                 isCollapsed={isCollapsed} />
            <SidebarItem to="/design-wise-running" icon={Layers}          label="Design-Wise Loom Running"  menuName="Design-Wise Loom Running"  isCollapsed={isCollapsed} />
            <SidebarItem to="/loom-runout"         icon={ListOrdered}     label="Loom Runout"               menuName="Loom Runout"               isCollapsed={isCollapsed} />
            <SidebarItem to="/design-runout"       icon={PieChart}        label="Design Runout"              menuName="Design Runout"             isCollapsed={isCollapsed} />
          </SidebarGroup>

          <SidebarGroup title="Operations" isCollapsed={isCollapsed}>
            <SidebarItem to="/entry"        icon={PenTool}  label="Main Entry"           menuName="Main Entry"           isCollapsed={isCollapsed} />
            <SidebarItem to="/availability" icon={Calendar} label="Availability Board"   menuName="Availability Board"   isCollapsed={isCollapsed} />
            <SidebarItem to="/eligibility"  icon={Cpu}      label="Smart Recommendation" menuName="Smart Recommendation" isCollapsed={isCollapsed} />
          </SidebarGroup>

          <SidebarGroup title="Planning" isCollapsed={isCollapsed}>
            <SidebarItem to="/orders"        icon={ClipboardList} label="Order Management"    menuName="Order Management"    isCollapsed={isCollapsed} />
            <SidebarItem to="/plan"          icon={HistoryIcon}   label="Loom Planning Setup"  menuName="Loom Planning Setup" isCollapsed={isCollapsed} />
            <SidebarItem to="/erp-alerts"    icon={AlertCircle}   label="Alert Center"         menuName="Alert Center"        isCollapsed={isCollapsed} badgeCount={openAlertCount} />
            <SidebarItem to="/runout-monitor" icon={Activity}     label="Runout Monitor"       menuName="Runout Monitor"      isCollapsed={isCollapsed} />
            <SidebarItem to="/planned-looms" icon={ListTodo}      label="Next Planned Looms"   menuName="Next Planned Looms"  isCollapsed={isCollapsed} />
          </SidebarGroup>

          <SidebarGroup title="History & Completion" isCollapsed={isCollapsed}>
            <SidebarItem to="/order-completion" icon={CheckCircle} label="Order Completion & History" menuName="Order Completion & History" isCollapsed={isCollapsed} />
            <SidebarItem to="/history"          icon={HistoryIcon} label="Completed Warp History"     menuName="Completed Warp History"     isCollapsed={isCollapsed} />
            <SidebarItem to="/analysis"         icon={Activity}    label="Completed Warp Analysis"    menuName="Completed Warp Analysis"    isCollapsed={isCollapsed} />
          </SidebarGroup>

          <SidebarGroup title="Master Data" isCollapsed={isCollapsed}>
            <SidebarItem to="/looms"      icon={Database} label="Loom Master"   menuName="Loom Master"   isCollapsed={isCollapsed} />
            <SidebarItem to="/designs"    icon={Palette}  label="Design Master" menuName="Design Master" isCollapsed={isCollapsed} />
            <SidebarItem to="/reed-stock" icon={Layers}   label="Reed Stock"    menuName="Reed Stock"    isCollapsed={isCollapsed} />
            <SidebarItem to="/beam-stock" icon={Package}  label="Beam Stock"    menuName="Beam Stock"    isCollapsed={isCollapsed} />
          </SidebarGroup>

          <SidebarGroup title="Administration" isCollapsed={isCollapsed}>
            <SidebarItem to="/users"         icon={Users}    label="User Management" menuName="User Management" isCollapsed={isCollapsed} />
            <SidebarItem to="/system-health" icon={Activity} label="System Health"   menuName="System Health"   isCollapsed={isCollapsed} />
          </SidebarGroup>
        </nav>

        {/* ── Sidebar Bottom: user info + logout + collapse ── */}
        <div className="border-t border-slate-800/50 bg-slate-900/40">

          {/* User row with always-visible Logout button */}
          <div className={`p-4 flex items-center gap-3 ${isCollapsed ? 'flex-col' : ''}`}>
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-spu-primary to-spu-secondary flex items-center justify-center text-white shadow-md flex-shrink-0">
              <UserIcon className="w-4 h-4" />
            </div>

            {!isCollapsed && (
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-white truncate">
                  {user?.employeeName || user?.username}
                </div>
                <div className="text-[10px] font-semibold uppercase text-slate-400 tracking-wider truncate">
                  {user?.role?.replace(/_/g, ' ')}
                </div>
              </div>
            )}

            {/* Logout — always visible */}
            <button
              onClick={handleLogout}
              title="Logout"
              className={`flex items-center justify-center gap-1.5 rounded-lg bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white transition-all duration-200 flex-shrink-0 font-semibold text-xs ${isCollapsed ? 'w-full py-2' : 'px-3 py-2'}`}
            >
              <LogOut className="w-4 h-4" />
              {!isCollapsed && <span>Logout</span>}
            </button>
          </div>

          {/* Collapse toggle */}
          <div className="px-4 pb-4">
            <button
              onClick={() => setIsCollapsed(c => !c)}
              className="flex items-center justify-center p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors w-full"
              title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            >
              {isCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
              {!isCollapsed && <span className="ml-2 text-xs font-semibold">Collapse</span>}
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main area ── */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden relative">

        {/* Top header */}
        <header className="h-16 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-6 shadow-sm z-20 flex-shrink-0 bg-white dark:bg-slate-800 transition-colors">

          <div className="flex items-center flex-1 gap-6">
            <div className="hidden md:flex items-center">
              <img src="/logo.png" alt="Santhi Processing Unit Logo" className="h-10 w-auto object-contain bg-white p-1 rounded-xl shadow-sm border border-slate-200" />
            </div>
            <div className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-colors max-w-md w-full ${isDarkMode ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-600 focus-within:border-spu-secondary'}`}>
              <Search className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search looms, designs, beams..."
                className="bg-transparent border-none outline-none text-sm w-full font-medium"
              />
            </div>
          </div>

          <div className="flex items-center space-x-3 ml-4">
            <div className="hidden lg:block text-sm font-bold text-slate-400 mr-2">
              {format(new Date(), 'EEEE, dd MMM yyyy')}
            </div>

            {/* Dark mode toggle */}
            <button
              onClick={() => setIsDarkMode(d => !d)}
              className="p-2 rounded-full transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-300"
              title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>

            {/* ── Functional Notification Bell ── */}
            <NotificationBell />

            <div className="h-8 w-px bg-slate-200 mx-1 hidden sm:block" />

            {/* User dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowUserDropdown(v => !v)}
                className="flex items-center gap-2 rounded-xl px-3 py-1.5 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                <div className="hidden sm:block text-right">
                  <div className="text-sm font-bold leading-tight text-slate-800 dark:text-white">
                    {user?.employeeName || user?.username}
                  </div>
                  <div className="text-[10px] font-black uppercase text-spu-secondary tracking-widest">
                    {user?.role?.replace(/_/g, ' ')}
                  </div>
                </div>
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-spu-primary to-spu-secondary flex items-center justify-center text-white shadow-md">
                  <UserIcon className="w-5 h-5" />
                </div>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${showUserDropdown ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown */}
              {showUserDropdown && (
                <div className="absolute right-0 top-full mt-2 w-52 bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                    <div className="text-sm font-bold text-slate-800 truncate">{user?.employeeName}</div>
                    <div className="text-xs text-slate-500 truncate">@{user?.username}</div>
                    <div className="mt-1 inline-block text-[10px] font-black uppercase tracking-widest text-white bg-spu-secondary px-2 py-0.5 rounded-full">
                      {user?.role?.replace(/_/g, ' ')}
                    </div>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-auto p-6 md:p-8">
          <img src={COMPANY_LOGO_DATA_URL} alt="SANthi Logo" className="print-watermark-logo" />
          <div className="max-w-[1600px] mx-auto h-full">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
