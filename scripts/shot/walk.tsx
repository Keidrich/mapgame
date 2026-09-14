/**
 * A walk through the game, as the bot plays it.
 *
 * `render.tsx` renders screens against a hand-built world. This one lets the soak bot actually
 * play for a while first, so every screen has what a real save has in it: crew in four different
 * states, rackets that are failing, a faction at war, open cases, a ledger full of history. Most
 * visual problems only show up with real content in them — an empty screen looks fine.
 *
 * Writes one HTML file per screen; `shots.sh` next to it screenshots them.
 *
 * Two things the harness has to lie about, both fixed here rather than in the app:
 *  - `100dvh` and `env(safe-area-inset-bottom)` do not resolve in headless Chrome in this
 *    container, which collapses `.app` and the bottom nav to nothing. Overridden below.
 *  - headless Chrome here clamps the window to 500px wide, so `--window-size=390` silently
 *    lays the page out at 500 and screenshots the left 390 of it — which reads exactly like a
 *    horizontal overflow bug and is not one. The frame below is an explicit 390px box.
 *  - MapLibre needs a real canvas, so the map itself is a flat panel and only its *chrome*
 *    (legend, layer bar, action button) is rendered over it. That is where the overlaps are.
 */
import { renderToString } from 'react-dom/server';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { select, type World } from '@sim/index';
import { run } from '../bot/run';
import { getState, newGame, openHelp, openSheet, setLayer } from '@ui/store';
import { Hud } from '@ui/components/Hud';
import { TabBar } from '@ui/components/TabBar';
import { OpTree } from '@ui/components/OpTree';
import { OpsTab } from '@ui/components/OpsTab';
import { Holdings } from '@ui/components/Holdings';
import { Inventory } from '@ui/components/Inventory';
import { FactionsTab } from '@ui/components/FactionsTab';
import { CrewTab } from '@ui/components/CrewTab';
import { EmpireTab } from '@ui/components/EmpireTab';
import { SocialTab } from '@ui/components/SocialTab';
import { MapLayers } from '@ui/components/MapLayers';
import { BlockSheet } from '@ui/components/BlockSheet';
import { BusinessSheet } from '@ui/components/BusinessSheet';
import { NpcSheet } from '@ui/components/NpcSheet';
import { HelpSheet } from '@ui/components/HelpSheet';
import { RecapSheet } from '@ui/components/RecapSheet';

const DAYS = Number(process.argv[2] ?? 22);
const SEED = Number(process.argv[3] ?? 7);

const r = run({ days: DAYS, seed: SEED, scenario: 'everything' });
const w: World = r.w;
newGame(w);

const css = readFileSync('ui/styles.css', 'utf8');
/** The app frame, at phone size, with the two things headless Chrome cannot resolve pinned. */
const page = (title: string, body: string) => `<!doctype html><meta charset="utf8">
<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}
html,body{height:100%;margin:0;background:#05070b}
.app{height:844px;width:390px;overflow:hidden}
.tabbar{height:60px;padding-bottom:0}
.panel{padding-bottom:20px}
/* sheets and modals are position:fixed, so they size to the window rather than the frame */
.sheet,.sheet-backdrop,.modal-backdrop,.toasts,.banner{width:390px;left:0;right:auto}
/* the dimmer is what a sheet sits on; for a look at the sheet itself it just gets in the way */
.sheet-backdrop{display:none!important}
/* a screenshot lands mid-animation, which reads as "the whole sheet is dimmed" */
*{animation:none!important;transition:none!important}
.shot-label{position:fixed;left:0;right:0;top:0;z-index:99;font:600 9px/1.6 ui-monospace,monospace;letter-spacing:.2em;color:#f5c542;background:#000;padding:2px 8px;text-transform:uppercase}
.app{padding-top:18px}
</style><div class="shot-label">${title}</div><div class="app">${body}</div>`;

/** A panel screen, inside the frame it really lives in: HUD above, nav below. */
const framed = (inner: string) => `${renderToString(<Hud />)}<div class="main"><div class="panel"><div class="panel-inner">${inner}</div></div></div>${renderToString(<TabBar />)}`;

