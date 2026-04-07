import React from 'react';
import { Settings } from 'lucide-react';
import styles from './DrawerToolbar.module.css';
import { DRAWER_CONFIG } from '../shared/constants';

interface DrawerToolbarProps {
  logoPosition: { x: number; y: number };
  isExportActive: boolean;
  onExportToggle: () => void;
  onSettingsClick: () => void;
}

const TOOLBAR_WIDTH = 28;
const ICON_BUTTON_SIZE = 28;
const GAP = 2;
const PADDING_Y = 5;
const LOGO_HALF = 22; // half of 44px logo
const TOOLBAR_GAP = 6; // gap between toolbar bottom and logo top
const TOOLBAR_HEIGHT = PADDING_Y + ICON_BUTTON_SIZE + GAP + ICON_BUTTON_SIZE + PADDING_Y; // 68

const toolbarStyle = {
  width: `${TOOLBAR_WIDTH}px`,
  padding: `${PADDING_Y}px 0`,
  gap: `${GAP}px`,
  backgroundColor: '#1a1a1a',
  borderRadius: '8px',
  boxShadow:
    'inset 1px 1px 2.8px -1px rgba(255, 255, 255, 0.65), 0 2px 5px -1px rgba(0, 0, 0, 0.35)',
} as const;

const iconButtonStyle = {
  width: `${ICON_BUTTON_SIZE}px`,
  height: `${ICON_BUTTON_SIZE}px`,
  background: 'none',
  border: 'none',
  padding: 0,
  lineHeight: 0,
} as const;

export const DrawerToolbar: React.FC<DrawerToolbarProps> = ({
  logoPosition,
  isExportActive,
  onExportToggle,
  onSettingsClick,
}) => {
  const topAbove = logoPosition.y - LOGO_HALF - TOOLBAR_GAP - TOOLBAR_HEIGHT;
  const fitsAbove = topAbove >= DRAWER_CONFIG.EDGE_MARGIN;
  const top = fitsAbove
    ? topAbove
    : logoPosition.y + LOGO_HALF + TOOLBAR_GAP;

  return (
  <div
    className="fixed flex flex-col items-center"
    style={{
      left: logoPosition.x - TOOLBAR_WIDTH / 2,
      top,
      zIndex: 1001,
      ...toolbarStyle,
    }}
  >
    {/* Export */}
    <button
      onClick={onExportToggle}
      className={`flex items-center justify-center cursor-pointer ${isExportActive ? 'text-text-main' : 'text-text-secondary'} hover:text-text-main transition-colors ${styles.iconButton}`}
      style={iconButtonStyle}
      aria-label="Toggle export mode"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 256 256">
        <path d="M224,104a8,8,0,0,1-16,0V59.32l-66.33,66.34a8,8,0,0,1-11.32-11.32L196.68,48H152a8,8,0,0,1,0-16h64a8,8,0,0,1,8,8Zm-40,24a8,8,0,0,0-8,8v72H48V80h72a8,8,0,0,0,0-16H48A16,16,0,0,0,32,80V208a16,16,0,0,0,16,16H176a16,16,0,0,0,16-16V136A8,8,0,0,0,184,128Z" />
      </svg>
    </button>
    {/* Settings */}
    <button
      onClick={onSettingsClick}
      className={`flex items-center justify-center cursor-pointer text-text-secondary hover:text-text-main transition-colors ${styles.iconButton}`}
      style={iconButtonStyle}
      aria-label="Settings"
    >
      <Settings size={18} strokeWidth={1.5} />
    </button>
  </div>
  );
};
