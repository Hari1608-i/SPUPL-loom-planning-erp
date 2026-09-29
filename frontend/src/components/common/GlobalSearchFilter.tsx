import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, Loader2 } from 'lucide-react';

export type SearchTypeOption = 'LOOM' | 'DESIGN' | 'ALL';

export interface SearchResultItem {
  id: string | number;
  loomNo?: string | number;
  designNo?: string;
  orderNo?: string;
  customer?: string;
  extraInfo?: string;
  rawItem?: any;
}

export interface GlobalSearchFilterProps {
  searchType: SearchTypeOption;
  onSearchTypeChange: (type: SearchTypeOption) => void;
  searchTerm: string;
  onSearchTermChange: (term: string) => void;
  placeholder?: string;
  suggestions?: SearchResultItem[];
  onSelectSuggestion?: (item: SearchResultItem) => void;
  className?: string;
  inputWidthClass?: string;
  isLoading?: boolean;
}

export const GlobalSearchFilter: React.FC<GlobalSearchFilterProps> = ({
  searchType,
  onSearchTypeChange,
  searchTerm,
  onSearchTermChange,
  placeholder,
  suggestions = [],
  onSelectSuggestion,
  className = '',
  inputWidthClass = 'w-64 sm:w-72',
  isLoading = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; placeAbove?: boolean }>({
    top: 0,
    left: 0,
    width: 288
  });

  const inputContainerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Default dynamic placeholder
  const effectivePlaceholder = useMemo(() => {
    if (placeholder) return placeholder;
    if (searchType === 'LOOM') return 'Search Loom No (e.g. 12, 101)...';
    if (searchType === 'DESIGN') return 'Search Design No (e.g. SP26/148)...';
    return 'Search Loom, Design, Order, All...';
  }, [placeholder, searchType]);

  // Calculate frontmost viewport coordinates
  const updatePosition = useCallback(() => {
    if (!inputContainerRef.current) return;
    const rect = inputContainerRef.current.getBoundingClientRect();
    const dropdownHeight = 260; // Estimated max height
    const spaceBelow = window.innerHeight - rect.bottom;
    const placeAbove = spaceBelow < dropdownHeight && rect.top > dropdownHeight;

    setCoords({
      top: placeAbove ? rect.top - dropdownHeight - 4 : rect.bottom + 4,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - Math.max(rect.width, 320) - 8)),
      width: Math.max(rect.width, 320),
      placeAbove
    });
  }, []);

  // Update position on open or window resize/scroll
  useEffect(() => {
    if (isOpen) {
      updatePosition();
      const handleResizeOrScroll = () => updatePosition();
      window.addEventListener('resize', handleResizeOrScroll);
      window.addEventListener('scroll', handleResizeOrScroll, true);
      return () => {
        window.removeEventListener('resize', handleResizeOrScroll);
        window.removeEventListener('scroll', handleResizeOrScroll, true);
      };
    }
  }, [isOpen, updatePosition]);

  // Click outside listener
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        inputContainerRef.current &&
        !inputContainerRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Safe text highlighting
  const renderHighlighted = (text: string | number | undefined, query: string) => {
    if (!text) return '';
    const str = String(text);
    const cleanQuery = query.trim().replace(/^[Ll]oom\s*|^[Ll]-?\s*/i, '');
    if (!cleanQuery) return str;

    const idx = str.toLowerCase().indexOf(cleanQuery.toLowerCase());
    if (idx === -1) return str;

    const before = str.slice(0, idx);
    const match = str.slice(idx, idx + cleanQuery.length);
    const after = str.slice(idx + cleanQuery.length);

    return (
      <>
        {before}
        <span className="bg-amber-200 text-amber-950 font-bold px-0.5 rounded">{match}</span>
        {after}
      </>
    );
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      setHighlightedIndex(-1);
      return;
    }
    if (!isOpen || suggestions.length === 0) {
      if (e.key === 'ArrowDown' && suggestions.length > 0) {
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
        handleSelect(suggestions[highlightedIndex]);
      }
    }
  };

  const handleSelect = (item: SearchResultItem) => {
    if (onSelectSuggestion) {
      onSelectSuggestion(item);
    } else {
      // Default fill based on searchType
      if (searchType === 'LOOM' && item.loomNo) {
        onSearchTermChange(String(item.loomNo));
      } else if (searchType === 'DESIGN' && item.designNo) {
        onSearchTermChange(item.designNo);
      } else {
        onSearchTermChange(item.designNo || (item.loomNo ? String(item.loomNo) : ''));
      }
    }
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  return (
    <div className={`flex items-center gap-2.5 print:hidden ${className}`}>
      {/* Search Type Selector */}
      <div className="flex items-center space-x-1.5 shrink-0">
        <span className="font-bold text-slate-500 uppercase text-[11px] whitespace-nowrap">Search Type:</span>
        <select
          value={searchType}
          onChange={(e) => {
            onSearchTypeChange(e.target.value as SearchTypeOption);
            setIsOpen(false);
          }}
          className="px-2.5 py-1.5 border border-slate-300 rounded-xl outline-none font-bold text-indigo-950 bg-white text-xs focus:ring-2 focus:ring-indigo-500 shadow-sm cursor-pointer hover:border-slate-400 transition-colors"
          title="Filter search field"
        >
          <option value="LOOM">Loom No</option>
          <option value="DESIGN">Design No</option>
          <option value="ALL">All Fields</option>
        </select>
      </div>

      {/* Search Input Box */}
      <div ref={inputContainerRef} className={`relative ${inputWidthClass}`}>
        <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
        <input
          type="text"
          placeholder={effectivePlaceholder}
          value={searchTerm}
          onChange={(e) => {
            onSearchTermChange(e.target.value);
            setIsOpen(true);
            setHighlightedIndex(-1);
          }}
          onFocus={() => {
            if (searchTerm.trim() && suggestions.length > 0) {
              updatePosition();
              setIsOpen(true);
            }
          }}
          onKeyDown={handleKeyDown}
          className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm border border-slate-300 rounded-xl outline-none font-bold text-indigo-900 bg-white placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm transition-all"
        />

        {isLoading ? (
          <Loader2 className="w-3.5 h-3.5 absolute right-2.5 top-3 text-indigo-500 animate-spin" />
        ) : searchTerm ? (
          <button
            type="button"
            onClick={() => {
              onSearchTermChange('');
              setIsOpen(false);
              setHighlightedIndex(-1);
            }}
            className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-100 transition-colors"
            title="Clear Search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : null}
      </div>

      {/* Frontmost Portal Dropdown rendered into document.body */}
      {isOpen && searchTerm.trim().length > 0 && typeof document !== 'undefined' && createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            top: coords.top,
            left: coords.left,
            width: coords.width,
            maxHeight: '260px',
            zIndex: 99999
          }}
          className="bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-[11px] font-bold text-slate-500">
            <span>
              Matching {searchType === 'LOOM' ? 'Looms' : searchType === 'DESIGN' ? 'Designs' : 'Records'} ({suggestions.length})
            </span>
            <span className="text-[10px] text-slate-400 font-normal">Esc to close</span>
          </div>

          <div className="overflow-y-auto max-h-[220px] divide-y divide-slate-100 custom-scrollbar">
            {suggestions.length === 0 ? (
              <div className="py-4 px-3 text-center text-xs text-slate-500 font-medium">
                No matching records found for "{searchTerm}"
              </div>
            ) : (
              suggestions.map((item, index) => {
                const isHighlighted = index === highlightedIndex;
                return (
                  <div
                    key={item.id ?? index}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`px-3 py-2 cursor-pointer transition-colors text-xs flex items-center justify-between gap-2 ${
                      isHighlighted ? 'bg-indigo-50 text-indigo-950 font-bold' : 'hover:bg-slate-50 text-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      {item.loomNo !== undefined && item.loomNo !== null && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black bg-indigo-100 text-indigo-800 shrink-0">
                          L-{item.loomNo}
                        </span>
                      )}
                      {item.designNo && (
                        <span className="font-bold text-slate-900 truncate">
                          {renderHighlighted(item.designNo, searchTerm)}
                        </span>
                      )}
                      {item.orderNo && (
                        <span className="text-slate-500 text-[11px] truncate">
                          ({renderHighlighted(item.orderNo, searchTerm)})
                        </span>
                      )}
                    </div>

                    {(item.customer || item.extraInfo) && (
                      <span className="text-[10px] text-slate-400 shrink-0 truncate max-w-[120px]">
                        {item.customer || item.extraInfo}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default GlobalSearchFilter;
