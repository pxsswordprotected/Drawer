import React, { useRef, useState, useEffect } from 'react';
import { useDrawerStore } from '@/store/drawerStore';
import { HIGHLIGHT_COLORS } from '@/shared/constants';
import { storageService } from '@/shared/storage';
import { downloadJson } from '@/shared/exportHighlights';

const COLOR_OPTIONS = [
  { name: 'Yellow', value: HIGHLIGHT_COLORS.yellow },
  { name: 'Green', value: HIGHLIGHT_COLORS.green },
  { name: 'Orange', value: HIGHLIGHT_COLORS.orange },
] as const;

const buttonClass =
  'px-4 text-sm font-light bg-[#373737] text-text-main hover:bg-[#444] transition-colors cursor-pointer flex items-center justify-center';

const buttonStyle = {
  borderRadius: '8px',
  height: '32px',
  boxShadow: 'inset 1px 1px 2.8px -1px rgba(255, 255, 255, 0.65)',
} as const;

export const DrawerSettings: React.FC = () => {
  const resetLogoPosition = useDrawerStore((state) => state.resetLogoPosition);
  const defaultColor = useDrawerStore((state) => state.defaultColor);
  const setDefaultColor = useDrawerStore((state) => state.setDefaultColor);
  const allHighlights = useDrawerStore((state) => state.allHighlights);
  const importBackup = useDrawerStore((state) => state.importBackup);
  const deleteAllHighlights = useDrawerStore((state) => state.deleteAllHighlights);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const [isHolding, setIsHolding] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startDelete = () => {
    if (isDeleted) return;
    setIsHolding(true);
    holdTimerRef.current = setTimeout(() => {
      setIsHolding(false);
      setIsDeleted(true);
      deleteAllHighlights();
      resetTimerRef.current = setTimeout(() => {
        setIsDeleted(false);
      }, 2000);
    }, 1000);
  };

  const stopDelete = () => {
    if (isDeleted) return;
    setIsHolding(false);
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
  };

  useEffect(() => {
    return () => {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  const handleBackup = async () => {
    const json = await storageService.exportHighlights();
    downloadJson(json);
  };

  const handleRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setRestoreError(null);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await importBackup(reader.result as string);
        console.log('[restore] success');
      } catch (err) {
        console.log('[restore] error caught:', err);
        setRestoreError(
          'Data could not be restored as the file format is not recognized. Please select a backup file that was exported from this extension.'
        );
      }
    };
    reader.readAsText(file);

    e.target.value = '';
  };

  return (
    <div className="flex flex-col gap-5 px-[38px] py-3 h-full justify-center">
      {/* Highlights */}
      <div className="flex flex-col gap-2">
        <span className="text-text-secondary text-xs font-light">Highlights</span>
        <div className="flex items-center justify-between">
          <span className="text-text-main text-sm font-light">Color</span>
          <div className="flex items-center gap-2">
            {COLOR_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setDefaultColor(opt.value)}
                className="cursor-pointer rounded-full"
                style={{
                  width: '20px',
                  height: '20px',
                  backgroundColor: opt.value,
                  outline: defaultColor === opt.value ? '2px solid #F5F5F5' : 'none',
                  outlineOffset: '2px',
                  border: 'none',
                  padding: 0,
                }}
                aria-label={`${opt.name} highlight color`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* General */}
      <div className="flex flex-col gap-2">
        <span className="text-text-secondary text-xs font-light">General</span>
        <button
          onClick={resetLogoPosition}
          className={`${buttonClass} self-start`}
          style={buttonStyle}
        >
          Reset position
        </button>
      </div>

      {/* Data */}
      <div className="flex flex-col gap-2">
        <span className="text-text-secondary text-xs font-light">Data</span>
        <div className="flex items-center gap-2">
          <button onClick={handleBackup} className={buttonClass} style={buttonStyle}>
            Backup
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className={buttonClass}
            style={buttonStyle}
          >
            Restore
          </button>
          <button
            onPointerDown={allHighlights.length > 0 ? startDelete : undefined}
            onPointerUp={allHighlights.length > 0 ? stopDelete : undefined}
            onPointerLeave={allHighlights.length > 0 ? stopDelete : undefined}
            className={`px-4 text-sm font-light text-white flex items-center justify-center overflow-hidden relative select-none ${allHighlights.length > 0 || isDeleted ? 'cursor-pointer' : 'opacity-40 pointer-events-none'}`}
            style={{ borderRadius: '8px', height: '32px', backgroundColor: '#DC2626' }}
          >
            <span className={`relative z-10 ${isDeleted ? 'invisible' : ''}`}>Delete all</span>
            {isDeleted && (
              <span className="absolute inset-0 flex items-center justify-center z-10 text-white">Deleted</span>
            )}
            <div
              aria-hidden
              className="absolute -inset-px pointer-events-none"
              style={{
                backgroundColor: '#991b1b',
                clipPath: isHolding || isDeleted
                  ? 'inset(0px 0% 0px 0px)'
                  : 'inset(0px 100% 0px 0px)',
                transitionProperty: 'clip-path, background-color',
                transitionDuration: isHolding ? '1000ms' : '400ms',
                transitionTimingFunction: isHolding
                  ? 'linear'
                  : 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
              }}
            />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleRestore}
            className="hidden"
          />
        </div>
        {restoreError && <p className="text-red-400 text-xs font-light">{restoreError}</p>}
      </div>
    </div>
  );
};
