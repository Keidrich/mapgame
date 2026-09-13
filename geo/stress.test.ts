import { describe, expect, it } from 'vitest';
import { buildChunk, chunkKeyAt } from './chunks';
import type { Polyline } from './polygonize';
import type { XY } from './project';

/** A city-sized street network: 60×60 grid, 40 m spacing, every segment wiggling through 6 shape nodes, plus 300 dead-end stubs. */
function bigCity() {
  const n = 60, sp = 40, sub = 6; const pos = new Map<string, XY>(); const lines: Polyline[] = [];
  const off = -(n - 1) * sp / 2;
  const id = (i: number, j: number) => `n${i}_${j}`;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) pos.set(id(i, j), { x: off + i * sp, y: off + j * sp });
  let shape = 0;
  const seg = (a: string, b: string): string[] => { const pa = pos.get(a)!, pb = pos.get(b)!; const out = [a]; for (let k = 1; k < sub; k++) { const t = k / sub; const s = `s${shape++}`; pos.set(s, { x: pa.x + (pb.x - pa.x) * t + Math.sin(k) * 2, y: pa.y + (pb.y - pa.y) * t + Math.cos(k) * 2 }); out.push(s); } out.push(b); return out; };
  for (let i = 0; i < n; i++) { const nodes: string[] = []; for (let j = 0; j + 1 < n; j++) { const s = seg(id(i, j), id(i, j + 1)); nodes.push(...(j ? s.slice(1) : s)); } lines.push({ id: `v${i}`, nodes, name: `Avenue ${i}` }); }
  for (let j = 0; j < n; j++) { const nodes: string[] = []; for (let i = 0; i + 1 < n; i++) { const s = seg(id(i, j), id(i + 1, j)); nodes.push(...(i ? s.slice(1) : s)); } lines.push({ id: `h${j}`, nodes, name: `Street ${j}` }); }
  for (let k = 0; k < 300; k++) { const i = (k * 7) % n, j = (k * 11) % n; const nodes = [id(i, j)]; for (let m = 1; m <= 12; m++) { const s = `d${k}_${m}`; pos.set(s, { x: off + i * sp + m * 3, y: off + j * sp + m * 2 }); nodes.push(s); } lines.push({ id: `dead${k}`, nodes }); }
  return { pos, lines };
}

describe('buildChunk at city scale', () => {
  it('finishes a 3600-block grid with 20k+ nodes in well under two seconds', () => {
    const origin = { lat: 40.7128, lng: -74.006 }; const key = chunkKeyAt(origin);
    const { pos, lines } = bigCity();
    expect(pos.size).toBeGreaterThan(20000);
    const t0 = performance.now();
    const chunk = buildChunk({ key, roads: lines, nodePos: pos, water: [], industrial: [], pois: [], places: [] });
    const ms = performance.now() - t0;
    expect(chunk.blocks.length).toBeGreaterThan(50);
    expect(chunk.blocks.length).toBeLessThanOrEqual(260);
    expect(ms).toBeLessThan(2000);
  });
});
