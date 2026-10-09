import type { RealCity } from '@geo/realCity';
export type MapCommand = { n: number; kind: 'home' | 'in' | 'out' | 'focus' };
export function streetLabels(city: RealCity) {
  const longest = new Map<string, { name: string; x: number; y: number; length: number }>();
  for (const s of city.streets) {
    if (!s.name || s.width < 5) continue;
    const a = s.points[0], b = s.points[s.points.length - 1];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if ((longest.get(s.name)?.length ?? 0) < length) longest.set(s.name, { name: s.name, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, length });
  }
  return [...longest.values()].sort((a, b) => b.length - a.length).slice(0, 14);
}
export const pathFor = (rings: { x: number; y: number }[][]) => rings.map(r => `M${r.map(p => `${p.x},${p.y}`).join('L')}Z`).join('');
