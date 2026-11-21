import { useState, type DragEvent, type KeyboardEvent } from 'react';
import { GripVertical } from 'lucide-react';
import { zoneFromPosition, type DropZone } from '@/lib/dragSort';

interface Options {
  /** called when a row is dropped on another one */
  onDrop: (dragId: string, targetId: string, zone: DropZone) => void;
  /** false = that drop is not allowed (no highlight, no drop) */
  canDrop?: (dragId: string, targetId: string, zone: DropZone) => boolean;
  /** true = the row can hold others, so its middle is an "inside" zone */
  allowInside?: (targetId: string) => boolean;
}

/**
 * Drag-and-drop for rows: the grip is what you drag (so buttons, switches and text stay normal), a row shows a line
 * above or below (or a frame around it for "inside") while you hover. The same grip works with the keyboard
 * (focus it, then the up and down arrow keys).
 */
export function useDragRows({ onDrop, canDrop, allowInside }: Options) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<{ id: string; zone: DropZone } | null>(null);

  const reset = () => {
    setDragging(null);
    setOver(null);
  };

  const rowProps = (id: string) => ({
    'data-drag-row': id,
    onDragOver: (e: DragEvent<HTMLElement>) => {
      if (!dragging || dragging === id) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const zone = zoneFromPosition(e.clientY - rect.top, rect.height, allowInside?.(id) ?? false);
      if (canDrop && !canDrop(dragging, id, zone)) {
        if (over?.id === id) setOver(null);
        return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (over?.id !== id || over.zone !== zone) setOver({ id, zone });
    },
    onDragLeave: (e: DragEvent<HTMLElement>) => {
      if (over?.id === id && !e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null);
    },
    onDrop: (e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      if (dragging && over && over.id === id) onDrop(dragging, id, over.zone);
      reset();
    },
  });

  const rowClass = (id: string) => {
    if (dragging === id) return 'opacity-40';
    if (over?.id !== id) return '';
    if (over.zone === 'before') return 'shadow-[inset_0_3px_0_0_#2563eb]';
    if (over.zone === 'after') return 'shadow-[inset_0_-3px_0_0_#2563eb]';
    return 'bg-blue-50 ring-2 ring-inset ring-blue-400';
  };

  const handleProps = (id: string, label: string, onStep?: (dir: -1 | 1) => void) => ({
    draggable: true,
    title: 'اسحب للترتيب',
    'aria-label': `اسحب ${label} للترتيب`,
    onDragStart: (e: DragEvent<HTMLElement>) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', id);
      const row = e.currentTarget.closest('[data-drag-row]');
      if (row) e.dataTransfer.setDragImage(row, 20, 20);
      setDragging(id);
    },
    onDragEnd: reset,
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (!onStep) return;
      if (e.key === 'ArrowUp') { e.preventDefault(); onStep(-1); }
      if (e.key === 'ArrowDown') { e.preventDefault(); onStep(1); }
    },
  });

  return { rowProps, rowClass, handleProps, dragging };
}

/** The little grip drawn on every draggable row. */
export function Grip({ className = '' }: { className?: string }) {
  return <GripVertical size={16} className={`text-gray-400 ${className}`} aria-hidden />;
}

export const gripButtonClass = 'p-1.5 rounded-lg cursor-grab active:cursor-grabbing hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-blue-300 flex-shrink-0';
