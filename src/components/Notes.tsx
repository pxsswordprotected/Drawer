import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useDrawerStore } from '@/store/drawerStore';

export interface NoteInputProps {
  highlightId: string;
  hasNotes: boolean;
  onNoteAdded: () => void;
}

export const NoteInput: React.FC<NoteInputProps> = ({ highlightId, hasNotes, onNoteAdded }) => {
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

export interface NoteItemProps {
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
