/**
 * A shipped change has to reach the player, and for a PWA that is not the same thing as
 * being deployed: a service worker serves the last build it cached.
 *
 * The default registration vite-plugin-pwa injects only registers the worker — it never
 * notices a newer one — so a new build took **two** reloads to appear: the first installed
 * the new worker, the second was served by it. Verified in a browser both ways (old build:
 * still the old bundle after one reload; with this wiring: the new bundle after one).
 *
 * These assertions are a guard on that wiring, because nothing else in the suite can see it:
 * unit tests never run a service worker.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

describe('a new build reaches players', () => {
  const config = read('../vite.config.ts');
  const main = read('./main.tsx');

  it('registers the worker from the app, not from the injected one-liner', () => {
    expect(config).toMatch(/injectRegister:\s*null/);
    expect(main).toMatch(/registerSW\(/);
    expect(main).toMatch(/immediate:\s*true/);
  });

  it('takes the update as soon as the new worker is live', () => {
    // autoUpdate mode calls onNeedReload instead of reloading for us; onNeedRefresh is never
    // called there, so wiring the save flush to that hook would silently do nothing
    expect(config).toMatch(/registerType:\s*'autoUpdate'/);
    expect(main).toMatch(/onNeedReload\(\)/);
    expect(main).not.toMatch(/onNeedRefresh/);
  });

  it('writes the save before the page goes', () => {
    expect(main).toMatch(/flushSave\(\)[\s\S]{0,60}location\.reload\(\)/);
    expect(read('./store.ts')).toMatch(/export async function flushSave/);
  });

  it('keeps checking while a tab is left open', () => {
    expect(main).toMatch(/reg\.update\(\)/);
  });

  it('stamps the build so you can tell which one you are looking at', () => {
    expect(config).toMatch(/__BUILD_ID__/);
    expect(read('./components/HelpSheet.tsx')).toMatch(/__BUILD_ID__/);
  });
});
