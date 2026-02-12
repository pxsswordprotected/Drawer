import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowLeft } from 'lucide-react';
import shave from 'shave';
import { Highlight } from '@/shared/types';
import { useDrawerStore } from '@/store/drawerStore';
import styles from './HighlightDetailView.module.css';

interface NoteInputProps {
  highlightId: string;
  hasNotes: boolean;
  onNoteAdded: () => void;
}

const NoteInput: React.FC<NoteInputProps> = ({ highlightId, hasNotes, onNoteAdded }) => {
  const [value, setValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const addNote = useDrawerStore((s) => s.addNote);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(async () => {
    const trimmed = value.trim();
    if (!trimmed) return;

    await addNote(highlightId, trimmed);
    setValue('');
    onNoteAdded();
  }, [value, highlightId, addNote, onNoteAdded]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      placeholder={hasNotes ? 'Add note' : 'No notes yet'}
      className="w-full bg-transparent text-text-secondary text-sm resize-none outline-none"
      style={{
        minHeight: '20px',
        color: value || isFocused ? '#F5F5F5' : '#8C8C8C',
      }}
      rows={1}
    />
  );
};

interface HighlightDetailViewProps {
  highlight: Highlight;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const months = [
    'JAN',
    'FEB',
    'MAR',
    'APR',
    'MAY',
    'JUN',
    'JUL',
    'AUG',
    'SEP',
    'OCT',
    'NOV',
    'DEC',
  ];

  const day = days[date.getDay()];
  const month = months[date.getMonth()];
  const dateNum = date.getDate();

  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;

  const minuteStr = minutes > 0 ? `:${minutes.toString().padStart(2, '0')}` : '';

  return `${day} ${month} ${dateNum}  ${hours}${minuteStr}${ampm}`;
}

interface NoteItemProps {
  noteId: string;
  highlightId: string;
  text: string;
}

const NoteItem: React.FC<NoteItemProps> = ({ noteId, highlightId, text }) => {
  const [value, setValue] = useState(text);
  const [isEditing, setIsEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const updateNote = useDrawerStore((s) => s.updateNote);
  const deleteNote = useDrawerStore((s) => s.deleteNote);

  const handleSubmit = useCallback(async () => {
    const trimmed = value.trim();

    // If empty, delete the note
    if (!trimmed) {
      await deleteNote(highlightId, noteId);
      return;
    }

    // If unchanged, just exit editing
    if (trimmed === text) {
      setIsEditing(false);
      return;
    }

    // Otherwise, update the note
    await updateNote(highlightId, noteId, trimmed);
    setIsEditing(false);
  }, [value, text, highlightId, noteId, updateNote, deleteNote]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      } else if (e.key === 'Escape') {
        setValue(text);
        setIsEditing(false);
        textareaRef.current?.blur();
      }
    },
    [handleSubmit, text]
  );

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [value]);

  return (
    <div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsEditing(true)}
        onBlur={handleSubmit}
        className="w-full bg-transparent text-text-main text-sm resize-none outline-none"
        style={{
          minHeight: '20px',
          cursor: 'text',
        }}
        rows={1}
      />
    </div>
  );
};

export const HighlightDetailView: React.FC<HighlightDetailViewProps> = ({ highlight }) => {
  const clearSelectedHighlight = useDrawerStore((s) => s.clearSelectedHighlight);
  const [highlightExpanded, setHighlightExpanded] = useState(false);
  const highlightTextRef = useRef<HTMLSpanElement>(null);
  const originalTextRef = useRef<string>(highlight.text);

  // Sort notes by timestamp descending (most recent first)
  const sortedNotes = [...highlight.notes].sort((a, b) => b.timestamp - a.timestamp);

  useEffect(() => {
    if (highlightTextRef.current && !highlightExpanded) {
      // Apply shave with 3 lines (assuming line-height of 1.5, so 3 * 1.5 = 4.5em = 72px for 16px base)
      shave(highlightTextRef.current, 72);
    } else if (highlightTextRef.current && highlightExpanded) {
      // Restore original text
      highlightTextRef.current.textContent = originalTextRef.current;
    }
  }, [highlightExpanded, highlight.text]);

  return (
    <div className="px-[38px]" style={{ paddingTop: '20px', paddingBottom: '20px' }}>
      {/* Back button + date */}
      <button
        onClick={clearSelectedHighlight}
        className="flex items-center gap-2 mb-4 text-text-secondary text-sm uppercase tracking-wide hover:text-text-main transition-colors duration-fast"
      >
        <ArrowLeft size={16} />
        <span>{formatDate(highlight.timestamp)}</span>
      </button>

      {/* Highlight text block */}
      <div className="mb-4">
        <p className="text-base leading-relaxed">
          <span
            ref={highlightTextRef}
            className="bg-white text-bg-main"
            style={{
              padding: '3px 4px',
              boxDecorationBreak: 'clone',
              WebkitBoxDecorationBreak: 'clone',
              cursor: 'pointer',
            }}
            onClick={() => setHighlightExpanded((prev) => !prev)}
          >
            {highlight.text}
          </span>
        </p>
      </div>

      {/* Notes section */}
      <p className="text-text-secondary text-xs mb-1">Notes</p>

      <div className="space-y-0">
        {/* Note input */}
        <div className="py-3">
          <NoteInput highlightId={highlight.id} hasNotes={sortedNotes.length > 0} onNoteAdded={() => {}} />
        </div>

        {sortedNotes.length > 0 && <div className="border-t border-divider" />}

        {sortedNotes.map((note, index) => (
          <React.Fragment key={note.id}>
            <div className="py-3">
              <NoteItem noteId={note.id} highlightId={highlight.id} text={note.text} />
            </div>
            {index < sortedNotes.length - 1 && <div className="border-t border-divider" />}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};
