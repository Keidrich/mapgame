import { setMode, type GameMode } from '@ui/mode';

/**
 * The first thing on the start screen: which game. The original stays exactly where it was; the
 * Remake is a separate game with its own save, so picking one never touches the other's city.
 */
export function TitleTabs({ current }: { current: GameMode }) {
  return (
    <nav className="title-tabs" aria-label="Choose a game">
      <button type="button" className={current === 'original' ? 'on' : ''} aria-pressed={current === 'original'} onClick={() => setMode('original')}>
        <b>RACKETS</b><span>The original, on the real map</span>
      </button>
      <button type="button" className={current === 'remake' ? 'on' : ''} aria-pressed={current === 'remake'} onClick={() => setMode('remake')}>
        <b>RACKETS: Remake <em>New</em></b><span>Every city generated from a seed</span>
      </button>
    </nav>
  );
}
