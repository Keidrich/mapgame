import type { World } from '@r/sim/types';
import { WORLD_VERSION } from '@r/sim/generate';

/** Dedicated database: even a failed read must never overwrite an older campaign. */
export const REAL_SAVE_DB = 'rackets.real-city.save.v1';
export interface RealSave { format: 1; geographyId: string; world: World }
export function decodeSave(value: unknown, geographyId: string): World {
  const s = value as RealSave | undefined, w = s?.world;
  if (s?.format !== 1 || s.geographyId !== geographyId || w?.city?.geography?.id !== geographyId || w.version !== WORLD_VERSION
    || !w.blocks?.[w.player?.blockId] || !w.businesses || !w.npcs || !Array.isArray(w.events) || !Array.isArray(w.log)) {
    throw new Error('This neighborhood save is incompatible or incomplete. It has been preserved.');
  }
  if (Object.values(w.businesses).some(b => !b.buildingId || !w.blocks[b.blockId] || !w.npcs[b.ownerId])) throw new Error('The saved places are incomplete. Your save has been preserved.');
  return w;
}
let database: Promise<IDBDatabase> | undefined;
function db() {
  return database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(REAL_SAVE_DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('campaign');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('Storage unavailable.'));
    r.onblocked = () => reject(new Error('Close other Rackets tabs to open this save.'));
  });
}
export async function readSave(): Promise<unknown> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction('campaign', 'readonly'), r = tx.objectStore('campaign').get('current');
    tx.oncomplete = () => resolve(r.result);
    tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('Could not read your save.'));
  });
}
let writes: Promise<void> = Promise.resolve();
export function saveWorld(world: World): Promise<void> {
  // Serialize whole-world snapshots and report success only after transaction commit.
  const value: RealSave = { format: 1, geographyId: world.city.geography!.id, world };
  writes = writes.catch(() => {}).then(async () => {
    const d = await db();
    await new Promise<void>((resolve, reject) => {
      const tx = d.transaction('campaign', 'readwrite');
      tx.objectStore('campaign').put(value, 'current');
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('Could not save.'));
    });
  });
  return writes;
}

/** Backup and repair commit together. A failed transaction leaves the original current save intact. */
export function savePlacementRepair(before: World, after: World): Promise<void> {
  writes = writes.catch(() => {}).then(async () => {
    const d = await db();
    await new Promise<void>((resolve, reject) => {
      const tx = d.transaction('campaign', 'readwrite'), store = tx.objectStore('campaign');
      const backup = store.get('placement-backup-v1');
      backup.onsuccess = () => {
        if (backup.result === undefined) store.put({ format: 1, geographyId: before.city.geography!.id, world: before } satisfies RealSave, 'placement-backup-v1');
        store.put({ format: 1, geographyId: after.city.geography!.id, world: after } satisfies RealSave, 'current');
      };
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('Could not repair place locations. Your original save is preserved.'));
    });
  });
  return writes;
}
