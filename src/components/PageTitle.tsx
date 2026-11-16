import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useDrawerStore } from '@/store/drawerStore';
import { EditIcon } from '@/shared/EditIcon';
import styles from './HighlightsDrawer.module.css';

interface PageTitleProps {
  url: string;
  title: string; // What the header shows now (custom title, else the saved one)
  isCollapsed: boolean;
  editable: boolean;
}

/**
 * A page group's title. Hovering the header shows an edit icon in the left margin; clicking it
 * turns the title into a text field. Enter or blur saves, Escape cancels, and an empty title
 * goes back to the title saved with the page.
 */
export const PageTitle: React.FC<PageTitleProps> = ({ url, title, isCollapsed, editable }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(title);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Enter, Escape and blur can all end an edit (unmounting the field may also fire blur);
  // only the first one counts.
  const editActiveRef = useRef(false);
  const setPageTitle = useDrawerStore((s) => s.setPageTitle);

  const finish = useCallback(
    (save: boolean) => {
      if (!editActiveRef.current) return;
      editActiveRef.current = false;
      setIsEditing(false);
      const trimmed = value.trim();
      if (save && trimmed !== title) setPageTitle(url, trimmed);
    },
    [value, title, url, setPageTitle]
  );

  const startEditing = (e: React.MouseEvent) => {
    e.stopPropagation(); // the header toggles its group on click
    editActiveRef.current = true;
    setValue(title);
    setIsEditing(true);
  };

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!isEditing || !textarea) return;
    textarea.focus();
    textarea.select();
  }, [isEditing]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [value, isEditing]);

  const weight = isCollapsed ? 'font-light' : 'font-medium';

  return (
    <>
      {editable && !isEditing && (
        <div className={styles.pageEditIcon} onClick={startEditing}>
          <EditIcon size={14} className="text-text-main" />
        </div>
      )}
      {isEditing ? (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            // Keep typing keys away from the drawer (Escape closes it, arrows move its selection)
            e.stopPropagation();
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              finish(true);
            } else if (e.key === 'Escape') {
              finish(false);
            }
          }}
          onBlur={() => finish(true)}
          onClick={(e) => e.stopPropagation()}
          aria-label="Page title"
          rows={1}
          className={`relative block w-full resize-none rounded-sm bg-edge text-base text-text-main ring-4 ring-edge outline-none ${weight}`}
        />
      ) : (
        <p
          className={`text-base ${styles.pageTitle} ${isCollapsed ? styles.pageTitleClamped : ''} ${weight} text-text-main`}
        >
          {title}
        </p>
      )}
    </>
  );
};
