import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  menuName?: string;
  adminOnly?: boolean;
}

export default function ProtectedRoute({ children, menuName, adminOnly }: ProtectedRouteProps) {
  const { user, token, authReady, hasMenuPermission } = useAuth();

  // Wait until session check is complete to avoid flash-of-login
  if (!authReady) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-slate-950 z-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin" />
          <p className="text-slate-400 text-sm font-semibold tracking-wide">Loading SPU ERP...</p>
        </div>
      </div>
    );
  }

  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  if (adminOnly && user.role !== 'ADMINISTRATOR' && user.role !== 'ADMIN' && user.role !== 'System Administrator') {
    return <Navigate to="/" replace />;
  }

  if (menuName && !hasMenuPermission(menuName)) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center bg-slate-50">
        <div className="text-center p-8 bg-white rounded-2xl shadow-sm border border-slate-200">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H10m4-9v.01M6.343 6.343a8 8 0 1111.314 11.314A8 8 0 016.343 6.343z" />
            </svg>
          </div>
          <h2 className="text-2xl font-black text-slate-800">Access Denied</h2>
          <p className="text-slate-500 mt-2 font-medium max-w-md mx-auto">
            You do not have permission to view the <strong className="text-slate-700">{menuName}</strong> module.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
