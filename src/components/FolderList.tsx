import React, { useLayoutEffect, useRef, useState } from 'react';
import { useDrawerStore } from '@/store/drawerStore';
import { TrashIcon } from '@/shared/TrashIcon';
import styles from './HighlightsDrawer.module.css';

interface FolderListProps {
  pages: { url: string; title: string }[]; // every page that has highlights
  onOpenPage: (url: string) => void; // a page was picked: show it in the list
}

const titleClass = `text-base font-light text-text-main ${styles.pageTitle} ${styles.pageTitleClamped}`;
// An open folder reads like an expanded page group: medium weight, whole name
const openTitleClass = `text-base font-medium text-text-main ${styles.pageTitle}`;

/** Dropdown row opening an open folder (always in view, never below the pages), styled like the drawer's add-note row. */
const AddPageRow: React.FC<{
  folderId: string;
  folderName: string;
  hasPages: boolean;
  unfiled: { url: string; title: string }[];
}> = ({ folderId, folderName, hasPages, unfiled }) => {
  const setSiteFolder = useDrawerStore((s) => s.setSiteFolder);
  return (
    <div className="border-b border-divider py-3 flex items-center">
      <select
        aria-label={`Add a page to ${folderName}`}
        value=""
        disabled={unfiled.length === 0}
        onChange={(e) => {
          if (e.target.value) void setSiteFolder(e.target.value, folderId);
        }}
        // The drawer's key handler preventDefaults ArrowUp/Down, which would break the native select
        onKeyDown={(e) => e.stopPropagation()}
        className="-ml-1 w-[calc(100%+4px)] cursor-pointer bg-transparent text-sm text-text-secondary outline-none focus:text-text-main disabled:cursor-default [color-scheme:dark]"
      >
        <option value="" disabled>
          {hasPages ? 'Add page' : 'No pages yet'}
        </option>
        {unfiled.map((page) => (
          <option key={page.url} value={page.url}>
            {page.title}
          </option>
        ))}
      </select>
    </div>
  );
};

/**
 * The folders view (toolbar folder button), laid out like the page list: a row per folder with
 * the hover minus icon of a page header (deletes it), and its pages indented below, each with a
 * divider and followed by a dropdown row to add a page. A folder may be empty.
 */
export const FolderList: React.FC<FolderListProps> = ({ pages, onOpenPage }) => {
  const folders = useDrawerStore((s) => s.folders);
  const siteFolders = useDrawerStore((s) => s.siteFolders);
  const createFolder = useDrawerStore((s) => s.createFolder);
  const deleteFolder = useDrawerStore((s) => s.deleteFolder);
  const setSiteFolder = useDrawerStore((s) => s.setSiteFolder);

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [openId, setOpenId] = useState<string | null>(null); // folder showing its pages
  const [pinned, setPinned] = useState(false); // open folder's header is scrolled under the island
  const barRef = useRef<HTMLDivElement>(null);
  const openRef = useRef<HTMLDivElement>(null);

  const finishCreate = (save: boolean) => {
    if (save && name.trim()) void createFolder(name);
    setCreating(false);
    setName('');
  };

  const unfiled = pages.filter((p) => !siteFolders[p.url]);
  const openFolder = folders.find((f) => f.id === openId);

  // The open folder's name replaces "Folders" while its header is hidden under the island but
  // some of its pages are still in view.
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
        {/* Sticky island: "Folders" turns into the open folder's name once its header has scrolled away */}
        <div
          ref={barRef}
          className={`${styles.folderLabel} justify-between gap-4 text-text-secondary text-xs`}
        >
          <span className="min-w-0 truncate">
            {pinned && openFolder ? openFolder.name : 'Folders'}
          </span>
          {creating ? (
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                // Keep typing keys away from the drawer (Escape closes it)
                e.stopPropagation();
                if (e.key === 'Enter') finishCreate(true);
                else if (e.key === 'Escape') finishCreate(false);
              }}
              onBlur={() => finishCreate(true)}
              aria-label="Folder name"
              placeholder="Folder name"
              className="bg-edge text-text-main w-[160px] shrink-0 rounded-sm px-2 py-0.5 text-xs outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="text-text-secondary hover:text-text-main shrink-0 cursor-pointer text-xs transition-colors"
            >
              New folder
            </button>
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
