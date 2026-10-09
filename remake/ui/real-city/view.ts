import type { RealCity } from '@geo/realCity';
export type MapCommand = { n: number; kind: 'home' | 'in' | 'out' | 'focus' };
export function streetLabels(city: RealCity, center = { x: 0, y: 0 }) {
  const nearest = new Map<string, { name: string; x: number; y: number; distance: number; angle: number; major: boolean }>();
  for (const s of city.streets) {
    if (!s.name || s.width < 5) continue;
    // Use a real segment, not the chord across a curved street.
    let a = s.points[0], b = s.points[1], closest = Infinity;
    for (let i = 1; i < s.points.length; i++) {
      const start = s.points[i - 1], end = s.points[i];
      if (Math.hypot(end.x - start.x, end.y - start.y) < 12) continue;
      const d = Math.hypot((start.x + end.x) / 2 - center.x, (start.y + end.y) / 2 - center.y);
      if (d < closest) { closest = d; a = start; b = end; }
    }
    if (!b) continue;
    let angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
    if (angle > 90) angle -= 180;
    if (angle < -90) angle += 180;
    const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
    const distance = Math.hypot(x - center.x, y - center.y);
    // The longest segment can be kilometres off screen (bridges are a common case).
    // Pick a nearby segment for each name, then follow the camera as it moves.
    if ((nearest.get(s.name)?.distance ?? Infinity) > distance) nearest.set(s.name, { name: s.name, x, y, distance, angle, major: s.major });
  }
  return [...nearest.values()].sort((a, b) => a.distance - b.distance).slice(0, 28);
}
export const pathFor = (rings: { x: number; y: number }[][]) => rings.map(r => `M${r.map(p => `${p.x},${p.y}`).join('L')}Z`).join('');
