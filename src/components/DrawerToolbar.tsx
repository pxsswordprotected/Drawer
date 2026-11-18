import React from 'react';
import { Folder, Settings } from 'lucide-react';
import styles from './DrawerToolbar.module.css';
import drawerStyles from './HighlightsDrawer.module.css';
import { DRAWER_CONFIG } from '../shared/constants';

interface DrawerToolbarProps {
  logoPosition: { x: number; y: number };
  isExportActive: boolean;
  isSettingsActive: boolean;
  isFoldersActive: boolean;
  closing: boolean; // exit animation playing: the parent unmounts the toolbar when the drawer finishes closing
  onExportToggle: () => void;
  onSettingsClick: () => void;
  onFoldersClick: () => void;
}

const TOOLBAR_WIDTH = 28;
const ICON_BUTTON_SIZE = 28;
const GAP = 2;
const PADDING_Y = 5;
const LOGO_HALF = 22; // half of 44px logo
const TOOLBAR_GAP = 6; // gap between toolbar bottom and logo top
const BUTTON_COUNT = 3;
const TOOLBAR_HEIGHT =
  PADDING_Y + ICON_BUTTON_SIZE * BUTTON_COUNT + GAP * (BUTTON_COUNT - 1) + PADDING_Y; // 98

const toolbarStyle = {
  width: `${TOOLBAR_WIDTH}px`,
  padding: `${PADDING_Y}px 0`,
  gap: `${GAP}px`,
  backgroundColor: '#1a1a1a',
  borderRadius: '8px',
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
  isSettingsActive,
  isFoldersActive,
  closing,
  onExportToggle,
  onSettingsClick,
  onFoldersClick,
}) => {
  const topAbove = logoPosition.y - LOGO_HALF - TOOLBAR_GAP - TOOLBAR_HEIGHT;
  const fitsAbove = topAbove >= DRAWER_CONFIG.EDGE_MARGIN;
  const top = fitsAbove
    ? topAbove
    : logoPosition.y + LOGO_HALF + TOOLBAR_GAP;

  return (
  <div
    // Same keyframes, duration and easing as the drawer, so both land together
    className={`fixed flex flex-col items-center shadow-bevel-raised ${closing ? `pointer-events-none ${drawerStyles.drawerClosing}` : drawerStyles.drawerEntering}`}
    style={{
      left: logoPosition.x - TOOLBAR_WIDTH / 2,
      top,
      zIndex: 1001,
      // Scale from the edge facing the logo, so the toolbar grows out of it
      transformOrigin: fitsAbove ? '50% 100%' : '50% 0%',
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
    {/* Folders */}
    <button
      onClick={onFoldersClick}
      className={`flex items-center justify-center cursor-pointer ${isFoldersActive ? 'text-text-main' : 'text-text-secondary'} hover:text-text-main transition-colors ${styles.iconButton}`}
      style={iconButtonStyle}
      aria-label="Folders"
    >
      <Folder size={18} strokeWidth={1.5} />
    </button>
    {/* Settings */}
    <button
      onClick={onSettingsClick}
      className={`flex items-center justify-center cursor-pointer ${isSettingsActive ? 'text-text-main' : 'text-text-secondary'} hover:text-text-main transition-colors ${styles.iconButton}`}
      style={iconButtonStyle}
      aria-label="Settings"
    >
      <Settings size={18} strokeWidth={1.5} />
    </button>
  </div>
  );
};
