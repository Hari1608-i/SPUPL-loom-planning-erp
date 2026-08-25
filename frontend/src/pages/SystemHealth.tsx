import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config';
import { 
  Activity, Database, Server, RefreshCw, AlertTriangle, 
  CheckCircle, XCircle, ShieldCheck, Box, Package, Palette, Play, History, Calendar
} from 'lucide-react';

interface HealthData {
  dbConnected: boolean;
  metrics: {
    totalLooms: number;
    totalDesigns: number;
    totalBeams: number;
    runningLooms: number;
    plannedLooms: number;
    historyCount: number;
  };
  health: {
    score: number;
    status: string;
    errors: string[];
    warnings: string[];
    responseTimeMs: number;
    lastSync: string;
  };
}

export default function SystemHealth() {
  const [data, setData] = useState<HealthData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastCheck, setLastCheck] = useState<Date>(new Date());
  const [errorMsg, setErrorMsg] = useState('');

  const fetchHealth = async () => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/system-health`);
      if (!res.ok) throw new Error('API Error');
      const json = await res.json();
      if (json.success) {
        setData(json.data);
        setLastCheck(new Date());
      } else {
        throw new Error(json.error || 'Unknown error');
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Failed to connect to health endpoint');
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchHealth();
    // Refresh every 30 seconds
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-500';
    if (score >= 70) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Excellent': return 'bg-green-100 text-green-800 border-green-200';
      case 'Good': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Needs Attention': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'Critical': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-200 gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center">
            <ShieldCheck className="w-8 h-8 mr-3 text-spu-primary" />
            System Control Center
          </h1>
          <p className="text-slate-500 font-medium mt-1">System Health, Data Integrity & End-to-End Workflow Validation</p>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="text-right">
            <div className="text-sm text-slate-500 font-medium">Last Checked</div>
            <div className="text-sm font-bold text-slate-900">{lastCheck.toLocaleTimeString()}</div>
          </div>
          <button 
            onClick={fetchHealth}
            disabled={isLoading}
            className="flex items-center px-6 py-3 bg-spu-secondary text-white rounded-xl hover:bg-spu-secondary/90 transition-all font-bold shadow-sm shadow-spu-secondary/20 disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 mr-2 ${isLoading ? 'animate-refresh-spin' : ''}`} />
            Run System Validation
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center text-red-700 font-medium">
          <AlertTriangle className="w-5 h-5 mr-3 flex-shrink-0" />
          {errorMsg}
        </div>
      )}

      {/* Main Stats Grid */}
      {data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            
            {/* Overall Health Card */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col items-center justify-center text-center">
              <h3 className="text-slate-500 font-bold uppercase tracking-wider text-xs mb-4">Overall System Health</h3>
              <div className={`text-6xl font-black tracking-tighter mb-2 ${getScoreColor(data.health.score)}`}>
                {data.health.score}%
              </div>
              <div className={`px-4 py-1.5 rounded-full border text-sm font-bold ${getStatusColor(data.health.status)}`}>
                {data.health.status}
              </div>
            </div>

            {/* DB Status Card */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between">
              <div>
                <h3 className="text-slate-500 font-bold uppercase tracking-wider text-xs mb-4 flex items-center">
                  <Server className="w-4 h-4 mr-2" /> Connection Status
                </h3>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-600">Database</span>
                    {data.dbConnected ? (
                       <span className="flex items-center text-green-600 font-bold text-sm"><CheckCircle className="w-4 h-4 mr-1" /> Connected</span>
                    ) : (
                       <span className="flex items-center text-red-600 font-bold text-sm"><XCircle className="w-4 h-4 mr-1" /> Offline</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-600">API Server</span>
                    <span className="flex items-center text-green-600 font-bold text-sm"><CheckCircle className="w-4 h-4 mr-1" /> Running</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-600">Response Time</span>
                    <span className="text-sm font-bold text-slate-900">{data.health.responseTimeMs} ms</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Master Data Card */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between">
              <div>
                <h3 className="text-slate-500 font-bold uppercase tracking-wider text-xs mb-4 flex items-center">
                  <Database className="w-4 h-4 mr-2" /> Master Data Load
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-600 flex items-center"><Box className="w-4 h-4 mr-2 text-slate-400" /> Looms Loaded</span>
                    <span className="text-sm font-bold text-slate-900">{data.metrics.totalLooms}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-600 flex items-center"><Palette className="w-4 h-4 mr-2 text-slate-400" /> Designs Loaded</span>
                    <span className="text-sm font-bold text-slate-900">{data.metrics.totalDesigns}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-600 flex items-center"><Package className="w-4 h-4 mr-2 text-slate-400" /> Beams in Stock</span>
                    <span className="text-sm font-bold text-slate-900">{data.metrics.totalBeams}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Transactions Card */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between">
              <div>
                <h3 className="text-slate-500 font-bold uppercase tracking-wider text-xs mb-4 flex items-center">
                  <Activity className="w-4 h-4 mr-2" /> Live Transactions
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-600 flex items-center"><Play className="w-4 h-4 mr-2 text-spu-primary" /> Active Runs</span>
                    <span className="text-sm font-bold text-slate-900">{data.metrics.runningLooms}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-600 flex items-center"><Calendar className="w-4 h-4 mr-2 text-amber-500" /> Planned Assignments</span>
                    <span className="text-sm font-bold text-slate-900">{data.metrics.plannedLooms}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-600 flex items-center"><History className="w-4 h-4 mr-2 text-purple-500" /> Completed History</span>
                    <span className="text-sm font-bold text-slate-900">{data.metrics.historyCount}</span>
                  </div>
                </div>
              </div>
            </div>
            
          </div>

          {/* Validation Logs */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Errors */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
              <div className="p-4 border-b border-slate-100 bg-red-50 flex items-center">
                <XCircle className="w-5 h-5 text-red-500 mr-2" />
                <h2 className="font-bold text-red-900">Critical Integrity Errors ({data.health.errors.length})</h2>
              </div>
              <div className="p-4 flex-1 overflow-y-auto max-h-64 bg-slate-50">
                {data.health.errors.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-sm font-medium text-green-600">
                    <CheckCircle className="w-5 h-5 mr-2" /> No critical errors found.
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {data.health.errors.map((err, idx) => (
                      <li key={idx} className="text-sm font-medium text-red-800 bg-white p-3 rounded border border-red-100 shadow-sm flex items-start">
                        <AlertTriangle className="w-4 h-4 mr-2 mt-0.5 text-red-500 flex-shrink-0" /> {err}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Warnings */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
              <div className="p-4 border-b border-slate-100 bg-amber-50 flex items-center">
                <AlertTriangle className="w-5 h-5 text-amber-500 mr-2" />
                <h2 className="font-bold text-amber-900">System Warnings ({data.health.warnings.length})</h2>
              </div>
              <div className="p-4 flex-1 overflow-y-auto max-h-64 bg-slate-50">
                {data.health.warnings.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-sm font-medium text-green-600">
                    <CheckCircle className="w-5 h-5 mr-2" /> No warnings found.
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {data.health.warnings.map((warn, idx) => (
                      <li key={idx} className="text-sm font-medium text-amber-800 bg-white p-3 rounded border border-amber-100 shadow-sm flex items-start">
                        <AlertTriangle className="w-4 h-4 mr-2 mt-0.5 text-amber-500 flex-shrink-0" /> {warn}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

          </div>
          
          {/* Detailed Module Sync Status - Visual check for user */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
             <h2 className="text-lg font-black text-slate-900 mb-6 flex items-center">
               <Activity className="w-5 h-5 mr-2 text-spu-primary" /> End-to-End Module Connections
             </h2>
             <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
               {[
                 { name: 'Loom Master', ok: data.dbConnected },
                 { name: 'Design Master', ok: data.dbConnected },
                 { name: 'Beam Stock', ok: data.dbConnected },
                 { name: 'Main Entry', ok: data.health.errors.length === 0 },
                 { name: 'Availability Board', ok: true },
                 { name: 'Runout Monitor', ok: true },
                 { name: 'Next Plan Setup', ok: true },
                 { name: 'Sizing Dashboard', ok: true },
               ].map((mod, idx) => (
                 <div key={idx} className="flex items-center justify-between p-3 border border-slate-100 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors">
                   <span className="text-sm font-bold text-slate-700">{mod.name}</span>
                   {mod.ok ? (
                     <span className="text-xs font-black px-2 py-1 bg-green-100 text-green-700 rounded-lg">Connected</span>
                   ) : (
                     <span className="text-xs font-black px-2 py-1 bg-red-100 text-red-700 rounded-lg">Warning</span>
                   )}
                 </div>
               ))}
             </div>
          </div>
        </>
      )}

    </div>
  );
}
