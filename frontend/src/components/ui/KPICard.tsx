import React from 'react';
import { LucideIcon } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: number; // Positive or negative percentage
  trendLabel?: string;
  color?: 'primary' | 'secondary' | 'accent' | 'success' | 'warning' | 'danger';
}

const colorMaps = {
  primary: 'from-spu-primary to-indigo-800 text-spu-primary bg-indigo-50 border-indigo-100',
  secondary: 'from-spu-secondary to-blue-700 text-spu-secondary bg-blue-50 border-blue-100',
  accent: 'from-spu-accent to-sky-600 text-spu-accent bg-sky-50 border-sky-100',
  success: 'from-spu-success to-emerald-600 text-spu-success bg-emerald-50 border-emerald-100',
  warning: 'from-spu-warning to-amber-600 text-spu-warning bg-amber-50 border-amber-100',
  danger: 'from-spu-danger to-red-600 text-spu-danger bg-red-50 border-red-100'
};

export default function KPICard({ title, value, icon: Icon, trend, trendLabel, color = 'primary' }: KPICardProps) {
  const isPositive = trend && trend > 0;
  const isNegative = trend && trend < 0;
  const theme = colorMaps[color];

  return (
    <div className={`bg-white rounded-3xl shadow-sm border border-slate-200 p-6 relative overflow-hidden group hover:shadow-xl transition-all duration-300 hover:-translate-y-1`}>
      {/* Decorative gradient blur */}
      <div className={`absolute -right-8 -top-8 w-32 h-32 bg-gradient-to-br ${theme.split(' ')[0]} ${theme.split(' ')[1]} rounded-full blur-3xl opacity-10 group-hover:opacity-20 transition-opacity`} />
      
      <div className="flex justify-between items-start relative z-10">
        <div>
          <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">{title}</p>
          <h3 className="text-4xl font-black text-slate-800 tracking-tight">{value}</h3>
          
          {trend !== undefined && (
            <div className="flex items-center mt-3">
              <span className={`text-xs font-bold px-2 py-1 rounded-lg flex items-center ${isPositive ? 'bg-emerald-100 text-emerald-700' : isNegative ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'}`}>
                {isPositive ? '↑' : isNegative ? '↓' : '-'} {Math.abs(trend)}%
              </span>
              {trendLabel && <span className="text-xs font-semibold text-slate-400 ml-2">{trendLabel}</span>}
            </div>
          )}
        </div>
        
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-inner ${theme.split(' ').slice(2).join(' ')} group-hover:scale-110 transition-transform duration-300`}>
          <Icon className="w-7 h-7" />
        </div>
      </div>
    </div>
  );
}
