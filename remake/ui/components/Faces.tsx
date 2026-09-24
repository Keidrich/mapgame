/**
 * Procedural faces and emblems. Nobody in the Remake has a stock portrait: a face is built from
 * the person's seed — head, skin, hair, eyes, nose, facial hair, glasses, a hat for a boss — and
 * its *expression* is read off how they feel about you right now, so the face changes as the
 * relationship does. A frightened owner looks frightened.
 */
import type { Emblem as EmblemT, Npc, Trait } from '@r/sim/types';
import { mute } from './tone';

function mulberry(seed: number) { let t = seed >>> 0; return () => { t = (t + 0x6d2b79f5) | 0; let x = Math.imul(t ^ (t >>> 15), 1 | t); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }
const SKIN = ['#f5d6c0', '#eac1a1', '#d9a47f', '#c68a62', '#a86d48', '#8a5436', '#6b3f28', '#4e2c1d'];
const HAIR = ['#1b1a1a', '#2e2019', '#4a3121', '#6d4526', '#8d4a2b', '#b98a4a', '#d8c08a', '#8b8b8b', '#d9d9d9'];

export interface FaceOpts { seed: number; pronoun?: 'he' | 'she' | 'they'; age?: number; traits?: Trait[]; mood?: 'warm' | 'afraid' | 'hostile' | 'neutral'; hat?: boolean; tint?: string; size?: number; dead?: boolean }

export function Face({ seed, pronoun = 'they', age = 40, traits = [], mood = 'neutral', hat, tint = '#252a36', size = 48, dead }: FaceOpts) {
  const r = mulberry(seed);
  const skin = SKIN[Math.floor(r() * SKIN.length)];
  const grey = age > 55 && r() < 0.7;
  const hairC = grey ? HAIR[7 + Math.floor(r() * 2)] : HAIR[Math.floor(r() * 7)];
  const rx = 15 + r() * 4, ry = 19 + r() * 3;
  const style = Math.floor(r() * 8);
  const long = pronoun === 'she' ? r() < 0.7 : r() < 0.12;
  const bald = pronoun === 'he' && (age > 45 ? r() < 0.35 : r() < 0.08);
  const eyeY = 31 + r() * 2, eyeDx = 6 + r() * 1.5;
  const beard = pronoun === 'he' && r() < 0.35, stache = pronoun === 'he' && !beard && r() < 0.3;
  const glasses = r() < (traits.includes('sly') || traits.includes('quiet') ? 0.4 : 0.14);
  const scar = traits.includes('tough') || traits.includes('hothead') ? r() < 0.5 : r() < 0.05;
  const earring = r() < 0.2;
  const noseW = 1.5 + r() * 2;
  // brows and mouth carry the mood, and a couple of traits
  const angry = mood === 'hostile' || traits.includes('hothead');
  const scared = mood === 'afraid' || traits.includes('coward');
  const browL = angry ? 'M20 27 L27 29' : scared ? 'M20 28 L27 26' : 'M20 27.5 L27 27';
  const browR = angry ? 'M44 27 L37 29' : scared ? 'M44 28 L37 26' : 'M44 27.5 L37 27';
  const mouth = mood === 'warm' ? 'M26 44 Q32 49 38 44' : mood === 'afraid' ? 'M28 46 Q32 42 36 46 Q32 48 28 46' : mood === 'hostile' ? 'M26 46 Q32 42 38 46' : 'M27 45 L37 45';
  const hc = hairC;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className="r-face" aria-hidden="true" style={dead ? { filter: 'grayscale(1)', opacity: 0.55 } : undefined}>
      <rect width="64" height="64" rx="10" fill={tint} />
      {/* shoulders */}
      <path d={`M8 64 Q12 50 32 50 Q52 50 56 64 Z`} fill={hat ? '#1c1c22' : '#3a4152'} />
      {long && !bald && <path d={`M${32 - rx - 3} 30 Q${32 - rx - 5} 52 ${32 - rx + 2} 56 L${32 + rx - 2} 56 Q${32 + rx + 5} 52 ${32 + rx + 3} 30 Z`} fill={hc} />}
      <ellipse cx="32" cy="34" rx={rx} ry={ry} fill={skin} />
      <ellipse cx={32 - rx + 0.5} cy="35" rx="2.2" ry="3.5" fill={skin} />
      <ellipse cx={32 + rx - 0.5} cy="35" rx="2.2" ry="3.5" fill={skin} />
      {earring && <circle cx={32 + rx - 0.5} cy="39.5" r="1" fill="#e8c35a" />}
      {!bald && hair(style, rx, hc)}
      {traits.includes('junkie') && <><ellipse cx={32 - eyeDx} cy={eyeY + 2.5} rx="3" ry="1.2" fill="#000" opacity=".18" /><ellipse cx={32 + eyeDx} cy={eyeY + 2.5} rx="3" ry="1.2" fill="#000" opacity=".18" /></>}
      <path d={browL} stroke={hc} strokeWidth="1.6" strokeLinecap="round" />
      <path d={browR} stroke={hc} strokeWidth="1.6" strokeLinecap="round" />
      {dead ? <><path d={`M${32 - eyeDx - 2} ${eyeY - 2} l4 4 m0 -4 l-4 4`} stroke="#222" strokeWidth="1.2" /><path d={`M${32 + eyeDx - 2} ${eyeY - 2} l4 4 m0 -4 l-4 4`} stroke="#222" strokeWidth="1.2" /></>
        : traits.includes('sly') ? <><path d={`M${32 - eyeDx - 2.5} ${eyeY} h5`} stroke="#1a1a1a" strokeWidth="1.6" strokeLinecap="round" /><path d={`M${32 + eyeDx - 2.5} ${eyeY} h5`} stroke="#1a1a1a" strokeWidth="1.6" strokeLinecap="round" /></>
        : <><circle cx={32 - eyeDx} cy={eyeY} r={scared ? 2 : 1.6} fill="#1a1a1a" /><circle cx={32 + eyeDx} cy={eyeY} r={scared ? 2 : 1.6} fill="#1a1a1a" /></>}
      {glasses && <g stroke="#111" strokeWidth="1.1" fill="none"><circle cx={32 - eyeDx} cy={eyeY} r="4" /><circle cx={32 + eyeDx} cy={eyeY} r="4" /><path d={`M${32 - eyeDx + 4} ${eyeY} h${2 * eyeDx - 8}`} /></g>}
      <path d={`M32 ${eyeY + 2} q${-noseW} 6 0 7.5`} stroke="#000" strokeOpacity=".3" strokeWidth="1.2" fill="none" />
      {beard && <path d={`M${32 - rx + 2} 38 Q${32 - rx + 3} 53 32 55 Q${32 + rx - 3} 53 ${32 + rx - 2} 38 Q32 50 ${32 - rx + 2} 38 Z`} fill={hc} opacity=".9" />}
      {(stache || beard) && <path d="M26 42.5 Q32 40 38 42.5 Q32 43.8 26 42.5 Z" fill={hc} />}
      <path d={mouth} stroke="#5a2a22" strokeWidth="1.5" fill={mood === 'afraid' ? '#5a2a22' : 'none'} strokeLinecap="round" />
      {scar && <path d="M40 30 l4 9" stroke="#8a3a2e" strokeWidth="1" opacity=".8" />}
      {hat && <g><path d={`M${32 - rx - 7} 20 Q32 16 ${32 + rx + 7} 20 L${32 + rx + 5} 22 Q32 19 ${32 - rx - 5} 22 Z`} fill="#15151a" /><path d={`M${32 - rx + 1} 20 Q${32 - rx + 3} 6 32 7 Q${32 + rx - 3} 6 ${32 + rx - 1} 20 Z`} fill="#15151a" /><rect x={32 - rx + 1} y="16" width={2 * rx - 2} height="2.6" fill="#7a1f1f" /></g>}
    </svg>
  );
}

