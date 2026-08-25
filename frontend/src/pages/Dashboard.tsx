import React from 'react';
import LiveStatusBar from '../components/dashboard/LiveStatusBar';
import ExecutiveKPIs from '../components/dashboard/ExecutiveKPIs';
import UnitPerformance from '../components/dashboard/UnitPerformance';
import SizingPendingTable from '../components/dashboard/SizingPendingTable';
import ReedPendingTable from '../components/dashboard/ReedPendingTable';
import CriticalLoomsTable from '../components/dashboard/CriticalLoomsTable';

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-industrial-50 text-industrial-900 font-sans pb-12">
      <LiveStatusBar />
      
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-8">
        <div>
          <h1 className="text-3xl font-black text-industrial-900 tracking-tight mb-1">Executive Dashboard</h1>
          <p className="text-industrial-500 font-medium">Real-time production, sizing, reed, and runout insights derived from Main Entry.</p>
        </div>

        <ExecutiveKPIs />
        
        <UnitPerformance />

        <SizingPendingTable />

        <ReedPendingTable />

        <CriticalLoomsTable />
      </div>
    </div>
  );
}

