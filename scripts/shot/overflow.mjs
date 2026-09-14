/**
 * What is sticking out past the right edge, and why.
 *
 * Screenshots show that something overflows; they do not show what. This loads each rendered
 * screen in headless Chrome, walks the DOM for boxes whose right edge is past the viewport, and
 * prints the narrowest such element in each branch — the one actually forcing the width, rather
 * than the twenty ancestors that merely contain it.
 */
import { execFileSync } from 'child_process';
import { readdirSync, writeFileSync, readFileSync } from 'fs';

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const probe = `
  const frame = document.querySelector('.app').getBoundingClientRect(); const W = frame.right, out = [];
  for (const el of document.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.right <= W + 0.5) continue;
    if ([...el.children].some(c => c.getBoundingClientRect().right > W + 0.5)) continue;  // blame the leaf
    const cs = getComputedStyle(el);
    out.push(el.tagName.toLowerCase() + '.' + (el.className || '').toString().trim().split(/\\s+/).join('.')
      + ' w=' + Math.round(r.width) + ' right=' + Math.round(r.right)
      + ' minw=' + cs.minWidth + ' ws=' + cs.whiteSpace + ' flex=' + cs.flex
      + ' | ' + (el.textContent || '').trim().slice(0, 40));
  }
  document.title = 'OVERFLOW ' + out.length + '::' + out.slice(0, 8).join(' ;; ');
`;
for (const f of readdirSync('/tmp/claude-0/walk').filter(f => f.endsWith('.html'))) {
  const path = `/tmp/claude-0/walk/${f}`;
  const html = readFileSync(path, 'utf8');
  const probed = `/tmp/claude-0/walk/_probe.html`;
  writeFileSync(probed, html + `<script>${probe}</script>`);
  const dom = execFileSync(CHROME, ['--headless', '--no-sandbox', '--disable-gpu', '--window-size=390,862',
    '--virtual-time-budget=1200', '--dump-dom', `file://${probed}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const m = dom.match(/<title>OVERFLOW (\d+)::(.*?)<\/title>/s);
  if (m && m[1] !== '0') console.log(`\n== ${f.replace('.html', '')} (${m[1]} overflowing)\n   ` + m[2].split(' ;; ').join('\n   '));
}
