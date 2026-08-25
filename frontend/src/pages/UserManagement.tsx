import React, { useState, useEffect } from 'react';
import { useAuth, User } from '../context/AuthContext';
import { Search, Edit, Trash2, CheckCircle, XCircle, Shield, Key, Users as UsersIcon, UserCheck, Lock, Upload, Plus, CheckSquare, Square } from 'lucide-react';
import { format } from 'date-fns';
import KPICard from '../components/ui/KPICard';
import GradientButton from '../components/ui/GradientButton';
import { API_BASE_URL } from '../config';

const PREDEFINED_ROLES = [
  { id: 'ADMINISTRATOR', label: 'ADMINISTRATOR', desc: 'Full administrative control with all permissions across all screens.' },
  { id: 'PLANNING', label: 'PLANNING', desc: 'Full operational and planning access for loom planning, orders, runout, and stock.' },
  { id: 'SIZING', label: 'SIZING', desc: 'Access to Sizing Dashboard, Beam Stock, Reed Stock, and related operations.' },
  { id: 'WEAVING', label: 'WEAVING', desc: 'Access to Main Entry, Availability Board, Loom Runout, and Masters.' },
  { id: 'MANAGEMENT', label: 'MANAGEMENT', desc: 'Executive view with analytical dashboards, reports, and export/print capabilities.' },
  { id: 'MERCH', label: 'MERCHANDISING (MERCH)', desc: 'Access to Order Management, Order Completion, Design Master, and Dashboards.' },
  { id: 'VIEWER', label: 'VIEWER', desc: 'Read-only access to primary dashboards and availability board.' }
];

const screens = [
  "Executive Dashboard",
  "Analytics",
  "Design-Wise Loom Running",
  "Loom Runout",
  "Design Runout",
  "Main Entry",
  "Availability Board",
  "Smart Recommendation",
  "Order Management",
  "Loom Planning Setup",
  "Alert Center",
  "Runout Monitor",
  "Next Planned Looms",
  "Order Completion & History",
  "Completed Warp History",
  "Completed Warp Analysis",
  "Loom Master",
  "Design Master",
  "Reed Stock",
  "Beam Stock",
  "Sizing Dashboard",
  "User Management",
  "System Health"
];

const actions = ["view", "create", "edit", "delete", "approve", "export", "print", "excel"];

