/**
 * Centralized Print Manager Utility for SPUPL Loom System
 * Provides dynamic auto-orientation detection (Portrait vs Landscape),
 * column auto-fitting, print style injection, and safe print execution.
 */

export interface PrintOptions {
  orientation?: 'portrait' | 'landscape' | 'auto';
  title?: string;
}

/**
 * Detects whether the current printable page or container contains a wide table/grid
 * or requires landscape orientation for optimal readability.
 */
export function detectOrientation(): 'portrait' | 'landscape' {
  // Check pathname first for known wide operational pages
  const pathname = window.location.pathname.toLowerCase();
  const widePages = [
    '/availability',
    '/entry',
    '/beam-stock',
    '/loom-master',
    '/design-master',
    '/analytics',
    '/order-completion',
    '/order-history',
    '/smart-recommendation'
  ];
  
  if (widePages.some(page => pathname.includes(page))) {
    return 'landscape';
  }

  // Detect wide table elements or multi-column grids in the DOM
  const tables = document.querySelectorAll('table');
  for (let i = 0; i < tables.length; i++) {
    const table = tables[i];
    const thCount = table.querySelectorAll('thead th, tr:first-child th, tr:first-child td').length;
    const isWideTable = thCount >= 7 || table.scrollWidth > 850;
    if (isWideTable) {
      return 'landscape';
    }
  }

  const wideGrids = document.querySelectorAll('.min-w-max, .overflow-x-auto, [style*="minWidth"]');
  if (wideGrids.length > 0) {
    return 'landscape';
  }

  return 'portrait';
}

/**
 * Dynamically injects page orientation print styles and triggers window.print()
 */
export function triggerPrint(options?: PrintOptions) {
  const styleId = 'spupl-dynamic-print-style';
  let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = styleId;
    document.head.appendChild(styleEl);
  }

  // Allow browser print dialog to switch dynamically between Portrait and Landscape
  const chosenOrientation = options?.orientation && options.orientation !== 'auto' ? options.orientation : null;
  const pageCss = chosenOrientation
    ? `@page { size: ${chosenOrientation}; margin: 8mm; }`
    : `@page { size: auto; margin: 8mm; }`;

  styleEl.textContent = `
    @media print {
      ${pageCss}
      body {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
    }
  `;

  // Trigger print
  window.print();
}
