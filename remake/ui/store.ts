/**
 * The Remake's UI store. Holds the World and purely presentational state. Every change to the
 * world goes through `act()` → `dispatch`, exactly like the original.
 *
 * Its save lives under its own key, so the original's city and the Remake's never touch.
 */
import { useSyncExternalStore } from 'react';
import { can, dispatch, migrate, WORLD_VERSION, type Action, type World } from '@r/sim/index';
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
  | { kind: 'help' }
  | { kind: 'region' };
export interface Toast { id: number; text: string; tone: LogEntry['tone'] }
export interface Recap { day: number; clean: number; dirty: number; spent: number; heat: number; washed: number; headline?: string; lines: LogEntry[]; away?: number }

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
  slots: (SlotInfo | null)[];
}

let state: UiState = { world: null, booting: true, tab: 'map', sheets: [], toasts: [], recap: null, layer: 'control', slots: [null, null, null] };
const listeners = new Set<() => void>();
function set(p: Partial<UiState>) { state = { ...state, ...p }; for (const l of listeners) l(); }
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export function useUi<T>(pick: (s: UiState) => T): T { return useSyncExternalStore(subscribe, () => pick(state), () => pick(state)); }
export function useWorld(): World { return useUi(s => s.world!); }
export const getState = () => state;

/**
 * Three cities can be kept at once. Slot 0 is the key the first release saved under, so a city
 * started before slots existed is still there. The index of what is in each slot lives beside them
 * so the start screen can list your cities without loading three worlds.
 */
export const SLOTS = 3;
export const SAVE_KEY = 'rackets.remake.save.v1';
const slotKey = (slot: number) => (slot === 0 ? SAVE_KEY : `${SAVE_KEY}.s${slot}`);
const INDEX_KEY = 'rackets.remake.slots.v1';
const CURRENT_KEY = 'rackets.remake.slot.v1';
export interface SlotInfo { slot: number; city: string; name: string; day: number; worth: number; savedAt: number; seed: number }

/** Idle play: while the app is closed, a day passes every six hours, up to three. */
export const IDLE_HOURS_PER_DAY = 6;
export const IDLE_MAX_DAYS = 3;

let slot = 0;
let index: (SlotInfo | null)[] = Array(SLOTS).fill(null);
const readCurrent = () => { try { const n = Number(localStorage.getItem(CURRENT_KEY)); return n >= 0 && n < SLOTS ? n : 0; } catch { return 0; } };
const writeCurrent = (n: number) => { try { localStorage.setItem(CURRENT_KEY, String(n)); } catch { /* the slot is remembered for this session */ } };
export const getIndex = () => index;
export const useSlots = () => useUi(s => s.slots);

let timer: ReturnType<typeof setTimeout> | null = null;
function save(w: World | null) {
  if (timer) clearTimeout(timer);
  const at = slot;
  timer = setTimeout(() => {
    timer = null;
    if (w) {
      void idbSet(slotKey(at), w);
      index = index.map((x, i) => (i === at ? { slot: at, city: w.city.name, name: w.player.nick ? `"${w.player.nick}"` : w.player.name, day: w.day, worth: w.history[w.history.length - 1]?.worth ?? w.player.cash, savedAt: Date.now(), seed: w.seed } : x));
    } else { void idbDel(slotKey(at)); index = index.map((x, i) => (i === at ? null : x)); }
    void idbSet(INDEX_KEY, index);
    set({ slots: index.slice() });
  }, 400);
}

let booted = false;
export async function boot() {
  if (booted) return; booted = true;
  index = (await idbGet<(SlotInfo | null)[]>(INDEX_KEY)) ?? Array(SLOTS).fill(null);
  if (index.length !== SLOTS) index = Array.from({ length: SLOTS }, (_, i) => index[i] ?? null);
  // a city saved before slots existed has no index entry: read it and give it one
  if (!index[0]) { const legacy = await idbGet<World>(SAVE_KEY); if (legacy && legacy.version === WORLD_VERSION) index[0] = { slot: 0, city: legacy.city.name, name: legacy.player.name, day: legacy.day, worth: legacy.player.cash, savedAt: Date.now(), seed: legacy.seed }; }
  slot = readCurrent();
  set({ slots: index.slice() });
  await open(slot, true);
}

