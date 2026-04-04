import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Highlight } from '@/shared/types';
import { generateMarkdown, downloadMarkdown, copyMarkdown } from '@/shared/exportHighlights';

export type ExportScope = 'current' | 'all' | 'selected';

interface ExportPanelProps {
  highlightsToExport: Highlight[];
  includeNotes: boolean;
  setIncludeNotes: (v: boolean) => void;
  includeTimestamps: boolean;
  setIncludeTimestamps: (v: boolean) => void;
  onClose: () => void;
  onBack: () => void;
}

export const ExportPanel: React.FC<ExportPanelProps> = ({
  highlightsToExport,
  includeNotes,
  setIncludeNotes,
  includeTimestamps,
  setIncludeTimestamps,
  onClose,
  onBack,
}) => {
  const [copyError, setCopyError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, []);

  const handleCopy = useCallback(async () => {
    setCopyError(null);
    const md = generateMarkdown(highlightsToExport, { includeNotes, includeTimestamps });
    try {
      await copyMarkdown(md);
      setDone(true);
      dismissTimer.current = setTimeout(() => onClose(), 1500);
    } catch {
      setCopyError("Couldn't copy to clipboard");
    }
  }, [highlightsToExport, includeNotes, includeTimestamps, onClose]);

  const handleDownload = useCallback(() => {
    setCopyError(null);
    const md = generateMarkdown(highlightsToExport, { includeNotes, includeTimestamps });
    downloadMarkdown(md);
    setDone(true);
    dismissTimer.current = setTimeout(() => onClose(), 1500);
  }, [highlightsToExport, includeNotes, includeTimestamps, onClose]);

  if (done) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-text-main text-sm font-light">Done</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col px-[38px] py-4">
      <div className="flex items-center gap-2 mb-6">
        <button
          onClick={onBack}
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
