/**
 * The city, from a seed.
 *
 * The original game laid its turf over real OpenStreetMap streets, which made every start a
 * network request that could fail, stall for forty-five seconds, or fall back to a hex grid. The
 * remake generates the whole place instead, and does it in a few milliseconds:
 *
 *   1. **A lattice of streets.** Column and row spacings are drawn per line, so blocks are not all
 *      one size, then every lattice vertex is pushed by fractal noise. Straight grids read as a
 *      spreadsheet; a warped one reads as a city that grew.
 *   2. **Water.** Most cities get a coast on one side, drawn as a noisy shoreline, and many get a
 *      river wandering across. Cells under water are simply not blocks.
 *   3. **Bridges.** Every avenue that meets the river crosses it. Anything left cut off gets a
 *      bridge wherever the gap is shortest, and a scrap of land that still cannot be reached is
 *      dropped rather than left as a block you could never walk to.
 *   4. **Districts.** Seed points spread over the land by farthest-point sampling, each given a
 *      character by *where* it is — the one nearest the middle is downtown, the ones on the water
 *      are docks, the ones farthest out are the heights and the suburbs — then every cell goes to
 *      the nearest seed with a little noise, so borders follow streets but never look ruled.
 *   5. **Blocks.** Cells merge into larger lots where the district wants them (a foundry is not a
 *      row of corner shops), and each block's outline is its ring of lattice vertices, inset by
 *      the half-width of whichever street runs along that side. Avenues are visibly wider.
 *
 * Parks are blocks too: no businesses, nobody to protect, and reachable only by holding the
 * ground around them — which is the case the territory rules were fixed to keep open.
 */
import { DISTRICTS } from '@r/content/world';
import { cityMotto, cityName, districtName, landmarkPool, parkName, streetName } from '@r/content/names';
import { centroid, chaikin, dist, distToPath, insetSides, pointInPoly, ribbon, round1, v } from './geom';
import { Rng, fbm } from './rng';
import type { Block, Bridge, City, District, DistrictKind, Id, Street, Vec } from './types';

export type CitySize = 'small' | 'medium' | 'large';
export const CITY_SIZES: Record<CitySize, { cols: number; rows: number; label: string }> = {
  small: { cols: 13, rows: 12, label: 'Small town' },
  medium: { cols: 17, rows: 15, label: 'City' },
  large: { cols: 21, rows: 18, label: 'Metropolis' },
};

export interface GeneratedCity {
  city: City;
  districts: Record<Id, District>;
  blocks: Record<Id, Block>;
  precincts: { id: Id; name: string; blockId: Id; districtIds: Id[] }[];
  cityHallBlockId: Id;
  courthouseBlockId: Id;
}

type CellKind = 'land' | 'sea' | 'river' | 'gone';
const HALF = { 0: 12, 1: 6.5, 2: 4.5 } as const;

/**
 * `prefix` namespaces every id the city makes (districts, blocks, streets, bridges, precincts) so a
 * second city can live in the same world as the first. The home city's prefix is empty, which keeps
 * every existing seed's ids — and so every save — exactly as they were.
 */
