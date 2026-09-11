import type { ReactNode } from 'react';

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

export function SkillBars({ skills }: { skills: { muscle: number; brains: number; charm: number; wheels: number; tech: number } }) {
  const keys = ['muscle', 'brains', 'charm', 'wheels', 'tech'] as const;
  return (
    <div className="skills">
      {keys.map(k => (
        <div className="skill" key={k}>
          <div className="bar"><div style={{ height: `${(skills[k] / 10) * 100}%` }} /></div>
          <b>{skills[k]}</b>{k}
        </div>
      ))}
    </div>
  );
}

export function RelMeters({ rel }: { rel: { trust: number; fear: number; respect: number } }) {
  return (
    <div className="col" style={{ gap: 4 }}>
      <Meter label="Trust" value={rel.trust} bipolar color={rel.trust >= 0 ? 'var(--green)' : 'var(--red)'} />
      <Meter label="Fear" value={rel.fear} color="var(--red)" />
      <Meter label="Respect" value={rel.respect} color="var(--gold)" />
    </div>
  );
}

export function Chip({ children, className = '', onClick, selected }: { children: ReactNode; className?: string; onClick?: () => void; selected?: boolean }) {
  const cls = `chip ${selected ? 'sel ' : ''}${onClick ? 'btn ' : ''}${className}`;
  return onClick ? <button type="button" className={cls} onClick={onClick}>{children}</button> : <span className={cls}>{children}</span>;
}
