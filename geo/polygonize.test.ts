import { describe, expect, it } from 'vitest';
import { buildGraph, faces, type Polyline } from './polygonize';
import type { XY } from './project';

/** n×n grid of streets 100 m apart, plus an optional diagonal and a dead-end stub. */
export function gridFixture(n = 5, opts: { diagonal?: boolean; stub?: boolean } = {}) {
  const pos = new Map<string, XY>(); const lines: Polyline[] = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) pos.set(`n${i}_${j}`, { x: i * 100, y: j * 100 });
  for (let i = 0; i < n; i++) lines.push({ id: `v${i}`, nodes: Array.from({ length: n }, (_, j) => `n${i}_${j}`), name: `Avenue ${i}` });
  for (let j = 0; j < n; j++) lines.push({ id: `h${j}`, nodes: Array.from({ length: n }, (_, i) => `n${i}_${j}`), name: `Street ${j}` });
  if (opts.diagonal) lines.push({ id: 'diag', nodes: Array.from({ length: n }, (_, k) => `n${k}_${k}`), name: 'Broadway' });
  if (opts.stub) { pos.set('stub', { x: -80, y: 150 }); lines.push({ id: 'stub', nodes: ['n0_1', 'stub'] }); }
  return { pos, lines };
}

describe('polygonize', () => {
  it('finds every cell of a grid', () => {
    const { pos, lines } = gridFixture(5);
    const f = faces(buildGraph(lines, pos));
    expect(f.length).toBe(16);
    for (const face of f) expect(Math.round(face.area)).toBe(10000);
    expect(f.every(face => face.ring.length === 4)).toBe(true);
  });
  it('splits cells along a diagonal and ignores dead ends', () => {
    const { pos, lines } = gridFixture(4, { diagonal: true, stub: true });
    const f = faces(buildGraph(lines, pos));
    // 9 cells, 3 of them cut in half by the diagonal → 12 faces
    expect(f.length).toBe(12);
    const total = f.reduce((s, x) => s + x.area, 0);
    expect(Math.round(total)).toBe(90000);
  });
  it('handles two disconnected components', () => {
    const a = gridFixture(3); const b = gridFixture(3);
    const pos = new Map(a.pos); for (const [k, v] of b.pos) pos.set(`B${k}`, { x: v.x + 1000, y: v.y });
    const lines = [...a.lines, ...b.lines.map(l => ({ ...l, id: `B${l.id}`, nodes: l.nodes.map(n => `B${n}`) }))];
    expect(faces(buildGraph(lines, pos)).length).toBe(8);
  });
});
