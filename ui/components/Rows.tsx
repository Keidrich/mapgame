import type { Business, Npc, World } from '@sim/types';
import { select } from '@sim/index';
import { TRAIT_LABELS } from '@content/rackets';
import { bizIcon, bizTypeLabel, initials, ownerLabel, protectionLabel, roleLabel } from '@ui/derive';
import { openSheet } from '@ui/store';
import { Icon, IconTile } from '@ui/icons';

/** Tappable NPC row → NPC sheet. */
export function NpcRow({ w, npc, sub, sel }: { w: World; npc: Npc; sub?: string; sel?: boolean }) {
  const status = npc.crew?.status;
  return (
    <button type="button" className={`listitem${sel ? ' sel' : ''}`} onClick={() => openSheet({ kind: 'npc', npcId: npc.id })}>
      <div className="avatar" style={{ color: npc.faction ? select.factionColor(w, npc.faction) : undefined }}>{initials(npc.name)}</div>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="title ellipsis">{npc.name}{!npc.alive && <span className="muted"> (dead)</span>}</div>
        <div className="sub ellipsis">{sub ?? `${roleLabel(npc)} · ${select.isKnown(npc) ? npc.traits.map(t => TRAIT_LABELS[t] ?? t).join(', ') : '?'} · ${select.relLabel(npc)}${npc.grudge ? ' · grudge' : ''}`}</div>
      </div>
      {status && <span className={`chip s-${status}`}>{status}</span>}
    </button>
  );
}

/** Tappable business row → Business sheet. */
export function BizRow({ w, biz, sel }: { w: World; biz: Business; sel?: boolean }) {
  const prot = protectionLabel(w, biz);
  const rackets = select.racketsAt(w, biz);
  return (
    <button type="button" className={`listitem${sel ? ' sel' : ''}`} onClick={() => openSheet({ kind: 'business', businessId: biz.id })}>
      <IconTile name={bizIcon(biz)} size={30} tone={biz.ownedBy === 'player' ? 'gold' : undefined} />
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="title ellipsis">{biz.name}</div>
        <div className="sub ellipsis">{bizTypeLabel(biz)} · {ownerLabel(w, biz)}{rackets.length > 0 && <> · {rackets.map(r => <Icon key={r.id} of="racket" id={r.kind} size={11} style={{ display: 'inline-block', verticalAlign: -1, marginRight: 2 }} />)}</>}</div>
      </div>
      {biz.ownedBy === 'player' ? <span className="chip" style={{ color: 'var(--gold)' }}>Yours</span> : prot && <span className="chip" style={{ color: select.factionColor(w, biz.protection!.factionId) }}><Icon name="protection" size={12} /></span>}
    </button>
  );
}
