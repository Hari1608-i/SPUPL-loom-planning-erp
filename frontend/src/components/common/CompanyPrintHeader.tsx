import React from 'react';
import { COMPANY_LOGO_DATA_URL } from '../../assets/logoDataUrl';

interface CompanyPrintHeaderProps {
  title?: string;
  subtitle?: string;
  showOnScreen?: boolean;
}

export const CompanyPrintHeader: React.FC<CompanyPrintHeaderProps> = ({
  title,
  subtitle,
  showOnScreen = false,
}) => {
  return (
    <div
      className={`${
        showOnScreen ? 'flex' : 'hidden print:flex'
      } items-center justify-between pb-4 mb-6 border-b-2 border-slate-800 w-full text-slate-900 bg-white`}
    >
      {/* Top Left Corner Logo (contains full company name inside image) */}
      <div className="flex items-center">
        <img
          src={COMPANY_LOGO_DATA_URL}
          alt="Santhi Processing Unit Pvt Ltd Logo"
          className="h-14 w-auto object-contain max-w-[260px]"
        />
      </div>

      {/* Top Right Corner Report Title & Date */}
      {(title || subtitle) && (
        <div className="text-right">
          {title && (
            <h2 className="font-bold text-lg text-slate-900 tracking-tight leading-none mb-1">
              {title}
            </h2>
          )}
          {subtitle && (
            <p className="text-xs text-slate-600 font-medium">{subtitle}</p>
          )}
          <p className="text-[10px] text-slate-400 font-medium mt-1">
            Generated: {new Date().toLocaleString()}
          </p>
        </div>
      )}
    </div>
  );
};
