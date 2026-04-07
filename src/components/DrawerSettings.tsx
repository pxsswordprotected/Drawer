import React from 'react';
import { useDrawerStore } from '@/store/drawerStore';
import { HIGHLIGHT_COLORS } from '@/shared/constants';

const COLOR_OPTIONS = [
  { name: 'Yellow', value: HIGHLIGHT_COLORS.yellow },
  { name: 'Green', value: HIGHLIGHT_COLORS.green },
  { name: 'Orange', value: HIGHLIGHT_COLORS.orange },
] as const;

export const DrawerSettings: React.FC = () => {
  const resetLogoPosition = useDrawerStore((state) => state.resetLogoPosition);
  const defaultColor = useDrawerStore((state) => state.defaultColor);
  const setDefaultColor = useDrawerStore((state) => state.setDefaultColor);

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

      <button
        onClick={resetLogoPosition}
        className="px-3 text-sm font-light bg-[#373737] text-text-main hover:bg-[#444] transition-colors cursor-pointer flex items-center justify-center"
        style={{ borderRadius: '8px', height: '32px', paddingTop: '1px' }}
      >
        Reset position
      </button>
    </div>
  );
};
