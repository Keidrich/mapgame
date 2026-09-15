/**
 * UI store. Holds the World plus purely presentational state (tab, sheet stack,
 * selection, toasts). All game mutations go through `act()` → sim `dispatch`.
 */
import { useSyncExternalStore } from 'react';
import { can, dispatch, select, WORLD_VERSION } from '@sim/index';
import type { Action, Affordance } from '@sim/actions';
import type { Id, LogEntry, ProductKind, World } from '@sim/types';
import { idbDel, idbGet, idbSet } from '@ui/net/idb';
import { allCachedChunks, loadChunk, reason } from '@ui/net/chunks';
import { chunkKeyAt, chunksInBox } from '@geo/chunks';

export type Tab = 'map' | 'crew' | 'ops' | 'social' | 'factions' | 'empire';
/** Which per-block field the map is shading. Pure presentation: see `ui/components/MapLayers.tsx`. */
export type MapLayer = 'control' | 'heat' | 'wealth' | 'police' | 'influence' | 'demand';
export type Sheet =
  | { kind: 'block'; blockId: Id }
  | { kind: 'business'; businessId: Id }
  | { kind: 'npc'; npcId: Id };
export interface Selection { blockId?: Id; businessId?: Id; npcId?: Id }
export interface SceneRequest { kind: 'shakedown' | 'threaten' | 'visit' | 'recruit' | 'parley' | 'broker'; npcId: Id; businessId?: Id; otherFactionId?: Id }
export interface Toast { id: number; text: string; tone: LogEntry['tone']; until: number }
/** What happened overnight (or while the app was closed): the UI captures the before-state and reads the log slice. */
export interface Recap { fromDay: number; toDay: number; idle: boolean; cashBefore: number; dirtyBefore: number; heatBefore: number; logStart: number }

/** Idle play: one day resolves per this many hours away, up to the cap. No server; it runs on reopen. */
export const IDLE_HOURS_PER_DAY = 6;
export const IDLE_MAX_DAYS = 3;

export interface UiState {
  world: World | null;
  booting: boolean;     // reading the save from IndexedDB
  chunkVersion: number; // bumps whenever chunk geometry arrives, so the map redraws
  tab: Tab;
  sheets: Sheet[];      // stack; the last one is visible
  selection: Selection;
  scene: SceneRequest | null;
  toasts: Toast[];
  victorySeen: boolean;
  help: boolean;       // the 'how to play' sheet
  recap: Recap | null; // the overnight report, shown before the day's events
  layer: MapLayer;      // the map overlay; reads fields that already exist, adds no simulation
  layerFactionId?: Id;  // which faction the influence layer is showing
  layerProduct?: ProductKind; // which product the demand layer is showing
  layersOpen: boolean;  // the overlay picker: a menu, so the map can be looked at without it
  /**
   * Which collapsible sections the player has opened or shut, by id.
   *
   * Only the ones they have actually touched: an id that is absent means "whatever this section's
   * own default is", so changing a default later does not fight a preference somebody set months
   * ago. Kept in localStorage rather than the save — it is how this person likes the screen, not
   * something about the city.
   */
  folds: Record<string, boolean>;
}

export const SAVE_KEY = 'rackets.save.v3';
const VICTORY_KEY = 'rackets.victory.v1';
const FOLDS_KEY = 'rackets.folds.v1';
const SAVED_AT_KEY = 'rackets.savedAt.v1';
const TOAST_MS = 3000;

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSave: World | null | undefined;
/** Saves are big (a city), so they go to IndexedDB, debounced. */
function save(w: World | null) {
  pendingSave = w;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const v = pendingSave; pendingSave = undefined;
    if (v) { void idbSet(SAVE_KEY, v); void idbSet(SAVED_AT_KEY, Date.now()); } else { void idbDel(SAVE_KEY); void idbDel(SAVED_AT_KEY); }
  }, 400);
}
/**
 * Write the pending save now rather than in 400ms. Called before the page reloads itself for
 * a new version: a debounce that loses the last move to an update is not an acceptable trade.
 */
export async function flushSave(): Promise<void> {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  const v = pendingSave; pendingSave = undefined;
  if (v === undefined) return;
  if (v) { await idbSet(SAVE_KEY, v); await idbSet(SAVED_AT_KEY, Date.now()); }
  else { await idbDel(SAVE_KEY); await idbDel(SAVED_AT_KEY); }
}
function loadVictorySeen(w: World | null): boolean {
  try { return !!w && localStorage.getItem(VICTORY_KEY) === String(w.seed); } catch { return false; }
}

function readFolds(): Record<string, boolean> {
  // A private window, blocked site data or a corrupted value all mean "no preferences yet", which
  // is a perfectly good state to be in — never a reason to fail to render the screen.
  try { const raw = localStorage.getItem(FOLDS_KEY); const v = raw ? JSON.parse(raw) : null; return v && typeof v === 'object' ? v as Record<string, boolean> : {}; } catch { return {}; }
}

