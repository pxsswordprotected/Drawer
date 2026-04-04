import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Highlight } from '@/shared/types';
import { generateMarkdown, downloadMarkdown, copyMarkdown } from '@/shared/exportHighlights';

export type ExportScope = 'current' | 'all';

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
  const [screen, setScreen] = useState<'scope' | 'options'>('scope');
  const [copyError, setCopyError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, []);

  const hasCurrentPage = currentPageHighlights.length > 0;

  const getHighlights = useCallback(() => {
    return scope === 'current' ? currentPageHighlights : allHighlights;
  }, [scope, currentPageHighlights, allHighlights]);

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

  const goToOptions = () => {
    setCopyError(null);
    setScreen('options');
  };

  const goToScope = () => {
    setCopyError(null);
    setScreen('scope');
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
        </div>

        <button
          onClick={goToOptions}
          className="w-full py-2 rounded text-sm font-light bg-[#373737] text-text-main hover:bg-[#444] transition-colors cursor-pointer"
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
          onClick={goToScope}
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
