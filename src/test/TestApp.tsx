import React from 'react';
import { DraggableLogo } from '../components/DraggableLogo';
import { HighlightsDrawer } from '../components/HighlightsDrawer';
import { Agentation } from 'agentation';

export const TestApp: React.FC = () => {
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <div className="w-1/2 bg-white" />
      <div className="w-1/2 bg-bg-main" />
      <DraggableLogo />
      <HighlightsDrawer />
    </div>
  );
};
