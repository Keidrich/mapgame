import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { boot, flushSave } from './store';
void boot();

/**
 * Ship a change and players get it on their next load — not two loads later.
 *
 * The app is a PWA, so a service worker serves the last build it cached. The registration
 * vite-plugin-pwa injects by default only registers the worker; it never notices a newer one,
 * so a deployed change sat behind the cached old one until the player happened to reload
 * enough times. This takes the update the moment it is ready, after writing the save, and
 * checks for one every hour so a tab left open overnight is not a week behind.
 */
registerSW({
  immediate: true,
  // autoUpdate mode: the new worker takes over by itself and this fires instead of reloading
  // for us, which is the chance to put the save on disk before the page goes
  onNeedReload() { void flushSave().finally(() => window.location.reload()); },
  onRegisteredSW(_url, reg) { if (reg) setInterval(() => void reg.update(), 60 * 60 * 1000); },
});

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
