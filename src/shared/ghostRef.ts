// Module-level refs for drag-to-delete ghost clone.
// DOM nodes and high-frequency pointer positions don't belong in Zustand.

export const ghostNodeRef: { current: HTMLElement | null } = { current: null };
export const pointerPosRef: { current: { x: number; y: number } } = {
  current: { x: 0, y: 0 },
};
