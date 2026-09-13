import { useState } from 'react';
import { sceneFor, type Scene, type SceneOption } from '@sim/index';
import type { Action } from '@sim/actions';
import { TRAIT_LABELS } from '@content/rackets';
import { act, closeScene, useStore, useWorld } from '@ui/store';
import { fmtMoney, initials } from '@ui/derive';

/** A face-to-face scene: what they say, the approaches on offer with odds, then what happened. */
export function SceneSheet() {
  const w = useWorld();
  const req = useStore(s => s.scene);
  const [result, setResult] = useState<{ lines: string[]; tone: string } | null>(null);
  if (!req) return null;
  const n = w.npcs[req.npcId]; if (!n) return null;
  const scene: Scene = sceneFor(w, req.kind, req.npcId, req.businessId);
  const biz = req.businessId ? w.businesses[req.businessId] : undefined;

  const choose = (o: SceneOption) => {
    const before = w.log.length;
    const action: Action =
      req.kind === 'shakedown' ? { type: 'shakedown', businessId: req.businessId!, approach: o.id }
      : req.kind === 'threaten' ? { type: 'threaten', npcId: req.npcId, approach: o.id }
      : req.kind === 'recruit' ? { type: 'recruit', npcId: req.npcId, approach: o.id }
      : req.kind === 'parley' ? { type: 'parley', npcId: req.npcId, approach: o.id }
      : { type: 'visit', npcId: req.npcId, approach: o.id };
    const ok = act(action);
    if (!ok) return;
    const after = useStore.getState().world!.log.slice(before);
    setResult({ lines: after.map(l => l.text), tone: after.some(l => l.tone === 'bad') ? 'bad' : after.some(l => l.tone === 'good' || l.tone === 'money') ? 'good' : 'info' });
  };
  const done = () => { setResult(null); closeScene(); };

  return (
    <div className="modal-backdrop scene-backdrop" role="dialog" aria-modal="true" aria-labelledby="scene-title" onClick={done}>
      <div className="modal scene" onClick={e => e.stopPropagation()}>
        <div className="scene-head">
          <div className="avatar big">{initials(n.name)}</div>
          <div className="grow">
            <h2 id="scene-title">{n.name}</h2>
            <div className="small muted">{n.role === 'owner' && biz ? `Runs ${biz.name}` : n.role} · {n.traits.map(t => TRAIT_LABELS[t] ?? t).join(', ')}</div>
            <div className="small muted">Trust {n.rel.trust} · Fear {n.rel.fear} · Nerve {n.nerve}</div>
          </div>
        </div>
        {!result ? (
          <>
            <p className="scene-line">{scene.line}</p>
            <div className="col">
              {scene.options.map(o => (
                <button type="button" key={o.id} className="opt scene-opt" disabled={!!o.disabled} onClick={() => choose(o)}>
                  <span className="lbl">{o.icon} {o.label} <span className={`odds ${o.chance >= 65 ? 'good' : o.chance >= 40 ? 'mid' : 'bad'}`}>{o.chance}%</span></span>
                  <span className="det">{o.blurb}</span>
                  <span className="stakes"><b className="green">✓ {o.good}</b> <b className="red">✗ {o.bad}</b></span>
                  <span className="cst">{o.disabled ?? `Costs ${o.costAp} AP${o.costCash ? ` · ${fmtMoney(o.costCash)}` : ''}`}</span>
                </button>
              ))}
            </div>
            <button type="button" className="btn btn-ghost btn-block mt8" onClick={done}>Walk away</button>
          </>
        ) : (
          <>
            <div className={`scene-result ${result.tone}`}>{result.lines.map((l, i) => <p key={i}>{l}</p>)}</div>
            <button type="button" className="btn btn-primary btn-block mt8" onClick={done}>Done</button>
          </>
        )}
      </div>
    </div>
  );
}
