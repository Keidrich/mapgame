/**
 * Every screen of the Remake renders, for a fresh city and one a month into a real game. A throw
 * in a render is a black screen with the save out of reach — the original learned that twice —
 * so every sheet the map can open is rendered here, not sampled.
 */
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { newWorld } from '@r/sim/index';
import { run } from '@r/scripts/bot';
import { startGame } from '@r/ui/store';
import { Start } from '@r/ui/components/Start';
import { BlockSheet, BusinessSheet } from '@r/ui/components/PlaceSheets';
import { PersonSheet } from '@r/ui/components/PersonSheet';
import { FactionSheet, JobSheet } from '@r/ui/components/JobFaction';
import { CrewTab, EmpireTab, JobsTab, PeopleTab, RivalsTab } from '@r/ui/components/Tabs';
import { CityMap } from '@r/ui/components/CityMap';
import { TitleTabs } from '@ui/components/TitleTabs';

describe('the start screen', () => {
  it('renders, with the game picker and a live city', () => {
    const html = renderToString(<Start />);
    expect(html).toContain('RACKETS: Remake');
    expect(html).toContain('The original');
    expect(html).toContain('Another city');
    expect(html).toContain('<svg');
  });
  it('the picker marks which game is on', () => {
    expect(renderToString(<TitleTabs current="remake" />)).toMatch(/aria-pressed="true"[^>]*><b>RACKETS: Remake/);
  });
});

describe('every sheet and tab renders', () => {
  const worlds = [newWorld({ seed: 4, size: 'small', name: 'T', background: 'bruiser' }), run({ days: 30, seed: 2, size: 'small' }).w];
  it.each(worlds.map((w, i) => [i === 0 ? 'fresh' : 'a month in', w] as const))('%s', (_label, w) => {
    startGame(w);
    for (const T of [PeopleTab, CrewTab, JobsTab, EmpireTab, RivalsTab]) expect(() => renderToString(<T />)).not.toThrow();
    expect(renderToString(<CityMap w={w} />)).toContain(w.city.name);
    for (const b of Object.values(w.blocks)) renderToString(<BlockSheet id={b.id} />);
    for (const b of Object.values(w.businesses)) renderToString(<BusinessSheet id={b.id} />);
    for (const n of Object.values(w.npcs).filter((_, i) => i % 3 === 0)) renderToString(<PersonSheet id={n.id} />);
    for (const id of w.player.crewIds) renderToString(<PersonSheet id={id} />);
    for (const j of Object.values(w.jobs)) renderToString(<JobSheet id={j.id} />);
    for (const f of Object.values(w.factions)) renderToString(<FactionSheet id={f.id} />);
  }, 90000);
});