/** Load a slot, and play out the days that passed while the app was shut. */
export async function open(n: number, atBoot = false) {
  slot = n; writeCurrent(n);
  const w = await idbGet<World>(slotKey(n));
  const ok = !!w && typeof w === 'object' && w.version === WORLD_VERSION;
  if (w && !ok) { void idbDel(slotKey(n)); index[n] = null; }
  if (!ok) { set({ world: null, booting: false, sheets: [], recap: null }); return; }
  migrate(w!);
  set({ world: w!, booting: false, tab: 'map', sheets: [], recap: null, toasts: [], focus: { blockId: w!.player.blockId, n: Date.now() } });
  const savedAt = index[n]?.savedAt;
  if (atBoot || savedAt) idle(savedAt, Date.now());
}

/**
 * Days that passed while the app was closed. Whatever comes up is answered the careful way — the
 * last option, which is written to be the one that risks nothing — and a paused job takes its safe
 * answer. You get a recap of all of it before anything else.
 */
export function idle(savedAt: number | undefined, now: number) {
  const w = state.world; if (!w || !savedAt || w.over) return;
  let days = Math.min(IDLE_MAX_DAYS, Math.floor((now - savedAt) / (IDLE_HOURS_PER_DAY * 3600 * 1000)));
  if (days < 1) return;
  let next = w;
  const before = { day: w.day, clean: 0, dirty: 0, spent: 0, washed: 0 };
  while (days-- > 0 && !next.over) {
    let guard = 0;
    while (guard++ < 8) {
      const j = Object.values(next.jobs).find(x => x.status === 'paused');
      if (j?.complication) { const o = j.complication.options.find(x => x.safe) ?? j.complication.options[0]; next = dispatch(next, { type: 'answer', jobId: j.id, optionId: o.id }); continue; }
      const e = next.events[0]; if (!e) break;
      const o = [...e.options].reverse().find(x => !x.disabled) ?? e.options[e.options.length - 1];
      const after = dispatch(next, { type: 'resolve_event', eventId: e.id, optionId: o.id });
      if (after === next) break; next = after;
    }
    const after = dispatch(next, { type: 'end_day' });
    if (after === next) break;
    next = after;
    const h = next.history[next.history.length - 1];
    if (h) { before.clean += h.clean; before.dirty += h.dirty; before.spent += h.spent; before.washed += h.washed ?? 0; }
  }
  if (next === w) return;
  const lines = next.log.filter(l => l.day >= w.day && l.day < next.day && LOUD.has(l.tone) && !/^Day \d+ ends/.test(l.text));
  save(next);
  set({ world: next, recap: { day: next.day - 1, clean: before.clean, dirty: before.dirty, spent: before.spent, heat: Math.round(next.player.heat), washed: before.washed, headline: next.news[next.news.length - 1]?.text, lines: lines.slice(-14), away: next.day - w.day } });
}

export function startGame(w: World, into?: number) {
  const free = into ?? index.findIndex(x => !x);
  slot = free >= 0 ? free : slot; writeCurrent(slot);
  save(w);
  set({ world: w, tab: 'map', sheets: [], recap: null, toasts: [], focus: { blockId: w.player.blockId, n: Date.now() } });
}
/** Back to the start screen. The city stays saved in its slot. */
export function leaveGame() { if (state.world) save(state.world); set({ world: null, sheets: [], recap: null, toasts: [] }); }
/** This city is gone for good. */
export function quitGame() { save(null); set({ world: null, sheets: [], recap: null, toasts: [] }); }
export async function deleteSlot(n: number) { await idbDel(slotKey(n)); index = index.map((x, i) => (i === n ? null : x)); await idbSet(INDEX_KEY, index); set({ slots: index.slice() }); }

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
