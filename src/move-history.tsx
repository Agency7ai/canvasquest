import { describeAction } from './store';
import type { GameAction, PlayerType } from './types';

const HISTORY_ROWS = 8;

const PLAYER_NAME: Record<PlayerType, string> = { human: 'You', agent: 'Agent' };

interface Props {
  history: GameAction[];
  emptyText: string;
}

/** The last few actions, newest first, numbered from the whole history. */
export default function MoveHistory({ history, emptyText }: Props) {
  const recent = history.slice(-HISTORY_ROWS).reverse();

  return (
    <section className="panel">
      <span className="label">Recent actions</span>
      {recent.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          {emptyText}
        </p>
      ) : (
        <ol className="history" reversed start={history.length}>
          {recent.map((action, index) => (
            <li key={`${action.timestamp}-${index}`}>
              <span className="history-player">{PLAYER_NAME[action.player]}</span> {describeAction(action)}
              {!action.costsMove && <span className="muted"> (free)</span>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