function hair(style: number, rx: number, c: string) {
  const l = 32 - rx, r = 32 + rx;
  switch (style % 6) {
    case 0: return <path d={`M${l - 1} 32 Q${l - 2} 12 32 13 Q${r + 2} 12 ${r + 1} 32 Q${r - 2} 20 32 20 Q${l + 2} 20 ${l - 1} 32 Z`} fill={c} />;
    case 1: return <path d={`M${l} 30 Q${l} 12 32 12 Q${r} 12 ${r} 30 Q${r - 4} 18 ${36} 18 L${l + 6} 22 Z`} fill={c} />;
    case 2: return <g fill={c}>{[0, 1, 2, 3, 4, 5, 6].map(i => <circle key={i} cx={l + 2 + i * ((r - l - 4) / 6)} cy={17 + (i % 2) * 2} r="5" />)}</g>;
    case 3: return <path d={`M${l + 1} 27 Q${l + 3} 13 32 14 Q${r - 3} 13 ${r - 1} 27 L${r - 3} 21 Q32 17 ${l + 3} 21 Z`} fill={c} />;
    case 4: return <g fill={c}><path d={`M${l} 30 Q${l} 13 32 13 Q${r} 13 ${r} 30 Q${r - 3} 19 32 19 Q${l + 3} 19 ${l} 30 Z`} /><circle cx="32" cy="10" r="5" /></g>;
    default: return <path d={`M29 12 Q32 8 35 12 L35 22 L29 22 Z`} fill={c} />;
  }
}