let state: UiState = { world: null, booting: true, chunkVersion: 0, tab: 'map', sheets: [], selection: {}, scene: null, toasts: [], victorySeen: false, help: false, recap: null, layer: 'control', layersOpen: false, folds: readFolds() };
const listeners = new Set<() => void>();
let toastSeq = 1;

function set(patch: Partial<UiState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}
function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }

/** Read the save once at boot. Old localStorage saves (v1/v2) are discarded. */
export async function boot() {
  try { localStorage.removeItem('rackets.save.v1'); } catch { /* ignore */ }
  const w = await idbGet<World>(SAVE_KEY);
  const ok = !!w && typeof w === 'object' && w.version === WORLD_VERSION;
  if (w && !ok) void idbDel(SAVE_KEY);
  const savedAt = ok ? await idbGet<number>(SAVED_AT_KEY) : undefined;
  set({ world: ok ? w : null, booting: false, victorySeen: loadVictorySeen(ok ? w : null) });
  if (ok && w) idleTick(w, savedAt, Date.now());
}

/** Resolve the days that passed while the app was closed, stopping at the first night that leaves something to decide. */
export function idleTick(w: World, savedAt: number | undefined, now: number) {
  if (!savedAt || w.gameOver || w.pendingEvents.length) return;
  let days = Math.min(IDLE_MAX_DAYS, Math.floor((now - savedAt) / (IDLE_HOURS_PER_DAY * 3600 * 1000)));
  if (days < 1) return;
  const recap: Recap = { fromDay: w.day, toDay: w.day, idle: true, cashBefore: w.player.cash, dirtyBefore: w.player.dirty, heatBefore: w.player.heat, logStart: w.log.length };
  let next = w;
  while (days-- > 0 && !next.pendingEvents.length && !next.gameOver && can(next, { type: 'end_day' }).ok) next = dispatch(next, { type: 'end_day' });
  if (next === w) return;
  recap.toDay = next.day;
  save(next);
  set({ world: next, recap, tab: 'map', sheets: [], scene: null });
}
export function setLayer(layer: MapLayer, opts: { factionId?: Id; product?: ProductKind } = {}) {
  set({ layer, layerFactionId: opts.factionId ?? state.layerFactionId, layerProduct: opts.product ?? state.layerProduct });
}
/** Open or shut the overlay picker. Closed is the default: the map is the thing being looked at. */
export function toggleLayers(open?: boolean) {
  set({ layersOpen: open ?? !state.layersOpen });
}

/** Open or shut one collapsible section, and remember it. See `UiState.folds`. */
export function toggleFold(id: string, open: boolean) {
  const folds = { ...state.folds, [id]: open };
  set({ folds });
  try { localStorage.setItem(FOLDS_KEY, JSON.stringify(folds)); } catch { /* a preference nobody can store is still a preference for this session */ }
}
/** Is this section open? `def` is what it does before anybody has said otherwise. */
export function isOpen(s: UiState, id: string, def: boolean): boolean { return s.folds[id] ?? def; }
export function bumpChunks() { set({ chunkVersion: state.chunkVersion + 1 }); }
/**
 * The player tapped somewhere under cloud. Tapping used to populate the chunk on the spot — a
 * whole district of people appearing because you touched the screen. Now it says no: ground
 * opens when somebody of yours walks to the edge of it (see `sim/fog.ts` and `revealNear`).
 */
export function explainFog(chunkKey: string) {
  const w = state.world; if (!w) return;
  const near = select.nearestFoggedDistance(w, [chunkKey]);
  pushToasts([{
    day: w.day,
    tone: 'info',
    text: near !== undefined && near > select.REVEAL_M * 4
      ? 'You have never been out that way. Walk toward it and it will open up.'
      : 'Nearly. Get to the edge of what you know and the next streets come into focus.',
  }]);
}

/**
 * Populate every cached chunk somebody of yours has now got close enough to see. Called after
 * anything that moves a person — a walk, a posting, the end of a day — so the map opens up as
 * the player travels rather than as they pan. Geometry that has not been fetched yet is fetched
 * here too: the fog rule decides *whether*, the network decides *when*.
 */
