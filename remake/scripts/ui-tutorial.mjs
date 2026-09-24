/**
 * The tutorial, played through the real screen: `npm run tutorial:ui` (with `npx vite build && npx
 * vite preview --port 4173` running). A browser at iPhone size starts a city on seed 7 and does
 * only what the quest strip says — taps it, and presses the buttons on whatever sheet it opens,
 * reading the odds the way a person would — ending the day when the strip asks for something that
 * cannot be done yet. It prints the day each step came up, and any script error on the page.
 *
 * `scripts/tutorial.ts` is the same player inside the sim, run by the test suite; this one catches
 * what only the screen can get wrong — a tap that goes nowhere, a button that is never live. It
 * found two: a job's crew list opened empty (so "Take it on" was grey), and the protect step
 * pointed at a stranger instead of the owner just won over.
 */
import { chromium } from 'playwright';
const url = process.env.URL ?? 'http://localhost:4173/';
const seed = process.argv[2] ?? '7';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--disable-gpu', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = [];
p.on('pageerror', e => errors.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });  // an offline font is not a failure
await p.addInitScript(() => localStorage.setItem('rackets.mode.v1', 'remake'));
await p.goto(url);
await p.waitForSelector('.r-start', { timeout: 20000 });
await p.fill('#r-seed-in', seed); await p.click('.r-seed button[type=submit]');
await p.waitForTimeout(500);
await p.click('.r-start-foot button', { force: true });
await p.waitForSelector('.r-top');
const clickText = async (sel, re) => { const els = await p.$$(sel); for (const e of els) { const t = (await e.innerText()).trim(); if (re.test(t) && await e.isEnabled()) { await e.evaluate(el => el.click()); await p.waitForTimeout(150); return t; } } return null; };
const dismiss = async () => {
  for (let i = 0; i < 6; i++) {
    if (await p.$('.r-card-options .r-option:not([disabled])')) { await p.click('.r-card-options .r-option:not([disabled])', { force: true }); await p.waitForTimeout(150); continue; }
    if (await p.$('.r-card .r-btn.primary')) { await p.click('.r-card .r-btn.primary', { force: true }); await p.waitForTimeout(150); continue; }
    break;
  }
};
const log = [];
let last = '', same = 0;
for (let step = 0; step < 140; step++) {
  await dismiss();
  if (await p.$('.r-sheet')) { await p.click('.r-close', { force: true }).catch(() => {}); await p.waitForTimeout(150); }
  if (!(await p.$('.r-tabbar button.on:has-text("City")'))) { await p.click('.r-tabbar button:has-text("City")', { force: true }); await p.waitForTimeout(150); }
  const lead = await p.$('.r-lead-top b'); if (!lead) { log.push('no lead strip'); break; }
  const text = (await lead.innerText()).trim();
  const day = (await p.innerText('.r-dayno b')).trim();
  if (text !== last) { log.push(`day ${day}: ${text}`); last = text; same = 0; } else same++;
  if (/Put an official|lieutenant|quarter of|half of/i.test(text)) break;
  await p.click('.r-lead-top', { force: true }); await p.waitForTimeout(250);
  let did = null;
  if (await p.$('.r-sheet')) {
    did = await clickText('.r-sheet .r-btn', /^Go to|Walk here|Take a cab/);
    const order = /Introduce|trust or fear/.test(text) ? ['Introduce yourself', 'Talk', 'Lean on them'] : /protection/.test(text) ? ['Offer protection', 'Talk', 'Lean on them'] : /recruit/.test(text) ? ['Recruit', 'Talk', 'Introduce yourself'] : /racket/.test(text) ? ['Start (?!Dealing)'] : /back room/.test(text) ? ['Take a back room'] : /fixer|wash/i.test(text) ? ['Introduce yourself', 'Talk'] : ['Offer protection', 'Start (?!Dealing)', 'Talk'];
    const odds = async label => { for (const e of await p.$$('.r-sheet .r-scene-main')) { const t = await e.innerText(); if (t.startsWith(label)) { const m = /(\d+)%/.exec(t); return m ? Number(m[1]) : 100; } } return -1; };
    let alts = order;
    if (/protection/.test(text) && (await odds('Offer protection')) < 35) alts = (await odds('Lean on them')) >= 45 ? ['Lean on them'] : ['Talk', 'Introduce yourself'];
    if (/recruit/.test(text) && (await odds('Recruit')) < 40) alts = ['Talk', 'Introduce yourself'];
    // "hold a block" opens the block: a person goes into a place nobody protects, then its owner
    if (/^Hold a block/.test(text)) {
      for (const r of await p.$$('.r-sheet .r-row')) { if (/Pays nobody/.test(await r.innerText())) { await r.evaluate(el => el.click()); await p.waitForTimeout(200); break; } }
      for (const r of await p.$$('.r-sheet .r-row')) { if (/Trust|never spoken/.test(await r.innerText())) { await r.evaluate(el => el.click()); await p.waitForTimeout(200); break; } }
      alts = (await odds('Offer protection')) >= 35 ? ['Offer protection'] : (await odds('Lean on them')) >= 45 ? ['Lean on them'] : ['Talk', 'Introduce yourself'];
    }
    // each alternative in the order written, not the order the buttons sit on the page
    for (const a of alts) { const re = new RegExp('^' + a); const d = (await clickText('.r-sheet .r-scene-main', re)) ?? (await clickText('.r-sheet .r-btn', re)); if (d) { did = d; break; } }
  } else if (await p.$('.r-tabbar button.on:has-text("Jobs")')) {
    const row = await p.$('.r-tab .r-row');
    if (row) { await row.click({ force: true }); await p.waitForTimeout(200); did = (await clickText('.r-sheet .r-btn', /^(Go in|Take it on)/)); }
  } else if (await p.$('.r-tabbar button.on:has-text("Empire")')) {
    did = await clickText('.r-tab .r-btn', /^Fixer: wash/);
  }
  if (!did || same > 6) {
    if (await p.$('.r-sheet')) await p.click('.r-close', { force: true }).catch(() => {});
    await p.click('.r-tabbar button:has-text("City")', { force: true });
    await p.waitForTimeout(150);
    // nothing the strip asked for could be done today: end it, as a player would
    await p.click('.r-endday button', { force: true }).catch(() => {}); await p.waitForTimeout(400); same = 0;
  }
  if (Number(day) > 30) break;
}
console.log(log.join('\n'));
console.log('errors:', errors.length ? errors.slice(0, 5) : 'none');
await b.close();
