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
            <h2 className="font-black text-xl text-black tracking-tight leading-none mb-1 print-title">
              {title}
            </h2>
          )}
          {subtitle && (
            <p className="text-xs text-slate-800 font-bold">{subtitle}</p>
          )}
          <p className="text-[11px] text-slate-700 font-semibold mt-1">
            Generated: {new Date().toLocaleString()}
          </p>
        </div>
      )}
    </div>
  );
};

interface PrintTableHeaderRowProps {
  title?: string;
  subtitle?: string;
  colSpan?: number;
}

/**
 * Renders inside a <thead> to automatically repeat the company logo,
 * report title, and generated timestamp at the top of EVERY printed page
 * when a table spans across multiple pages.
 */
export const PrintTableHeaderRow: React.FC<PrintTableHeaderRowProps> = ({
  title,
  subtitle,
  colSpan = 100,
}) => {
  return (
    <tr className="hidden print:table-row border-0 bg-white print-header-row">
      <th colSpan={colSpan} className="border-0 p-0 pb-3 bg-white font-normal text-left print-header-cell">
        <div className="flex items-center justify-between pb-3 mb-2 border-b-2 border-slate-900 w-full text-slate-900 bg-white print-header-content">
          <div className="flex items-center">
            <img
              src={COMPANY_LOGO_DATA_URL}
              alt="Santhi Processing Unit Pvt Ltd Logo"
              className="h-12 w-auto object-contain max-w-[240px] print-logo"
            />
          </div>
          {(title || subtitle) && (
            <div className="text-right">
              {title && (
                <h2 className="font-black text-lg text-black tracking-tight leading-none mb-1">
                  {title}
                </h2>
              )}
              {subtitle && (
                <p className="text-xs text-slate-800 font-bold">{subtitle}</p>
              )}
              <p className="text-[10px] text-slate-600 font-semibold mt-0.5">
                Generated: {new Date().toLocaleString()}
              </p>
            </div>
          )}
        </div>
      </th>
    </tr>
  );
};
