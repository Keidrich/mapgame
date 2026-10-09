import { expect, it } from 'vitest';
import type { RealCity } from '@geo/realCity';
import { streetLabels } from './view';

it('follows the camera with one nearby label per street instead of choosing an off-screen long segment', () => {
  const street = (id: string, x: number, length: number) => ({ id, name: 'Orchard Street', points: [{ x, y: 0 }, { x: x + length, y: 0 }], width: 9, major: false });
  const city = { streets: [street('far', 2000, 1000), street('near', 0, 40)] } as RealCity;
  expect(streetLabels(city).map(s => s.x)).toEqual([20]);
  expect(streetLabels(city, { x: 2500, y: 0 }).map(s => s.x)).toEqual([2500]);
});
