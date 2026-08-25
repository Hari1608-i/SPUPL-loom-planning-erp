import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppProvider';
import { calculateLoomRun } from '../utils/calculations';
import { ListTodo, Search, Calendar, Download, FileSpreadsheet, FileText } from 'lucide-react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import { CompanyPrintHeader } from '../components/common/CompanyPrintHeader';
import { triggerPrint } from '../utils/printManager';

export default function LoomWiseRunout() {
  const { activeRuns, designs, looms, nextPlans } = useAppContext();
  const [searchTerm, setSearchTerm] = useState('');

  const tableData = useMemo(() => {
    const list = Object.values(activeRuns).map(run => {
      const design = designs.find(d => d.designNo === run.designNo);
      const loom = looms.find(l => l.loomNo === run.loomNo);
      const plan = nextPlans[run.loomNo];
      
      const calc = calculateLoomRun({
        loomStartDate: new Date(run.loomStartDate),
        warpedMeter: run.warpedMeter,
        dailyProduction: run.dailyProduction,
        crimpPercent: design?.crimpPercent || 0,
        rpm: run.rpm,
        efficiency: run.efficiency,
        pick: design?.pick,
        productionOverride: run.productionOverride
      });
      
      return { 
        ...run, 
        ...calc, 
        unit: loom?.unit || 'Unknown',
        loomType: loom?.loomType || 'Unknown',
        nextDesign: plan?.designNo || 'Unplanned'
      };
    });

    return list.sort((a, b) => a.balanceDays - b.balanceDays);
  }, [activeRuns, designs, looms, nextPlans]);

  const filteredData = tableData.filter(d => 
    d.designNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.loomNo.toString().includes(searchTerm)
  );

  const handleExportExcel = () => {
    const exportRows = filteredData.map(r => ({
      'Loom No': `L-${r.loomNo}`,
      'Unit': r.unit,
      'Loom Type': r.loomType,
      'Current Design': r.designNo,
      'Warped Meter': r.warpedMeter,
      'Produced Meter': Math.round(r.producedMeter),
      'Net Balance (M)': Math.round(r.netBalanceMeter),
      'Effective Daily Production': Math.round(r.effectiveDailyProduction),
      'Runout Source': r.runoutSource,
      'Confidence Level': r.confidenceLevel,
      'Balance Days': r.balanceDays.toFixed(1),
      'Expected Runout Date': format(r.expectedRunoutDate, 'dd-MMM-yyyy'),
      'Next Plan': r.nextDesign
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Loom Runout');
    XLSX.writeFile(workbook, `Loom_Wise_Runout_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
  };

  const handleExportCSV = () => {
    const headers = ['Loom No', 'Unit', 'Loom Type', 'Current Design', 'Warped Meter', 'Produced Meter', 'Net Balance (M)', 'Effective Daily Production', 'Runout Source', 'Confidence Level', 'Balance Days', 'Expected Runout Date', 'Next Plan'];
    const csvRows: string[][] = [headers];

    filteredData.forEach(r => {
      csvRows.push([
        `"L-${r.loomNo}"`,
        `"${r.unit}"`,
        `"${r.loomType}"`,
        `"${r.designNo}"`,
        `"${r.warpedMeter}"`,
        `"${Math.round(r.producedMeter)}"`,
        `"${Math.round(r.netBalanceMeter)}"`,
        `"${Math.round(r.effectiveDailyProduction)}"`,
        `"${r.runoutSource}"`,
        `"${r.confidenceLevel}"`,
        `"${r.balanceDays.toFixed(1)}"`,
        `"${format(r.expectedRunoutDate, 'dd-MMM-yyyy')}"`,
        `"${r.nextDesign}"`
      ]);
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + csvRows.map(e => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Loom_Wise_Runout_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPDF = () => {
    triggerPrint();
  };

  return (
    <div className="space-y-6">
      <CompanyPrintHeader title="Loom-Wise Runout Report" subtitle="Warp Balance & Runout Schedule Audit Log" />

      <div className="flex justify-between items-center mb-6 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-industrial-900 flex items-center">
            <ListTodo className="w-6 h-6 mr-3 text-industrial-500" /> Loom-Wise Runout
          </h1>
          <p className="text-industrial-500 text-sm mt-1">
            Detailed view of all running looms sorted by runout proximity with Effective Daily Production & Runout Source tracking.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportExcel}
            title="Export Excel"
            className="flex items-center px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-colors font-bold text-xs shadow-sm"
          >
            <FileSpreadsheet className="w-4 h-4 mr-1.5" />
            Excel
          </button>
          <button
            onClick={handleExportCSV}
            title="Export CSV"
            className="flex items-center px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors font-bold text-xs shadow-sm"
          >
            <FileText className="w-4 h-4 mr-1.5" />
            CSV
          </button>
          <button
            onClick={handleExportPDF}
            title="Print / Save PDF"
            className="flex items-center px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl transition-colors font-bold text-xs shadow-sm"
          >
            <Download className="w-4 h-4 mr-1.5" />
            PDF
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-industrial-100 overflow-hidden flex flex-col">
        <div className="p-4 border-b border-industrial-100 bg-industrial-50 flex justify-between items-center">
           <div className="relative w-64">
             <Search className="w-4 h-4 absolute left-3 top-2.5 text-industrial-400" />
             <input 
               type="text" 
               placeholder="Search Loom or Design..." 
               value={searchTerm}
               onChange={e => setSearchTerm(e.target.value)}
               className="w-full pl-9 pr-4 py-2 text-sm border border-industrial-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
             />
           </div>
           <div className="text-sm text-industrial-500 font-medium">Running Looms: {filteredData.length}</div>
        </div>
        
        <div className="overflow-x-auto flex-1 min-h-[500px]">
          <table className="w-full text-left border-collapse whitespace-nowrap text-xs">
            <thead className="bg-white sticky top-0 shadow-sm z-10">
              <tr className="border-b border-industrial-200 font-bold uppercase text-industrial-500">
                <th className="py-3 px-4">Loom No</th>
                <th className="py-3 px-4">Unit</th>
                <th className="py-3 px-4">Loom Type</th>
                <th className="py-3 px-4">Current Design</th>
                <th className="py-3 px-4 text-right">Warped Mtr</th>
                <th className="py-3 px-4 text-right">Produced Mtr</th>
                <th className="py-3 px-4 text-right">Net Balance</th>
                <th className="py-3 px-4 text-right">Effective Prod</th>
                <th className="py-3 px-4">Runout Source</th>
                <th className="py-3 px-4">Confidence</th>
                <th className="py-3 px-4 text-right">Balance Days</th>
                <th className="py-3 px-4">Expected Runout</th>
                <th className="py-3 px-4">Next Plan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-industrial-100">
              {filteredData.map(row => (
                <tr key={row.loomNo} className="hover:bg-industrial-50 transition-colors">
                  <td className="py-3 px-4 font-black text-industrial-900">L-{row.loomNo}</td>
                  <td className="py-3 px-4 text-industrial-600 font-medium">{row.unit}</td>
                  <td className="py-3 px-4 text-industrial-500">{row.loomType}</td>
                  <td className="py-3 px-4 font-bold text-industrial-800">{row.designNo}</td>
                  
                  <td className="py-3 px-4 text-right text-industrial-600">{Math.round(row.warpedMeter).toLocaleString()}</td>
                  <td className="py-3 px-4 text-right text-industrial-600">{Math.round(row.producedMeter).toLocaleString()}</td>
                  <td className="py-3 px-4 text-right font-mono font-black text-industrial-900">{Math.round(row.netBalanceMeter).toLocaleString()} m</td>
                  <td className="py-3 px-4 text-right font-bold text-slate-800">{Math.round(row.effectiveDailyProduction)} M/d</td>
                  
                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      row.runoutSource === 'ACTUAL PRODUCTION' ? 'bg-emerald-100 text-emerald-800' :
                      row.runoutSource === 'RPM + EFFICIENCY' ? 'bg-blue-100 text-blue-800' :
                      row.runoutSource === 'DAILY PRODUCTION' ? 'bg-indigo-100 text-indigo-800' :
                      'bg-slate-100 text-slate-500'
                    }`}>
                      {row.runoutSource}
                    </span>
                  </td>

                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      row.confidenceLevel === 'HIGH CONFIDENCE' ? 'bg-emerald-50 text-emerald-700 border border-emerald-300' :
                      row.confidenceLevel === 'MEDIUM CONFIDENCE' ? 'bg-blue-50 text-blue-700 border border-blue-300' :
                      row.confidenceLevel === 'LOW CONFIDENCE' ? 'bg-amber-50 text-amber-700 border border-amber-300' :
                      'bg-slate-100 text-slate-400'
                    }`}>
                      {row.confidenceLevel}
                    </span>
                  </td>

                  <td className="py-3 px-4 text-right">
                    <span className={`px-2 py-1 rounded font-bold font-mono text-xs ${row.balanceDays <= 2 ? 'bg-red-100 text-red-700' : 'text-industrial-900'}`}>
                      {row.balanceDays.toFixed(1)} d
                    </span>
                  </td>
                  <td className="py-3 px-4 flex items-center font-medium">
                    <Calendar className={`w-4 h-4 mr-1.5 ${row.balanceDays <= 2 ? 'text-red-500' : 'text-industrial-400'}`} />
                    <span className={row.balanceDays <= 2 ? 'text-red-600 font-bold' : 'text-industrial-700'}>
                      {format(row.expectedRunoutDate, 'dd MMM yyyy')}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    {row.nextDesign !== 'Unplanned' ? (
                      <span className="px-2 py-1 bg-green-100 text-green-800 rounded font-semibold text-xs border border-green-200">
                        {row.nextDesign}
                      </span>
                    ) : (
                      <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded font-semibold text-xs border border-yellow-200">
                        Unplanned
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