export async function revealNear() {
  const w = state.world; if (!w) return;
  const cached = allCachedChunks().map(c => c.key);
  let opened = 0;
  // Populating one chunk can put the player within reach of the next one along, so this asks
  // again off the *new* world each time rather than off one snapshot. Bounded by the cache.
  for (let pass = 0; pass < cached.length; pass++) {
    const now = state.world; if (!now) break;
    const key = select.revealable(now, cached)[0];
    if (!key) break;
    const chunk = allCachedChunks().find(c => c.key === key);
    if (!chunk) break;
    act({ type: 'populate_chunk', chunk });
    if (state.world?.chunks[key]) opened++; else break;   // refused for some reason; do not spin
  }
  // ground somebody is standing next to but whose streets were never downloaded
  const cur = state.world;
  if (cur) {
    for (const key of chunksInBox(...boxAround(cur)).filter(k => !cur.chunks[k] && !cached.includes(k))) {
      if (!select.withinReach(cur, key) || revealing.has(key)) continue;
      revealing.add(key);
      void loadChunk(key, undefined, { attempts: 1, priority: 3 })
        .then(chunk => { if (state.world && !state.world.chunks[chunk.key] && select.withinReach(state.world, chunk.key)) { act({ type: 'populate_chunk', chunk }); bumpChunks(); } })
        .catch(() => { /* it opens the next time somebody walks out this way */ })
        .finally(() => { revealing.delete(key); });
    }
  }
  if (opened) {
    bumpChunks();
    pushToasts([{ day: w.day, text: opened === 1 ? 'The next few streets come into focus.' : `${opened} more parts of the city come into focus.`, tone: 'good' }]);
  }
}
const revealing = new Set<string>();
/** A small box around the player, in the shape chunksInBox wants. */
function boxAround(w: World): [number, number, number, number, number] {
  const c = w.blocks[w.player.currentBlockId]?.center ?? w.origin;
  const d = 0.025;
  return [c.lat - d, c.lng - d, c.lat + d, c.lng + d, 9];
}

/** Subscribe to a slice. The selector must return a stable reference for an unchanged state. */
export function useStore<T>(sel: (s: UiState) => T): T {
  return useSyncExternalStore(subscribe, () => sel(state), () => sel(state));
}
useStore.getState = () => state;
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
  // a new day starts on the map: first the overnight report, then the event cards
  if (action.type === 'end_day') {
    const recap: Recap = { fromDay: w.day, toDay: next.day, idle: false, cashBefore: w.player.cash, dirtyBefore: w.player.dirty, heatBefore: w.player.heat, logStart: before };
    set({ world: next, sheets: [], tab: 'map', scene: null, help: false, recap });
    void revealNear();
    return true;
  }
  set({ world: next });
  pushToasts(next.log.slice(before));
  // the map opens up as people travel, not as the camera pans
  if (action.type === 'move' || action.type === 'assign') void revealNear();
  return true;
}
/** A city that started on the grid can be rebuilt on the real streets: same place, name and background, fresh start. */
export async function rebuildOnRealStreets(onStatus: (s: string) => void): Promise<string | null> {
  const w = state.world; if (!w) return 'No game.';
  const key = chunkKeyAt(w.origin);
  try {
    const chunk = await loadChunk(key, onStatus, { attempts: 2, timeoutMs: 25000, budgetMs: 45000, priority: 10 });
    onStatus('Populating the city…');
    await new Promise(r => setTimeout(r, 30));
    const { generateWorld } = await import('@sim/generate');
    const next = generateWorld({
      origin: w.origin, placeName: w.placeName, playerName: w.player.name, background: w.player.background,
      // a hand-built character keeps the spread and the edge they chose
      custom: w.player.background === 'custom' ? { skills: w.player.skills, trait: w.player.startTrait ?? 'connected' } : undefined,
      chunk,
    });
    newGame(next);
    return null;
  } catch (e) { return reason(e); }
}
export function newGame(w: World) {
  save(w);
  set({ world: w, booting: false, tab: 'map', sheets: [], selection: {}, toasts: [], victorySeen: false, recap: null, chunkVersion: state.chunkVersion + 1 });
}
export function resetGame() {
  save(null);
  try { localStorage.removeItem(VICTORY_KEY); } catch { /* ignore */ }
  set({ world: null, tab: 'map', sheets: [], selection: {}, toasts: [], victorySeen: false, recap: null });
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
export function openScene(scene: SceneRequest) { set({ scene }); }
export function closeScene() { set({ scene: null }); }
export function closeSheets() { set({ sheets: [] }); }
export function openHelp() { set({ help: true }); }
export function closeRecap() { set({ recap: null }); }
export function closeHelp() { set({ help: false }); }
export function selectBlock(blockId?: Id) { set({ selection: { ...state.selection, blockId, businessId: undefined } }); }
/** Jump to the map and open a block / business (used by log refs). */
export function focus(ref: { blockId?: Id; businessId?: Id; npcId?: Id }) {
  if (state.recap) set({ recap: null });
  if (ref.businessId && state.world?.businesses[ref.businessId]) { set({ tab: 'map', sheets: [] }); openSheet({ kind: 'business', businessId: ref.businessId }); return; }
  if (ref.blockId && state.world?.blocks[ref.blockId]) { set({ tab: 'map', sheets: [] }); openSheet({ kind: 'block', blockId: ref.blockId }); return; }
  if (ref.npcId && state.world?.npcs[ref.npcId]) { openSheet({ kind: 'npc', npcId: ref.npcId }); }
}

function pushToasts(entries: LogEntry[]) {
  if (!entries.length || state.scene) return; // a scene shows its own outcome
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