const getDefaultRolePermissions = (role: string) => {
  const roleUpper = role?.toUpperCase() || '';
  const perms: Record<string, Record<string, boolean>> = {};

  screens.forEach(screen => {
    perms[screen] = {
      view: false,
      create: false,
      edit: false,
      delete: false,
      approve: false,
      export: false,
      print: false,
      excel: false
    };

    if (roleUpper === 'ADMINISTRATOR' || roleUpper === 'ADMIN' || roleUpper === 'SYSTEM ADMINISTRATOR') {
      actions.forEach(a => perms[screen][a] = true);
    } else if (roleUpper === 'PLANNING' || roleUpper === 'PLANNING_MANAGER') {
      const allowedScreens = ["Executive Dashboard", "Analytics", "Design-Wise Loom Running", "Loom Runout", "Design Runout", "Main Entry", "Availability Board", "Smart Recommendation", "Order Management", "Loom Planning Setup", "Alert Center", "Runout Monitor", "Next Planned Looms", "Order Completion & History", "Completed Warp History", "Completed Warp Analysis", "Loom Master", "Design Master", "Reed Stock", "Beam Stock", "Sizing Dashboard"];
      if (allowedScreens.includes(screen)) {
        perms[screen].view = true;
        perms[screen].create = true;
        perms[screen].edit = true;
        perms[screen].approve = true;
        perms[screen].export = true;
        perms[screen].print = true;
        perms[screen].excel = true;
      }
    } else if (roleUpper === 'SIZING') {
      const allowedScreens = ["Executive Dashboard", "Sizing Dashboard", "Beam Stock", "Reed Stock", "Alert Center", "Runout Monitor", "Main Entry", "Availability Board"];
      if (allowedScreens.includes(screen)) {
        perms[screen].view = true;
        perms[screen].create = true;
        perms[screen].edit = true;
        perms[screen].export = true;
        perms[screen].print = true;
        perms[screen].excel = true;
      }
    } else if (roleUpper === 'WEAVING') {
      const allowedScreens = ["Executive Dashboard", "Main Entry", "Availability Board", "Loom Runout", "Design Runout", "Loom Master", "Design Master"];
      if (allowedScreens.includes(screen)) {
        perms[screen].view = true;
        perms[screen].create = true;
        perms[screen].edit = true;
        perms[screen].export = true;
        perms[screen].print = true;
        perms[screen].excel = true;
      }
    } else if (roleUpper === 'MANAGEMENT') {
      const allowedScreens = ["Executive Dashboard", "Analytics", "Design-Wise Loom Running", "Loom Runout", "Design Runout", "Order Completion & History", "Completed Warp History", "Completed Warp Analysis", "Order Management"];
      if (allowedScreens.includes(screen)) {
        perms[screen].view = true;
        perms[screen].export = true;
        perms[screen].print = true;
        perms[screen].excel = true;
      }
    } else if (roleUpper === 'MERCH') {
      const allowedScreens = ["Executive Dashboard", "Analytics", "Order Management", "Order Completion & History", "Design Master"];
      if (allowedScreens.includes(screen)) {
        perms[screen].view = true;
        perms[screen].create = true;
        perms[screen].edit = true;
        perms[screen].export = true;
        perms[screen].print = true;
        perms[screen].excel = true;
      }
    } else if (roleUpper === 'VIEWER') {
      const allowedScreens = ["Executive Dashboard", "Analytics", "Design-Wise Loom Running", "Availability Board"];
      if (allowedScreens.includes(screen)) {
        perms[screen].view = true;
      }
    }
  });

  return perms;
};