export function generateCity(seed: number, size: CitySize = 'medium', prefix = ''): GeneratedCity {
  const rng = new Rng(seed ^ 0x51c3a);
  const { cols, rows } = CITY_SIZES[size];

  // ---- 1. the lattice: uneven spacings, then warped
  const xs = [0]; for (let i = 0; i < cols; i++) xs.push(xs[i] + rng.int(120, 190));
  const ys = [0]; for (let j = 0; j < rows; j++) ys.push(ys[j] + rng.int(110, 175));
  const W = xs[cols], H = ys[rows];
  const warpSeed = rng.int(1, 1e9);
  const verts: Vec[] = [];
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
    const x = xs[i], y = ys[j];
    // two scales: a broad bend so avenues curve across town, and a local wobble so no two blocks match
    const bx = fbm(warpSeed, x / 1600, y / 1600) * 110 + fbm(warpSeed + 11, x / 500, y / 500) * 28;
    const by = fbm(warpSeed + 3, x / 1600, y / 1600) * 110 + fbm(warpSeed + 17, x / 500, y / 500) * 28;
    verts.push(round1(v(x + bx, y + by)));
  }
  const vt = (i: number, j: number) => verts[j * (cols + 1) + i];
  const cellCenter = (i: number, j: number) => { const a = vt(i, j), b = vt(i + 1, j + 1), c = vt(i + 1, j), d = vt(i, j + 1); return v((a.x + b.x + c.x + d.x) / 4, (a.y + b.y + c.y + d.y) / 4); };

  // ---- 2. water: a coast on one side, and maybe a river
  const kind: CellKind[][] = Array.from({ length: cols }, () => Array<CellKind>(rows).fill('land'));
  const coastal = rng.chance(0.8);
  let sea: Vec[] | undefined;
  let coastSide: 'n' | 's' | 'e' | 'w' | undefined;
  if (coastal) {
    coastSide = rng.pick(['n', 's', 'e', 'w'] as const);
    const along = coastSide === 'n' || coastSide === 's' ? W : H;
    const deep = (coastSide === 'n' || coastSide === 's' ? H : W) * rng.int(14, 24) / 100;
    const cs = rng.int(1, 1e9);
    const line: Vec[] = [];
    for (let t = -300; t <= along + 300; t += 60) {
      const d = deep + fbm(cs, t / 700, 0.5) * deep * 0.55 + fbm(cs + 9, t / 180, 2) * 30;
      line.push(coastSide === 'n' ? v(t, d) : coastSide === 's' ? v(t, H - d) : coastSide === 'w' ? v(d, t) : v(W - d, t));
    }
    const far = 2000;
    const edge = coastSide === 'n' ? [v(W + far, -far), v(-far, -far)] : coastSide === 's' ? [v(W + far, H + far), v(-far, H + far)]
      : coastSide === 'w' ? [v(-far, H + far), v(-far, -far)] : [v(W + far, H + far), v(W + far, -far)];
    sea = [...chaikin(line, 2).map(round1), ...edge];
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) if (pointInPoly(cellCenter(i, j), sea)) kind[i][j] = 'sea';
  }
  let river: City['river'];
  if (rng.chance(0.7)) {
    // Enter on a side that is not the sea and steer for a point on the far side — the coast if
    // there is one, since rivers end in the sea. Steering at a *target* rather than holding a
    // heading is what makes it actually cross town: a drifting heading wandered back out through
    // the side it came in on and clipped one corner of the map.
    const sides = (['n', 's', 'e', 'w'] as const).filter(s => s !== coastSide);
    const from = rng.pick(sides);
    const opp = { n: 's', s: 'n', e: 'w', w: 'e' } as const;
    const to = coastSide ?? opp[from];
    const onSide = (side: 'n' | 's' | 'e' | 'w', f: number, out: number) => side === 'n' ? v(W * f, -out) : side === 's' ? v(W * f, H + out) : side === 'w' ? v(-out, H * f) : v(W + out, H * f);
    let p = onSide(from, rng.int(22, 78) / 100, 150);
    const target = onSide(to, rng.int(25, 75) / 100, coastSide ? -H * 0.05 : 150);
    const rs = rng.int(1, 1e9);
    const path: Vec[] = [p];
    let ang = Math.atan2(target.y - p.y, target.x - p.x);
    for (let k = 0; k < 200; k++) {
      const want = Math.atan2(target.y - p.y, target.x - p.x);
      ang += Math.atan2(Math.sin(want - ang), Math.cos(want - ang)) * 0.18 + fbm(rs, k / 5, 0) * 0.55;
      p = v(p.x + Math.cos(ang) * 80, p.y + Math.sin(ang) * 80);
      path.push(p);
      if (k > 4 && (p.x < -220 || p.y < -220 || p.x > W + 220 || p.y > H + 220)) break;
      if (sea && k > 3 && pointInPoly(p, sea)) { path.push(v(p.x + Math.cos(ang) * 250, p.y + Math.sin(ang) * 250)); break; }
    }
    const width = rng.int(55, 85);
    river = { path: chaikin(path, 2).map(round1), width };
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) if (kind[i][j] === 'land' && distToPath(cellCenter(i, j), river.path) < width * 0.5 + 38) kind[i][j] = 'river';
  }

  // ---- streets: which lines are avenues, and what everything is called
  const taken = new Set<string>();
  const numberX = rng.chance(0.5);
  const avX = rng.int(3, 4), avY = rng.int(3, 4), offX = rng.int(0, avX - 1), offY = rng.int(0, avY - 1);
  const streets: Street[] = [];
  let nth = 1;
  for (let i = 0; i <= cols; i++) {
    const rank = (i % avX === offX ? 0 : i === 0 || i === cols ? 2 : 1) as 0 | 1 | 2;
    const n = streetName(rng, rank, numberX ? nth++ : undefined, taken);
    streets.push({ id: `${prefix}sx${i}`, name: n.full, rank, axis: 'x', index: i, points: Array.from({ length: rows + 1 }, (_, j) => vt(i, j)) });
    (streets[streets.length - 1] as Street & { short: string }).short = n.short;
  }
  nth = 1;
  for (let j = 0; j <= rows; j++) {
    const rank = (j % avY === offY ? 0 : j === 0 || j === rows ? 2 : 1) as 0 | 1 | 2;
    const n = streetName(rng, rank, numberX ? undefined : nth++, taken);
    streets.push({ id: `${prefix}sy${j}`, name: n.full, rank, axis: 'y', index: j, points: Array.from({ length: cols + 1 }, (_, i) => vt(i, j)) });
    (streets[streets.length - 1] as Street & { short: string }).short = n.short;
  }
  const xLine = (i: number) => streets[i] as Street & { short: string };
  const yLine = (j: number) => streets[cols + 1 + j] as Street & { short: string };

  // ---- 4. districts: spread seeds over the land, give each a character by where it sits
  const land: [number, number][] = [];
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) if (kind[i][j] === 'land') land.push([i, j]);
  const mid = v(W / 2, H / 2);
  const waterDist = (p: Vec) => Math.min(sea ? coastDist(p, sea) : Infinity, river ? distToPath(p, river.path) : Infinity);
  const K = Math.max(5, Math.min(12, Math.round(land.length / 22)));
  const seeds: Vec[] = [cellCenter(...land[Math.floor(rng.float() * land.length)])];
  while (seeds.length < K) {
    let best: Vec | undefined, bd = -1;
    for (let t = 0; t < 40; t++) {
      const c = cellCenter(...land[Math.floor(rng.float() * land.length)]);
      const d = Math.min(...seeds.map(s => dist(s, c)));
      if (d > bd) { bd = d; best = c; }
    }
    seeds.push(best!);
  }
  const order: DistrictKind[] = ['downtown', 'docks', 'oldtown', 'strip', 'heights', 'market', 'industrial', 'projects', 'suburb', 'docks', 'industrial', 'projects'];
  const kinds: (DistrictKind | undefined)[] = seeds.map(() => undefined);
  const hasWater = !!(sea || river);
  for (const k of order) {
    if (kinds.every(x => x)) break;
    if (k === 'docks' && !hasWater) continue;
    let bi = -1, bs = -Infinity;
    seeds.forEach((s, idx) => {
      if (kinds[idx]) return;
      const c = -dist(s, mid), w = -waterDist(s);
      const score = k === 'downtown' ? c : k === 'docks' ? w * 2 + c * 0.2 : k === 'oldtown' || k === 'strip' || k === 'market' ? c - Math.abs(w + 300) * 0.1
        : k === 'heights' || k === 'suburb' ? -c - Math.max(0, 300 + w) : k === 'industrial' ? w + c * 0.3 : -Math.abs(c + 700);
      if (score > bs) { bs = score; bi = idx; }
    });
    if (bi >= 0) kinds[bi] = k;
  }
  const dNames = new Set<string>();
  const districts: Record<Id, District> = {};
  const dIds = seeds.map((s, idx) => {
    const k = kinds[idx] ?? 'suburb';
    const id = `${prefix}d${idx}`;
    const def = DISTRICTS[k];
    districts[id] = {
      id, name: districtName(rng, k, dNames), kind: k, center: round1(s),
      wealth: Math.round(def.wealth[0] + rng.float() * (def.wealth[1] - def.wealth[0])),
      police: Math.round(def.police[0] + rng.float() * (def.police[1] - def.police[0])),
      attention: 0, precinctId: '', blockIds: [],
    };
    districts[id].attention = districts[id].police;
    return id;
  });
  const dns = rng.int(1, 1e9);
  const cellDistrict: Id[][] = Array.from({ length: cols }, () => Array<Id>(rows).fill(''));
  for (const [i, j] of land) {
    const c = cellCenter(i, j);
    let best = 0, bd = Infinity;
    seeds.forEach((s, idx) => { const d = dist(s, c) + fbm(dns + idx, c.x / 500, c.y / 500) * 110; if (d < bd) { bd = d; best = idx; } });
    cellDistrict[i][j] = dIds[best];
  }

  // ---- 5. blocks: merge cells into lots the district wants, then outline and inset
  const cellBlock: (Id | undefined)[][] = Array.from({ length: cols }, () => Array<Id | undefined>(rows).fill(undefined));
  const blocks: Record<Id, Block> = {};
  const parks: City['parks'] = [];
  const parkQuota = Math.max(1, Math.round(land.length / 70));
  let parksMade = 0;
  const cells = rng.shuffle(land);
  let bn = 0;
  const free = (i: number, j: number, d: Id) => i < cols && j < rows && kind[i][j] === 'land' && !cellBlock[i][j] && cellDistrict[i][j] === d;
  for (const [i, j] of cells) {
    if (cellBlock[i][j]) continue;
    const d = cellDistrict[i][j];
    const dk = districts[d].kind;
    const big = DISTRICTS[dk].merge;
    const wantPark = parksMade < parkQuota && (dk === 'heights' || dk === 'suburb' || dk === 'oldtown' || dk === 'downtown') && rng.chance(0.08);
    let w = 1, h = 1;
    const r = rng.float();
    if (wantPark || r < big * 0.35) { w = 2; h = 2; } else if (r < big) { if (rng.chance(0.5)) w = 2; else h = 2; }
    // shrink until the rectangle fits
    while (w * h > 1) {
      let ok = true;
      for (let a = 0; a < w && ok; a++) for (let b = 0; b < h && ok; b++) if (!free(i + a, j + b, d)) ok = false;
      if (ok) break;
      if (w === 2 && h === 2) { if (rng.chance(0.5)) w = 1; else h = 1; } else { w = 1; h = 1; }
    }
    const id = `${prefix}b${bn++}`;
    for (let a = 0; a < w; a++) for (let b = 0; b < h; b++) cellBlock[i + a][j + b] = id;
    const i1 = i + w - 1, j1 = j + h - 1;
    const sides = [
      { pts: range(i, i1 + 1).map(x => vt(x, j)), w: HALF[yLine(j).rank] },
      { pts: range(j, j1 + 1).map(y => vt(i1 + 1, y)), w: HALF[xLine(i1 + 1).rank] },
      { pts: range(i, i1 + 1).reverse().map(x => vt(x, j1 + 1)), w: HALF[yLine(j1 + 1).rank] },
      { pts: range(j, j1 + 1).reverse().map(y => vt(i, y)), w: HALF[xLine(i).rank] },
    ];
    const poly = insetSides(sides);
    const isPark = wantPark && w * h >= 2;
    const ns = [xLine(i), xLine(i1 + 1)].sort((a, b) => a.rank - b.rank)[0];
    const ew = [yLine(j), yLine(j1 + 1)].sort((a, b) => a.rank - b.rank)[0];
    const def = DISTRICTS[dk];
    const wealth = Math.max(5, Math.min(100, Math.round(districts[d].wealth + rng.gauss(0, 8))));
    blocks[id] = {
      id, name: `${ns.short} & ${ew.short}`, districtId: d, cells: [i, j, i1, j1], poly, center: round1(centroid(poly)),
      neighborIds: [], waterfront: false, wealth,
      population: isPark ? 0 : Math.round(def.population * w * h * (0.7 + rng.float() * 0.6)),
      heat: 0, influence: {}, businessIds: [],
    };
    if (isPark) { const pn = parkName(rng); blocks[id].landmark = pn; parks.push({ id, name: pn, poly }); parksMade++; }
    districts[d].blockIds.push(id);
  }

  // ---- adjacency across streets, then bridges over the river
  const link = (a: Id, b: Id) => { if (a === b) return; const A = blocks[a], B = blocks[b]; if (!A.neighborIds.includes(b)) A.neighborIds.push(b); if (!B.neighborIds.includes(a)) B.neighborIds.push(a); };
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const a = cellBlock[i][j]; if (!a) continue;
    if (i + 1 < cols && cellBlock[i + 1][j]) link(a, cellBlock[i + 1][j]!);
    if (j + 1 < rows && cellBlock[i][j + 1]) link(a, cellBlock[i][j + 1]!);
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = i + di, y = j + dj;
      if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
      if (kind[x][y] === 'sea' || kind[x][y] === 'river') blocks[a].waterfront = true;
    }
  }
  const bridges: Bridge[] = [];
  /** Walk a column (or row) of cells from a land cell across water; return the land cell on the far side. */
  const across = (i: number, j: number, di: number, dj: number, maxRun: number): [number, number] | undefined => {
    let x = i + di, y = j + dj, run = 0;
    while (x >= 0 && y >= 0 && x < cols && y < rows && kind[x][y] === 'river') { x += di; y += dj; run++; if (run > maxRun) return undefined; }
    if (run === 0 || x < 0 || y < 0 || x >= cols || y >= rows || !cellBlock[x][y]) return undefined;
    return [x, y];
  };
  /**
   * A bridge has to *cross* the water. Walking a column of cells finds land beyond a run of river
   * just as happily when the river runs down that column, and the first draft drew bridges lying
   * along the bank. `strict` asks that the span meet the river at a real angle.
   */
  const crosses = (from: Vec, to: Vec) => {
    if (!river) return true;
    let bi = 0, bd = Infinity;
    const m = v((from.x + to.x) / 2, (from.y + to.y) / 2);
    river.path.forEach((q, k) => { const d = dist(q, m); if (d < bd) { bd = d; bi = k; } });
    const a = river.path[Math.max(0, bi - 1)], b = river.path[Math.min(river.path.length - 1, bi + 1)];
    const rx = b.x - a.x, ry = b.y - a.y, sx = to.x - from.x, sy = to.y - from.y;
    const cos = Math.abs(rx * sx + ry * sy) / ((Math.hypot(rx, ry) * Math.hypot(sx, sy)) || 1);
    return cos < 0.6 && bd < river.width * 1.6;
  };
  const addBridge = (i: number, j: number, far: [number, number], vertical: boolean, strict = true) => {
    const a = cellBlock[i][j]!, b = cellBlock[far[0]][far[1]]!;
    if (blocks[a].neighborIds.includes(b)) return false;
    const from = vertical ? (far[1] > j ? vt(i + 1, j + 1) : vt(i + 1, j)) : (far[0] > i ? vt(i + 1, j + 1) : vt(i, j + 1));
    const to = vertical ? (far[1] > j ? vt(i + 1, far[1]) : vt(i + 1, far[1] + 1)) : (far[0] > i ? vt(far[0], j + 1) : vt(far[0] + 1, j + 1));
    if (strict && !crosses(from, to)) return false;
    link(a, b);
    const line = vertical ? xLine(i + 1) : yLine(j + 1);
    bridges.push({ id: `${prefix}br${bridges.length}`, streetId: line.id, from: round1(from), to: round1(to) });
    return true;
  };
  // every avenue meeting the river crosses it
  for (let i = 0; i < cols - 1; i++) if (xLine(i + 1).rank === 0) for (let j = 0; j < rows; j++) {
    if (!cellBlock[i][j] || j + 1 >= rows || kind[i][j + 1] !== 'river') continue;
    const far = across(i, j, 0, 1, 5); if (far) addBridge(i, j, far, true);
  }
  for (let j = 0; j < rows - 1; j++) if (yLine(j + 1).rank === 0) for (let i = 0; i < cols; i++) {
    if (!cellBlock[i][j] || i + 1 >= cols || kind[i + 1][j] !== 'river') continue;
    const far = across(i, j, 1, 0, 5); if (far) addBridge(i, j, far, false);
  }
  // anything still cut off gets the shortest bridge that joins it to the main city
  for (let guard = 0; guard < 12; guard++) {
    const comps = components(blocks);
    if (comps.length <= 1) break;
    const main = new Set(comps[0]);
    let done = false;
    for (let i = 0; i < cols && !done; i++) for (let j = 0; j < rows && !done; j++) {
      const a = cellBlock[i][j]; if (!a || main.has(a)) continue;
      for (const [di, dj] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const far = across(i, j, di, dj, 6);
        // a proper crossing if there is one; a span along the bank only when nothing else joins it
        if (far && main.has(cellBlock[far[0]][far[1]]!) && (addBridge(i, j, far, dj !== 0) || (guard > 6 && addBridge(i, j, far, dj !== 0, false)))) { done = true; break; }
      }
    }
    if (!done) break;
  }
  // and land that still cannot be reached is not part of the game
  const comps = components(blocks);
  for (const comp of comps.slice(1)) for (const id of comp) {
    const b = blocks[id];
    districts[b.districtId].blockIds = districts[b.districtId].blockIds.filter(x => x !== id);
    for (const n of b.neighborIds) blocks[n].neighborIds = blocks[n].neighborIds.filter(x => x !== id);
    delete blocks[id];
    const pi = parks.findIndex(p => p.id === id); if (pi >= 0) parks.splice(pi, 1);
  }
  for (const d of Object.values(districts)) if (!d.blockIds.length) delete districts[d.id];

  // ---- precincts: two or three station houses, each covering the nearest districts
  const dlist = Object.values(districts);
  const pCount = dlist.length >= 9 ? 3 : 2;
  const pSeeds = rng.shuffle(dlist).slice(0, pCount);
  const precincts = pSeeds.map((d, n) => ({ id: `${prefix}p${n}`, name: `${ordinalWord(n + 1)} Precinct`, blockId: '', districtIds: [] as Id[], center: d.center }));
  for (const d of dlist) {
    const p = precincts.reduce((a, b) => (dist(a.center, d.center) <= dist(b.center, d.center) ? a : b));
    d.precinctId = p.id; p.districtIds.push(d.id);
  }
  const landmarks = rng.shuffle(landmarkPool());
  const pickBlock = (ds: Id[], avoid: Set<Id>) => {
    const cands = ds.flatMap(id => districts[id].blockIds).filter(id => !avoid.has(id) && !blocks[id].landmark);
    return cands.length ? cands.reduce((a, b) => (blocks[a].population >= blocks[b].population ? a : b)) : ds.flatMap(id => districts[id].blockIds)[0];
  };
  const used = new Set<Id>();
  for (const p of precincts) { p.blockId = pickBlock(p.districtIds, used); used.add(p.blockId); blocks[p.blockId].landmark = `the ${p.name.toLowerCase()} station house`; }
  const center = dlist.find(d => d.kind === 'downtown') ?? dlist[0];
  const cityHallBlockId = pickBlock([center.id], used); used.add(cityHallBlockId); blocks[cityHallBlockId].landmark = 'city hall';
  const courthouseBlockId = pickBlock([center.id, ...dlist.filter(d => d.kind === 'oldtown').map(d => d.id)], used); used.add(courthouseBlockId); blocks[courthouseBlockId].landmark = 'the courthouse';
  for (const d of dlist) if (rng.chance(0.5)) {
    const b = pickBlock([d.id], used); if (!b || blocks[b].landmark) continue;
    const l = landmarks.pop(); if (!l || ['city hall', 'the courthouse'].includes(l)) continue;
    blocks[b].landmark = l; used.add(b);
  }

  const city: City = {
    name: cityName(rng, coastal), motto: cityMotto(rng), width: W, height: H, cols, rows, verts,
    streets: streets.map(s => ({ id: s.id, name: s.name, rank: s.rank, axis: s.axis, index: s.index, points: s.points })),
    sea, river, bridges, parks,
  };
  return { city, districts, blocks, precincts: precincts.map(({ center: _c, ...p }) => p), cityHallBlockId, courthouseBlockId };
}

function range(a: number, b: number): number[] { const out: number[] = []; for (let x = a; x <= b; x++) out.push(x); return out; }
function ordinalWord(n: number) { return ['First', 'Second', 'Third', 'Fourth'][n - 1] ?? `${n}th`; }

/** Distance to the shoreline: the sea polygon's first stretch is the coast. */
function coastDist(p: Vec, sea: Vec[]): number { return pointInPoly(p, sea) ? 0 : distToPath(p, sea.slice(0, sea.length - 2)); }

/** Connected groups of blocks, biggest first. */
export function components(blocks: Record<Id, Block>): Id[][] {
  const seen = new Set<Id>(); const out: Id[][] = [];
  for (const id of Object.keys(blocks)) {
    if (seen.has(id)) continue;
    const comp: Id[] = []; const stack = [id]; seen.add(id);
    while (stack.length) { const x = stack.pop()!; comp.push(x); for (const n of blocks[x].neighborIds) if (!seen.has(n) && blocks[n]) { seen.add(n); stack.push(n); } }
    out.push(comp);
  }
  return out.sort((a, b) => b.length - a.length);
}

export { ribbon };
