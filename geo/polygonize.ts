/**
 * Planar face extraction: streets in, city blocks out.
 * Input is a set of polylines whose shared vertices (OSM node ids) are the
 * intersections. Output is every bounded face of the planar graph.
 */
import type { XY } from './project';
import { signedArea } from './project';

export interface Polyline { id: string; nodes: string[]; name?: string }
export interface Face { ring: string[]; area: number } // node ids, area in m² (positive)

export interface Graph {
  pos: Map<string, XY>;
  adj: Map<string, string[]>;           // node -> neighbours (sorted by angle after build)
  edgeName: Map<string, string | undefined>; // "a|b" (a<b) -> road name
}

const ekey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function buildGraph(lines: Polyline[], pos: Map<string, XY>): Graph {
  const adj = new Map<string, Set<string>>();
  const edgeName = new Map<string, string | undefined>();
  const add = (a: string, b: string, name?: string) => {
    if (a === b || !pos.has(a) || !pos.has(b)) return;
    if (!adj.has(a)) adj.set(a, new Set()); if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b); adj.get(b)!.add(a);
    const k = ekey(a, b); if (!edgeName.has(k) || (name && !edgeName.get(k))) edgeName.set(k, name);
  };
  for (const l of lines) for (let i = 0; i + 1 < l.nodes.length; i++) add(l.nodes[i], l.nodes[i + 1], l.name);
  // prune dangling ends (dead-end streets never bound a face): queue-based, linear time
  const queue: string[] = [];
  for (const [n, s] of adj) if (s.size <= 1) queue.push(n);
  while (queue.length) {
    const n = queue.pop()!; const s = adj.get(n); if (!s || s.size > 1) continue;
    for (const o of s) { const os = adj.get(o); if (os) { os.delete(n); if (os.size <= 1) queue.push(o); } }
    adj.delete(n);
  }
  const sorted = new Map<string, string[]>();
  for (const [n, s] of adj) {
    const p = pos.get(n)!;
    sorted.set(n, [...s].sort((a, b) => angle(p, pos.get(a)!) - angle(p, pos.get(b)!)));
  }
  return { pos, adj: sorted, edgeName };
}

const angle = (from: XY, to: XY) => Math.atan2(to.y - from.y, to.x - from.x);

/** All bounded faces (clockwise-free: rings are returned counter-clockwise). */
export function faces(g: Graph): Face[] {
  const visited = new Set<string>(); // directed half-edge "a>b"
  const out: Face[] = [];
  for (const [a, nbrs] of g.adj) for (const b of nbrs) {
    const start = `${a}>${b}`; if (visited.has(start)) continue;
    const ring: string[] = [];
    let u = a, v = b; let guard = 0;
    while (guard++ < 100000) {
      const key = `${u}>${v}`; if (visited.has(key)) break;
      visited.add(key); ring.push(u);
      const around = g.adj.get(v)!; const i = around.indexOf(u);
      // next edge: the neighbour just before `u` in counter-clockwise order around v = sharpest right turn
      const w = around[(i - 1 + around.length) % around.length];
      u = v; v = w;
      if (u === a && v === b) break;
    }
    if (ring.length < 3) continue;
    const xy = ring.map(n => g.pos.get(n)!);
    const area = signedArea(xy);
    // With this turn rule bounded faces come out counter-clockwise (positive area); the outer face is negative.
    if (area > 0) out.push({ ring, area });
  }
  return out;
}
