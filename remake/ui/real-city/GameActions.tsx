import { useState } from 'react';
import { can, select, type Action, type World } from '@r/sim/index';
import type { SceneKind } from '@r/sim/scenes';
export const cash = (n: number) => `$${Math.round(n).toLocaleString()}`;
export type Act = (action: Action) => void;
export function GameAction({ world, action, label, act, detail }: { world: World; action: Action; label: string; act: Act; detail?: string }) {
  const q = can(world,action);
  return <button type="button" className="rc-action" disabled={!q.ok} onClick={() => act(action)}><strong>{label}</strong>{(!!q.ap || !!q.cash) && <small>{[q.ap ? `${q.ap} h` : '',q.cash ? cash(q.cash) : ''].filter(Boolean).join(' · ')}</small>}<small>{q.ok ? detail : q.why}</small></button>;
}
export function SceneAction({ world, npcId, businessId, kind, act, label }: { world: World; npcId: string; businessId?: string; kind: SceneKind; act: Act; label?: string }) {
  const q = select.quote(world,kind,npcId,{businessId}), action: Action = {type:'scene',kind,npcId,businessId}, allowed = can(world,action);
  return <div className="rc-scene-action"><button type="button" className="rc-action" disabled={!allowed.ok} onClick={() => act(action)}><strong>{label ?? q.label}</strong><small>{q.ap} h{q.cash ? ` · ${cash(q.cash)}${q.clean?' clean':''}` : ''}{kind!=='buy' ? ` · ${q.chance}%` : ''}</small>{!allowed.ok && <small>{allowed.why}</small>}</button><details><summary>{label ?? (kind === 'protect' ? 'Protection' : kind === 'recruit' ? 'Recruitment' : 'Conversation')} details</summary><p>{q.gain}</p><p>Risk: {q.risk}</p>{q.factors.map((f,i) => <small key={i}>{f.label}: {f.n>0?'+':''}{f.n} </small>)}</details></div>;
}
export function ExpandSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open,setOpen] = useState(false);
  return <section className="rc-expand"><button type="button" className="rc-section-button" aria-expanded={open} onClick={() => setOpen(x=>!x)}>{title}<span>{open?'−':'+'}</span></button>{open && children}</section>;
}