export default function UserManagement() {
  const { token, user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  
  // Pagination & Filtering
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  
  // Wizard State
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [formData, setFormData] = useState<any>({
    username: '', password: '', employeeName: '', employeeId: '', role: 'VIEWER', department: '', status: 'ACTIVE', permissions: {}
  });

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        search,
        role: roleFilter
      });
      const res = await fetch(`${API_BASE_URL}/api/users?${query.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setUsers(data.users || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [page, limit, search, roleFilter]);

  const handleSaveUser = async () => {
    try {
      await fetch(`${API_BASE_URL}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ ...formData, permissions: JSON.stringify(formData.permissions), adminUser: currentUser?.username })
      });
      setIsWizardOpen(false);
      fetchUsers();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteUser = async (id: number, username: string) => {
    if (!window.confirm(`Are you sure you want to delete user ${username}?`)) return;
    try {
      await fetch(`${API_BASE_URL}/api/users/${id}?adminUser=${currentUser?.username || ''}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fetchUsers();
    } catch (err) {
      console.error(err);
    }
  };

  const togglePermission = (screen: string, action: string) => {
    setFormData((prev: any) => {
      const updated = { ...prev.permissions };
      if (!updated[screen]) {
        updated[screen] = { view: false, create: false, edit: false, delete: false, approve: false, export: false, print: false, excel: false };
      }
      const currentVal = !!updated[screen][action];
      const newVal = !currentVal;
      
      updated[screen] = { ...updated[screen], [action]: newVal };

      // Sensible permission dependency: Non-view action requires VIEW
      if (action !== 'view' && newVal) {
        updated[screen].view = true;
      }
      // Disabling VIEW disables all actions for this screen
      if (action === 'view' && !newVal) {
        actions.forEach(a => updated[screen][a] = false);
      }

      return { ...prev, permissions: updated };
    });
  };

  const handleSelectAllRow = (screen: string, select: boolean) => {
    setFormData((prev: any) => {
      const updated = { ...prev.permissions };
      updated[screen] = {};
      actions.forEach(a => updated[screen][a] = select);
      return { ...prev, permissions: updated };
    });
  };

  const handleSelectAllColumn = (action: string, select: boolean) => {
    setFormData((prev: any) => {
      const updated = { ...prev.permissions };
      screens.forEach(screen => {
        if (!updated[screen]) updated[screen] = { view: false, create: false, edit: false, delete: false, approve: false, export: false, print: false, excel: false };
        updated[screen][action] = select;
        if (action !== 'view' && select) {
          updated[screen].view = true;
        }
        if (action === 'view' && !select) {
          actions.forEach(a => updated[screen][a] = false);
        }
      });
      return { ...prev, permissions: updated };
    });
  };

  const handleSelectAllMatrix = (select: boolean) => {
    setFormData((prev: any) => {
      const updated: Record<string, Record<string, boolean>> = {};
      screens.forEach(screen => {
        updated[screen] = {};
        actions.forEach(a => updated[screen][a] = select);
      });
      return { ...prev, permissions: updated };
    });
  };

  const handleSelectRole = (selectedRole: string) => {
    const defaultPerms = getDefaultRolePermissions(selectedRole);
    setFormData((prev: any) => ({
      ...prev,
      role: selectedRole,
      permissions: defaultPerms
    }));
  };

  return (
    <div className="space-y-6 flex flex-col h-full">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center tracking-tight">
            <Shield className="w-8 h-8 mr-3 text-spu-primary p-1.5 bg-indigo-50 rounded-lg" /> 
            Enterprise User Management
          </h1>
          <p className="text-slate-500 text-sm mt-2 font-medium">Control roles, granular access matrices, and user lifecycles.</p>
        </div>
        <div className="flex gap-3">
          <GradientButton label="Bulk Import" icon={Upload} variant="secondary" />
          <GradientButton label="Create User" icon={Plus} onClick={() => {
            const defaultRole = 'VIEWER';
            setFormData({
              username: '',
              password: '',
              employeeName: '',
              employeeId: '',
              role: defaultRole,
              department: '',
              status: 'ACTIVE',
              permissions: getDefaultRolePermissions(defaultRole)
            });
            setWizardStep(1);
            setIsWizardOpen(true);
          }} />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <KPICard title="Total Users" value={total} icon={UsersIcon} color="primary" />
        <KPICard title="Active Users" value={users.filter(u => u.status === 'ACTIVE').length} icon={UserCheck} color="success" />
        <KPICard title="Locked Accounts" value={users.filter(u => u.status === 'LOCKED').length} icon={Lock} color="danger" />
        <KPICard title="Administrators" value={users.filter(u => u.role === 'ADMINISTRATOR' || u.role === 'ADMIN').length} icon={Shield} color="warning" />
      </div>

      {/* Data Grid Area */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 flex-1 overflow-hidden flex flex-col relative z-10">
        
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl w-80 focus-within:border-spu-primary focus-within:ring-2 focus-within:ring-spu-primary/20 transition-all">
            <Search className="w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search by name, ID or username..." 
              className="bg-transparent border-none outline-none text-sm w-full font-medium"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          
          <select 
            className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-spu-primary"
            value={roleFilter}
            onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
          >
            <option value="">All Roles</option>
            {PREDEFINED_ROLES.map(r => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        <div className="overflow-auto custom-scrollbar flex-1">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead className="bg-slate-50 sticky top-0 shadow-sm z-10 border-b border-slate-200">
              <tr>
                <th className="py-4 px-6 text-xs font-black text-slate-500 uppercase tracking-wider">Employee</th>
                <th className="py-4 px-6 text-xs font-black text-slate-500 uppercase tracking-wider">Username</th>
                <th className="py-4 px-6 text-xs font-black text-slate-500 uppercase tracking-wider">Role</th>
                <th className="py-4 px-6 text-xs font-black text-slate-500 uppercase tracking-wider">Department</th>
                <th className="py-4 px-6 text-xs font-black text-slate-500 uppercase tracking-wider">Status</th>
                <th className="py-4 px-6 text-xs font-black text-slate-500 uppercase tracking-wider">Last Login</th>
                <th className="py-4 px-6 text-xs font-black text-slate-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-indigo-50/30 transition-colors group">
                  <td className="py-3 px-6">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-100 to-indigo-200 text-indigo-700 flex items-center justify-center font-bold text-xs">
                        {u.employeeName ? u.employeeName.charAt(0) : 'U'}
                      </div>
                      <div>
                        <div className="font-bold text-slate-800 text-sm">{u.employeeName}</div>
                        <div className="text-xs text-slate-400 font-medium">{u.employeeId}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-6 text-slate-600 font-medium text-sm">{u.username}</td>
                  <td className="py-3 px-6">
                    <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 text-[10px] font-black rounded-md uppercase tracking-wider border border-indigo-100">
                      {u.role ? u.role.replace(/_/g, ' ') : 'VIEWER'}
                    </span>
                  </td>
                  <td className="py-3 px-6 text-slate-500 text-sm font-medium">{u.department || '-'}</td>
                  <td className="py-3 px-6">
                    {u.status === 'ACTIVE' ? (
                      <span className="flex items-center text-emerald-600 text-xs font-bold"><CheckCircle className="w-4 h-4 mr-1.5" /> Active</span>
                    ) : u.status === 'LOCKED' ? (
                      <span className="flex items-center text-red-600 text-xs font-bold"><Lock className="w-4 h-4 mr-1.5" /> Locked</span>
                    ) : (
                      <span className="flex items-center text-slate-400 text-xs font-bold"><XCircle className="w-4 h-4 mr-1.5" /> {u.status}</span>
                    )}
                  </td>
                  <td className="py-3 px-6 text-slate-500 text-sm font-medium">
                    {u.lastLogin ? format(new Date(u.lastLogin), 'dd MMM yyyy, HH:mm') : 'Never'}
                  </td>
                  <td className="py-3 px-6 text-right space-x-1">
                    <button 
                      onClick={() => {
                        let parsedPerms = {};
                        if (u.permissions) {
                          try {
                            parsedPerms = JSON.parse(u.permissions);
                          } catch (e) {}
                        }
                        // If no specific perms exist, pre-fill with defaults for user's role
                        if (Object.keys(parsedPerms).length === 0) {
                          parsedPerms = getDefaultRolePermissions(u.role);
                        }
                        setFormData({ ...u, permissions: parsedPerms });
                        setWizardStep(4);
                        setIsWizardOpen(true);
                      }}
                      className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Permission Matrix"
                    >
                      <Key className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => {
                        let parsedPerms = {};
                        if (u.permissions) {
                          try {
                            parsedPerms = JSON.parse(u.permissions);
                          } catch (e) {}
                        }
                        if (Object.keys(parsedPerms).length === 0) {
                          parsedPerms = getDefaultRolePermissions(u.role);
                        }
                        setFormData({ ...u, permissions: parsedPerms, password: '' });
                        setWizardStep(1);
                        setIsWizardOpen(true);
                      }}
                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Edit Profile"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleDeleteUser(u.id, u.username)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100" title="Delete User"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 font-medium">No users found matching your criteria.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-sm text-slate-500 font-medium">
          <div>Showing {total > 0 ? (page - 1) * limit + 1 : 0} to {Math.min(page * limit, total)} of {total} users</div>
          <div className="flex gap-2">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 border border-slate-200 rounded-lg bg-white hover:bg-slate-100 disabled:opacity-50 font-bold">Prev</button>
            <button disabled={page * limit >= total} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 border border-slate-200 rounded-lg bg-white hover:bg-slate-100 disabled:opacity-50 font-bold">Next</button>
          </div>
        </div>
      </div>

      {/* Create / Edit User Wizard Modal */}
      {isWizardOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
            
            <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h2 className="text-xl font-black text-slate-800">{formData.id ? `Edit User - ${formData.employeeName || formData.username}` : 'Create New User'}</h2>
                <p className="text-xs text-slate-500 font-medium mt-0.5">Role Assignment & Screen Permission Matrix</p>
              </div>
              <button onClick={() => setIsWizardOpen(false)} className="text-slate-400 hover:text-red-500 transition-colors"><XCircle className="w-6 h-6" /></button>
            </div>

            <div className="flex-1 overflow-auto p-8 custom-scrollbar">
              {/* Step indicator */}
              <div className="flex justify-between mb-8 relative before:content-[''] before:absolute before:top-1/2 before:left-0 before:w-full before:h-0.5 before:bg-slate-100 before:-z-10">
                {['Employee Info', 'Login Credentials', 'Role Assignment', 'Permission Matrix'].map((step, idx) => (
                  <div key={step} className="flex flex-col items-center gap-2 bg-white px-2 cursor-pointer" onClick={() => setWizardStep(idx + 1)}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-colors ${wizardStep === idx + 1 ? 'bg-spu-primary text-white shadow-lg' : wizardStep > idx + 1 ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                      {wizardStep > idx + 1 ? '✓' : idx + 1}
                    </div>
                    <span className={`text-xs font-bold uppercase tracking-wider ${wizardStep === idx + 1 ? 'text-spu-primary' : 'text-slate-400'}`}>{step}</span>
                  </div>
                ))}
              </div>

              {/* Step 1: Employee Info */}
              {wizardStep === 1 && (
                <div className="grid grid-cols-2 gap-6 max-w-2xl mx-auto">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Employee Name</label>
                    <input type="text" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-spu-primary outline-none font-medium text-slate-700" value={formData.employeeName || ''} onChange={e => setFormData({...formData, employeeName: e.target.value})} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Employee ID</label>
                    <input type="text" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-spu-primary outline-none font-medium text-slate-700" value={formData.employeeId || ''} onChange={e => setFormData({...formData, employeeId: e.target.value})} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Department</label>
                    <input type="text" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-spu-primary outline-none font-medium text-slate-700" value={formData.department || ''} onChange={e => setFormData({...formData, department: e.target.value})} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Designation</label>
                    <input type="text" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-spu-primary outline-none font-medium text-slate-700" value={formData.designation || ''} onChange={e => setFormData({...formData, designation: e.target.value})} />
                  </div>
                </div>
              )}

              {/* Step 2: Login Credentials */}
              {wizardStep === 2 && (
                <div className="grid grid-cols-1 gap-6 max-w-md mx-auto">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Username</label>
                    <input type="text" disabled={!!formData.id} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-spu-primary outline-none font-medium text-slate-700 disabled:opacity-50" value={formData.username || ''} onChange={e => setFormData({...formData, username: e.target.value})} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{formData.id ? 'Reset Password (Leave blank to keep)' : 'Password'}</label>
                    <input type="password" placeholder={formData.id ? '••••••••' : ''} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-spu-primary outline-none font-medium text-slate-700" value={formData.password || ''} onChange={e => setFormData({...formData, password: e.target.value})} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Account Status</label>
                    <select className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-spu-primary outline-none font-medium text-slate-700" value={formData.status || 'ACTIVE'} onChange={e => setFormData({...formData, status: e.target.value})}>
                      <option value="ACTIVE">Active</option>
                      <option value="LOCKED">Locked</option>
                      <option value="INACTIVE">Inactive</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Step 3: Role Assignment */}
              {wizardStep === 3 && (
                <div className="max-w-3xl mx-auto space-y-4">
                  <div className="text-center mb-6">
                    <h3 className="text-lg font-bold text-slate-800">Select Base Role</h3>
                    <p className="text-xs text-slate-500">Choosing a role automatically populates standard screen permission defaults. You can fine-tune permissions per screen in Step 4.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {PREDEFINED_ROLES.map(r => (
                      <div 
                        key={r.id} 
                        onClick={() => handleSelectRole(r.id)}
                        className={`p-4 border-2 rounded-2xl cursor-pointer transition-all ${formData.role === r.id ? 'border-spu-primary bg-indigo-50/70 shadow-sm' : 'border-slate-200 hover:border-indigo-300 bg-white'}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-black text-slate-800 text-sm">{r.label}</div>
                          {formData.role === r.id && <CheckCircle className="w-5 h-5 text-spu-primary" />}
                        </div>
                        <div className="text-xs font-medium text-slate-500 mt-1.5 leading-relaxed">{r.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 4: Permission Matrix */}
              {wizardStep === 4 && (
                <div className="max-w-5xl mx-auto space-y-4">
                  
                  {/* Action Toolbar for Bulk Matrix Selection */}
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex items-center justify-between flex-wrap gap-3">
                    <div className="text-xs font-bold text-slate-700">
                      Granular Matrix Control — User: <span className="text-indigo-600 font-black">{formData.employeeName || formData.username}</span> ({formData.role})
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        type="button" 
                        onClick={() => handleSelectAllMatrix(true)}
                        className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-1 shadow-sm"
                      >
                        <CheckSquare className="w-3.5 h-3.5" /> Select All Matrix
                      </button>
                      <button 
                        type="button" 
                        onClick={() => handleSelectAllMatrix(false)}
                        className="px-3 py-1.5 bg-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-300 transition-colors flex items-center gap-1"
                      >
                        <Square className="w-3.5 h-3.5" /> Clear All Matrix
                      </button>
                    </div>
                  </div>

                  {/* Matrix Table */}
                  <div className="overflow-x-auto custom-scrollbar border border-slate-200 rounded-2xl bg-white shadow-sm">
                    <table className="w-full text-left border-collapse whitespace-nowrap">
                      <thead className="bg-slate-100 border-b border-slate-200">
                        <tr>
                          <th className="py-3 px-4 text-xs font-black text-slate-700 uppercase sticky left-0 bg-slate-100 z-20 border-r border-slate-200 min-w-[220px]">
                            Screen / Module Name
                          </th>
                          {actions.map(a => (
                            <th key={a} className="py-3 px-3 text-[10px] font-black text-slate-600 uppercase text-center min-w-[80px]">
                              <div className="flex flex-col items-center gap-1">
                                <span>{a.toUpperCase()}</span>
                                <div className="flex gap-1 text-[9px] font-semibold text-indigo-600">
                                  <button type="button" onClick={() => handleSelectAllColumn(a, true)} title={`Select all ${a}`}>All</button>
                                  <span>/</span>
                                  <button type="button" onClick={() => handleSelectAllColumn(a, false)} title={`Clear all ${a}`}>None</button>
                                </div>
                              </div>
                            </th>
                          ))}
                          <th className="py-3 px-3 text-[10px] font-black text-slate-500 uppercase text-center min-w-[100px]">Row Options</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {screens.map(screen => {
                          const screenPerms = formData.permissions[screen] || {};
                          const isAllSelected = actions.every(a => !!screenPerms[a]);
                          return (
                            <tr key={screen} className="hover:bg-indigo-50/20 transition-colors">
                              <td className="py-3 px-4 text-sm font-bold text-slate-800 sticky left-0 bg-white group-hover:bg-indigo-50/20 border-r border-slate-200">
                                {screen}
                              </td>
                              {actions.map(a => (
                                <td key={a} className="py-3 px-3 text-center">
                                  <input 
                                    type="checkbox" 
                                    checked={!!screenPerms[a]}
                                    onChange={() => togglePermission(screen, a)}
                                    className="w-4 h-4 rounded text-spu-primary focus:ring-spu-primary cursor-pointer accent-indigo-600"
                                  />
                                </td>
                              ))}
                              <td className="py-3 px-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleSelectAllRow(screen, !isAllSelected)}
                                  className={`text-[10px] font-bold px-2 py-1 rounded transition-colors ${isAllSelected ? 'bg-amber-100 text-amber-800 hover:bg-amber-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                >
                                  {isAllSelected ? 'Clear Row' : 'Select All'}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            </div>

            <div className="px-8 py-6 border-t border-slate-100 bg-slate-50/50 flex justify-between">
              {wizardStep > 1 ? (
                <button onClick={() => setWizardStep(s => s - 1)} className="px-6 py-3 font-bold text-slate-500 hover:bg-slate-200 rounded-xl transition-colors">Back</button>
              ) : <div></div>}
              
              {wizardStep < 4 ? (
                <GradientButton label="Next Step" onClick={() => setWizardStep(s => s + 1)} />
              ) : (
                <GradientButton label="Save User Profile & Permissions" onClick={handleSaveUser} />
              )}
            </div>
            
          </div>
        </div>
      )}
    </div>
  );
}
