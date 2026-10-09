import { expect, it } from 'vitest';
import { polygonTriangles } from './geometry';
it('triangulates a courtyard without filling its hole', () => {
  const ring = (n: number, p: number) => [{ x: p, y: p }, { x: n, y: p }, { x: n, y: n }, { x: p, y: n }];
  const p = polygonTriangles([ring(10, 0), ring(7, 3)], 12);
  let area = 0;
  for (let i = 0; i < p.length; i += 9) {
    area += Math.abs((p[i + 3] - p[i]) * (p[i + 8] - p[i + 2]) - (p[i + 6] - p[i]) * (p[i + 5] - p[i + 2])) / 2;
    expect(p[i + 1]).toBe(12);
  }
  expect(area).toBe(84);
});
