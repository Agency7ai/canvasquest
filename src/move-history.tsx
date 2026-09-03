import { PLAYER_EMOJI, headingStyle, sectionStyle } from './panel';
import { describeAction } from './store';
import type { GameAction } from './types';

/** How many history entries the list shows. */
const HISTORY_ROWS = 8;

/** The last few moves, newest first, numbered from the whole history. */
export default function MoveHistory({ history, emptyText }: { history: GameAction[]; emptyText: string }) {
  const recent = history.slice(-HISTORY_ROWS).reverse();
  return (
    <section style={sectionStyle}>
      <div style={headingStyle}>Recent moves</div>
      {recent.length === 0 ? (
        <div style={{ fontSize: '12px', color: '#94a3b8' }}>{emptyText}</div>
      ) : (
        <ol
          reversed
          start={history.length}
          style={{
            margin: 0,
            paddingLeft: '22px',
            maxHeight: '170px',
            overflowY: 'auto',
            fontSize: '12px',
            color: '#334155',
            lineHeight: 1.6,
          }}
        >
          {recent.map((action, index) => (
            <li key={`${action.timestamp}-${index}`}>
              {PLAYER_EMOJI[action.player]} {describeAction(action)}
              {action.costsMove ? '' : <span style={{ color: '#94a3b8' }}> (free)</span>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
