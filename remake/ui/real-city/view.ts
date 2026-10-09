import type { RealCity } from '@geo/realCity';
export type MapCommand = { n: number; kind: 'home' | 'in' | 'out' | 'focus' };
export function streetLabels(city: RealCity, center = { x: 0, y: 0 }) {
  const nearest = new Map<string, { name: string; x: number; y: number; distance: number }>();
  for (const s of city.streets) {
    if (!s.name || s.width < 5) continue;
    const a = s.points[0], b = s.points[s.points.length - 1];
    const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
    const distance = Math.hypot(x - center.x, y - center.y);
    // The longest segment can be kilometres off screen (bridges are a common case).
    // Pick a nearby segment for each name, then follow the camera as it moves.
    if ((nearest.get(s.name)?.distance ?? Infinity) > distance) nearest.set(s.name, { name: s.name, x, y, distance });
  }
  return [...nearest.values()].sort((a, b) => a.distance - b.distance).slice(0, 14);
}
export const pathFor = (rings: { x: number; y: number }[][]) => rings.map(r => `M${r.map(p => `${p.x},${p.y}`).join('L')}Z`).join('');
