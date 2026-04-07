import React, { useRef } from 'react';
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
  'px-3 text-sm font-light bg-[#373737] text-text-main hover:bg-[#444] transition-colors cursor-pointer flex items-center justify-center';

const buttonStyle = { borderRadius: '8px', height: '32px', paddingTop: '1px' } as const;

export const DrawerSettings: React.FC = () => {
  const resetLogoPosition = useDrawerStore((state) => state.resetLogoPosition);
  const defaultColor = useDrawerStore((state) => state.defaultColor);
  const setDefaultColor = useDrawerStore((state) => state.setDefaultColor);
  const importBackup = useDrawerStore((state) => state.importBackup);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleBackup = async () => {
    const json = await storageService.exportHighlights();
    downloadJson(json);
  };

  const handleRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      await importBackup(reader.result as string);
    };
    reader.readAsText(file);

    // Reset so the same file can be re-selected
    e.target.value = '';
  };

  return (
    <div className="flex flex-col gap-4 px-[38px] py-3 h-full">
      <span className="text-text-main text-sm font-light">Settings</span>

      <div className="flex items-center gap-3">
        <span className="text-text-secondary text-sm font-light">Highlight color</span>
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

      <button onClick={resetLogoPosition} className={buttonClass} style={buttonStyle}>
        Reset position
      </button>

      <div className="flex flex-col gap-2">
        <span className="text-text-secondary text-xs font-light">Backup / Restore</span>
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
      </div>
    </div>
  );
};