// Something to look at on every sheet: a block with businesses, a place of the player's, and
// somebody they have actually dealt with.
const myBiz = w.player.businessIds.map(id => w.businesses[id])[0]
  ?? Object.values(w.businesses).find(b => b.racketIds.some(id => w.rackets[id]?.owner === 'player'))
  ?? Object.values(w.businesses)[0];
const busyBlock = Object.values(w.blocks).sort((a, b) => b.businessIds.length - a.businessIds.length)[0];
const someone = w.player.crewIds.map(id => w.npcs[id]).find(n => n?.crew)
  ?? Object.values(w.npcs).find(n => n.known && n.alive)!;

mkdirSync('/tmp/claude-0/walk', { recursive: true });
const screens: [string, () => string][] = [
  ['map chrome', () => `${renderToString(<Hud />)}<div class="main"><div class="map" style="background:#0d1520"></div>
    <div class="map-legend open"><span><i class="sw" style="background:#f5c542"></i>You</span><span><i class="sw" style="background:#e5484d"></i>Los Delgado</span><span><i class="sw" style="background:#45d489"></i>Iron Saints MC</span></div>
    <div class="map-hint">Tap a block to work it. Pinch to zoom out for the whole city.</div>
    ${renderToString(<MapLayers />)}
    <button type="button" class="fab">End day</button>
  </div>${renderToString(<TabBar />)}`],
  ['ops tree', () => framed(renderToString(<OpTree onPick={() => {}} />))],
  ['ops planner', () => framed(renderToString(<OpsTab />))],
  ['crew', () => framed(renderToString(<CrewTab />))],
  ['factions', () => framed(renderToString(<FactionsTab />))],
  ['social', () => framed(renderToString(<SocialTab />))],
  ['empire', () => framed(renderToString(<EmpireTab />))],
  ['holdings', () => framed(renderToString(<Holdings />))],
  ['inventory', () => framed(renderToString(<Inventory />))],
  ['block sheet', () => { openSheet({ kind: 'block', blockId: busyBlock.id }); return `${renderToString(<Hud />)}<div class="main"><div class="map" style="background:#0d1520"></div></div>${renderToString(<TabBar />)}${renderToString(<BlockSheet blockId={busyBlock.id} />)}`; }],
  ['business sheet', () => `${renderToString(<Hud />)}<div class="main"><div class="map" style="background:#0d1520"></div></div>${renderToString(<TabBar />)}${renderToString(<BusinessSheet businessId={myBiz.id} />)}`],
  ['npc sheet', () => `${renderToString(<Hud />)}<div class="main"><div class="map" style="background:#0d1520"></div></div>${renderToString(<TabBar />)}${renderToString(<NpcSheet npcId={someone.id} />)}`],
  ['help', () => { openHelp(); return `${renderToString(<Hud />)}<div class="main"></div>${renderToString(<HelpSheet />)}`; }],
  // the recap only exists after an end-day, so the harness has to put one there the way the
  // store does — the component asserts it is non-null, which is right: the app only mounts it then
  ['recap', () => { setRecap(w); return `${renderToString(<Hud />)}<div class="main"></div>${renderToString(<RecapSheet />)}`; }],
];

/** Put a day's recap in the store, as `end_day` does. */
function setRecap(world: World) {
  const st = getState() as unknown as { recap: unknown };
  st.recap = { fromDay: world.day - 1, toDay: world.day, logStart: Math.max(0, world.log.length - 14), cash: world.player.cash, dirty: world.player.dirty, heat: world.player.heat };
}

setLayer('control');
for (const [name, fn] of screens) {
  let body = '';
  try { body = fn(); } catch (e) { body = `<pre style="color:#e5484d;padding:12px;white-space:pre-wrap">${String(e)}</pre>`; }
  writeFileSync(`/tmp/claude-0/walk/${name.replace(/\W+/g, '-')}.html`, page(name, body));
}
console.log(`day ${w.day} · ${w.player.racketIds.length} rackets · ${w.player.crewIds.length} crew · ${select.openCases(w).length} open cases · control ${(select.controlShare(w) * 100).toFixed(1)}% · heat ${Math.round(w.player.heat)}`);
console.log('screens:', screens.map(s => s[0]).join(', '));
