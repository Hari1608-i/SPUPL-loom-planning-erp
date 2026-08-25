import React, { useState, useEffect } from 'react';
import { 
  Database, Search, Download, Printer, Eye, Lock, RefreshCw, 
  Layers, Filter, CheckCircle2, ShieldCheck, ArrowUpDown, FileText, Trash2
} from 'lucide-react';
import { API_BASE_URL } from '../config';
import { useAppContext } from '../context/AppProvider';
import * as XLSX from 'xlsx';
import { CompanyPrintHeader } from '../components/common/CompanyPrintHeader';
import { triggerPrint } from '../utils/printManager';
import { parseConstructionSpecs } from '../utils/calculations';


interface DesignItem {
  design_no_sp_no: string;
  construction: string;
  weave_type: string;
  reed_count: string;
  pick: string;
  greige_width: string;
  total_ends: number;
  reed_space_warp_width: string;
  frames: number;
  beam_type: string;
  beam_dia: number;
  crimp_percent: number;
  weft_colours: number;
  status?: string;
  remarks?: string;
  createdAt?: string;
}

export default function DesignMaster() {
  const { designs, refreshData } = useAppContext();
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<keyof DesignItem>('design_no_sp_no');
  const [sortAsc, setSortAsc] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedDesign, setSelectedDesign] = useState<DesignItem | null>(null);

  useEffect(() => {
    refreshData();
  }, []);

  const handleSort = (field: keyof DesignItem) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const processedDesigns = (designs || []).map((d: any) => {
    const parsed = parseConstructionSpecs(d.construction);
    const rawPick = d.pick !== undefined && d.pick !== null && String(d.pick).trim() !== '' ? String(d.pick) : (d.ppi ? String(d.ppi) : (parsed.pick || ''));
    const rawWidth = d.greigeWidth || d.greige_width || d.width ? String(d.greigeWidth || d.greige_width || d.width) : (parsed.greigeWidth || '');
    const rawReedSpace = d.reedSpace || d.reed_space_warp_width ? String(d.reedSpace || d.reed_space_warp_width) : (parsed.reedSpace || (rawWidth ? String(parseFloat(rawWidth) + 1.5) : ''));

    return {
      design_no_sp_no: d.designNo || d.design_no_sp_no || '',
      construction: d.construction || '',
      weave_type: d.weaveType || d.weave_type || '',
      reed_count: d.reedCount !== undefined && d.reedCount !== null && String(d.reedCount).trim() !== '' ? String(d.reedCount) : (d.reed_count ? String(d.reed_count) : ''),
      pick: rawPick,
      greige_width: rawWidth,
      total_ends: Number(d.totalEnds || d.total_ends) || 0,
      reed_space_warp_width: rawReedSpace,
      frames: Number(d.frames) || 0,
      beam_type: d.beamType || d.beam_type || '',
      beam_dia: Number(d.beamDia || d.beam_dia) || 0,
      crimp_percent: Number(d.crimpPercent || d.crimp_percent) || 0,
      weft_colours: Number(d.weftColours || d.weft_colours) || 0,
      status: d.status || 'ACTIVE',
      remarks: d.remarks || '',
      createdAt: d.createdAt || ''
    };
  });


  const filteredDesigns = processedDesigns.filter(d => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return d.design_no_sp_no.toLowerCase().includes(q) ||
           d.construction.toLowerCase().includes(q) ||
           d.weave_type.toLowerCase().includes(q);
  }).sort((a, b) => {
    const valA = a[sortField] ?? '';
    const valB = b[sortField] ?? '';
    if (valA < valB) return sortAsc ? -1 : 1;
    if (valA > valB) return sortAsc ? 1 : -1;
    return 0;
  });

  const handleExportExcel = () => {
    const exportData = filteredDesigns.map(d => ({
      'Design Number': d.design_no_sp_no,
      'Construction': d.construction,
      'Weave Type': d.weave_type,
      'Reed Count': d.reed_count,
      'Pick': d.pick,
      'Greige Width': d.greige_width,
      'Total Ends': d.total_ends,
      'Reed Space / Warp Width': d.reed_space_warp_width,
      'Frames': d.frames,

      'Crimp %': d.crimp_percent ? `${(d.crimp_percent * 100).toFixed(1)}%` : '0%',
      'Weft Colours': d.weft_colours,
      'Status': d.status,
      'Remarks': d.remarks
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "DesignLibrary");
    XLSX.writeFile(wb, `SPUPL_Design_Master_Library.xlsx`);
  };

  const handlePrint = () => {
    triggerPrint();
  };

  return (
    <div className="space-y-6 flex flex-col h-full bg-slate-50/70 p-4 print:p-0 print:bg-white">
      <CompanyPrintHeader title="Master Design Library (SSOT)" subtitle="Official Fabric & Construction Specifications" />
      
      {/* Page Header */}
      <div className="flex flex-wrap justify-between items-center gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-industrial-900 flex items-center">
            <Database className="w-6 h-6 mr-3 text-blue-600" /> Master Design Library (SSOT)
          </h1>
          <p className="text-industrial-500 text-sm mt-1">Single Source of Truth — All design specifications are managed centrally via Order Management.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button 
            onClick={async () => { setIsRefreshing(true); await refreshData(); setTimeout(() => setIsRefreshing(false), 700); }}
            className="flex items-center px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg shadow-sm font-semibold text-sm transition-all"
          >
            <RefreshCw className={`w-4 h-4 mr-1.5 ${isRefreshing ? 'animate-refresh-spin' : ''}`} /> Refresh Library
          </button>

          <button 
            onClick={handleExportExcel}
            className="flex items-center px-4 py-2 bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 shadow-sm font-semibold text-sm transition-all"
          >
            <Download className="w-4 h-4 mr-1.5" /> Export Excel
          </button>

          <button 
            onClick={handlePrint}
            className="flex items-center px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 shadow-sm font-semibold text-sm transition-all"
          >
            <Printer className="w-4 h-4 mr-1.5" /> Print / Export PDF
          </button>
        </div>
      </div>

      {/* SSOT Read-Only Info Banner */}
      <div className="bg-blue-50/90 border border-blue-200 rounded-xl p-4 flex items-center justify-between shadow-sm print:hidden">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-blue-900 flex items-center">
              Single Source of Truth Architecture Active
            </div>
            <div className="text-xs text-blue-700 mt-0.5">
              Design specifications are created & updated exclusively inside <span className="font-bold underline">Order Management</span>. This library automatically retrieves and displays synchronized records across all system modules.
            </div>
          </div>
        </div>
        <div className="text-xs font-bold px-3 py-1.5 bg-blue-100 text-blue-800 rounded-lg border border-blue-300">
          Read-Only Library
        </div>
      </div>

      {/* Grid Container */}
      <div className="bg-white rounded-xl shadow-sm border border-industrial-100 flex-1 overflow-hidden flex flex-col">
        
        {/* Dark Header Bar */}
        <div className="p-3 bg-industrial-800 border-b border-industrial-700 flex justify-between items-center text-white print:hidden">
          <div className="flex items-center space-x-4">
            <div className="font-semibold flex items-center text-sm tracking-wide">
              <CheckCircle2 className="w-4 h-4 mr-2 text-green-400" /> Active Design Library
            </div>
            <div className="relative w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2 text-industrial-400" />
              <input 
                type="text" 
                placeholder="Search design no, construction, weave..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1 text-xs bg-industrial-900 border border-industrial-600 rounded text-white placeholder-industrial-400 outline-none"
              />
            </div>
          </div>
          
          <div className="text-xs text-industrial-300 font-medium">
            Total Synchronized Designs: <span className="text-white font-bold">{filteredDesigns.length}</span>
          </div>
        </div>

        {/* Read-Only Table */}
        <div className="flex-1 overflow-auto custom-scrollbar relative">
          <table className="w-full text-left border-collapse whitespace-nowrap text-xs">
            <thead className="bg-industrial-900 text-white font-bold sticky top-0 z-20 shadow-sm">
              <tr className="border-b border-industrial-700">
                <th className="py-2.5 px-3 text-center w-10">#</th>
                <th className="py-2.5 px-3 cursor-pointer hover:bg-industrial-800" onClick={() => handleSort('design_no_sp_no')}>
                  <div className="flex items-center">Design Number <ArrowUpDown className="w-3 h-3 ml-1 text-industrial-400" /></div>
                </th>
                <th className="py-2.5 px-3 cursor-pointer hover:bg-industrial-800" onClick={() => handleSort('construction')}>
                  <div className="flex items-center">Construction <ArrowUpDown className="w-3 h-3 ml-1 text-industrial-400" /></div>
                </th>
                <th className="py-2.5 px-3">Weave Type</th>
                <th className="py-2.5 px-3 text-center">Reed Count</th>
                <th className="py-2.5 px-3 text-center">Pick</th>
                <th className="py-2.5 px-3 text-center">Greige Width</th>
                <th className="py-2.5 px-3 text-right">Total Ends</th>
                <th className="py-2.5 px-3 text-center">Reed Space</th>
                <th className="py-2.5 px-3 text-center">Frames</th>

                <th className="py-2.5 px-3 text-right">Crimp %</th>
                <th className="py-2.5 px-3 text-center">Colours</th>
                <th className="py-2.5 px-3 text-center print:hidden">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-industrial-100">
              {filteredDesigns.map((d, index) => (
                <tr key={d.design_no_sp_no || index} className="hover:bg-blue-50/50 transition-colors">
                  <td className="py-2 px-3 text-industrial-400 font-mono text-[10px] text-center bg-industrial-50/40">{index + 1}</td>
                  <td className="py-2 px-3 font-black text-blue-900 bg-blue-50/30">{d.design_no_sp_no}</td>
                  <td className="py-2 px-3 font-semibold text-industrial-800">{d.construction || '—'}</td>
                  <td className="py-2 px-3 font-medium text-industrial-700">{d.weave_type || '—'}</td>
                  <td className="py-2 px-3 text-center font-semibold text-industrial-800">{d.reed_count || '—'}</td>
                  <td className="py-2 px-3 text-center font-semibold text-industrial-800">{d.pick || '—'}</td>
                  <td className="py-2 px-3 text-center font-medium text-industrial-700">{d.greige_width || '—'}</td>
                  <td className="py-2 px-3 text-right font-mono font-bold text-industrial-800">{d.total_ends || '—'}</td>
                  <td className="py-2 px-3 text-center font-medium text-industrial-700">{d.reed_space_warp_width || '—'}</td>
                  <td className="py-2 px-3 text-center font-bold text-industrial-800">{d.frames || '—'}</td>

                  <td className="py-2 px-3 text-right font-bold text-blue-800">
                    {d.crimp_percent ? `${(d.crimp_percent * 100).toFixed(1)}%` : '0%'}
                  </td>
                  <td className="py-2 px-3 text-center font-bold text-industrial-800">{d.weft_colours || '—'}</td>
                  <td className="py-2 px-3 text-center print:hidden">
                    <div className="flex items-center justify-center gap-1.5">
                      <button 
                        onClick={() => setSelectedDesign(d)}
                        className="p-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg transition-colors font-medium text-xs flex items-center"
                        title="View Full Specifications"
                      >
                        <Eye className="w-3.5 h-3.5 mr-1" /> View
                      </button>
                      <button 
                        onClick={async () => {
                          if (!window.confirm(`Delete Design "${d.design_no_sp_no}"?\n\nThis will permanently remove it from the Master Design Library.`)) return;
                          try {
                            // Try normal delete first
                            const res = await fetch(`${API_BASE_URL}/api/designs?designNo=${encodeURIComponent(d.design_no_sp_no)}`, {
                              method: 'DELETE'
                            });
                            const data = await res.json();
                            if (res.ok && data.success) {
                              // Close modal if it's showing this design
                              if (selectedDesign && selectedDesign.design_no_sp_no === d.design_no_sp_no) {
                                setSelectedDesign(null);
                              }
                              await refreshData();
                              alert(`✅ Design "${d.design_no_sp_no}" deleted successfully.`);
                            } else if (res.status === 400 && data.linked) {
                              // Design is linked – ask if admin wants to force delete
                              const linkedInfo = Object.entries(data.linked)
                                .filter(([, v]) => v)
                                .map(([k]) => k)
                                .join(', ');
                              const forceIt = window.confirm(
                                `⚠️ "${d.design_no_sp_no}" is linked to: ${linkedInfo}.\n\nForce delete anyway? (This cannot be undone)`
                              );
                              if (forceIt) {
                                const res2 = await fetch(`${API_BASE_URL}/api/designs?designNo=${encodeURIComponent(d.design_no_sp_no)}&force=true`, {
                                  method: 'DELETE'
                                });
                                const data2 = await res2.json();
                                if (res2.ok && data2.success) {
                                  if (selectedDesign && selectedDesign.design_no_sp_no === d.design_no_sp_no) {
                                    setSelectedDesign(null);
                                  }
                                  await refreshData();
                                  alert(`✅ Design "${d.design_no_sp_no}" force-deleted successfully.`);
                                } else {
                                  alert('❌ Force delete failed: ' + (data2.error || 'Unknown error'));
                                }
                              }
                            } else {
                              alert('❌ ' + (data.error || 'Failed to delete design.'));
                            }
                          } catch (e: any) {
                            alert('❌ Error: ' + e.message);
                          }
                        }}
                        className="p-1.5 bg-red-50 text-red-700 hover:bg-red-100 rounded-lg transition-colors font-medium text-xs flex items-center"
                        title="Delete Design"
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* View Specification Modal */}
      {selectedDesign && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-xl font-bold text-slate-900 flex items-center">
                  <FileText className="w-5 h-5 mr-2 text-blue-600" /> {selectedDesign.design_no_sp_no}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">Master Design Specification (SSOT)</p>
              </div>
              <button onClick={() => setSelectedDesign(null)} className="text-slate-400 hover:text-slate-600 p-1">✕</button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-2.5 bg-slate-50 rounded-lg"><span className="font-semibold text-slate-500 block">Construction</span><span className="font-bold text-slate-800">{selectedDesign.construction || '—'}</span></div>
              <div className="p-2.5 bg-slate-50 rounded-lg"><span className="font-semibold text-slate-500 block">Weave Type</span><span className="font-bold text-slate-800">{selectedDesign.weave_type || '—'}</span></div>
              <div className="p-2.5 bg-slate-50 rounded-lg"><span className="font-semibold text-slate-500 block">Reed Count</span><span className="font-bold text-slate-800">{selectedDesign.reed_count || '—'}</span></div>
              <div className="p-2.5 bg-slate-50 rounded-lg"><span className="font-semibold text-slate-500 block">Pick</span><span className="font-bold text-slate-800">{selectedDesign.pick || '—'}</span></div>
              <div className="p-2.5 bg-slate-50 rounded-lg"><span className="font-semibold text-slate-500 block">Greige Width</span><span className="font-bold text-slate-800">{selectedDesign.greige_width || '—'}</span></div>
              <div className="p-2.5 bg-slate-50 rounded-lg"><span className="font-semibold text-slate-500 block">Total Ends</span><span className="font-bold text-slate-800">{selectedDesign.total_ends || '—'}</span></div>
              <div className="p-2.5 bg-slate-50 rounded-lg"><span className="font-semibold text-slate-500 block">Reed Space</span><span className="font-bold text-slate-800">{selectedDesign.reed_space_warp_width || '—'}</span></div>
              <div className="p-2.5 bg-slate-50 rounded-lg"><span className="font-semibold text-slate-500 block">Frames</span><span className="font-bold text-slate-800">{selectedDesign.frames || '—'}</span></div>

              <div className="p-2.5 bg-slate-50 rounded-lg"><span className="font-semibold text-slate-500 block">Crimp %</span><span className="font-bold text-slate-800">{selectedDesign.crimp_percent ? `${(selectedDesign.crimp_percent * 100).toFixed(1)}%` : '0%'}</span></div>
              <div className="p-2.5 bg-slate-50 rounded-lg"><span className="font-semibold text-slate-500 block">Weft Colours</span><span className="font-bold text-slate-800">{selectedDesign.weft_colours || '—'}</span></div>
            </div>

            <div className="text-right pt-2 border-t border-slate-100">
              <button onClick={() => setSelectedDesign(null)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg">Close</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
