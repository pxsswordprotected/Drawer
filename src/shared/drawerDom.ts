let drawerEl: HTMLElement | null = null;

export function setDrawerElement(el: HTMLElement | null) {
  drawerEl = el;
}

export function getDrawerElement() {
  return drawerEl;
}

export interface DrawerLayout {
  width: number;
  height: number;
  side: 'left' | 'right';
  offset: number; // horizontal offset from logo center to drawer left edge
}

let drawerLayout: DrawerLayout | null = null;

export function setDrawerLayout(layout: DrawerLayout | null) {
  drawerLayout = layout;
}

export function getDrawerLayout() {
  return drawerLayout;
}
