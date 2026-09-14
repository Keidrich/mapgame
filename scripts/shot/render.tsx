/**
 * A look at the real screens.
 *
 * Renders the components server-side against the shipped stylesheet and writes one HTML file per
 * screen, for a screenshot. Not a test — the tests assert structure; this is for the pass where
 * somebody has to actually look at it.
 *
 * One known lie in the output: the bottom nav collapses to a ~20px band here and its icons do not
 * paint. That is the harness, not the app — headless Chrome in this container does not resolve
 * `100dvh` or `env(safe-area-inset-bottom)` the way a real browser does, and the previous
 * stylesheet collapses in exactly the same way. Do not "fix" the tab bar because of a screenshot
 * from this file; check it in a browser.
 */
import { renderToString } from 'react-dom/server';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { generateWorld, dispatch, select, PLAYER, type World } from '@sim/index';
import { mkRacket } from '@sim/reducer';
import { newGame } from '@ui/store';
import { Hud } from '@ui/components/Hud';
import { TabBar } from '@ui/components/TabBar';
import { OpTree } from '@ui/components/OpTree';
import { Holdings } from '@ui/components/Holdings';
import { Inventory } from '@ui/components/Inventory';
import { FactionsTab } from '@ui/components/FactionsTab';
import { CrewTab } from '@ui/components/CrewTab';
import { EmpireTab } from '@ui/components/EmpireTab';
import { BlockSheet } from '@ui/components/BlockSheet';
import { OpsTab } from '@ui/components/OpsTab';

function world(): World {
  let w = generateWorld({ origin: { lat: 41.88, lng: -87.63 }, placeName: 'Chicago', playerName: 'Vic', background: 'muscle', seed: 12 });
  w.pendingEvents = [];
  w.day = 34; w.player.cash = 18450; w.player.dirty = 7300; w.player.heat = 48; w.player.respect = 41; w.player.fear = 27;
  w.player.ap = 5; w.player.apMax = 8; w.player.legwork = 3; w.player.lawyer = true;
  for (const p of ['booze', 'green', 'pills', 'hot_goods', 'streetwear'] as const) w.player.stash[p] = 12 + p.length;
  // a few rackets of your own, on places you hold
  const biz = Object.values(w.businesses).filter(b => b.ownedBy === 'npc').slice(0, 5);
  for (const [i, b] of biz.entries()) {
    b.protection = { factionId: PLAYER, rate: 0.15, since: 5 };
    const kinds = ['protection', 'numbers', 'bookmaking', 'dealing', 'laundering'] as const;
    const r = mkRacket(w, kinds[i], b); r.lastIncome = 120 + i * 90; if (kinds[i] === 'dealing') r.product = 'green';
    w.blocks[b.blockId].influence[PLAYER] = 55 + i * 6;
  }
  // and some crew
  for (const n of Object.values(w.npcs).filter(x => x.alive && x.role === 'patron').slice(0, 4)) {
    n.role = 'crew'; n.known = true;
    n.crew = { loyalty: 62, cut: 90, status: 'idle', statusDays: 0, joinedDay: 12 };
    w.player.crewIds.push(n.id); w.player.crewEver++;
  }
  w = dispatch(w, { type: 'cheat', what: 'unlock' });
  return w;
}

const css = readFileSync('ui/styles.css', 'utf8');
const page = (title: string, body: string) => `<!doctype html><meta charset="utf8">
<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}
html,body{height:auto}body{width:400px}.shot{display:flex;flex-direction:column;min-height:820px}
.shot .panel{position:static;flex:1}.shot-label{font:600 10px/1 ui-monospace,monospace;letter-spacing:.2em;color:#7d8a9d;padding:6px 10px;border-bottom:1px solid #1e2a3a;text-transform:uppercase}
</style><div class="shot"><div class="shot-label">${title}</div>${body}</div>`;

const w = world();
newGame(w);
mkdirSync('/tmp/claude-0/shots', { recursive: true });
const screens: [string, () => string][] = [
  ['hud + ops tree', () => renderToString(<Hud />) + `<div class="panel"><div class="panel-inner">${renderToString(<OpTree onPick={() => {}} />)}</div></div>` + renderToString(<TabBar />)],
  ['holdings', () => renderToString(<Hud />) + `<div class="panel"><div class="panel-inner">${renderToString(<Holdings />)}</div></div>` + renderToString(<TabBar />)],
  ['inventory', () => `<div class="panel"><div class="panel-inner">${renderToString(<Inventory />)}</div></div>`],
  ['factions', () => `<div class="panel"><div class="panel-inner">${renderToString(<FactionsTab />)}</div></div>`],
  ['crew', () => `<div class="panel"><div class="panel-inner">${renderToString(<CrewTab />)}</div></div>`],
  ['empire', () => `<div class="panel"><div class="panel-inner">${renderToString(<EmpireTab />)}</div></div>`],
  // a sheet and a modal, which are the two bits of chrome that sit over everything else
  ['ops planner', () => `<div class="panel"><div class="panel-inner">${renderToString(<OpsTab />)}</div></div>`],
  ['sheets', () => `<div class="panel"></div>${renderToString(<BlockSheet blockId={w.player.currentBlockId} />)}`],
];
for (const [name, fn] of screens) {
  writeFileSync(`/tmp/claude-0/shots/${name.replace(/[^a-z]+/g, '-')}.html`, page(name, fn()));
}
console.log('wrote', screens.length, 'screens | control', (select.controlShare(w) * 100).toFixed(1) + '%');
