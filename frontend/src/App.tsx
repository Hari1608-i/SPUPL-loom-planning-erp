import React from 'react';
import { Routes, Route, Link, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { LayoutDashboard, Scissors, PenTool, Database, Calendar, History as HistoryIcon, PieChart, AlertCircle, ListTodo, Activity, ListOrdered, Cpu, Package, Palette, Users, LogOut } from 'lucide-react';

import Dashboard from './pages/Dashboard';
import LoomMaster from './pages/LoomMaster';
import DesignMaster from './pages/DesignMaster';
import MainEntry from './pages/MainEntry';
import EligibilityEngine from './pages/EligibilityEngine';
import Alerts from './pages/Alerts';
import NextPlan from './pages/NextPlan';
import DesignRunout from './pages/DesignRunout';
import LoomWiseRunout from './pages/LoomWiseRunout';
import AvailabilityBoard from './pages/AvailabilityBoard';
import History from './pages/History';
import PlannedLooms from './pages/PlannedLooms';
import CompletedWarpAnalysis from './pages/CompletedWarpAnalysis';
import VisualDashboard from './pages/VisualDashboard';
import RunoutMonitor from './pages/RunoutMonitor';
import SizingDashboard from './pages/SizingDashboard';
import BeamStock from './pages/BeamStock';
import Login from './pages/Login';
import SystemHealth from './pages/SystemHealth';
import UserManagement from './pages/UserManagement';
import OrderManagement from './pages/OrderManagement';
import ReedStock from './pages/ReedStock';
import OrderCompletion from './pages/OrderCompletion';
import ErpAlertCenter from './pages/ErpAlertCenter';
import DesignWiseRunningReport from './pages/DesignWiseRunningReport';

import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import MainLayout from './components/layout/MainLayout';

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      
      <Route path="*" element={
        <ProtectedRoute>
          <MainLayout>
            <Routes>
              <Route path="/" element={<ProtectedRoute menuName="Executive Dashboard"><Dashboard /></ProtectedRoute>} />
              <Route path="/visual" element={<ProtectedRoute menuName="Analytics"><VisualDashboard /></ProtectedRoute>} />
              <Route path="/design-wise-running" element={<ProtectedRoute menuName="Design-Wise Loom Running"><DesignWiseRunningReport /></ProtectedRoute>} />
              <Route path="/yarn-confirmation" element={<Navigate to="/orders" replace />} />
              <Route path="/sizing-confirmation" element={<Navigate to="/orders" replace />} />
              <Route path="/erp-alerts" element={<ProtectedRoute menuName="Alert Center"><ErpAlertCenter /></ProtectedRoute>} />
              <Route path="/loom-runout" element={<ProtectedRoute menuName="Loom Runout"><LoomWiseRunout /></ProtectedRoute>} />
              <Route path="/design-runout" element={<ProtectedRoute menuName="Design Runout"><DesignRunout /></ProtectedRoute>} />
              <Route path="/looms" element={<ProtectedRoute menuName="Loom Master"><LoomMaster /></ProtectedRoute>} />
              <Route path="/designs" element={<ProtectedRoute menuName="Design Master"><DesignMaster /></ProtectedRoute>} />
              <Route path="/reed-stock" element={<ProtectedRoute menuName="Reed Stock"><ReedStock /></ProtectedRoute>} />
              <Route path="/entry" element={<ProtectedRoute menuName="Main Entry"><MainEntry /></ProtectedRoute>} />


              <Route path="/beam-stock" element={<ProtectedRoute menuName="Beam Stock"><BeamStock /></ProtectedRoute>} />
              <Route path="/availability" element={<ProtectedRoute menuName="Availability Board"><AvailabilityBoard /></ProtectedRoute>} />
              <Route path="/eligibility" element={<ProtectedRoute menuName="Smart Recommendation"><EligibilityEngine /></ProtectedRoute>} />
              <Route path="/runout-monitor" element={<ProtectedRoute menuName="Runout Monitor"><RunoutMonitor /></ProtectedRoute>} />
              <Route path="/alerts" element={<ProtectedRoute menuName="Runout Monitor"><Alerts /></ProtectedRoute>} />
              <Route path="/plan" element={<ProtectedRoute menuName="Loom Planning Setup"><NextPlan /></ProtectedRoute>} />
              <Route path="/sizing" element={<ProtectedRoute menuName="Sizing Dashboard"><SizingDashboard /></ProtectedRoute>} />
              <Route path="/planned-looms" element={<ProtectedRoute menuName="Next Planned Looms"><PlannedLooms /></ProtectedRoute>} />
              <Route path="/history" element={<ProtectedRoute menuName="Completed Warp History"><History /></ProtectedRoute>} />
              <Route path="/order-completion" element={<ProtectedRoute menuName="Order Completion & History"><OrderCompletion /></ProtectedRoute>} />
              <Route path="/analysis" element={<ProtectedRoute menuName="Completed Warp Analysis"><CompletedWarpAnalysis /></ProtectedRoute>} />
              
              <Route path="/orders" element={<ProtectedRoute menuName="Order Management"><OrderManagement /></ProtectedRoute>} />
              
              <Route path="/users" element={<ProtectedRoute menuName="User Management"><UserManagement /></ProtectedRoute>} />
              <Route path="/system-health" element={<ProtectedRoute menuName="System Health"><SystemHealth /></ProtectedRoute>} />
              
              <Route path="*" element={
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 min-h-[400px] flex items-center justify-center">
                  <div className="text-center text-slate-400">
                    <PieChart className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium">Page Not Found</p>
                  </div>
                </div>
              } />
            </Routes>
          </MainLayout>
        </ProtectedRoute>
      } />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
