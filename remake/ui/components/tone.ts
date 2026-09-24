/**
 * Outfit colours, as the screen draws them. The sim picks an outfit's colour from `STYLES` (and a
 * save keeps it), and those are poster colours — hot pink, electric blue — that made the map look
 * like a sweet shop. The screen mutes every one to the same saturation and lightness, so rivals
 * read as dyed ink on a night map and old saves get the same treatment. The sim's value is untouched.
 */
const cache = new Map<string, string>();
export function mute(hex: string): string {
  const hit = cache.get(hex); if (hit) return hit;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex); if (!m) return hex;
  const n = parseInt(m[1], 16); const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  const s0 = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  // everybody at the same weight: saturation capped, lightness pulled to the middle
  const s = Math.min(s0, 0.42), L = 0.5 + (l - 0.5) * 0.3;
  const c = (1 - Math.abs(2 * L - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), o = L - c / 2;
  const [rr, gg, bb] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const out = `#${[rr, gg, bb].map(v => Math.round((v + o) * 255).toString(16).padStart(2, '0')).join('')}`;
  cache.set(hex, out);
  return out;
}
