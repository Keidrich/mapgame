/**
 * Map overlays. The contract is that every mode reads a field the sim already keeps, shades
 * the city by it, and changes nothing — no new per-block stat, no simulation difference while
 * an overlay is on. These tests hold the "reads existing fields only" line, which is the one
 * that gets crossed when somebody wants a prettier overlay later.
 */
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { generateWorld } from '@sim/generate';
import { PLAYER, select, type World } from '@sim/index';
import { layerValue } from './components/Map';
import { MapLayers } from './components/MapLayers';
import { newGame, setLayer, getState } from './store';
import { plain } from './test-util';

const mk = (seed = 4) => generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'brains', seed });
const render = (w: World) => { newGame(w); return plain(renderToString(<MapLayers />)); };
const anyBlock = (w: World) => Object.values(w.blocks)[0];

describe('the picker', () => {
  it('offers every overlay, and starts on plain control', () => {
    const w = mk();
    const html = render(w);
    for (const label of ['Control', 'Heat', 'Wealth', 'Police', 'Influence', 'Demand']) expect(html).toContain(label);
    expect(getState().layer).toBe('control');
  });

  it('switching is presentation only: the world object is untouched', () => {
    const w = mk();
    render(w);
    const before = JSON.stringify(getState().world);
    for (const l of ['heat', 'wealth', 'police', 'influence', 'demand', 'control'] as const) setLayer(l);
    expect(JSON.stringify(getState().world)).toBe(before);
  });
});

describe('what each overlay reads', () => {
  it('control has no shading value of its own — it is the existing faction view', () => {
    const w = mk();
    expect(layerValue(w, anyBlock(w).id, { layer: 'control' })).toBeUndefined();
  });

  it('heat and wealth read the block fields directly', () => {
    const w = mk();
    const b = anyBlock(w);
    b.heat = 40; b.wealth = 80;
    expect(layerValue(w, b.id, { layer: 'heat' })).toBeCloseTo(0.4, 6);
    expect(layerValue(w, b.id, { layer: 'wealth' })).toBeCloseTo(0.8, 6);
  });

  it('police reads the block baseline plus the live Authority field', () => {
    const w = mk();
    const a = select.authorities(w)[0];
    const field = select.monitoringField(w);
    const withField = layerValue(w, a.blockId, { layer: 'police', field })!;
    const without = layerValue(w, a.blockId, { layer: 'police' })!;
    expect(withField).toBeGreaterThan(without);
    expect(without).toBeCloseTo(w.blocks[a.blockId].police / 100, 6);
  });

  it('influence reads one outfit at a time', () => {
    const w = mk();
    const b = anyBlock(w);
    b.influence = { [PLAYER]: 60 };
    expect(layerValue(w, b.id, { layer: 'influence', factionId: PLAYER })).toBeCloseTo(0.6, 6);
    const rival = Object.values(w.factions)[0].id;
    expect(layerValue(w, b.id, { layer: 'influence', factionId: rival })).toBe(0);
  });

  it('demand reads one product at a time, off the demand record that already exists', () => {
    const w = mk();
    const b = anyBlock(w);
    expect(b.demand).toBeDefined();
    const green = layerValue(w, b.id, { layer: 'demand', product: 'green' })!;
    expect(green).toBeGreaterThanOrEqual(0);
    expect(green).toBeLessThanOrEqual(1);
    b.demand.green = 0;
    expect(layerValue(w, b.id, { layer: 'demand', product: 'green' })).toBe(0);
  });

  it('every overlay stays inside 0..1, however extreme the field', () => {
    const w = mk();
    const b = anyBlock(w);
    b.heat = 100; b.wealth = 100; b.police = 100; b.influence = { [PLAYER]: 100 }; b.demand.green = 999;
    const field = select.monitoringField(w);
    for (const layer of ['heat', 'wealth', 'police', 'influence', 'demand'] as const) {
      const v = layerValue(w, b.id, { layer, factionId: PLAYER, product: 'green', field })!;
      expect(v, layer).toBeGreaterThanOrEqual(0);
      expect(v, layer).toBeLessThanOrEqual(1);
    }
  });

  it('adds no per-block stat: every overlay is a read of something already on the block', () => {
    const w = mk();
    const b = anyBlock(w);
    const keys = new Set(Object.keys(b));
    for (const k of ['heat', 'wealth', 'police', 'influence', 'demand']) expect(keys, k).toContain(k);
    // and reading every layer does not add one
    const field = select.monitoringField(w);
    for (const layer of ['heat', 'wealth', 'police', 'influence', 'demand', 'control'] as const) layerValue(w, b.id, { layer, field });
    expect(new Set(Object.keys(w.blocks[b.id]))).toEqual(keys);
  });
});
