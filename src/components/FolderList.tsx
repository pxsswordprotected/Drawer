import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useDrawerStore } from '@/store/drawerStore';
import { TrashIcon } from '@/shared/TrashIcon';
import { ChevronDownIcon } from '@/shared/ChevronDownIcon';
import styles from './HighlightsDrawer.module.css';

interface FolderListProps {
  pages: { url: string; title: string }[]; // every page that has highlights
  onOpenPage: (url: string) => void; // a page was picked: show it in the list
}

const titleClass = `text-base font-light text-text-main ${styles.pageTitle} ${styles.pageTitleClamped}`;
// An open folder reads like an expanded page group: medium weight, whole name
const openTitleClass = `text-base font-medium text-text-main ${styles.pageTitle}`;

const MENU_MAX_HEIGHT = 200;
const MENU_MIN_HEIGHT = 96;
const MENU_GAP = 8;
const STICKY_BAR_HEIGHT = 40; // the sticky top row (.folderLabel) covers the top of the list

/**
 * Row opening an open folder (always in view, never below the pages), styled like the drawer's
 * add-note row. A custom dropdown of the pages in no folder: the native select's popup cannot be
 * styled. The menu opens below the row, or above it when the list ends too close to fit.
 */
const AddPageRow: React.FC<{
  folderId: string;
  folderName: string;
  hasPages: boolean;
  unfiled: { url: string; title: string }[];
}> = ({ folderId, folderName, hasPages, unfiled }) => {
  const setSiteFolder = useDrawerStore((s) => s.setSiteFolder);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0); // highlighted option; focus stays on the trigger
  const [placement, setPlacement] = useState({ up: false, maxHeight: MENU_MAX_HEIGHT });
  const rowRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const disabled = unfiled.length === 0;

  const openMenu = () => {
    if (disabled) return;
    const row = rowRef.current;
    const scroller = row?.closest('[data-folder-list]')?.parentElement;
    if (row && scroller) {
      const r = row.getBoundingClientRect();
      const s = scroller.getBoundingClientRect();
      const below = s.bottom - r.bottom - MENU_GAP;
      const above = r.top - s.top - STICKY_BAR_HEIGHT - MENU_GAP;
      const up = below < MENU_MIN_HEIGHT && above > below;
      const room = up ? above : below;
      setPlacement({ up, maxHeight: Math.min(MENU_MAX_HEIGHT, Math.max(MENU_MIN_HEIGHT, room)) });
    }
    setActive(0);
    setOpen(true);
  };

  const choose = (url: string) => {
    setOpen(false);
    void setSiteFolder(url, folderId);
  };

  // A press anywhere else in the drawer closes the menu
  useEffect(() => {
    const row = rowRef.current;
    if (!open || !row) return;
    const root: EventTarget = row.getRootNode();
    const closeOutside = (e: Event) => {
      if (!e.composedPath().includes(row)) setOpen(false);
    };
    root.addEventListener('pointerdown', closeOutside);
    return () => root.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  // Keep the highlighted option inside the menu's scroll window
  useLayoutEffect(() => {
    const menu = menuRef.current;
    const item = menu?.children[active] as HTMLElement | undefined;
    if (!open || !menu || !item) return;
    const pad = 4;
    if (item.offsetTop - pad < menu.scrollTop) menu.scrollTop = item.offsetTop - pad;
    else if (item.offsetTop + item.offsetHeight + pad > menu.scrollTop + menu.clientHeight)
      menu.scrollTop = item.offsetTop + item.offsetHeight + pad - menu.clientHeight;
  }, [open, active]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Escape closes the drawer, so only the open menu takes it; the drawer's handler also
    // preventDefaults ArrowUp/Down, so every other key stays here
    if (e.key === 'Escape' && !open) return;
    e.stopPropagation();
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    const last = unfiled.length - 1;
    if (e.key === 'ArrowDown') setActive((i) => Math.min(i + 1, last));
    else if (e.key === 'ArrowUp') setActive((i) => Math.max(i - 1, 0));
    else if (e.key === 'Home') setActive(0);
    else if (e.key === 'End') setActive(last);
    else if (e.key === 'Enter' || e.key === ' ') {
      const page = unfiled[active];
      if (page) choose(page.url);
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      setOpen(false);
      return; // Tab still moves focus on
    } else return;
    e.preventDefault();
  };

  return (
    <div
      ref={rowRef}
      onKeyDown={onKeyDown}
      className="relative flex items-center border-b border-divider py-3"
    >
      <button
        type="button"
        role="combobox"
        aria-label={`Add a page to ${folderName}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        className={`flex w-full cursor-pointer items-center justify-between gap-2 text-left text-sm outline-none transition-colors hover:text-text-main focus-visible:text-text-main disabled:cursor-default disabled:hover:text-text-secondary ${open ? 'text-text-main' : 'text-text-secondary'}`}
      >
        <span className="truncate">{hasPages ? 'Add page' : 'No pages yet'}</span>
        {!disabled && (
          <ChevronDownIcon
            size={16}
            className={`shrink-0 ${styles.dropdownChevron} ${open ? styles.dropdownChevronOpen : ''}`}
          />
        )}
      </button>
      {open && (
        <ul
          ref={menuRef}
          id={listId}
          role="listbox"
          aria-label={`Pages to add to ${folderName}`}
          style={{ maxHeight: placement.maxHeight }}
          className={`absolute left-0 right-0 z-10 overflow-y-auto rounded-lg bg-button p-1 shadow-bevel-raised ring-1 ring-edge [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${placement.up ? 'bottom-full mb-2' : 'top-full mt-2'}`}
        >
          {unfiled.map((page, i) => (
            <li
              key={page.url}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              title={page.title}
              onMouseDown={(e) => e.preventDefault()}
              onMouseMove={() => i !== active && setActive(i)}
              onClick={() => choose(page.url)}
              className={`cursor-pointer truncate rounded px-2 py-2 text-sm text-text-main ${i === active ? 'bg-button-hover' : ''}`}
            >
              {page.title}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/**
 * The folders view (toolbar folder button), laid out like the page list: a sticky top row with
 * the new-folder input (it turns into the open folder's name while you scroll through that
 * folder), then a row per folder with the hover minus icon of a page header (deletes it). An open
 * folder shows a dropdown row to add a page, then its pages, each with a divider. A folder may be
 * empty.
 */
export const FolderList: React.FC<FolderListProps> = ({ pages, onOpenPage }) => {
  const folders = useDrawerStore((s) => s.folders);
  const siteFolders = useDrawerStore((s) => s.siteFolders);
  const createFolder = useDrawerStore((s) => s.createFolder);
  const deleteFolder = useDrawerStore((s) => s.deleteFolder);
  const setSiteFolder = useDrawerStore((s) => s.setSiteFolder);

  const [name, setName] = useState('');
  const [openId, setOpenId] = useState<string | null>(null); // folder showing its pages
  const [pinned, setPinned] = useState(false); // open folder's header is scrolled under the top row
  const barRef = useRef<HTMLDivElement>(null);
  const openRef = useRef<HTMLDivElement>(null);

  const submit = () => {
    if (!name.trim()) return;
    void createFolder(name);
    setName('');
  };

  const unfiled = pages.filter((p) => !siteFolders[p.url]);
  const openFolder = folders.find((f) => f.id === openId);

  // The row shows the open folder's name while that folder's header is hidden under it but some
  // of the folder's pages are still in view.
  const syncPinned = () => {
    const bar = barRef.current;
    const section = openRef.current;
    const header = section?.querySelector('[data-folder-header]');
    let next = false;
    if (bar && section && header) {
      const edge = bar.getBoundingClientRect().bottom;
      next =
        header.getBoundingClientRect().bottom <= edge &&
        section.getBoundingClientRect().bottom > edge;
    }
    setPinned(next);
  };
  // After every render: opening, closing and page moves change the layout without a scroll event
  useLayoutEffect(syncPinned);

  return (
    <div className={`${styles.scrollContainer} h-full`} onScroll={syncPinned}>
      <div data-folder-list className="px-[38px] pb-2">
        {/* Sticky top-left row. Normally the new-folder input, styled like the drawer's note input:
            Enter adds the folder and the field stays put for the next one. While you scroll
            through an open folder (its header out of view) it shows that folder's name instead. */}
        <div ref={barRef} className={styles.folderLabel}>
          {pinned && openFolder ? (
            <span className="min-w-0 truncate text-sm text-text-secondary">{openFolder.name}</span>
          ) : (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                // Escape closes the drawer, so only a draft takes it (clearing it); every other
                // key stays out of the drawer's handlers
                if (e.key === 'Escape' && !name) return;
                e.stopPropagation();
                if (e.key === 'Enter') submit();
                else if (e.key === 'Escape') setName('');
              }}
              aria-label="New folder"
              placeholder="New folder"
              className={`w-full bg-transparent text-sm outline-none placeholder:text-text-secondary focus:text-text-main ${name ? 'text-text-main' : 'text-text-secondary'}`}
            />
          )}
        </div>

        {folders.map((folder, i) => {
          const members = pages.filter((p) => siteFolders[p.url] === folder.id);
          const isOpen = openId === folder.id;
          return (
            <React.Fragment key={folder.id}>
              {i > 0 && openId !== folders[i - 1].id && (
                <div className="border-t border-divider mx-auto" style={{ width: '300px' }} />
              )}
              <div ref={isOpen ? openRef : undefined} className="py-4">
                <div
                  data-folder-header
                  className={`${styles.pageHeader} ${styles.folderHeader} ${openId && !isOpen ? styles.folderHeaderDim : ''}`}
                  onClick={() => setOpenId(isOpen ? null : folder.id)}
                >
                  <p className={isOpen ? openTitleClass : titleClass}>
                    {folder.name}
                    <span className="text-text-secondary ml-2 inline-block -translate-y-[0.6px] text-xs">
                      {members.length}
                    </span>
                  </p>
                  <button
                    type="button"
                    aria-label={`Delete folder ${folder.name}`}
                    className={styles.pageTrashIcon}
                    onClick={(e) => {
                      e.stopPropagation();
                      void deleteFolder(folder.id);
                    }}
                  >
                    <TrashIcon size={14} />
                  </button>
                </div>

                {isOpen && (
                  <>
                    <AddPageRow
                      folderId={folder.id}
                      folderName={folder.name}
                      hasPages={members.length > 0}
                      unfiled={unfiled}
                    />
                    {members.map((page) => (
                      <div key={page.url} className="border-b border-divider py-4">
                        <div
                          data-folder-page
                          className={`group ${styles.pageHeader}`}
                          onClick={() => onOpenPage(page.url)}
                        >
                          <p className={`${titleClass} ${styles.folderPageTitle}`}>{page.title}</p>
                          <button
                            type="button"
                            aria-label={`Remove ${page.title} from ${folder.name}`}
                            className={styles.pageTrashIcon}
                            onClick={(e) => {
                              e.stopPropagation();
                              void setSiteFolder(page.url, null);
                            }}
                          >
                            <TrashIcon size={14} tone="neutral" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
