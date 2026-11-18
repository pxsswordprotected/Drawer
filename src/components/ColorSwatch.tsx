import { HIGHLIGHT_COLORS } from '@/shared/constants';

export const COLOR_OPTIONS = [
  { name: 'Yellow', value: HIGHLIGHT_COLORS.yellow },
  { name: 'Green', value: HIGHLIGHT_COLORS.green },
  { name: 'Orange', value: HIGHLIGHT_COLORS.orange },
  { name: 'Blue', value: HIGHLIGHT_COLORS.blue },
  { name: 'Pink', value: HIGHLIGHT_COLORS.pink },
  { name: 'Purple', value: HIGHLIGHT_COLORS.purple },
] as const;

/** Inline style of a highlighter-stroke swatch button of `size` px */
export const highlighterStyle = (color: string, isSelected: boolean, size = 20) => ({
  width: `${size}px`,
  height: `${size}px`,
  backgroundColor: 'transparent',
  backgroundImage: `linear-gradient(175deg, ${color} 20%, color-mix(in srgb, ${color}, white 30%) 50%, ${color} 80%), linear-gradient(83.4deg, ${color}, color-mix(in srgb, ${color}, white 20%) 4%, color-mix(in srgb, ${color}, white 10%) 96%, ${color})`,
  backgroundSize: '100% 100%',
  borderRadius: '0.1em 0.5em 0.15em 0.4em / 0.5em 0.1em 0.4em 0.15em',
  boxShadow: `1px 1px 3px color-mix(in srgb, ${color}, transparent 85%)`,
  outline: isSelected ? '2px solid #F5F5F5' : 'none',
  outlineOffset: '2px',
  border: 'none',
  padding: 0,
});
