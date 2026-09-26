/**
 * Centralized Print Manager Utility for SPUPL Loom System
 * Provides dynamic auto-orientation detection (Portrait vs Landscape),
 * column auto-fitting, print style injection, multi-page layout protection,
 * and safe print execution.
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
  // Check pathname first for known wide operational reports
  const pathname = window.location.pathname.toLowerCase();
  const widePages = [
    '/order-tracking',
    '/design-running',
    '/design-wise',
    '/design-wise-running',
    '/loom-runout',
    '/design-runout',
    '/runout-monitor',
    '/entry',
    '/main-entry',
    '/availability',
    '/beam-stock',
    '/reed-stock',
    '/orders',
    '/order-management',
    '/loom-master',
    '/design-master',
    '/analytics',
    '/visual',
    '/order-completion',
    '/order-history',
    '/completed-warp-history',
    '/warp-history',
    '/warp-analysis',
    '/smart-recommendation',
    '/plan',
    '/planned-looms'
  ];
  
  if (widePages.some(page => pathname.includes(page))) {
    return 'landscape';
  }

  // Detect wide table elements or multi-column grids in the DOM
  const tables = document.querySelectorAll('table');
  for (let i = 0; i < tables.length; i++) {
    const table = tables[i];
    const thCount = table.querySelectorAll('thead th, tr:first-child th, tr:first-child td').length;
    const isWideTable = thCount >= 5 || table.scrollWidth > 700;
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

  // Determine orientation: explicit or automatic detection
  const chosenOrientation = options?.orientation && options.orientation !== 'auto'
    ? options.orientation
    : detectOrientation();

  const pageCss = `@page { size: A4 ${chosenOrientation}; margin: 0; }`;

  styleEl.textContent = `
    ${pageCss}

    @media print {
      /* Base print color and reset */
      *, *::before, *::after {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        box-shadow: none !important;
        text-shadow: none !important;
        transition: none !important;
      }

      /* Clean page foundation - Full A4 area utilization */
      html, body {
        background: #ffffff !important;
        color: #000000 !important;
        width: 100% !important;
        height: auto !important;
        min-height: 0 !important;
        overflow: visible !important;
        margin: 0 !important;
        padding: 0 !important;
        font-size: 9px !important;
        line-height: 1.25 !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif !important;
      }

      /* Dark mode override: print must always be white paper with dark text */
      .dark, html.dark, body.dark, .dark body, [class*="dark:bg-"] {
        background-color: #ffffff !important;
        background: #ffffff !important;
        color: #000000 !important;
      }
      .dark [class*="dark:text-"] {
        color: #000000 !important;
      }
      .dark [class*="dark:border-"] {
        border-color: #94a3b8 !important;
      }

      /* Unset all ancestor container height & overflow restrictions that prevent multi-page flow */
      main, 
      #root, 
      #root > div,
      body > div,
      .app-container,
      .flex-1,
      [class*="h-screen"],
      [class*="h-full"],
      [class*="overflow-"],
      .overflow-hidden,
      .overflow-auto,
      .overflow-x-auto,
      .overflow-y-auto {
        overflow: visible !important;
        height: auto !important;
        min-height: 0 !important;
        max-height: none !important;
        position: static !important;
        width: 100% !important;
        max-width: 100% !important;
        padding: 0 !important;
        margin: 0 !important;
      }

      /* Hide screen-only interactive chrome */
      header,
      header.app-header,
      aside,
      nav,
      .no-print,
      .print\\:hidden,
      .print-hide,
      .search-bar,
      .pagination-controls,
      .action-buttons,
      .no-print-area,
      .screen-only,
      button.print\\:hidden,
      div.print\\:hidden {
        display: none !important;
      }

      .print\\:block {
        display: block !important;
      }

      .print\\:flex {
        display: flex !important;
      }

      .print\\:inline {
        display: inline !important;
      }

      .print\\:inline-block {
        display: inline-block !important;
      }

      .print\\:table-row {
        display: table-row !important;
      }

      .print\\:table-header-group {
        display: table-header-group !important;
      }

      /* Multi-page table formatting */
      table {
        width: 100% !important;
        max-width: 100% !important;
        table-layout: auto !important;
        border-collapse: collapse !important;
        border-spacing: 0 !important;
        page-break-inside: auto !important;
        break-inside: auto !important;
        font-size: 8.5px !important;
        margin-bottom: 8px !important;
        box-shadow: none !important;
      }

      thead {
        display: table-header-group !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }

      tbody {
        display: table-row-group !important;
      }

      tfoot {
        display: table-footer-group !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }

      tr {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }

      /* Base table cells - Clean single borders and full wrapping */
      th, td {
        word-break: break-word !important;
        overflow-wrap: anywhere !important;
        white-space: normal !important;
        padding: 2.5px 4.5px !important;
        border: 1px solid #94a3b8 !important;
        color: #000000 !important;
        vertical-align: middle !important;
        box-shadow: none !important;
      }

      /* Standard column headers (excluding the special print header row) */
      thead tr:not(.print-header-row) th,
      th.table-header,
      .print-topic,
      .print-header {
        background-color: #f1f5f9 !important;
        color: #000000 !important;
        font-weight: 800 !important;
        font-size: 8.5px !important;
        text-transform: uppercase !important;
        text-align: center !important;
        vertical-align: middle !important;
        border: 1px solid #475569 !important;
        border-bottom: 2px solid #000000 !important;
        letter-spacing: 0.02em !important;
        padding: 3px 4px !important;
      }

      /* Numbers, dates, statuses, percentages centered per user specification */
      td:not(.text-left):not(.p-left) {
        text-align: center !important;
      }
      td.text-left, td.p-left {
        text-align: left !important;
      }

      /* Dedicated repeating logo & report title header row inside thead */
      tr.print-header-row,
      tr.print-header-row th,
      th.print-header-cell {
        background: #ffffff !important;
        border: none !important;
        border-bottom: 1.5px solid #000000 !important;
        padding: 0 0 3px 0 !important;
        color: #000000 !important;
        font-weight: normal !important;
        text-transform: none !important;
      }

      tr.print-header-row th *,
      th.print-header-cell *,
      .print-header-content * {
        background: transparent !important;
        border: none !important;
      }

      .print-header-content,
      .company-print-header {
        padding-bottom: 2px !important;
        margin-bottom: 4px !important;
        border-bottom: 1.5px solid #000000 !important;
      }

      .print-logo {
        max-height: 40px !important;
        max-width: 220px !important;
        height: 38px !important;
        width: auto !important;
        object-fit: contain !important;
      }

      /* Expand truncated text so full data is visible in print (no ellipsis) */
      .truncate,
      [class*="truncate"],
      .line-clamp-1,
      .line-clamp-2,
      .line-clamp-3 {
        overflow: visible !important;
        text-overflow: clip !important;
        white-space: normal !important;
        max-width: none !important;
        display: block !important;
      }

      /* Section headers (like Unit I, Unit II) */
      .print-section-header,
      [data-print-section] {
        page-break-after: avoid !important;
        break-after: avoid !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        background-color: #f8fafc !important;
        color: #000000 !important;
        border: 1px solid #475569 !important;
        padding: 2px 4px !important;
      }

      /* Ensure loom pills wrap cleanly and remain visible */
      .print-keep,
      .data-badge,
      .loom-pill,
      [class*="rounded-full"] {
        display: inline-block !important;
        background: #f8fafc !important;
        color: #000000 !important;
        border: 1px solid #64748b !important;
        border-radius: 3px !important;
        padding: 1px 3.5px !important;
        font-size: 7.5px !important;
        font-weight: 700 !important;
        box-shadow: none !important;
        margin: 0.5px !important;
        white-space: nowrap !important;
      }

      /* Flatten form inputs if any are shown in print */
      input, select, textarea {
        border: none !important;
        background: transparent !important;
        box-shadow: none !important;
        appearance: none !important;
        color: #000000 !important;
        padding: 0 !important;
      }
    }
  `;

  // Set document title before window.print() so browser suggests this title when Saving as PDF
  const originalTitle = document.title;
  if (options?.title) {
    document.title = options.title;
  } else {
    document.title = '';
  }

  setTimeout(() => {
    window.print();
    setTimeout(() => {
      document.title = originalTitle || 'SPUPL LOOM SYSTEM';
    }, 1200);
  }, 60);
}