/** How someone looks at you, for the face. */
export function moodOf(n: Npc): FaceOpts['mood'] {
  if (n.rel.fear >= 55) return 'afraid';
  if (n.rel.trust <= -25) return 'hostile';
  if (n.rel.trust >= 30 || n.crew) return 'warm';
  return 'neutral';
}

export function NpcFace({ n, size = 48, tint }: { n: Npc; size?: number; tint?: string }) {
  return <Face seed={n.face} pronoun={n.pronoun} age={n.age} traits={n.known ? n.traits : []} mood={moodOf(n)} hat={n.role === 'boss'} tint={tint} size={size} dead={!n.alive} />;
}

// ------------------------------------------------------------------------------------ emblems
const SHAPES = [
  'M32 4 L58 12 L56 36 Q52 54 32 60 Q12 54 8 36 L6 12 Z',
  'M32 4 A28 28 0 1 1 31.9 4 Z',
  'M32 3 L61 32 L32 61 L3 32 Z',
  'M32 3 L57 17 L57 47 L32 61 L7 47 L7 17 Z',
  'M8 6 H56 V50 L32 60 L8 50 Z',
];
const CHARGES = [
  'M32 16 L36 28 L49 28 L38.5 36 L42.5 48 L32 40.5 L21.5 48 L25.5 36 L15 28 L28 28 Z',
  'M17 42 L20 22 L27 32 L32 18 L37 32 L44 22 L47 42 Z M17 45 H47 V49 H17 Z',
  'M32 12 L35 36 L32 42 L29 36 Z M24 36 H40 V39 H24 Z M31 39 H33 V50 H31 Z',
  'M32 20 C38 20 42 26 38 31 C44 30 46 38 40 40 C42 46 34 48 32 43 C30 48 22 46 24 40 C18 38 20 30 26 31 C22 26 26 20 32 20 Z',
  'M14 32 Q32 16 50 32 Q32 48 14 32 Z M32 26 A6 6 0 1 1 31.9 26 Z',
  'M40 16 Q24 16 26 26 Q28 34 38 34 Q48 36 42 46 Q36 52 22 48',
  'M32 14 C44 14 48 24 46 32 L42 36 V44 H22 V36 L18 32 C16 24 20 14 32 14 Z M26 28 A3 3 0 1 1 25.9 28 Z M38 28 A3 3 0 1 1 37.9 28 Z',
  'M32 14 A4 4 0 1 1 31.9 14 Z M31 18 H33 V46 H31 Z M24 26 H40 V28 H24 Z M18 38 Q24 50 32 48 Q40 50 46 38',
  'M26 18 A7 7 0 1 1 25.9 18 Z M30 28 H34 V50 H30 Z M34 40 H40 V44 H34 Z M34 46 H38 V50 H34 Z',
  'M22 30 H42 V46 Q42 50 38 50 H26 Q22 50 22 46 Z M22 22 H27 V30 H22 Z M28 20 H33 V30 H28 Z M34 20 H39 V30 H34 Z',
  'M32 14 Q46 28 46 36 Q46 44 38 44 Q35 44 33 41 L36 50 H28 L31 41 Q29 44 26 44 Q18 44 18 36 Q18 28 32 14 Z',
  'M32 12 Q42 26 38 34 Q44 30 44 40 Q42 52 32 52 Q22 52 20 40 Q20 30 26 34 Q24 22 32 12 Z',
];
export function Emblem({ e, size = 32, title }: { e: EmblemT; size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className="r-emblem" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <path d={SHAPES[e.shape % SHAPES.length]} fill={mute(e.bg)} stroke="#0b0c10" strokeWidth="2" />
      <path d={SHAPES[e.shape % SHAPES.length]} fill="none" stroke={e.fg} strokeOpacity=".35" strokeWidth="1" transform="translate(32 32) scale(.86) translate(-32 -32)" />
      <path d={CHARGES[e.charge % CHARGES.length]} fill={e.charge === 5 ? 'none' : e.fg} stroke={e.charge === 5 ? e.fg : 'none'} strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
