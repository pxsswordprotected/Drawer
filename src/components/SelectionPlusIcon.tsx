import React, { useRef, useEffect } from 'react';

interface SelectionPlusIconProps {
  visible: boolean;
  x: number;
  y: number;
  onClick: () => void;
  disabled?: boolean;
  isSuccess?: boolean;
  isDismissing?: boolean;
}

export const SelectionPlusIcon: React.FC<SelectionPlusIconProps> = ({
  visible,
  x,
  y,
  onClick,
  disabled = false,
  isSuccess = false,
  isDismissing = false,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);

  // Trigger morph animation when isSuccess flips to true
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    if (isSuccess) {
      const animations = svg.querySelectorAll('animate[data-anim="toCheck"]');
      animations.forEach((anim) => (anim as SVGAnimateElement).beginElement());
      svg.style.color = '#14C935';
    }

    // Cleanup: reset to plus state
    return () => {
      if (!svg) return;
      const polylines = svg.querySelectorAll('polyline');
      if (polylines[0]) polylines[0].setAttribute('points', '3,8 13,8');
      if (polylines[1]) polylines[1].setAttribute('points', '8,3 8,13');
      svg.style.color = '';
    };
  }, [isSuccess]);

  if (!visible) return null;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      data-selection-plus-icon="true"
      className="fixed z-[999] bg-bg-main rounded-full p-1.5 shadow-lg hover:bg-[#2a2a2a] cursor-pointer border border-white/20 disabled:cursor-default"
      style={{
        left: `${x}px`,
        top: `${y}px`,
        transition:
          'opacity 150ms cubic-bezier(.19, 1, .22, 1), transform 150ms cubic-bezier(.19, 1, .22, 1), color 200ms ease',
        opacity: isDismissing ? 0 : 1,
        transform: isDismissing ? 'scale(0.9)' : 'scale(1)',
      }}
    >
      <svg
        ref={svgRef}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 16 16"
        width="16"
        height="16"
        className="text-text-main"
        style={{ transition: 'color 100ms ease' }}
      >
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        >
          {/* STROKE 1: Horizontal Bar -> Short Check Leg */}
          <polyline points="3,8 13,8">
            <animate
              data-anim="toCheck"
              attributeName="points"
              dur="350ms"
              begin="indefinite"
              fill="freeze"
              calcMode="spline"
              keyTimes="0;1"
              keySplines="0.19 1 0.22 1"
              to="3,8 6,11"
            />
            <animate
              data-anim="toPlus"
              attributeName="points"
              dur="200ms"
              begin="indefinite"
              fill="freeze"
              calcMode="spline"
              keyTimes="0;1"
              keySplines="0.19 1 0.22 1"
              to="3,8 13,8"
            />
          </polyline>

          {/* STROKE 2: Vertical Bar -> Long Check Leg */}
          <polyline points="8,3 8,13">
            <animate
              data-anim="toCheck"
              attributeName="points"
              dur="350ms"
              begin="indefinite"
              fill="freeze"
              calcMode="spline"
              keyTimes="0;1"
              keySplines="0.19 1 0.22 1"
              to="6,11 13,4"
            />
            <animate
              data-anim="toPlus"
              attributeName="points"
              dur="200ms"
              begin="indefinite"
              fill="freeze"
              calcMode="spline"
              keyTimes="0;1"
              keySplines="0.19 1 0.22 1"
              to="8,3 8,13"
            />
          </polyline>

          {/* STROKE 3: Utility Stroke */}
          <polyline points="8,8 8,8" opacity="0">
            <animate
              data-anim="toCheck"
              attributeName="opacity"
              dur="1ms"
              begin="indefinite"
              fill="freeze"
              to="0"
            />
            <animate
              data-anim="toPlus"
              attributeName="opacity"
              dur="1ms"
              begin="indefinite"
              fill="freeze"
              to="0"
            />
          </polyline>
        </g>
      </svg>
    </button>
  );
};
