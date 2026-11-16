import { produce } from 'immer';
import { create } from 'zustand';
import type { Part, Vec3 } from '@viz/shared';
import { api } from '../api';

export type PartSelection = { kind: 'pin'; id: string } | { kind: 'strip'; id: string; index?: number } | null;
export type PartTool = 'select' | 'pin' | 'strip';

interface PartEditorState {
  part: Part | null;
  /** Last version known to be stored. */
  saved: Part | null;
  past: Part[];
  future: Part[];
  selection: PartSelection;
  tool: PartTool;
  /** First click of the strip tool. */
  stripStart: { point: Vec3; normal: Vec3 } | null;
  hoverPinId: string | null;
  showNames: boolean;
  keepPitch: boolean;
  saveState: 'saved' | 'unsaved' | 'saving' | 'error';
}

export const usePartEditor = create<PartEditorState>(() => ({
  part: null,
  saved: null,
  past: [],
  future: [],
  selection: null,
  tool: 'select',
  stripStart: null,
  hoverPinId: null,
  showNames: false,
  keepPitch: true,
  saveState: 'saved',
}));

const get = usePartEditor.getState;
const set = usePartEditor.setState;
// End-to-end tests read the editor state through this.
(window as unknown as { __vizPartEditor?: unknown }).__vizPartEditor = usePartEditor;

export function openPart(part: Part): void {
  set({ part, saved: part, past: [], future: [], selection: null, tool: 'select', stripStart: null, hoverPinId: null, saveState: 'saved' });
}

export function mutatePart(fn: (part: Part) => void, transient = false): void {
  const s = get();
  if (!s.part || s.part.builtin) return;
  const next = produce(s.part, fn);
  if (next === s.part) return;
  set(transient ? { part: next } : { part: next, past: [...s.past.slice(-199), s.part], future: [] });
}

let gestureBase: Part | null = null;

export function beginPartGesture(): void {
  const s = get();
  if (!s.part || gestureBase) return;
  gestureBase = s.part;
  set({ past: [...s.past.slice(-199), s.part], future: [] });
}

export function endPartGesture(): void {
  const s = get();
  if (gestureBase && gestureBase === s.part) set({ past: s.past.slice(0, -1) });
  gestureBase = null;
}

function keep(part: Part, sel: PartSelection): PartSelection {
  if (!sel) return null;
  if (sel.kind === 'pin') return part.pins.some((p) => p.id === sel.id) ? sel : null;
  return part.strips.some((st) => st.id === sel.id) ? sel : null;
}

export function undoPart(): void {
  const s = get();
  const prev = s.past.at(-1);
  if (!prev || !s.part) return;
  set({ part: prev, past: s.past.slice(0, -1), future: [s.part, ...s.future], selection: keep(prev, s.selection), stripStart: null });
}

export function redoPart(): void {
  const s = get();
  const next = s.future[0];
  if (!next || !s.part) return;
  set({ part: next, past: [...s.past, s.part], future: s.future.slice(1), selection: keep(next, s.selection), stripStart: null });
}

export function setPartTool(tool: PartTool): void {
  set({ tool, stripStart: null });
}

// Autosave

let timer: ReturnType<typeof setTimeout> | undefined;
let inFlight = false;

export function schedulePartSave(delay = 1200): void {
  const s = get();
  if (!s.part || s.part.builtin) return;
  if (s.saveState !== 'saving') set({ saveState: 'unsaved' });
  clearTimeout(timer);
  timer = setTimeout(() => void savePartNow(), delay);
}

export async function savePartNow(): Promise<void> {
  const s = get();
  clearTimeout(timer);
  if (!s.part || s.part.builtin || s.part === s.saved) return;
  if (inFlight) {
    schedulePartSave(400);
    return;
  }
  inFlight = true;
  const sent = s.part;
  set({ saveState: 'saving' });
  try {
    await api.updatePart(sent);
    const now = get();
    if (now.part?.id !== sent.id) return;
    set({ saved: sent, saveState: now.part === sent ? 'saved' : 'unsaved' });
    if (now.part !== sent) schedulePartSave();
  } catch {
    set({ saveState: 'error' });
    timer = setTimeout(() => void savePartNow(), 5000);
  } finally {
    inFlight = false;
  }
}
