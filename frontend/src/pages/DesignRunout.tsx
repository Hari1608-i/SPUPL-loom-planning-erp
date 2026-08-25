import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppProvider';
import { calculateLoomRun } from '../utils/calculations';
import { BarChart2, Search, ChevronDown, ChevronRight, Calendar, Download, FileSpreadsheet, FileText } from 'lucide-react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import { CompanyPrintHeader } from '../components/common/CompanyPrintHeader';
import { triggerPrint } from '../utils/printManager';

export default function DesignRunout() {
  const { activeRuns, designs, looms } = useAppContext();
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedDesign, setExpandedDesign] = useState<string | null>(null);

  const groupedData = useMemo(() => {
    const runsWithCalc = Object.values(activeRuns).map(run => {
      const design = designs.find(d => d.designNo === run.designNo);
      const loom = looms.find(l => l.loomNo === run.loomNo);
      const calc = calculateLoomRun({
        loomStartDate: new Date(run.loomStartDate),
        warpedMeter: run.warpedMeter,
        dailyProduction: run.dailyProduction,
        crimpPercent: design?.crimpPercent || 0,
      });
      return { 
        ...run, 
        ...calc, 
        unit: loom?.unit || 'Unknown' 
      };
    });

    const groups: Record<string, any> = {};
    runsWithCalc.forEach(run => {
      if (!groups[run.designNo]) {
        groups[run.designNo] = {
          designNo: run.designNo,
          runningLoomCount: 0,
          totalNetBalance: 0,
          totalGrossBalance: 0,
          totalAvgProduction: 0,
          earliestRunout: new Date(2100, 1, 1),
          latestRunout: new Date(1970, 1, 1),
          criticalLooms: 0,
          looms: []
        };
      }
      
      const g = groups[run.designNo];
      g.runningLoomCount += 1;
      g.totalNetBalance += run.netBalanceMeter;
      g.totalGrossBalance += run.warpBalanceGross;
      g.totalAvgProduction += run.avgProduction;
      
      if (run.expectedRunoutDate < g.earliestRunout) g.earliestRunout = run.expectedRunoutDate;
      if (run.expectedRunoutDate > g.latestRunout) g.latestRunout = run.expectedRunoutDate;
      
      if (run.balanceDays <= 2) g.criticalLooms += 1;
      
      g.looms.push(run);
    });

    // Sort looms within groups by runout
    Object.values(groups).forEach(g => {
      g.looms.sort((a: any, b: any) => a.expectedRunoutDate.getTime() - b.expectedRunoutDate.getTime());
    });

    return Object.values(groups).sort((a, b) => a.earliestRunout.getTime() - b.earliestRunout.getTime());
  }, [activeRuns, designs, looms]);

  const filteredData = groupedData.filter(d => 
    d.designNo.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleExportExcel = () => {
    const summaryRows = filteredData.map(d => ({
      'Design No / SP No': d.designNo,
      'Running Looms': d.runningLoomCount,
      'Total Net Balance (M)': Math.round(d.totalNetBalance),
      'Avg Daily Production (M/d)': Math.round(d.totalAvgProduction),
      'Earliest Runout': format(d.earliestRunout, 'dd-MMM-yyyy'),
      'Latest Runout': format(d.latestRunout, 'dd-MMM-yyyy'),
      'Critical Looms (<=2 Days)': d.criticalLooms
    }));

    const detailRows: any[] = [];
    filteredData.forEach(d => {
      d.looms.forEach((l: any) => {
        detailRows.push({
          'Design No / SP No': d.designNo,
          'Loom No': `L-${l.loomNo}`,
          'Unit': l.unit,
          'Warped Meter': l.warpedMeter,
          'Produced Meter': Math.round(l.producedMeter),
          'Net Balance (M)': Math.round(l.netBalanceMeter),
          'Effective Production': Math.round(l.effectiveDailyProduction),
          'Balance Days': l.balanceDays.toFixed(1),
          'Expected Runout Date': format(l.expectedRunoutDate, 'dd-MMM-yyyy'),
          'Status': l.runoutStatus
        });
      });
    });

    const workbook = XLSX.utils.book_new();
    const summaryWs = XLSX.utils.json_to_sheet(summaryRows);
    const detailWs = XLSX.utils.json_to_sheet(detailRows);

    XLSX.utils.book_append_sheet(workbook, summaryWs, 'Design Summary');
    XLSX.utils.book_append_sheet(workbook, detailWs, 'Loom Breakdown');

    XLSX.writeFile(workbook, `Design_Wise_Runout_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
  };

  const handleExportCSV = () => {
    const headers = ['Design No / SP No', 'Running Looms', 'Total Net Balance (M)', 'Avg Production (M/d)', 'Earliest Runout', 'Latest Runout', 'Critical Looms'];
    const csvRows: string[][] = [headers];

    filteredData.forEach(d => {
      csvRows.push([
        `"${d.designNo}"`,
        `"${d.runningLoomCount}"`,
        `"${Math.round(d.totalNetBalance)}"`,
        `"${Math.round(d.totalAvgProduction)}"`,
        `"${format(d.earliestRunout, 'dd-MMM-yyyy')}"`,
        `"${format(d.latestRunout, 'dd-MMM-yyyy')}"`,
        `"${d.criticalLooms}"`
      ]);
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + csvRows.map(e => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Design_Wise_Runout_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPDF = () => {
    triggerPrint();
  };

  return (
    <div className="space-y-6">
      <CompanyPrintHeader title="Design-Wise Runout Report" subtitle="Aggregated Warp Balance & Runout Schedule by Design" />

      <div className="flex justify-between items-center mb-6 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-industrial-900 flex items-center">
            <BarChart2 className="w-6 h-6 mr-3 text-industrial-500" /> Design-Wise Runout
          </h1>
          <p className="text-industrial-500 text-sm mt-1">Aggregated warp balance and runout dates grouped by Design No.</p>
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
        <div className="p-4 border-b border-industrial-100 bg-industrial-50 flex justify-between items-center print:hidden">
           <div className="relative w-64">
             <Search className="w-4 h-4 absolute left-3 top-2.5 text-industrial-400" />
             <input 
               type="text" 
               placeholder="Search design..." 
               value={searchTerm}
               onChange={e => setSearchTerm(e.target.value)}
               className="w-full pl-9 pr-4 py-2 text-sm border border-industrial-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
             />
           </div>
           <div className="text-sm text-industrial-500 font-medium">Active Designs: {filteredData.length}</div>
        </div>
        
        <div className="overflow-x-auto flex-1 min-h-[400px]">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead className="bg-white sticky top-0 shadow-sm z-10">
              <tr className="border-b border-industrial-200">
                <th className="py-3 px-4 w-10"></th>
                <th className="py-3 px-6 text-xs font-semibold text-industrial-500 uppercase">Design No / SP No</th>
                <th className="py-3 px-6 text-xs font-semibold text-industrial-500 uppercase text-right">Running Looms</th>
                <th className="py-3 px-6 text-xs font-semibold text-industrial-500 uppercase text-right">Total Net Balance</th>
                <th className="py-3 px-6 text-xs font-semibold text-industrial-500 uppercase text-right">Avg Production</th>
                <th className="py-3 px-6 text-xs font-semibold text-industrial-500 uppercase text-right">Earliest Runout</th>
                <th className="py-3 px-6 text-xs font-semibold text-industrial-500 uppercase text-right">Latest Runout</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-industrial-100">
              {filteredData.map(row => (
                <React.Fragment key={row.designNo}>
                  <tr 
                    className="hover:bg-industrial-50 transition-colors cursor-pointer"
                    onClick={() => setExpandedDesign(expandedDesign === row.designNo ? null : row.designNo)}
                  >
                    <td className="py-3 px-4">
                      {expandedDesign === row.designNo ? <ChevronDown className="w-5 h-5 text-industrial-400" /> : <ChevronRight className="w-5 h-5 text-industrial-400" />}
                    </td>
                    <td className="py-3 px-6 font-bold text-industrial-800 flex items-center">
                      {row.designNo}
                      {row.criticalLooms > 0 && <span className="ml-2 bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded-full">{row.criticalLooms} Critical</span>}
                    </td>
                    <td className="py-3 px-6 text-industrial-600 text-right font-mono font-bold text-blue-600">{row.runningLoomCount}</td>
                    <td className="py-3 px-6 text-industrial-800 text-right font-mono font-bold">{Math.round(row.totalNetBalance).toLocaleString()} m</td>
                    <td className="py-3 px-6 text-industrial-800 text-right font-mono font-medium">{Math.round(row.totalAvgProduction).toLocaleString()} m/day</td>
                    <td className="py-3 px-6 text-red-600 text-right font-medium flex justify-end items-center"><Calendar className="w-4 h-4 mr-1.5"/>{format(row.earliestRunout, 'dd MMM yyyy')}</td>
                    <td className="py-3 px-6 text-green-600 text-right font-medium">{format(row.latestRunout, 'dd MMM yyyy')}</td>
                  </tr>
                  
                  {expandedDesign === row.designNo && (
                    <tr className="bg-industrial-50/50">
                      <td colSpan={7} className="p-0 border-b border-industrial-200">
                        <div className="px-14 py-4 bg-industrial-50/50 inner-shadow">
                          <table className="w-full text-sm text-left">
                            <thead>
                              <tr className="text-industrial-500 uppercase font-semibold text-[10px]">
                                <th className="pb-2 pr-4">Loom No</th>
                                <th className="pb-2 pr-4">Unit</th>
                                <th className="pb-2 pr-4">Running Days</th>
                                <th className="pb-2 pr-4">Balance Days</th>
                                <th className="pb-2 pr-4">Runout Date</th>
                                <th className="pb-2 pr-4">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-industrial-100">
                              {row.looms.map((l: any) => (
                                <tr key={l.loomNo} className="text-industrial-700">
                                  <td className="py-2 pr-4 font-bold">{l.loomNo}</td>
                                  <td className="py-2 pr-4">{l.unit}</td>
                                  <td className="py-2 pr-4">{l.runningDays}</td>
                                  <td className="py-2 pr-4 font-mono font-bold">{l.balanceDays.toFixed(1)}</td>
                                  <td className="py-2 pr-4 font-medium">{format(l.expectedRunoutDate, 'dd MMM yyyy')}</td>
                                  <td className="py-2 pr-4">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${l.balanceDays <= 2 ? 'bg-red-100 text-red-700' : 'bg-industrial-200 text-industrial-600'}`}>
                                      {l.runoutStatus}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
