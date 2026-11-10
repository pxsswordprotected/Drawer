import React, { useState } from 'react';
import { clearDebugLog, exportDebugLog } from '@/shared/debugLog';

interface DebugLogControlsProps {
  buttonClass: string;
  buttonStyle: React.CSSProperties;
}

// Debug builds only: render behind `__DRAWER_DEBUG__` so the normal extension build drops
// this component and the debug log module. Sits in the Settings "General" row; narrower
// padding keeps it beside "Reset position" within the drawer's width.
export const DebugLogControls: React.FC<DebugLogControlsProps> = ({ buttonClass, buttonStyle }) => {
  const [cleared, setCleared] = useState(false);
  const compactStyle = { ...buttonStyle, paddingLeft: 12, paddingRight: 12 };

  const handleClear = async () => {
    await clearDebugLog();
    setCleared(true);
    setTimeout(() => setCleared(false), 2000);
  };

  return (
    <>
      <button onClick={() => void exportDebugLog()} className={buttonClass} style={compactStyle}>
        Export log
      </button>
      <button
        onClick={() => void handleClear()}
        className={`${buttonClass} ${cleared ? 'pointer-events-none' : ''}`}
        style={compactStyle}
      >
        {cleared ? 'Cleared' : 'Clear'}
      </button>
    </>
  );
};
