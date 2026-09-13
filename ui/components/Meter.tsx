import type { ReactNode } from 'react';
import { Term } from './Info';

/** Horizontal meter. `bipolar` renders −max..max around a centre line. */
export function Meter({ label, value, max = 100, color = 'var(--blue)', bipolar, suffix, format }: {
  label: ReactNode; value: number; max?: number; color?: string; bipolar?: boolean; suffix?: string; format?: (v: number) => string;
}) {
  const v = Math.max(bipolar ? -max : 0, Math.min(max, value));
  const width = bipolar ? (Math.abs(v) / max) * 50 : (v / max) * 100;
  const left = bipolar ? (v >= 0 ? 50 : 50 - width) : 0;
  return (
    <div className="meter">
      <span className="lbl ellipsis">{label}</span>
      <div className={`meter-bar${bipolar ? ' bipolar' : ''}`}>
        <div className="meter-fill" style={{ width: `${width}%`, marginLeft: `${left}%`, background: color }} />
      </div>
      <span className="val">{format ? format(v) : Math.round(v)}{suffix ?? ''}</span>
    </div>
  );
}

const SKILLS = ['muscle', 'brains', 'charm', 'wheels', 'tech'] as const;

export function SkillBars({ skills, plain }: { skills: { muscle: number; brains: number; charm: number; wheels: number; tech: number }; plain?: boolean }) {
  return (
    <div className="skills">
      {SKILLS.map(k => (
        <div className="skill" key={k}>
          <div className="bar"><div style={{ height: `${(skills[k] / 10) * 100}%` }} /></div>
          <b>{skills[k]}</b>{plain ? k : <Term id={k}>{k}</Term>}
        </div>
      ))}
    </div>
  );
}

/** How an NPC feels about the player. `plain` drops the explainers, for use inside a button. */
export function RelMeters({ rel, plain }: { rel: { trust: number; fear: number; respect: number }; plain?: boolean }) {
  const lbl = (id: string, text: string) => (plain ? text : <Term id={id}>{text}</Term>);
  return (
    <div className="col" style={{ gap: 4 }}>
      <Meter label={lbl('trust', 'Trust')} value={rel.trust} bipolar color={rel.trust >= 0 ? 'var(--green)' : 'var(--red)'} />
      <Meter label={lbl('npcfear', 'Fear')} value={rel.fear} color="var(--red)" />
      <Meter label={lbl('npcrespect', 'Respect')} value={rel.respect} color="var(--gold)" />
    </div>
  );
}

export function Chip({ children, className = '', onClick, selected }: { children: ReactNode; className?: string; onClick?: () => void; selected?: boolean }) {
  const cls = `chip ${selected ? 'sel ' : ''}${onClick ? 'btn ' : ''}${className}`;
  return onClick ? <button type="button" className={cls} onClick={onClick}>{children}</button> : <span className={cls}>{children}</span>;
}
