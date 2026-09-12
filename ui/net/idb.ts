/** Tiny IndexedDB key-value store: saves and chunk geometry are too big for localStorage. */
const DB = 'rackets'; const STORE = 'kv';
let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (!dbp) dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}
export async function idbGet<T>(key: string): Promise<T | undefined> {
  try { const d = await db(); return await new Promise((res, rej) => { const r = d.transaction(STORE, 'readonly').objectStore(STORE).get(key); r.onsuccess = () => res(r.result as T | undefined); r.onerror = () => rej(r.error); }); }
  catch { return undefined; }
}
export async function idbSet(key: string, value: unknown): Promise<void> {
  try { const d = await db(); await new Promise<void>((res, rej) => { const r = d.transaction(STORE, 'readwrite').objectStore(STORE).put(value, key); r.onsuccess = () => res(); r.onerror = () => rej(r.error); }); }
  catch { /* storage unavailable: play without persistence */ }
}
export async function idbDel(key: string): Promise<void> {
  try { const d = await db(); await new Promise<void>((res, rej) => { const r = d.transaction(STORE, 'readwrite').objectStore(STORE).delete(key); r.onsuccess = () => res(); r.onerror = () => rej(r.error); }); }
  catch { /* ignore */ }
}
