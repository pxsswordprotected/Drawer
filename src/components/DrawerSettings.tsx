import React from 'react';
import { useDrawerStore } from '@/store/drawerStore';

export const DrawerSettings: React.FC = () => {
  const resetLogoPosition = useDrawerStore((state) => state.resetLogoPosition);

  return (
    <div className="flex flex-col gap-3 px-[38px] py-3 h-full">
      <span className="text-text-main text-sm font-light">Settings</span>
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
