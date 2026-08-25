import React, { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export interface User {
  id: number;
  username: string;
  employeeName: string;
  role: string;
  permissions?: string; // JSON string
  status?: string;
  employeeId?: string;
  department?: string;
  lastLogin?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  authReady: boolean; // true once session check is complete

  login: (token: string, user: User) => void;
  logout: () => void;
  hasMenuPermission: (menu: string) => boolean;
  hasActionPermission: (menu: string, action: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * SESSION KEY — written to sessionStorage (not localStorage) on every successful login.
 * sessionStorage is cleared automatically when the tab/browser window is closed.
 * So: open a new tab / copy-paste the URL → session is gone → login screen shows.
 *
 * localStorage is still used to persist user info between F5 reloads of the SAME tab.
 */
const SESSION_FLAG = 'erp_session_active';

function readStoredAuth(): { token: string | null; user: User | null } {
  try {
    // Only restore if THIS tab has an active session flag
    const sessionActive = sessionStorage.getItem(SESSION_FLAG);
    if (!sessionActive) return { token: null, user: null };

    const savedToken = localStorage.getItem('erp_token');
    const savedUser  = localStorage.getItem('erp_user');
    if (savedToken && savedUser) {
      return { token: savedToken, user: JSON.parse(savedUser) };
    }
  } catch (_) {}
  return { token: null, user: null };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const stored = readStoredAuth();
  const [user,      setUser]      = useState<User | null>(stored.user);
  const [token,     setToken]     = useState<string | null>(stored.token);
  const [authReady, setAuthReady] = useState<boolean>(false);

  const navigate = useNavigate();

  // Mark auth check as done after first render
  useEffect(() => {
    setAuthReady(true);
  }, []);

  const login = (newToken: string, newUser: User) => {
    setToken(newToken);
    setUser(newUser);
    // Persist in localStorage for F5 reloads
    localStorage.setItem('erp_token', newToken);
    localStorage.setItem('erp_user', JSON.stringify(newUser));
    // Mark THIS tab as having an active session
    sessionStorage.setItem(SESSION_FLAG, '1');
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('erp_token');
    localStorage.removeItem('erp_user');
    sessionStorage.removeItem(SESSION_FLAG);
    navigate('/login');
  };

  const hasPermission = (menu: string, action: string = 'view'): boolean => {
    if (!user) return false;
    const roleUpper = user.role?.toUpperCase() || '';
    if (roleUpper === 'ADMINISTRATOR' || roleUpper === 'ADMIN' || user.role === 'System Administrator') return true;

    const actionKey = action.toLowerCase();

    // Check specific user JSON permissions (controlling authorization layer)
    if (user.permissions) {
      try {
        const perms = JSON.parse(user.permissions);
        if (typeof perms === 'object' && perms !== null && Object.keys(perms).length > 0) {
          const screenPerm = perms[menu];
          if (screenPerm !== undefined) {
            if (typeof screenPerm === 'object' && screenPerm !== null) {
              const hasView = Boolean(screenPerm.view);
              if (actionKey === 'view') return hasView;
              // Action permission requires VIEW permission
              if (!hasView) return false;
              return Boolean(screenPerm[actionKey]);
            }
            if (typeof screenPerm === 'boolean') {
              if (actionKey === 'view') return screenPerm;
              return screenPerm;
            }
          } else {
            // Screen is not in explicitly saved permissions -> DENY
            return false;
          }
        }
      } catch (e) {}
    }

    // Role default permissions fallback (only if user has no saved custom permissions JSON)
    const roleAccess: Record<string, string[]> = {
      'PLANNING': ['Executive Dashboard', 'Analytics', 'Design-Wise Loom Running', 'Loom Runout', 'Design Runout', 'Main Entry', 'Availability Board', 'Smart Recommendation', 'Order Management', 'Loom Planning Setup', 'Alert Center', 'Runout Monitor', 'Next Planned Looms', 'Order Completion & History', 'Completed Warp History', 'Completed Warp Analysis', 'Loom Master', 'Design Master', 'Reed Stock', 'Beam Stock', 'Sizing Dashboard'],
      'PLANNING_MANAGER': ['Executive Dashboard', 'Analytics', 'Design-Wise Loom Running', 'Loom Runout', 'Design Runout', 'Main Entry', 'Availability Board', 'Smart Recommendation', 'Order Management', 'Loom Planning Setup', 'Alert Center', 'Runout Monitor', 'Next Planned Looms', 'Order Completion & History', 'Completed Warp History', 'Completed Warp Analysis', 'Loom Master', 'Design Master', 'Reed Stock', 'Beam Stock', 'Sizing Dashboard'],
      'SIZING': ['Executive Dashboard', 'Sizing Dashboard', 'Beam Stock', 'Reed Stock', 'Alert Center', 'Runout Monitor', 'Main Entry', 'Availability Board'],
      'WEAVING': ['Executive Dashboard', 'Main Entry', 'Availability Board', 'Loom Runout', 'Design Runout', 'Loom Master', 'Design Master'],
      'MANAGEMENT': ['Executive Dashboard', 'Analytics', 'Design-Wise Loom Running', 'Loom Runout', 'Design Runout', 'Order Completion & History', 'Completed Warp History', 'Completed Warp Analysis', 'Order Management'],
      'MERCH': ['Executive Dashboard', 'Analytics', 'Order Management', 'Order Completion & History', 'Design Master'],
      'VIEWER': ['Executive Dashboard', 'Analytics', 'Design-Wise Loom Running', 'Availability Board']
    };

    const targetRole = roleAccess[roleUpper] ? roleUpper : (roleAccess[user.role] ? user.role : '');
    const isMenuAllowedInRole = targetRole ? roleAccess[targetRole].includes(menu) : false;

    if (!isMenuAllowedInRole) return false;
    if (actionKey === 'view') return true;

    // Default action permissions per role if no explicit user override
    if (roleUpper === 'VIEWER') {
      return actionKey === 'view';
    }
    if (roleUpper === 'MANAGEMENT') {
      return ['view', 'export', 'print', 'excel'].includes(actionKey);
    }
    if (roleUpper === 'MERCH') {
      return ['view', 'create', 'edit', 'export', 'print', 'excel'].includes(actionKey);
    }

    return true;
  };

  const hasMenuPermission = (menu: string) => hasPermission(menu, 'view');
  const hasActionPermission = (menu: string, action: string) => hasPermission(menu, action);

  return (
    <AuthContext.Provider value={{ user, token, authReady, login, logout, hasMenuPermission, hasActionPermission }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
