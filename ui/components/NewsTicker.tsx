import { select } from '@sim/index';
import { useWorld } from '@ui/store';
import { Icon } from '@ui/icons';

/**
 * The front page.
 *
 * Every line is generated from `w.log`, which the game has been writing all along — see
 * `sim/news.ts`. The point of it being *late* and slightly wrong is that it is the city's view of
 * the player rather than the player's own: the log says what you did, this says what got out.
 */
export function NewsTicker() {
  const w = useWorld();
  const news = select.headlines(w, 8);
  if (!news.length) return null;
  return (
    <div className="news">
      <div className="news-head"><Icon name="doc" size={12} /> The {w.placeName} Register</div>
      {news.map((h, i) => (
        <div key={i} className={`news-line${h.tone === 'big' ? ' big' : ''}`}>
          <span className="news-day">DAY {h.day}</span>
          <span>{h.text}</span>
        </div>
      ))}
    </div>
  );
}
