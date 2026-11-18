import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useDrawerStore } from '@/store/drawerStore';
import { Note } from '@/shared/types';

interface NoteInputProps {
  highlightId: string;
  hasNotes: boolean;
}

export const NoteInput: React.FC<NoteInputProps> = ({ highlightId, hasNotes }) => {
  const [value, setValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const addNote = useDrawerStore((s) => s.addNote);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(async () => {
    const trimmed = value.trim();
    if (!trimmed) return;

    await addNote(highlightId, trimmed);
    setValue('');
  }, [value, highlightId, addNote]);

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

interface NoteItemProps {
  noteId: string;
  highlightId: string;
  text: string;
}

export const NoteItem: React.FC<NoteItemProps> = ({ noteId, highlightId, text }) => {
  const [value, setValue] = useState(text);
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

    // If unchanged, nothing to save
    if (trimmed === text) return;

    // Otherwise, update the note
    await updateNote(highlightId, noteId, trimmed);
  }, [value, text, highlightId, noteId, updateNote, deleteNote]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      } else if (e.key === 'Backspace' && !value) {
        e.preventDefault();
        handleSubmit();
      } else if (e.key === 'Escape') {
        setValue(text);
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
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={handleSubmit}
      className="w-full bg-transparent text-text-main text-sm resize-none outline-none"
      style={{
        minHeight: '20px',
        cursor: 'text',
      }}
      rows={1}
    />
  );
};

export const newestFirst = (notes: Note[]): Note[] =>
  [...notes].sort((a, b) => b.timestamp - a.timestamp);

export const NotesLabel: React.FC = () => (
  <p className="text-text-secondary text-xs mb-1" style={{ marginTop: '12px' }}>
    Notes
  </p>
);

export const AddNoteRow: React.FC<{ highlightId: string; hasNotes: boolean }> = ({
  highlightId,
  hasNotes,
}) => (
  <div className="py-3 flex items-center">
    <NoteInput highlightId={highlightId} hasNotes={hasNotes} />
  </div>
);

interface NoteRowsProps {
  highlightId: string;
  notes: Note[]; // rendered in the order given
  borderSide: 'top' | 'bottom'; // which edge of each row carries the divider; the last row has none
}

export const NoteRows: React.FC<NoteRowsProps> = ({ highlightId, notes, borderSide }) => (
  <>
    {notes.map((note, i) => (
      <div
        key={note.id}
        className={`py-3 flex items-center ${
          i < notes.length - 1
            ? borderSide === 'bottom'
              ? 'border-b border-divider'
              : 'border-t border-divider'
            : ''
        }`}
      >
        <NoteItem noteId={note.id} highlightId={highlightId} text={note.text} />
      </div>
    ))}
  </>
);

interface NotesSectionProps {
  highlightId: string;
  notes: Note[];
}

/** "Notes" label, add-note input and the note list (newest first); the drawer's layout */
export const NotesSection: React.FC<NotesSectionProps> = ({ highlightId, notes }) => {
  const sortedNotes = useMemo(() => newestFirst(notes), [notes]);

  return (
    <>
      <NotesLabel />

      <div className="space-y-0">
        <AddNoteRow highlightId={highlightId} hasNotes={sortedNotes.length > 0} />

        {sortedNotes.length > 0 && <div className="border-t border-divider" />}

        <NoteRows highlightId={highlightId} notes={sortedNotes} borderSide="bottom" />
      </div>
    </>
  );
};
