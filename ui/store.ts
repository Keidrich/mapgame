/**
 * UI store. Holds the World plus purely presentational state (tab, sheet stack,
 * selection, toasts). All game mutations go through `act()` → sim `dispatch`.
 */
import { useSyncExternalStore } from 'react';
import { can, dispatch, WORLD_VERSION } from '@sim/index';
import type { Action, Affordance } from '@sim/actions';
import type { Id, LogEntry, World } from '@sim/types';

export type Tab = 'map' | 'crew' | 'ops' | 'factions' | 'empire';
export type Sheet =
  | { kind: 'block'; blockId: Id }
  | { kind: 'business'; businessId: Id }
  | { kind: 'npc'; npcId: Id };
export interface Selection { blockId?: Id; businessId?: Id; npcId?: Id }
export interface Toast { id: number; text: string; tone: LogEntry['tone']; until: number }

export interface UiState {
  world: World | null;
  tab: Tab;
  sheets: Sheet[];      // stack; the last one is visible
  selection: Selection;
  toasts: Toast[];
  victorySeen: boolean;
}

export const SAVE_KEY = 'rackets.save.v1';
const VICTORY_KEY = 'rackets.victory.v1';
const TOAST_MS = 3000;

function loadSave(): World | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const w = JSON.parse(raw) as World;
    if (!w || typeof w !== 'object' || w.version !== WORLD_VERSION) { localStorage.removeItem(SAVE_KEY); return null; }
    return w;
  } catch { return null; }
}
function save(w: World | null) {
  try { if (w) localStorage.setItem(SAVE_KEY, JSON.stringify(w)); else localStorage.removeItem(SAVE_KEY); } catch { /* quota / private mode */ }
}
function loadVictorySeen(w: World | null): boolean {
  try { return !!w && localStorage.getItem(VICTORY_KEY) === String(w.seed); } catch { return false; }
}

const initialWorld = loadSave();
let state: UiState = { world: initialWorld, tab: 'map', sheets: [], selection: {}, toasts: [], victorySeen: loadVictorySeen(initialWorld) };
const listeners = new Set<() => void>();
let toastSeq = 1;

function set(patch: Partial<UiState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}
function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }

/** Subscribe to a slice. The selector must return a stable reference for an unchanged state. */
export function useStore<T>(sel: (s: UiState) => T): T {
  return useSyncExternalStore(subscribe, () => sel(state), () => sel(state));
}
/** World for screens that only render once a game exists. */
export function useWorld(): World {
  const w = useStore(s => s.world);
  if (!w) throw new Error('useWorld called without a world');
  return w;
}
export function getState() { return state; }

// ---------- game mutations ----------
export function check(action: Action): Affordance {
  return state.world ? can(state.world, action) : { ok: false, reason: 'No game' };
}
export function act(action: Action): boolean {
  const w = state.world; if (!w) return false;
  const gate = can(w, action);
  if (!gate.ok) { pushToasts([{ day: w.day, text: gate.reason, tone: 'warn' }]); return false; }
  const before = w.log.length;
  const next = dispatch(w, action);
  save(next);
  // a new day starts on the map, so the event cards are the first thing the player sees
  set(action.type === 'end_day' ? { world: next, sheets: [], tab: 'map' } : { world: next });
  pushToasts(next.log.slice(before));
  return true;
}
export function newGame(w: World) {
  save(w);
  set({ world: w, tab: 'map', sheets: [], selection: {}, toasts: [], victorySeen: false });
}
export function resetGame() {
  save(null);
  try { localStorage.removeItem(VICTORY_KEY); } catch { /* ignore */ }
  set({ world: null, tab: 'map', sheets: [], selection: {}, toasts: [], victorySeen: false });
}
export function importWorld(json: string): string | null {
  try {
    const w = JSON.parse(json) as World;
    if (!w || typeof w !== 'object' || !w.blocks || !w.player) return 'Not a RACKETS save.';
    if (w.version !== WORLD_VERSION) return `Save version ${w.version} does not match ${WORLD_VERSION}.`;
    newGame(w); set({ victorySeen: loadVictorySeen(w) });
    return null;
  } catch (e) { return `Could not parse: ${(e as Error).message}`; }
}
export function markVictorySeen() {
  try { if (state.world) localStorage.setItem(VICTORY_KEY, String(state.world.seed)); } catch { /* ignore */ }
  set({ victorySeen: true });
}

// ---------- presentation ----------
export function setTab(tab: Tab) { set({ tab, sheets: [] }); }
export function openSheet(sheet: Sheet) {
  const w = state.world;
  const sel: Selection = { ...state.selection };
  if (sheet.kind === 'block') { sel.blockId = sheet.blockId; sel.businessId = undefined; }
  if (sheet.kind === 'business' && w) { sel.businessId = sheet.businessId; sel.blockId = w.businesses[sheet.businessId]?.blockId ?? sel.blockId; }
  if (sheet.kind === 'npc') sel.npcId = sheet.npcId;
  // Replace if the same sheet is already on top; otherwise push.
  const top = state.sheets[state.sheets.length - 1];
  const same = top && JSON.stringify(top) === JSON.stringify(sheet);
  set({ sheets: same ? state.sheets : [...state.sheets, sheet].slice(-6), selection: sel });
}
export function backSheet() { set({ sheets: state.sheets.slice(0, -1) }); }
export function closeSheets() { set({ sheets: [] }); }
export function selectBlock(blockId?: Id) { set({ selection: { ...state.selection, blockId, businessId: undefined } }); }
/** Jump to the map and open a block / business (used by log refs). */
export function focus(ref: { blockId?: Id; businessId?: Id; npcId?: Id }) {
  if (ref.businessId && state.world?.businesses[ref.businessId]) { set({ tab: 'map', sheets: [] }); openSheet({ kind: 'business', businessId: ref.businessId }); return; }
  if (ref.blockId && state.world?.blocks[ref.blockId]) { set({ tab: 'map', sheets: [] }); openSheet({ kind: 'block', blockId: ref.blockId }); return; }
  if (ref.npcId && state.world?.npcs[ref.npcId]) { openSheet({ kind: 'npc', npcId: ref.npcId }); }
}

function pushToasts(entries: LogEntry[]) {
  if (!entries.length) return;
  const now = Date.now();
  const fresh = entries.slice(-2).map(e => ({ id: toastSeq++, text: e.text, tone: e.tone, until: now + TOAST_MS }));
  const merged = [...state.toasts.filter(t => !fresh.some(f => f.text === t.text)), ...fresh];
  set({ toasts: merged.slice(-2) });
  setTimeout(() => {
    const t = Date.now();
    set({ toasts: state.toasts.filter(x => x.until > t) });
  }, TOAST_MS + 50);
}
export function toast(text: string, tone: LogEntry['tone'] = 'info') { pushToasts([{ day: 0, text, tone }]); }
