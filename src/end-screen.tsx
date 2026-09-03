import { useEffect, useMemo, useState } from 'react';
import { gameToMarkdown, slugify } from './export-markdown';
import { applyShareHash, buildShareUrl } from './persistence';
import { computeScore, scoreRows } from './scoring';
import { useGameStore } from './store';
import type { SavedGame } from './types';

const NOTICE_MS = 3000;

const buttonStyle = {
  padding: '10px',
  border: 'none',
  borderRadius: '6px',
  fontWeight: 600,
  fontSize: '13px',
  cursor: 'pointer',
  color: 'white',
};

export default function EndScreen() {
  const question = useGameStore(state => state.question);
  const nodes = useGameStore(state => state.nodes);
  const humanMoves = useGameStore(state => state.humanMoves);
  const agentMoves = useGameStore(state => state.agentMoves);
  const currentPlayer = useGameStore(state => state.currentPlayer);
  const isSharedView = useGameStore(state => state.isSharedView);
  const history = useGameStore(state => state.history);
  const resetGame = useGameStore(state => state.resetGame);
  const undoLastMove = useGameStore(state => state.undoLastMove);
  const lastAction = history[history.length - 1];
  const canUndoAgent = !isSharedView && lastAction?.player === 'agent';

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

  return (
    <aside
      style={{
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        background: '#f8fafc',
        borderLeft: '1px solid #e2e8f0',
        width: '360px',
        minWidth: '320px',
        overflowY: 'auto',
      }}
    >
      <div style={{ background: '#0f172a', color: 'white', padding: '16px', borderRadius: '8px', textAlign: 'center' }}>
        <div style={{ fontSize: '13px', opacity: 0.8, marginBottom: '4px' }}>
          {isSharedView ? 'Shared board' : 'Game over'}
        </div>
        <div style={{ fontSize: '40px', fontWeight: 700, lineHeight: 1 }}>{score.total}</div>
        <div style={{ fontSize: '13px', opacity: 0.8, marginTop: '4px' }}>out of 100</div>
      </div>

      <div style={{ fontSize: '13px', color: '#475569', lineHeight: 1.4 }}>
        <strong>Question:</strong> {question}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ color: '#64748b', textAlign: 'left' }}>
            <th style={{ padding: '4px 0', fontWeight: 600 }}>Component</th>
            <th style={{ padding: '4px 0', fontWeight: 600, textAlign: 'right' }}>Points</th>
          </tr>
        </thead>
        <tbody>
          {scoreRows(score).map(row => (
            <tr key={row.label} style={{ borderTop: '1px solid #e2e8f0' }}>
              <td style={{ padding: '6px 0', color: '#0f172a' }}>{row.label}</td>
              <td
                style={{
                  padding: '6px 0',
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                  color: row.points < 0 ? '#b91c1c' : '#0f172a',
                }}
              >
                {row.max === null ? row.points : `${row.points} / ${row.max}`}
              </td>
            </tr>
          ))}
          <tr style={{ borderTop: '2px solid #cbd5e1', fontWeight: 700 }}>
            <td style={{ padding: '6px 0' }}>Total</td>
            <td style={{ padding: '6px 0', textAlign: 'right' }}>{score.total} / 100</td>
          </tr>
        </tbody>
      </table>

      {score.openGaps.length > 0 && (
        <div style={{ fontSize: '13px', color: '#0f172a' }}>
          <div style={{ fontWeight: 600, marginBottom: '6px' }}>Open gaps ({score.openGaps.length})</div>
          <ul style={{ margin: 0, paddingLeft: '18px', display: 'grid', gap: '4px', color: '#475569' }}>
            {score.openGaps.map(id => {
              const node = byId.get(id);
              if (!node) return null;
              return (
                <li key={id}>
                  <strong style={{ color: '#0f172a' }}>{node.label}</strong>
                  {' — '}
                  {node.isGap ? (node.gapReason ?? 'marked as a gap') : 'no resource or skill beneath it'}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {notice && (
        <div style={{ background: '#ecfdf5', color: '#065f46', padding: '10px', borderRadius: '6px', fontSize: '13px' }}>
          {notice}
        </div>
      )}
      {manualCopy && (
        <textarea
          readOnly
          value={manualCopy}
          aria-label="Text to copy by hand"
          onFocus={event => event.target.select()}
          rows={3}
          style={{ width: '100%', boxSizing: 'border-box', fontSize: '11px', fontFamily: 'monospace' }}
        />
      )}

      {canUndoAgent && (
        <button
          onClick={() => setNotice(undoLastMove().message)}
          title="Take back the agent's final move and keep playing"
          style={{ ...buttonStyle, background: '#f59e0b', color: '#1f2937' }}
        >
          ↶ Undo agent's last move and resume
        </button>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <button onClick={download} style={{ ...buttonStyle, background: '#10b981' }}>
          ⬇ Export markdown
        </button>
        <button onClick={() => copy(markdown, 'Markdown')} style={{ ...buttonStyle, background: '#64748b' }}>
          Copy markdown
        </button>
        <button onClick={() => copy(shareUrl, 'Share link')} style={{ ...buttonStyle, background: '#0f172a' }}>
          🔗 Copy share link
        </button>
        <button onClick={resetGame} style={{ ...buttonStyle, background: '#6366f1' }}>
          🔄 New game
        </button>
      </div>

      <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8', lineHeight: 1.5 }}>
        The share link carries the whole board in its URL, so anyone who opens it sees this tree
        read-only. New game clears the board and the link.
      </p>
    </aside>
  );
}
