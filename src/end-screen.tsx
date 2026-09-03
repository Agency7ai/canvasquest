import { useEffect, useMemo, useState } from 'react';
import { gameToMarkdown, slugify } from './export-markdown';
import { applyShareHash, buildShareUrl } from './persistence';
import { computeScore, scoreRows } from './scoring';
import { useGameStore } from './store';
import type { SavedGame } from './types';

const NOTICE_MS = 3000;

export default function EndScreen() {
  const question = useGameStore(state => state.question);
  const nodes = useGameStore(state => state.nodes);
  const humanMoves = useGameStore(state => state.humanMoves);
  const agentMoves = useGameStore(state => state.agentMoves);
  const currentPlayer = useGameStore(state => state.currentPlayer);
  const isSharedView = useGameStore(state => state.isSharedView);
  const history = useGameStore(state => state.history);
  const grove = useGameStore(state => state.grove);
  const newTree = useGameStore(state => state.newTree);
  const undoLastMove = useGameStore(state => state.undoLastMove);
  const lastAction = history[history.length - 1];
  const canUndoAgent = !isSharedView && lastAction?.player === 'agent';
  // A shared board is somebody else's tree, so it is never planted here.
  const inForest = grove.some(tree => tree.question === question);

  const score = useMemo(() => computeScore(nodes), [nodes]);
  const markdown = useMemo(() => gameToMarkdown(question, nodes), [question, nodes]);
  const byId = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);

  // The share payload never includes history, so an empty one is exact here.
  const shared = useMemo<SavedGame>(
    () => ({
      question,
      nodes,
      humanMoves,
      agentMoves,
      currentPlayer,
      gamePhase: 'ended',
      history: [],
      openingMovesUsed: 0,
    }),
    [question, nodes, humanMoves, agentMoves, currentPlayer],
  );
  const shareUrl = useMemo(() => buildShareUrl(shared), [shared]);

  const [notice, setNotice] = useState('');
  // Shown when the clipboard is unavailable, so the text can still be copied by hand.
  const [manualCopy, setManualCopy] = useState('');
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  // The address bar becomes the share link as soon as the game ends.
  useEffect(() => {
    applyShareHash(shared);
  }, [shared]);

  const download = () => {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${slugify(question)}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice(`Downloaded ${anchor.download}`);
  };

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(`${what} copied to the clipboard`);
      setManualCopy('');
    } catch {
      setNotice(`The browser blocked clipboard access: copy the ${what.toLowerCase()} from the box below`);
      setManualCopy(text);
    }
  };

  const others = grove.length - 1;

  return (
    <aside className="aside">
      <section className="panel panel-dark score-box">
        <span className="label">{isSharedView ? 'Shared board' : 'Game over'}</span>
        <div className="score-total">{score.total}</div>
        <span className="label">out of 100</span>
      </section>

      <p className="stat" style={{ margin: 0 }}>
        <strong>Question:</strong> {question}
      </p>

      {inForest && (
        <p className="feedback">
          This tree now stands in your forest with{' '}
          {others === 0 ? 'no others yet' : `${others} ${others === 1 ? 'other' : 'others'}`}. Step back in the
          forest to see them all.
        </p>
      )}

      <section className="panel">
        <span className="label">Score</span>
        <table className="score-table">
          <thead>
            <tr>
              <th>Component</th>
              <th className="num">Points</th>
            </tr>
          </thead>
          <tbody>
            {scoreRows(score).map(row => (
              <tr key={row.label}>
                <td>{row.label}</td>
                <td className={`num${row.points < 0 ? ' neg' : ''}`}>
                  {row.max === null ? row.points : `${row.points} / ${row.max}`}
                </td>
              </tr>
            ))}
            <tr className="total">
              <td>Total</td>
              <td className="num">{score.total} / 100</td>
            </tr>
          </tbody>
        </table>
      </section>

      {score.openGaps.length > 0 && (
        <section className="panel">
          <span className="label">Open gaps ({score.openGaps.length})</span>
          <ul className="gap-list">
            {score.openGaps.map(id => {
              const node = byId.get(id);
              if (!node) return null;
              return (
                <li key={id}>
                  <strong>{node.label}</strong>
                  {' · '}
                  {node.isGap ? (node.gapReason ?? 'marked as a gap') : 'no resource or skill beneath it'}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {notice && (
        <p role="status" className="feedback">
          {notice}
        </p>
      )}
      {manualCopy && (
        <textarea
          readOnly
          className="input"
          value={manualCopy}
          aria-label="Text to copy by hand"
          onFocus={event => event.target.select()}
          rows={3}
        />
      )}

      {canUndoAgent && (
        <button
          type="button"
          className="btn btn-warn btn-block"
          onClick={() => setNotice(undoLastMove().message)}
          title="Take back the agent's final move and keep playing"
        >
          ↶ Undo agent&apos;s last move and resume
        </button>
      )}

      <div className="two-columns">
        <button type="button" className="btn btn-dark" onClick={download}>
          Export markdown
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => copy(markdown, 'Markdown')}>
          Copy markdown
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => copy(shareUrl, 'Share link')}>
          Copy share link
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={newTree}
          title="Clears the stage for a new question; this tree stays in the index and the forest"
        >
          New tree
        </button>
      </div>

      <p className="footnote">
        The share link carries the whole board in its URL, so anyone who opens it sees this tree read-only. New
        tree clears the board and the link; this tree stays in the question index and the forest.
      </p>
    </aside>
  );
}
