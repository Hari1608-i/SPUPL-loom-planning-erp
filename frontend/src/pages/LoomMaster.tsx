import React, { useState, useEffect, useRef } from 'react';
import { 
  Database, Search, Plus, Download, Upload, Trash2, Save, 
  ChevronDown, ChevronUp, FileSpreadsheet, Clipboard, CheckCircle, 
  RefreshCw, Printer, Calendar, CheckCircle2, AlertCircle, Copy
} from 'lucide-react';
import { useAppContext } from '../context/AppProvider';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../config';
import * as XLSX from 'xlsx';
import { CompanyPrintHeader } from '../components/common/CompanyPrintHeader';
import { triggerPrint } from '../utils/printManager';

// Loom Master Row Interface matching Excel columns order
interface LoomRowState {
  id: string;
  unit: string;
  loomNo: number | '';
  loomType: string;
  weftColours: number | '';
  beamType: string;
  beamDia: number | '';
  installedLever: number | '';
  width: string;
  weave: string;
}

const FIELDS_ORDER: (keyof LoomRowState)[] = [
  'unit', 'loomNo', 'loomType', 'weftColours', 'beamType', 'beamDia', 'installedLever', 'width', 'weave'
];

export default function LoomMaster() {
  const { looms, refreshData } = useAppContext();
  const { user } = useAuth();

  const [rows, setRows] = useState<LoomRowState[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Sync DB looms into editable rows, or initialize 20 blank rows if empty
  useEffect(() => {
    if (looms && looms.length > 0) {
      const loaded = looms.map((l: any, idx: number) => ({
        id: `existing-${idx}`,
        unit: l.unit || 'Unit I',
        loomNo: l.loom_no !== undefined ? l.loom_no : '',
        loomType: l.loom_type || 'DOBBY',
        weftColours: l.weft_colours !== undefined ? l.weft_colours : 4,
        beamType: l.beam_type || 'SINGLE BEAM',
        beamDia: l.beam_dia !== undefined ? l.beam_dia : 800,
        installedLever: l.installed_lever !== undefined ? l.installed_lever : 5,
        width: l.width || '190CM',
        weave: l.weave || 'PLAIN'
      }));
      setRows(loaded);
    } else {
      // Initialize 20 blank rows ready for Excel copy-paste
      const emptyRows: LoomRowState[] = Array.from({ length: 20 }).map((_, idx) => ({
        id: `blank-${idx}`,
        unit: '',
        loomNo: '',
        loomType: '',
        weftColours: '',
        beamType: '',
        beamDia: '',
        installedLever: '',
        width: '',
        weave: ''
      }));
      setRows(emptyRows);
    }
  }, [looms]);

  const handleRowChange = (index: number, field: keyof LoomRowState, value: any) => {
    setRows(prev => {
      const newRows = [...prev];
      newRows[index] = { ...newRows[index], [field]: value };
      return newRows;
    });
  };

  // Excel multi-row / multi-column paste handler
  const handlePaste = (
    e: React.ClipboardEvent<HTMLInputElement | HTMLSelectElement>,
    startRowIndex: number,
    startField: keyof LoomRowState
  ) => {
    e.preventDefault();
    const clipboardData = e.clipboardData.getData('Text');
    if (!clipboardData || !clipboardData.trim()) return;

    const rawLines = clipboardData.trim().split(/\r?\n/).filter(l => l.trim().length > 0);
    if (rawLines.length === 0) return;

    const startFieldIndex = FIELDS_ORDER.indexOf(startField);
    if (startFieldIndex === -1) return;

    const isTabSeparated = rawLines[0].includes('\t');

    const parseLineCols = (line: string): string[] => {
      if (isTabSeparated) {
        return line.split('\t').map(c => c.trim().replace(/^"|"$/g, ''));
      }
      const parts: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') inQuotes = !inQuotes;
        else if (char === ',' && !inQuotes) {
          parts.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      parts.push(current.trim());
      return parts;
    };

    // Header Detection logic:
    // A line is ONLY a header line if cols[0] or cols[1] equals "unit", "loom no", "loomno", "loom_no" AND is NOT a valid numeric loom number
    const firstLineCols = parseLineCols(rawLines[0]);
    const col0Low = (firstLineCols[0] || '').toLowerCase();
    const col1Low = (firstLineCols[1] || '').toLowerCase();

    const isCol0Header = col0Low === 'unit' || col0Low === 'loom no' || col0Low === 'loomno' || col0Low === 'loom_no' || col0Low === 'loom';
    const isCol1Header = col1Low === 'loom no' || col1Low === 'loomno' || col1Low === 'loom_no' || col1Low === 'loom' || col1Low === 'loom type';
    
    // Check if either column 0 or column 1 contains a valid numeric Loom Number
    const col0Num = Number(firstLineCols[0]);
    const col1Num = Number(firstLineCols[1]);

    const hasNumericLoomNo = (!isNaN(col0Num) && firstLineCols[0] !== '') || (!isNaN(col1Num) && firstLineCols[1] !== '');

    const hasHeader = (isCol0Header || isCol1Header) && !hasNumericLoomNo;
    const startLineIndex = hasHeader ? 1 : 0;

    setRows(prev => {
      const newRows = [...prev];
      let pastedCount = 0;

      for (let rIdx = startLineIndex; rIdx < rawLines.length; rIdx++) {
        const cells = parseLineCols(rawLines[rIdx]);
        const targetRowIndex = startRowIndex + (rIdx - startLineIndex);

        // Auto-add new row if pasting beyond current length
        if (targetRowIndex >= newRows.length) {
          newRows.push({
            id: `pasted-${Date.now()}-${rIdx}`,
            unit: '', loomNo: '', loomType: '', weftColours: '',
            beamType: '', beamDia: '', installedLever: '', width: '', weave: ''
          });
        }

        let updatedRow = { ...newRows[targetRowIndex] };

        cells.forEach((cellStr, cellIndex) => {
          const targetFieldIndex = startFieldIndex + cellIndex;
          if (targetFieldIndex < FIELDS_ORDER.length) {
            const field = FIELDS_ORDER[targetFieldIndex];
            let valStr = cellStr.trim();

            if (field === 'loomNo' || field === 'weftColours' || field === 'beamDia' || field === 'installedLever') {
              const num = Number(valStr.replace(/[^0-9]/g, ''));
              if (!isNaN(num) && valStr !== '') {
                (updatedRow as any)[field] = num;
              } else {
                (updatedRow as any)[field] = valStr;
              }
            } else if (field === 'unit' && valStr && !valStr.toLowerCase().startsWith('unit')) {
              // Prepend Unit if given as I, II, III, etc.
              (updatedRow as any)[field] = `Unit ${valStr}`;
            } else {
              (updatedRow as any)[field] = valStr;
            }
          }
        });

        newRows[targetRowIndex] = updatedRow;
        pastedCount++;
      }

      setErrorMsg(`Pasted ${pastedCount} loom records from Excel! Click "Save All Loom Master Changes" to persist to Database.`);
      setTimeout(() => setErrorMsg(null), 6000);
      return newRows;
    });
  };

  // Batch Save to DB
  const handleSaveAll = async () => {
    const validRows = rows.filter(r => r.loomNo !== '' && !isNaN(Number(r.loomNo)));

    if (validRows.length === 0) {
      setErrorMsg('Please enter a valid Loom No for at least one row before saving.');
      setTimeout(() => setErrorMsg(null), 4000);
      return;
    }

    setIsSaving(true);
    setErrorMsg('Saving all Loom Master records to Database...');

    try {
      const payload = validRows.map(r => ({
        loomNo: Number(r.loomNo),
        unit: r.unit || 'Unit I',
        loomType: r.loomType || 'DOBBY',
        weftColours: Number(r.weftColours) || 4,
        beamType: r.beamType || 'SINGLE BEAM',
        beamDia: Number(r.beamDia) || 800,
        installedLever: Number(r.installedLever) || 5,
        width: r.width || '190CM',
        weave: r.weave || 'PLAIN',
        status: 'Active',
        remarks: ''
      }));

      const res = await fetch(`${API_BASE_URL}/api/looms`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user': user?.username || 'System'
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText);
      }

      await refreshData();
      setErrorMsg(`Successfully saved ${payload.length} Loom Master records to Database!`);
    } catch (e: any) {
      setErrorMsg(`Database Save Error: ${e.message}`);
    } finally {
      setIsSaving(false);
      setTimeout(() => setErrorMsg(null), 4000);
    }
  };

  // Delete All Looms (Clear Database)
  const handleClearDatabase = async () => {
    if (window.confirm('Are you sure you want to delete ALL Loom Master data from the database? This cannot be undone.')) {
      try {
        const res = await fetch(`${API_BASE_URL}/api/looms/clear-all`, { 
          method: 'DELETE',
          headers: { 'x-user': user?.username || 'System' }
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to clear database');
        }
        const data = await res.json();
        
        // Reset rows in grid to blank rows
        const emptyRows: LoomRowState[] = Array.from({ length: 20 }).map((_, idx) => ({
          id: `blank-${idx}`,
          unit: '', loomNo: '', loomType: '', weftColours: '',
          beamType: '', beamDia: '', installedLever: '', width: '', weave: ''
        }));
        setRows(emptyRows);

        await refreshData();
        setErrorMsg(`Successfully deleted ALL ${data.count ?? ''} Loom Master records from Database! Grid reset to blank.`);
        setTimeout(() => setErrorMsg(null), 5000);
      } catch (e: any) {
        setErrorMsg(`Failed to clear database: ${e.message}`);
      }
    }
  };

  const handleAddBlankRow = () => {
    setRows(prev => [
      ...prev,
      {
        id: `manual-${Date.now()}`,
        unit: '', loomNo: '', loomType: '', weftColours: '',
        beamType: '', beamDia: '', installedLever: '', width: '', weave: ''
      }
    ]);
  };

  const handleDeleteRow = (index: number) => {
    const target = rows[index];
    if (target.loomNo && !isNaN(Number(target.loomNo))) {
      fetch(`${API_BASE_URL}/api/looms/${target.loomNo}`, { method: 'DELETE' })
        .then(() => refreshData())
        .catch(console.error);
    }
    setRows(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleExportExcel = () => {
    const exportData = rows
      .filter(r => r.loomNo !== '')
      .map(r => ({
        'Unit': r.unit,
        'Loom No': r.loomNo,
        'Loom Type': r.loomType,
        'Colours': r.weftColours,
        'Beam Type': r.beamType,
        'Beam Dia': r.beamDia,
        'Installed Lever': r.installedLever,
        'Width': r.width,
        'WEAVE': r.weave
      }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "LoomMaster");
    XLSX.writeFile(wb, `SPUPL_Loom_Master.xlsx`);
  };

  const filteredRows = rows.filter(r => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return r.loomNo.toString().includes(q) || 
           r.unit.toLowerCase().includes(q) || 
           r.loomType.toLowerCase().includes(q) || 
           r.weave.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6 flex flex-col h-full bg-slate-50/70 p-4 print:p-0 print:bg-white">
      <CompanyPrintHeader title="Loom Master Register" subtitle="Factory Loom Specification & Unit Inventory" />
      
      {/* Page Header */}
      <div className="flex flex-wrap justify-between items-center gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-industrial-900 flex items-center">
            <Copy className="w-6 h-6 mr-3 text-blue-600" /> Excel Entry Grid - Loom Master
          </h1>
          <p className="text-industrial-500 text-sm mt-1">Select a cell and press Ctrl+V to paste multiple rows/columns from Excel directly.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button 
            onClick={handleAddBlankRow}
            className="flex items-center px-4 py-2.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg shadow-sm font-semibold text-sm transition-all"
          >
            <Plus className="w-4 h-4 mr-1.5" /> Add Blank Row
          </button>

          <button 
            onClick={handleExportExcel}
            className="flex items-center px-4 py-2.5 bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 shadow-sm font-semibold text-sm transition-all"
          >
            <Download className="w-4 h-4 mr-1.5" /> Export Excel
          </button>

          <button 
            onClick={() => triggerPrint()}
            className="flex items-center px-4 py-2.5 bg-slate-800 text-white hover:bg-slate-900 rounded-lg shadow-sm font-semibold text-sm transition-all"
          >
            <Printer className="w-4 h-4 mr-1.5" /> Print Report
          </button>

          <button 
            onClick={handleClearDatabase}
            className="flex items-center px-4 py-2.5 bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 rounded-lg shadow-sm font-semibold text-sm transition-all"
            title="Delete all looms from database"
          >
            <Trash2 className="w-4 h-4 mr-1.5" /> Clear All Looms
          </button>

          <button 
            onClick={handleSaveAll} 
            disabled={isSaving}
            className="flex items-center px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm transition-all font-semibold text-sm disabled:opacity-50"
          >
            {isSaving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save All Loom Master Changes
          </button>
        </div>
      </div>

      {/* Notification Banner */}
      {errorMsg && (
        <div className={`border-l-4 p-4 rounded-r-lg flex items-start shadow-sm print:hidden ${errorMsg.includes('Successfully') || errorMsg.includes('Pasted') || errorMsg.includes('deleted') ? 'bg-green-50 border-green-500 text-green-800' : 'bg-yellow-50 border-yellow-500 text-yellow-800'}`}>
          <AlertCircle className={`w-5 h-5 mr-3 mt-0.5 ${errorMsg.includes('Successfully') || errorMsg.includes('Pasted') || errorMsg.includes('deleted') ? 'text-green-600' : 'text-yellow-600'}`} />
          <div className="font-medium text-sm">{errorMsg}</div>
        </div>
      )}

      {/* High-Speed Live Grid Container */}
      <div className="bg-white rounded-xl shadow-sm border border-industrial-100 flex-1 overflow-hidden flex flex-col">
        
        {/* Dark Header Bar */}
        <div className="p-3 bg-industrial-800 border-b border-industrial-700 flex justify-between items-center text-white">
          <div className="flex items-center space-x-4">
            <div className="font-semibold flex items-center text-sm tracking-wide">
              <CheckCircle2 className="w-4 h-4 mr-2 text-green-400" /> High-Speed Live Grid
            </div>
            <div className="relative w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2 text-industrial-400" />
              <input 
                type="text" 
                placeholder="Search loom no, unit, weave..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1 text-xs bg-industrial-900 border border-industrial-600 rounded text-white placeholder-industrial-400 outline-none"
              />
            </div>
          </div>
          
          <div className="text-xs text-industrial-300 font-medium flex items-center">
            <Calendar className="w-4 h-4 mr-1.5 text-blue-400" /> Total Rows: {rows.length} | DB Looms: {looms.length}
          </div>
        </div>

        {/* Scrollable Table Grid */}
        <div className="flex-1 overflow-auto custom-scrollbar relative">
          <table className="w-full text-left border-collapse whitespace-nowrap text-xs">
            
            {/* Header Rows */}
            <thead className="bg-industrial-50 sticky top-0 z-20 shadow-sm">
              <tr className="border-b-2 border-industrial-200">
                <th colSpan={10} className="py-2 px-3 text-center bg-blue-50 text-blue-700 font-bold uppercase tracking-wider">
                  MANUAL ENTRY (COPY/PASTE SUPPORTED FROM EXCEL)
                </th>
              </tr>
              <tr className="border-b border-industrial-200 shadow-sm bg-industrial-900 text-white font-bold">
                <th className="py-2.5 px-2 text-center w-10">#</th>
                <th className="py-2.5 px-3 min-w-[90px]">Unit</th>
                <th className="py-2.5 px-3 min-w-[90px]">Loom No</th>
                <th className="py-2.5 px-3 min-w-[110px]">Loom Type</th>
                <th className="py-2.5 px-3 min-w-[80px]">Colours</th>
                <th className="py-2.5 px-3 min-w-[120px]">Beam Type</th>
                <th className="py-2.5 px-3 min-w-[90px]">Beam Dia</th>
                <th className="py-2.5 px-3 min-w-[110px]">Installed Lever</th>
                <th className="py-2.5 px-3 min-w-[100px]">Width</th>
                <th className="py-2.5 px-3 min-w-[280px]">WEAVE</th>
                <th className="py-2.5 px-2 text-center w-12 print:hidden">Del</th>
              </tr>
            </thead>

            {/* Table Rows */}
            <tbody className="divide-y divide-industrial-100">
              {filteredRows.map((row, visualIndex) => {
                const actualIndex = rows.findIndex(r => r.id === row.id);

                return (
                  <tr key={row.id} className="hover:bg-blue-50/50 transition-colors group">
                    <td className="py-1.5 px-3 text-industrial-400 font-mono text-[10px] text-center bg-industrial-50/40">{visualIndex + 1}</td>

                    {/* 1. Unit */}
                    <td className="py-1.5 px-1">
                      <input 
                        type="text"
                        placeholder="Unit I"
                        value={row.unit}
                        onChange={e => handleRowChange(actualIndex, 'unit', e.target.value)}
                        onPaste={e => handlePaste(e, actualIndex, 'unit')}
                        className="w-full min-w-[80px] px-2 py-1 text-xs border border-industrial-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white font-semibold text-industrial-800"
                      />
                    </td>

                    {/* 2. Loom No */}
                    <td className="py-1.5 px-1">
                      <input 
                        type="number"
                        placeholder="1"
                        value={row.loomNo}
                        onChange={e => handleRowChange(actualIndex, 'loomNo', e.target.value === '' ? '' : Number(e.target.value))}
                        onPaste={e => handlePaste(e, actualIndex, 'loomNo')}
                        className="w-full min-w-[80px] px-2 py-1 text-xs border border-industrial-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white font-black text-blue-900"
                      />
                    </td>

                    {/* 3. Loom Type */}
                    <td className="py-1.5 px-1">
                      <input 
                        type="text"
                        placeholder="DOBBY"
                        value={row.loomType}
                        onChange={e => handleRowChange(actualIndex, 'loomType', e.target.value)}
                        onPaste={e => handlePaste(e, actualIndex, 'loomType')}
                        className="w-full min-w-[100px] px-2 py-1 text-xs border border-industrial-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white font-medium text-industrial-800"
                      />
                    </td>

                    {/* 4. Colours */}
                    <td className="py-1.5 px-1">
                      <input 
                        type="number"
                        placeholder="4"
                        value={row.weftColours}
                        onChange={e => handleRowChange(actualIndex, 'weftColours', e.target.value === '' ? '' : Number(e.target.value))}
                        onPaste={e => handlePaste(e, actualIndex, 'weftColours')}
                        className="w-full min-w-[60px] px-2 py-1 text-xs border border-industrial-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white font-medium text-center"
                      />
                    </td>

                    {/* 5. Beam Type */}
                    <td className="py-1.5 px-1">
                      <input 
                        type="text"
                        placeholder="SINGLE BEAM"
                        value={row.beamType}
                        onChange={e => handleRowChange(actualIndex, 'beamType', e.target.value)}
                        onPaste={e => handlePaste(e, actualIndex, 'beamType')}
                        className="w-full min-w-[110px] px-2 py-1 text-xs border border-industrial-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white font-medium text-industrial-800"
                      />
                    </td>

                    {/* 6. Beam Dia */}
                    <td className="py-1.5 px-1">
                      <input 
                        type="number"
                        placeholder="800"
                        value={row.beamDia}
                        onChange={e => handleRowChange(actualIndex, 'beamDia', e.target.value === '' ? '' : Number(e.target.value))}
                        onPaste={e => handlePaste(e, actualIndex, 'beamDia')}
                        className="w-full min-w-[70px] px-2 py-1 text-xs border border-industrial-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white font-mono text-right"
                      />
                    </td>

                    {/* 7. Installed Lever */}
                    <td className="py-1.5 px-1">
                      <input 
                        type="number"
                        placeholder="5"
                        value={row.installedLever}
                        onChange={e => handleRowChange(actualIndex, 'installedLever', e.target.value === '' ? '' : Number(e.target.value))}
                        onPaste={e => handlePaste(e, actualIndex, 'installedLever')}
                        className="w-full min-w-[70px] px-2 py-1 text-xs border border-industrial-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white font-mono text-right"
                      />
                    </td>

                    {/* 8. Width */}
                    <td className="py-1.5 px-1">
                      <input 
                        type="text"
                        placeholder="190CM"
                        value={row.width}
                        onChange={e => handleRowChange(actualIndex, 'width', e.target.value)}
                        onPaste={e => handlePaste(e, actualIndex, 'width')}
                        className="w-full min-w-[80px] px-2 py-1 text-xs border border-industrial-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white font-medium text-center"
                      />
                    </td>

                    {/* 9. WEAVE */}
                    <td className="py-1.5 px-1">
                      <input 
                        type="text"
                        placeholder="PLAIN , 2/2 TWILL , (5 FRAME - DOBBY)"
                        value={row.weave}
                        onChange={e => handleRowChange(actualIndex, 'weave', e.target.value)}
                        onPaste={e => handlePaste(e, actualIndex, 'weave')}
                        className="w-full min-w-[260px] px-2 py-1 text-xs border border-industrial-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white font-medium text-industrial-800"
                      />
                    </td>

                    {/* Actions */}
                    <td className="py-1.5 px-2 text-center print:hidden">
                      <button 
                        onClick={() => handleDeleteRow(actualIndex)}
                        className="p-1 text-industrial-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                        title="Delete Row"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>

                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
