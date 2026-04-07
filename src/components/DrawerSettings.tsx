import React, { useRef, useState } from 'react';
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
  'w-full px-3 text-sm font-light bg-[#373737] text-text-main hover:bg-[#444] transition-colors cursor-pointer flex items-center justify-center';

const buttonStyle = {
  borderRadius: '8px',
  height: '32px',
  boxShadow: 'inset 1px 1px 2.8px -1px rgba(255, 255, 255, 0.65)',
} as const;

export const DrawerSettings: React.FC = () => {
  const resetLogoPosition = useDrawerStore((state) => state.resetLogoPosition);
  const defaultColor = useDrawerStore((state) => state.defaultColor);
  const setDefaultColor = useDrawerStore((state) => state.setDefaultColor);
  const importBackup = useDrawerStore((state) => state.importBackup);
  const deleteAllHighlights = useDrawerStore((state) => state.deleteAllHighlights);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

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
    <div className="flex flex-col gap-5 px-[38px] py-3 h-full">
      {/* Highlights */}
      <div className="flex flex-col gap-3">
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
        <button onClick={resetLogoPosition} className={buttonClass} style={buttonStyle}>
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
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleRestore}
            className="hidden"
          />
        </div>
        {restoreError && <p className="text-red-400 text-xs font-light">{restoreError}</p>}
        <button
          onClick={deleteAllHighlights}
          className="w-full px-3 text-sm font-light bg-red-600 text-white hover:bg-red-700 transition-colors cursor-pointer flex items-center justify-center"
          style={{ borderRadius: '8px', height: '32px' }}
        >
          Delete all highlights
        </button>
      </div>
    </div>
  );
};
