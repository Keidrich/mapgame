import { useEffect, useState } from 'react';
import { select } from '@sim/index';
import type { Id } from '@sim/types';
import { act, useWorld } from '@ui/store';

/**
 * The player's own note on somebody: a memory aid, saved on the NPC and nowhere near the
 * sim's own `notes` flavour text. Edits go through `set_note` like every other change to the
 * world, so a note survives a save and a reload exactly as anything else does.
 */
export function NoteEditor({ npcId }: { npcId: Id }) {
  const w = useWorld();
  const saved = w.npcs[npcId]?.playerNote ?? '';
  const [text, setText] = useState(saved);
  // if the note changes underneath us (edited on the other screen), follow it
  useEffect(() => { setText(saved); }, [saved, npcId]);
  const dirty = text.trim() !== saved;
  return (
    <div>
      <label className="field" htmlFor={`note-${npcId}`}>Your note</label>
      <textarea
        id={`note-${npcId}`} className="textarea" rows={2} maxLength={select.PLAYER_NOTE_MAX}
        placeholder="Owes me a favour · knows the captain · do not trust"
        value={text} onChange={e => setText(e.target.value)}
      />
      <div className="row between mt8">
        <span className="small muted">{text.length}/{select.PLAYER_NOTE_MAX}</span>
        <div className="row" style={{ gap: 8 }}>
          {saved && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setText(''); act({ type: 'set_note', npcId, text: '' }); }}>Clear</button>}
          <button type="button" className="btn btn-primary btn-sm" disabled={!dirty} onClick={() => act({ type: 'set_note', npcId, text })}>{dirty ? 'Save note' : 'Saved'}</button>
        </div>
      </div>
    </div>
  );
}
