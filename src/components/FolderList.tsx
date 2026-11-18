import React, { useState } from 'react';
import { useDrawerStore } from '@/store/drawerStore';

interface FolderListProps {
  pages: { url: string; title: string }[]; // every page that has highlights
}

/**
 * Folders above the page list: make one, open it to see its pages, take a page out or put one
 * in. A folder may be empty. Plain list for now; the page list below is unchanged.
 */
export const FolderList: React.FC<FolderListProps> = ({ pages }) => {
  const folders = useDrawerStore((s) => s.folders);
  const siteFolders = useDrawerStore((s) => s.siteFolders);
  const createFolder = useDrawerStore((s) => s.createFolder);
  const deleteFolder = useDrawerStore((s) => s.deleteFolder);
  const setSiteFolder = useDrawerStore((s) => s.setSiteFolder);

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const finishCreate = (save: boolean) => {
    if (save && name.trim()) void createFolder(name);
    setCreating(false);
    setName('');
  };

  const unfiled = pages.filter((p) => !siteFolders[p.url]);

  return (
    <div data-folder-list className="flex flex-col gap-2 px-[38px] pt-4">
      <div className="flex h-6 items-center justify-between">
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

      {folders.map((folder) => {
        const members = pages.filter((p) => siteFolders[p.url] === folder.id);
        const isOpen = openId === folder.id;
        return (
          <div key={folder.id} className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpenId(isOpen ? null : folder.id)}
                className="text-text-main min-w-0 cursor-pointer truncate text-left text-sm"
              >
                {folder.name}
                <span className="text-text-secondary ml-2 text-xs">{members.length}</span>
              </button>
              <button
                type="button"
                aria-label={`Delete folder ${folder.name}`}
                onClick={() => void deleteFolder(folder.id)}
                className="text-text-secondary hover:text-text-main cursor-pointer text-xs transition-colors"
              >
                Delete
              </button>
            </div>
            {isOpen && (
              <div className="flex flex-col gap-1 pl-4">
                {members.map((page) => (
                  <div key={page.url} className="flex items-center justify-between gap-2">
                    <span className="text-text-secondary min-w-0 truncate text-xs">{page.title}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${page.title} from folder`}
                      onClick={() => void setSiteFolder(page.url, null)}
                      className="text-text-secondary hover:text-text-main cursor-pointer text-xs transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                {unfiled.length > 0 && (
                  <select
                    aria-label={`Add a page to ${folder.name}`}
                    value=""
                    onChange={(e) => e.target.value && void setSiteFolder(e.target.value, folder.id)}
                    className="bg-button text-text-main w-full cursor-pointer rounded-sm text-xs"
                  >
                    <option value="">Add page…</option>
                    {unfiled.map((page) => (
                      <option key={page.url} value={page.url}>
                        {page.title}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
