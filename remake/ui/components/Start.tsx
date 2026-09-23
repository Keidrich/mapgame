/**
 * The Remake's front page. The city is generated live as you choose — roll the dice and a new
 * one appears, map and all, before you commit — because the whole point of this game is that
 * the place is made for you.
 */
import { useMemo, useState } from 'react';
import { BACKGROUNDS } from '@r/content/world';
import { CITY_SIZES, newWorld, type CitySize } from '@r/sim/index';
import { hashString } from '@r/sim/rng';
import type { Background } from '@r/sim/types';
import { Icon } from '@ui/icons';
import { TitleTabs } from '@ui/components/TitleTabs';
import { deleteSlot, open, startGame, useSlots } from '../store';
import { CityMap } from './CityMap';
import { Emblem } from './Faces';

const randomSeed = () => Math.floor(Math.random() * 1e9);
const BG_ORDER: Background[] = ['bruiser', 'grifter', 'brain', 'wheelman', 'hacker', 'drifter'];
const BG_ICON: Record<Background, string> = { bruiser: 'fist', grifter: 'hand', brain: 'note', wheelman: 'muscle_car', hacker: 'laptop', drifter: 'gambling_den' };

export function Start() {
  const [seed, setSeed] = useState(randomSeed);
  const [seedText, setSeedText] = useState('');
  const [size, setSize] = useState<CitySize>('medium');
  const [bg, setBg] = useState<Background>('grifter');
  const [name, setName] = useState('');
  const [nick, setNick] = useState('');
  const preview = useMemo(() => newWorld({ seed, size, name: name || 'You', background: bg }), [seed, size, bg, name]);
  const factions = Object.values(preview.factions);
  const useSeedText = () => { const t = seedText.trim(); if (!t) return; setSeed(/^\d+$/.test(t) ? Number(t) : hashString(t.toLowerCase())); };
  const slots = useSlots();
  const saved = slots.filter((x): x is NonNullable<typeof x> => !!x);
  const full = saved.length >= slots.length;
  const [sure, setSure] = useState<number | null>(null);
  const begin = () => startGame(newWorld({ seed, size, name: name.trim() || 'Nobody', nick: nick.trim() || undefined, background: bg }));

  return (
    <div className="r-start">
      <TitleTabs current="remake" />
      <header className="r-masthead">
        <div className="r-masthead-rule"><span>Vol. II</span><span>Every city generated</span><span>Late edition</span></div>
        <h1>RACKETS</h1>
        <p className="r-masthead-sub">The Remake — a crime empire in a city nobody has seen before</p>
      </header>

      {saved.length > 0 && (
        <section className="r-saved" aria-label="Your cities">
          <h3 className="r-h3">Your cities</h3>
          {saved.map(x => (
            <div key={x.slot} className="r-saved-row">
              <button type="button" className="r-saved-main" onClick={() => void open(x.slot)}>
                <b>{x.city}</b>
                <span>{x.name} · day {x.day} · worth ${x.worth.toLocaleString('en-US')} · seed {x.seed}</span>
              </button>
              <button type="button" className="r-btn primary small" onClick={() => void open(x.slot)}>Continue</button>
              <button type="button" className={`r-btn small ${sure === x.slot ? 'danger' : 'ghost'}`} onClick={() => { if (sure === x.slot) { void deleteSlot(x.slot); setSure(null); } else setSure(x.slot); }}>{sure === x.slot ? 'Gone for good?' : 'Delete'}</button>
            </div>
          ))}
        </section>
      )}

      <section className="r-city-card" aria-label="Your city">
        <div className="r-city-map"><CityMap w={preview} mini /></div>
        <div className="r-city-info">
          <div className="r-kicker">Tonight's city</div>
          <h2>{preview.city.name}</h2>
          <p className="r-motto">“{preview.city.motto}”</p>
          <p className="r-city-facts">{Object.keys(preview.districts).length} districts · {Object.keys(preview.blocks).length} blocks · {Object.keys(preview.businesses).length} businesses · {preview.city.river ? 'a river' : 'no river'}{preview.city.sea ? ', a coast' : ''}</p>
          <div className="r-rivals-preview">
            {factions.map(f => <span key={f.id} className="r-rival-chip"><Emblem e={f.emblem} size={20} />{f.name}</span>)}
          </div>
          <div className="r-city-controls">
            <button type="button" className="r-btn primary" onClick={() => setSeed(randomSeed())}><Icon name="gambling_den" size={16} /> Another city</button>
            <div className="r-seg" role="group" aria-label="City size">
              {(Object.keys(CITY_SIZES) as CitySize[]).map(s => <button type="button" key={s} className={size === s ? 'on' : ''} aria-pressed={size === s} onClick={() => setSize(s)}>{CITY_SIZES[s].label}</button>)}
            </div>
          </div>
          <form className="r-seed" onSubmit={e => { e.preventDefault(); useSeedText(); }}>
            <label htmlFor="r-seed-in">Seed</label>
            <input id="r-seed-in" className="r-input" placeholder={String(seed)} value={seedText} onChange={e => setSeedText(e.target.value)} autoComplete="off" />
            <button type="submit" className="r-btn small">Use</button>
          </form>
          <p className="r-hint">Same seed, same city — for anybody, on any device. Share it.</p>
        </div>
      </section>

      <section className="r-who">
        <div className="r-field-row">
          <div className="grow"><label htmlFor="r-name">Your name</label><input id="r-name" className="r-input" placeholder="What do they call you?" value={name} onChange={e => setName(e.target.value)} maxLength={24} autoComplete="off" /></div>
          <div className="grow"><label htmlFor="r-nick">Street name (optional)</label><input id="r-nick" className="r-input" placeholder="Leave it to the street" value={nick} onChange={e => setNick(e.target.value)} maxLength={18} autoComplete="off" /></div>
        </div>
        <h3 className="r-h3">Who you were before</h3>
        <div className="r-bg-grid">
          {BG_ORDER.map(k => {
            const b = BACKGROUNDS[k];
            return (
              <button type="button" key={k} className={`r-bg${bg === k ? ' on' : ''}`} aria-pressed={bg === k} onClick={() => setBg(k)}>
                <span className="r-bg-top"><Icon name={BG_ICON[k]} size={18} /><b>{b.label}</b></span>
                <span className="r-bg-blurb">{b.blurb}</span>
                {bg === k && <span className="r-bg-perk">{b.perk}</span>}
                <span className="r-bg-skills">{Object.entries(k === 'drifter' ? preview.player.skills : b.skills).map(([s, v]) => <span key={s}><i>{s.slice(0, 3)}</i>{v}</span>)}</span>
              </button>
            );
          })}
        </div>
      </section>

      <footer className="r-start-foot">
        <button type="button" className="r-btn primary block big" onClick={begin} disabled={full}>Start in {preview.city.name}</button>
        {full && <p className="r-why center">Three cities is the most you can keep. Delete one above to start another.</p>}
        <p className="r-hint center">Starting on {preview.blocks[preview.player.blockId].name}, {preview.districts[preview.blocks[preview.player.blockId].districtId].name}.</p>
      </footer>
    </div>
  );
}
