import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Highlight } from '@/shared/types';
import { generateMarkdown, downloadMarkdown, copyMarkdown } from '@/shared/exportHighlights';

export type ExportScope = 'current' | 'all' | 'selected';

interface ExportPanelProps {
  allHighlights: Highlight[];
  currentPageHighlights: Highlight[];
  scope: ExportScope;
  setScope: (s: ExportScope) => void;
  includeNotes: boolean;
  setIncludeNotes: (v: boolean) => void;
  includeTimestamps: boolean;
  setIncludeTimestamps: (v: boolean) => void;
  onClose: () => void;
}

export const ExportPanel: React.FC<ExportPanelProps> = ({
  allHighlights,
  currentPageHighlights,
  scope,
  setScope,
  includeNotes,
  setIncludeNotes,
  includeTimestamps,
  setIncludeTimestamps,
  onClose,
}) => {
  const [screen, setScreen] = useState<'scope' | 'selection' | 'options'>('scope');
  const [copyError, setCopyError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(allHighlights.map((h) => h.id)));

  useEffect(() => {
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, []);

  const hasCurrentPage = currentPageHighlights.length > 0;

  // Group highlights by URL for the selection screen
  const groups = useMemo(() => {
    const map = new Map<string, Highlight[]>();
    for (const h of allHighlights) {
      const list = map.get(h.url) || [];
      list.push(h);
      map.set(h.url, list);
    }
    return [...map.entries()].map(([url, items]) => ({
      url,
      pageTitle: items[0].pageTitle || url,
      highlights: [...items].sort((a, b) => a.timestamp - b.timestamp),
    }));
  }, [allHighlights]);

  const getHighlights = useCallback(() => {
    if (scope === 'current') return currentPageHighlights;
    if (scope === 'selected') return allHighlights.filter((h) => selectedIds.has(h.id));
    return allHighlights;
  }, [scope, currentPageHighlights, allHighlights, selectedIds]);

  const handleCopy = useCallback(async () => {
    setCopyError(null);
    const md = generateMarkdown(getHighlights(), { includeNotes, includeTimestamps });
    try {
      await copyMarkdown(md);
      setDone(true);
      dismissTimer.current = setTimeout(() => onClose(), 1500);
    } catch {
      setCopyError("Couldn't copy to clipboard");
    }
  }, [getHighlights, includeNotes, includeTimestamps, onClose]);

  const handleDownload = useCallback(() => {
    setCopyError(null);
    const md = generateMarkdown(getHighlights(), { includeNotes, includeTimestamps });
    downloadMarkdown(md);
    setDone(true);
    dismissTimer.current = setTimeout(() => onClose(), 1500);
  }, [getHighlights, includeNotes, includeTimestamps, onClose]);

  const toggleHighlight = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const togglePage = useCallback((highlights: Highlight[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const anySelected = highlights.some((h) => prev.has(h.id));
      for (const h of highlights) {
        if (anySelected) next.delete(h.id);
        else next.add(h.id);
      }
      return next;
    });
  }, []);

  const goToOptions = () => {
    setCopyError(null);
    setScreen('options');
  };

  const goToScope = () => {
    setCopyError(null);
    setScreen('scope');
  };

  const goToSelection = () => {
    setCopyError(null);
    setScreen('selection');
  };

  if (done) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-text-main text-sm font-light">Done</p>
      </div>
    );
  }

  if (screen === 'scope') {
    return (
      <div className="h-full flex flex-col px-[38px] py-4">
        <p className="text-text-main text-sm font-medium mb-6">Export</p>

        <div className="flex flex-col gap-3 flex-1">
          <label
            className={`flex items-center gap-3 cursor-pointer ${!hasCurrentPage ? 'opacity-40 pointer-events-none' : ''}`}
          >
            <input
              type="radio"
              name="export-scope"
              checked={scope === 'current'}
              onChange={() => setScope('current')}
              disabled={!hasCurrentPage}
              className="accent-text-main"
            />
            <span className="text-text-main text-sm font-light">
              Current page ({currentPageHighlights.length})
            </span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name="export-scope"
              checked={scope === 'all'}
              onChange={() => setScope('all')}
              className="accent-text-main"
            />
            <span className="text-text-main text-sm font-light">
              All highlights ({allHighlights.length})
            </span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name="export-scope"
              checked={scope === 'selected'}
              onChange={() => setScope('selected')}
              className="accent-text-main"
            />
            <span className="text-text-main text-sm font-light">
              Selected
            </span>
          </label>
        </div>

        <button
          onClick={scope === 'selected' ? goToSelection : goToOptions}
          className="w-full py-2 rounded text-sm font-light bg-[#373737] text-text-main hover:bg-[#444] transition-colors cursor-pointer"
        >
          Next
        </button>
      </div>
    );
  }

  if (screen === 'selection') {
    const selectedCount = allHighlights.filter((h) => selectedIds.has(h.id)).length;

    return (
      <div className="h-full flex flex-col px-[38px] py-4">
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={goToScope}
            className="text-text-secondary hover:text-text-main transition-colors cursor-pointer"
            style={{ background: 'none', border: 'none', padding: 0 }}
          >
            &larr;
          </button>
          <p className="text-text-main text-sm font-medium">
            Select highlights ({selectedCount})
          </p>
        </div>

        <div className="flex-1 overflow-y-auto flex flex-col gap-1" style={{ minHeight: 0 }}>
          {groups.map((group) => {
            const allInGroup = group.highlights.every((h) => selectedIds.has(h.id));
            const someInGroup = group.highlights.some((h) => selectedIds.has(h.id));

            return (
              <div key={group.url}>
                {/* Page header */}
                <label className="flex items-center gap-2 py-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={someInGroup}
                    onChange={() => togglePage(group.highlights)}
                    className="accent-text-main flex-shrink-0"
                  />
                  <span className="text-text-main text-sm font-medium truncate">
                    {group.pageTitle}
                  </span>
                </label>

                {/* Highlights in this page */}
                {group.highlights.map((h) => (
                  <label key={h.id} className="flex items-center gap-2 py-1 pl-6 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(h.id)}
                      onChange={() => toggleHighlight(h.id)}
                      className="accent-text-main flex-shrink-0"
                    />
                    <span className="text-text-secondary text-xs font-light truncate">
                      {h.text.length > 80 ? h.text.slice(0, 80) + '...' : h.text}
                    </span>
                  </label>
                ))}
              </div>
            );
          })}
        </div>

        <button
          onClick={goToOptions}
          disabled={selectedCount === 0}
          className="w-full py-2 mt-2 rounded text-sm font-light bg-[#373737] text-text-main hover:bg-[#444] transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
        >
          Next
        </button>
      </div>
    );
  }

  // Options screen
  return (
    <div className="h-full flex flex-col px-[38px] py-4">
      <div className="flex items-center gap-2 mb-6">
        <button
          onClick={scope === 'selected' ? goToSelection : goToScope}
          className="text-text-secondary hover:text-text-main transition-colors cursor-pointer"
          style={{ background: 'none', border: 'none', padding: 0 }}
        >
          &larr;
        </button>
        <p className="text-text-main text-sm font-medium">Options</p>
      </div>

      <div className="flex flex-col gap-3 flex-1">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={includeNotes}
            onChange={(e) => setIncludeNotes(e.target.checked)}
            className="accent-text-main"
          />
          <span className="text-text-main text-sm font-light">Include notes</span>
        </label>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={includeTimestamps}
            onChange={(e) => setIncludeTimestamps(e.target.checked)}
            className="accent-text-main"
          />
          <span className="text-text-main text-sm font-light">Include timestamps</span>
        </label>
      </div>

      {copyError && (
        <p className="text-red-400 text-xs font-light mb-2">{copyError}</p>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleCopy}
          className="flex-1 py-2 rounded text-sm font-light bg-[#373737] text-text-main hover:bg-[#444] transition-colors cursor-pointer"
        >
          Copy Markdown
        </button>
        <button
          onClick={handleDownload}
          className="flex-1 py-2 rounded text-sm font-light bg-[#373737] text-text-main hover:bg-[#444] transition-colors cursor-pointer"
        >
          Download .md
        </button>
      </div>
    </div>
  );
};
