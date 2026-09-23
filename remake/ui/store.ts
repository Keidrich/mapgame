/**
 * The Remake's UI store. Holds the World and purely presentational state. Every change to the
 * world goes through `act()` → `dispatch`, exactly like the original.
 *
 * Its save lives under its own key, so the original's city and the Remake's never touch.
 */
import { useSyncExternalStore } from 'react';
import { can, dispatch, WORLD_VERSION, type Action, type World } from '@r/sim/index';
import type { Id, LogEntry } from '@r/sim/types';
import { idbDel, idbGet, idbSet } from '@ui/net/idb';

export type Tab = 'map' | 'people' | 'crew' | 'jobs' | 'empire' | 'rivals';
export type Layer = 'control' | 'heat' | 'wealth' | 'police';
export type Sheet =
  | { kind: 'block'; id: Id }
  | { kind: 'business'; id: Id }
  | { kind: 'person'; id: Id }
  | { kind: 'job'; id: Id }
  | { kind: 'faction'; id: Id }
  | { kind: 'menu' }
  | { kind: 'help' };
export interface Toast { id: number; text: string; tone: LogEntry['tone'] }
export interface Recap { day: number; clean: number; dirty: number; spent: number; heat: number; washed: number; headline?: string; lines: LogEntry[] }

export interface UiState {
  world: World | null;
  booting: boolean;
  tab: Tab;
  sheets: Sheet[];
  toasts: Toast[];
  recap: Recap | null;
  layer: Layer;
  /** A request for the map to fly somewhere. Bumped, not stored: the map reads and clears it. */
  focus?: { blockId: Id; n: number };
}

export const SAVE_KEY = 'rackets.remake.save.v1';
let state: UiState = { world: null, booting: true, tab: 'map', sheets: [], toasts: [], recap: null, layer: 'control' };
const listeners = new Set<() => void>();
function set(p: Partial<UiState>) { state = { ...state, ...p }; for (const l of listeners) l(); }
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export function useUi<T>(pick: (s: UiState) => T): T { return useSyncExternalStore(subscribe, () => pick(state), () => pick(state)); }
export function useWorld(): World { return useUi(s => s.world!); }
export const getState = () => state;

let timer: ReturnType<typeof setTimeout> | null = null;
function save(w: World | null) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; if (w) void idbSet(SAVE_KEY, w); else void idbDel(SAVE_KEY); }, 400);
}

let booted = false;
export async function boot() {
  if (booted) return; booted = true;
  const w = await idbGet<World>(SAVE_KEY);
  const ok = !!w && typeof w === 'object' && w.version === WORLD_VERSION;
  if (w && !ok) void idbDel(SAVE_KEY);
  set({ world: ok ? w! : null, booting: false });
}

export function startGame(w: World) { save(w); set({ world: w, tab: 'map', sheets: [], recap: null, toasts: [], focus: { blockId: w.player.blockId, n: Date.now() } }); }
export function quitGame() { save(null); set({ world: null, sheets: [], recap: null, toasts: [] }); }

let toastSeq = 1;
const LOUD = new Set(['good', 'bad', 'money', 'war', 'law', 'warn']);
export function act(a: Action): boolean {
  const w = state.world; if (!w) return false;
  const ok = can(w, a);
  if (!ok.ok) { toast(ok.why ?? 'Not now.', 'warn'); return false; }
  const next = dispatch(w, a);
  if (next === w) return false;
  const newOnes = newEntries(w, next).slice(-4);
  save(next);
  const patch: Partial<UiState> = { world: next };
  if (a.type === 'end_day' || a.type === 'lay_low') {
    const h = next.history[next.history.length - 1];
    const lines = next.log.filter(l => l.day >= w.day && l.day < next.day && LOUD.has(l.tone) && !/^Day \d+ ends/.test(l.text));
    patch.recap = h ? { day: h.day, clean: h.clean, dirty: h.dirty, spent: h.spent, heat: h.heat, washed: h.washed ?? 0, headline: next.news[next.news.length - 1]?.text, lines: lines.slice(-12) } : null;
  } else {
    const toasts = newOnes.filter(l => LOUD.has(l.tone) || a.type === 'scene').map(l => ({ id: toastSeq++, text: l.text, tone: l.tone }));
    if (toasts.length) { patch.toasts = [...state.toasts, ...toasts].slice(-3); for (const t of toasts) setTimeout(() => dismissToast(t.id), 4200); }
  }
  set(patch);
  return true;
}
/**
 * What this action added to the log. Dispatch clones the world, so entries cannot be compared by
 * reference, and the log is capped, so its length alone lies once it is full: find the old last
 * line in the new log, from the end, and take everything after it.
 */
export function newEntries(before: World, after: World): LogEntry[] {
  const last = before.log[before.log.length - 1];
  if (!last) return after.log.slice();
  for (let i = after.log.length - 1; i >= 0; i--) {
    const l = after.log[i];
    if (l.day === last.day && l.text === last.text) return after.log.slice(i + 1);
  }
  return after.log.slice(-4);
}
export function toast(text: string, tone: LogEntry['tone'] = 'info') {
  const t = { id: toastSeq++, text, tone };
  set({ toasts: [...state.toasts, t].slice(-3) });
  setTimeout(() => dismissToast(t.id), 3600);
}
export function dismissToast(id: number) { set({ toasts: state.toasts.filter(t => t.id !== id) }); }

export function setTab(tab: Tab) { set({ tab, sheets: [] }); }
export function openSheet(s: Sheet) {
  const top = state.sheets[state.sheets.length - 1];
  if (top && JSON.stringify(top) === JSON.stringify(s)) return;
  set({ sheets: [...state.sheets, s].slice(-6) });
}
export function closeSheet() { set({ sheets: state.sheets.slice(0, -1) }); }
export function closeSheets() { set({ sheets: [] }); }
export function closeRecap() { set({ recap: null }); }
export function setLayer(layer: Layer) { set({ layer }); }
export function focusBlock(blockId: Id) { set({ focus: { blockId, n: Date.now() }, tab: 'map', sheets: [] }); }
