import { api, ApiError } from '../api';
import type { SetupMeta } from '@viz/shared';
import { useEditor } from './store';

const DELAY = 2000;
let timer: ReturnType<typeof setTimeout> | undefined;
let inFlight = false;
let thumbProvider: (() => string | undefined) | null = null;

/** The editor registers a function that captures a small picture of the bench. */
export function setThumbProvider(fn: (() => string | undefined) | null): void {
  thumbProvider = fn;
}

export function scheduleSave(delay = DELAY): void {
  const s = useEditor.getState();
  if (s.readOnly || !s.setup) return;
  if (s.saveState !== 'conflict' && s.saveState !== 'saving') useEditor.setState({ saveState: 'unsaved' });
  clearTimeout(timer);
  timer = setTimeout(() => void saveNow(), delay);
}

export function cancelScheduledSave(): void {
  clearTimeout(timer);
}

/**
 * Store the setup. When someone else saved since it was opened the server refuses,
 * and the editor shows the conflict until the user picks a side.
 */
export async function saveNow(opts: { force?: boolean; keepalive?: boolean } = {}): Promise<void> {
  const s = useEditor.getState();
  if (!s.setup || s.readOnly) return;
  if (s.saveState === 'conflict' && !opts.force) return;
  if (s.doc === s.savedDoc && !opts.force) {
    if (s.saveState !== 'saved') useEditor.setState({ saveState: 'saved' });
    return;
  }
  if (inFlight) {
    scheduleSave(500);
    return;
  }
  clearTimeout(timer);
  inFlight = true;
  const sent = s.doc;
  useEditor.setState({ saveState: 'saving' });
  try {
    let thumb: string | undefined;
    try {
      thumb = opts.keepalive ? undefined : thumbProvider?.();
    } catch {
      thumb = undefined;
    }
    const meta = await api.saveSetup(s.setup.id, { doc: sent, baseVersion: s.setup.version, force: opts.force, thumb }, opts.keepalive);
    const now = useEditor.getState();
    if (now.setup?.id !== meta.id) return; // another setup was opened meanwhile
    const changedSince = now.doc !== sent;
    useEditor.setState({ setup: meta, savedDoc: sent, conflict: null, saveState: changedSince ? 'unsaved' : 'saved' });
    if (changedSince) scheduleSave();
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) {
      useEditor.setState({ saveState: 'conflict', conflict: (e.data as { current: SetupMeta }).current });
    } else {
      useEditor.setState({ saveState: 'error' });
      clearTimeout(timer);
      timer = setTimeout(() => void saveNow(), 5000);
    }
  } finally {
    inFlight = false;
  }
}
