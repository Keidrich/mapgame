import { select } from '@sim/index';
import type { Id } from '@sim/types';
import { act, useWorld } from '@ui/store';
import { Info, Term } from './Info';
import { Icon } from '@ui/icons';

/**
 * "Walk here". Shows what the trip costs in legwork and why it is not possible when it
 * isn't. Renders nothing when the player is already standing on the block.
 */
export function WalkHere({ blockId, what, block = true }: { blockId?: Id; what?: string; block?: boolean }) {
  const w = useWorld();
  if (!blockId || !w.blocks[blockId] || select.isHere(w, blockId)) return null;
  const cost = select.travelCost(w, blockId);
  const name = w.blocks[blockId].name;
  const canAfford = cost !== undefined && cost <= w.player.legwork;
  return (
    <div className="actwrap">
      <button type="button" className={`btn btn-primary${block ? ' btn-block' : ''}`} disabled={!canAfford} onClick={() => act({ type: 'move', toBlockId: blockId })}>
        <span><Icon name="legwork" size={14} /> Walk to {name}</span>
        <span className="cost">{cost === undefined ? '—' : cost === 0 ? 'free' : `${cost} legwork`}</span>
      </button>
      {cost === undefined
        ? <span className="btn-caption">No way through from here yet.</span>
        : !canAfford
          ? <span className="btn-caption">{cost} legwork, you have {w.player.legwork} left today.</span>
          : cost === 0
            ? <span className="btn-caption" style={{ color: 'var(--green)' }}>Your own turf all the way. No legwork.</span>
            : what
              ? <span className="btn-caption" style={{ color: 'var(--muted)' }}>{what} is over there.</span>
              : null}
    </div>
  );
}

/** A one-line "you are somewhere else" banner with the walk button under it. */
export function AwayNotice({ blockId, what }: { blockId?: Id; what: string }) {
  const w = useWorld();
  if (!blockId || !w.blocks[blockId] || select.isHere(w, blockId)) return null;
  return (
    <div className="card mt8" style={{ borderColor: 'var(--orange)' }}>
      <b><Icon name="legwork" size={14} /> You are not there.<Info id="presence" /></b>
      <p className="small muted mt8">
        Face-to-face business needs you on the block. {what} is on {w.blocks[blockId].name}; you are on {select.currentBlock(w)?.name ?? 'another block'}.
        {' '}<Term id="legwork">Legwork</Term> is separate from AP and refills every day.
      </p>
      <div className="mt8"><WalkHere blockId={blockId} /></div>
    </div>
  );
}
