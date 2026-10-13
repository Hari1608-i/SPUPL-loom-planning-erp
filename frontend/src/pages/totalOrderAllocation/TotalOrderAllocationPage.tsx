import React, { useState } from 'react';
import { 
  LayoutDashboard, PlusCircle, Layers, Building2, Cpu, 
  Factory, CheckSquare, FileText, FileSpreadsheet, Download
} from 'lucide-react';
import ToaDashboard from './ToaDashboard';
import ToaOrderEntry from './ToaOrderEntry';
import ToaInHouseAllocation from './ToaInHouseAllocation';
import ToaVendorAllocation from './ToaVendorAllocation';
import ToaInHouseCapabilityBoard from './ToaInHouseCapabilityBoard';
import ToaVendorLoomMaster from './ToaVendorLoomMaster';
import ToaProductionUpdate from './ToaProductionUpdate';
import ToaCompletionReview from './ToaCompletionReview';
import ToaIbpoAnalysisReport from './ToaIbpoAnalysisReport';
import ToaBulkOperations from './ToaBulkOperations';
import { API_BASE_URL } from '../../config';

const TABS = [
  { id: 'dashboard', label: '1. Dashboard', icon: LayoutDashboard },
  { id: 'orders', label: '2. Order Entry', icon: PlusCircle },
  { id: 'inhouse', label: '3. In-House Allocation', icon: Layers },
  { id: 'vendor', label: '4. Vendor Allocation', icon: Building2 },
  { id: 'inhouse-board', label: '5. In-House Capability Board', icon: Cpu },
  { id: 'vendor-master', label: '6. Vendor Loom Master', icon: Factory },
  { id: 'production', label: '7. Production Entry', icon: Factory },
  { id: 'completion', label: '8. Completion Review', icon: CheckSquare },
  { id: 'report', label: '9. IBPO Lifecycle Report', icon: FileText },
  { id: 'bulk', label: '10. Bulk Operations', icon: FileSpreadsheet }
];

export default function TotalOrderAllocationPage() {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [contextIbpo, setContextIbpo] = useState<string>('');

  const handleSelectTab = (tabId: string, ibpo?: string) => {
    setActiveTab(tabId);
    if (ibpo) setContextIbpo(ibpo);
  };

  const handleExportFullExcel = () => {
    window.open(`${API_BASE_URL}/api/total-order-allocation/reports/export-excel`, '_blank');
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Module Title & Tab Navigation */}
      <div className="bg-white dark:bg-slate-800 p-4 sm:p-5 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-pulse" />
              <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                Total Order Allocation System
              </h1>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              SPUPL Independent Autonomous Allocation & Production Module • Ref: KPX 2026 Engine
            </p>
          </div>

          <button
            onClick={handleExportFullExcel}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black shadow-md flex items-center gap-1.5 transition-all self-start sm:self-auto"
          >
            <Download className="w-3.5 h-3.5" />
            Export System Excel Report
          </button>
        </div>

        {/* Tab Navigation Pill Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/20'
                    : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content Rendering */}
      <div>
        {activeTab === 'dashboard' && (
          <ToaDashboard onSelectTab={handleSelectTab} />
        )}

        {activeTab === 'orders' && (
          <ToaOrderEntry onOrderSaved={(ibpo) => handleSelectTab('inhouse', ibpo)} />
        )}

        {activeTab === 'inhouse' && (
          <ToaInHouseAllocation
            initialIbpo={contextIbpo}
            onAllocationConfirmed={(ibpo) => handleSelectTab('production', ibpo)}
          />
        )}

        {activeTab === 'vendor' && (
          <ToaVendorAllocation
            initialIbpo={contextIbpo}
            onAllocationConfirmed={(ibpo) => handleSelectTab('production', ibpo)}
            onNavigateToVendorMaster={() => setActiveTab('vendor-master')}
          />
        )}

        {activeTab === 'inhouse-board' && (
          <ToaInHouseCapabilityBoard />
        )}

        {activeTab === 'vendor-master' && (
          <ToaVendorLoomMaster />
        )}

        {activeTab === 'production' && (
          <ToaProductionUpdate
            initialIbpo={contextIbpo}
            onNavigateToCompletion={(ibpo) => handleSelectTab('completion', ibpo)}
          />
        )}

        {activeTab === 'completion' && (
          <ToaCompletionReview
            initialIbpo={contextIbpo}
            onOrderClosed={(ibpo) => handleSelectTab('report', ibpo)}
          />
        )}

        {activeTab === 'report' && (
          <ToaIbpoAnalysisReport initialIbpo={contextIbpo} />
        )}

        {activeTab === 'bulk' && (
          <ToaBulkOperations />
        )}
      </div>
    </div>
  );
}
