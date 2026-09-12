import { useState, type ReactNode } from 'react';
import type { Action } from '@sim/actions';
import { act, check, openScene, useStore, type SceneRequest } from '@ui/store';
import { fmtMoney } from '@ui/derive';

/**
 * A button bound to a sim Action. Disabled (with the sim's refusal reason as a
 * caption) when `can()` says no; shows AP / cash cost when the sim reports it.
 */
export function Act({ action, label, kind = '', block, small, onDone, confirm, icon }: {
  action: Action; label: ReactNode; kind?: '' | 'primary' | 'danger' | 'ghost'; block?: boolean; small?: boolean; onDone?: () => void; confirm?: string; icon?: string;
}) {
  useStore(s => s.world); // re-evaluate affordance when the world changes
  const a = check(action);
  const cost = a.ok && a.cost ? [a.cost.ap ? `${a.cost.ap} AP` : '', a.cost.cash ? fmtMoney(a.cost.cash) : ''].filter(Boolean).join(' · ') : '';
  const cls = `btn${kind ? ` btn-${kind}` : ''}${block ? ' btn-block' : ''}${small ? ' btn-sm' : ''}`;
  const onClick = () => {
    if (confirm && !window.confirm(confirm)) return;
    if (act(action)) onDone?.();
  };
  return (
    <div className="actwrap">
      <button type="button" className={cls} disabled={!a.ok} onClick={onClick}>
        <span>{icon && <>{icon} </>}{label}</span>{cost && <span className="cost">{cost}</span>}
      </button>
      {!a.ok && <span className="btn-caption">{a.reason}</span>}
    </div>
  );
}

/** Chips of preset amounts plus a free number input. */
export function AmountPicker({ presets, value, onChange, prefix = '$', min = 0, max }: { presets: number[]; value: number; onChange: (v: number) => void; prefix?: string; min?: number; max?: number }) {
  return (
    <div className="col" style={{ gap: 6 }}>
      <div className="chips">
        {presets.map(p => <button type="button" key={p} className={`chip btn${value === p ? ' sel' : ''}`} onClick={() => onChange(p)}>{prefix}{p.toLocaleString('en-US')}</button>)}
      </div>
      <input className="input" type="number" inputMode="numeric" min={min} max={max} value={Number.isFinite(value) ? value : ''} onChange={e => onChange(Math.max(min, Number(e.target.value) || 0))} />
    </div>
  );
}

/** A collapsible sub-form: a button that reveals its children in place. */
export function Disclosure({ label, children, icon, kind }: { label: string; children: ReactNode; icon?: string; kind?: '' | 'primary' | 'danger' | 'ghost' }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="actwrap">
      <button type="button" className={`btn${kind ? ` btn-${kind}` : ''}${open ? ' btn-ghost' : ''}`} onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span>{icon && <>{icon} </>}{label} <span className="muted">{open ? '▴' : '▾'}</span></span>
      </button>
      {open && <div className="card mt8">{children}</div>}
    </div>
  );
}

/** A button that opens a scene (approach choice) instead of acting straight away. Gated like Act. */
export function SceneAct({ scene, label, icon, kind = '' }: { scene: SceneRequest; label: ReactNode; icon?: string; kind?: '' | 'primary' | 'danger' | 'ghost' }) {
  useStore(s => s.world);
  const base: Action = scene.kind === 'shakedown' ? { type: 'shakedown', businessId: scene.businessId! } : scene.kind === 'threaten' ? { type: 'threaten', npcId: scene.npcId } : scene.kind === 'recruit' ? { type: 'recruit', npcId: scene.npcId } : { type: 'visit', npcId: scene.npcId };
  const a = check(base);
  return (
    <div className="actwrap">
      <button type="button" className={`btn${kind ? ` btn-${kind}` : ''}`} disabled={!a.ok} onClick={() => openScene(scene)}>
        <span>{icon && <>{icon} </>}{label}</span><span className="cost">1 AP</span>
      </button>
      {!a.ok && <span className="btn-caption">{a.reason}</span>}
    </div>
  );
}
