/**
 * Which game is on screen: the original RACKETS, or the Remake. A presentation preference, kept
 * in localStorage like the folds — never in either save, so switching never touches a city.
 */
import { useSyncExternalStore } from 'react';

export type GameMode = 'original' | 'remake';
const KEY = 'rackets.mode.v1';
const listeners = new Set<() => void>();
function read(): GameMode { try { return localStorage.getItem(KEY) === 'remake' ? 'remake' : 'original'; } catch { return 'original'; } }
let mode: GameMode = typeof window === 'undefined' ? 'original' : read();

export function setMode(m: GameMode) {
  mode = m;
  try { localStorage.setItem(KEY, m); } catch { /* a preference nobody can store still holds for this session */ }
  for (const l of listeners) l();
}
export function useMode(): GameMode {
  return useSyncExternalStore(l => { listeners.add(l); return () => { listeners.delete(l); }; }, () => mode, () => mode);
}
