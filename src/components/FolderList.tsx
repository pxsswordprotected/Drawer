import React, { useState } from 'react';
import { useDrawerStore } from '@/store/drawerStore';
import { TrashIcon } from '@/shared/TrashIcon';
import { PlusIcon } from '@/shared/PlusIcon';
import styles from './HighlightsDrawer.module.css';

interface FolderListProps {
  pages: { url: string; title: string }[]; // every page that has highlights
}

const titleClass = `text-base font-light text-text-main ${styles.pageTitle} ${styles.pageTitleClamped}`;

/**
 * The folders view (toolbar folder button), laid out like the page list: a row per folder with
 * the hover icons of a page header (minus on the right deletes it, plus on the left adds a
 * page), and its pages indented below. A folder may be empty.
 */
export const FolderList: React.FC<FolderListProps> = ({ pages }) => {
  const folders = useDrawerStore((s) => s.folders);
  const siteFolders = useDrawerStore((s) => s.siteFolders);
  const createFolder = useDrawerStore((s) => s.createFolder);
  const deleteFolder = useDrawerStore((s) => s.deleteFolder);
  const setSiteFolder = useDrawerStore((s) => s.setSiteFolder);

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [openId, setOpenId] = useState<string | null>(null); // folder showing its pages
  const [addingId, setAddingId] = useState<string | null>(null); // folder showing the pages to add

  const finishCreate = (save: boolean) => {
    if (save && name.trim()) void createFolder(name);
    setCreating(false);
    setName('');
  };

  const unfiled = pages.filter((p) => !siteFolders[p.url]);

  return (
    <div data-folder-list className="px-[38px] py-2">
      <div className="flex h-6 items-center justify-between pt-2">
        <span className="text-text-secondary text-xs">Folders</span>
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
            className="bg-edge text-text-main w-[160px] rounded-sm px-2 text-xs outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="text-text-secondary hover:text-text-main cursor-pointer text-xs transition-colors"
          >
            New folder
          </button>
        )}
      </div>

      {folders.map((folder, i) => {
        const members = pages.filter((p) => siteFolders[p.url] === folder.id);
        const isOpen = openId === folder.id;
        const isAdding = addingId === folder.id;
        return (
          <React.Fragment key={folder.id}>
            {i > 0 && <div className="border-t border-divider mx-auto" style={{ width: '300px' }} />}
            <div className="py-4">
              <div
                data-folder-header
                className={styles.pageHeader}
                onClick={() => {
                  setOpenId(isOpen ? null : folder.id);
                  if (isOpen) setAddingId(null);
                }}
              >
                <button
                  type="button"
                  aria-label={`Add a page to ${folder.name}`}
                  className={styles.pageEditIcon}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenId(folder.id);
                    setAddingId(isAdding ? null : folder.id);
                  }}
                >
                  <PlusIcon size={14} className="text-text-main" />
                </button>
                <p className={titleClass}>
                  {folder.name}
                  <span className="text-text-secondary ml-2 text-xs">{members.length}</span>
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
                <div className="flex flex-col gap-4 pl-4 pt-4">
                  {members.map((page) => (
                    <div key={page.url} className={styles.pageHeader}>
                      <p className={titleClass}>{page.title}</p>
                      <button
                        type="button"
                        aria-label={`Remove ${page.title} from ${folder.name}`}
                        className={styles.pageTrashIcon}
                        onClick={() => void setSiteFolder(page.url, null)}
                      >
                        <TrashIcon size={14} />
                      </button>
                    </div>
                  ))}
                  {isAdding &&
                    (unfiled.length > 0 ? (
                      unfiled.map((page) => (
                        <button
                          key={page.url}
                          type="button"
                          onClick={() => {
                            void setSiteFolder(page.url, folder.id);
                            setAddingId(null);
                          }}
                          className={`text-text-secondary hover:text-text-main cursor-pointer text-left text-base font-light transition-colors ${styles.pageTitle} ${styles.pageTitleClamped}`}
                        >
                          {page.title}
                        </button>
                      ))
                    ) : (
                      <p className="text-text-secondary text-xs">No pages left to add</p>
                    ))}
                </div>
              )}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};
