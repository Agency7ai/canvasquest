import { useEffect, useMemo, useState } from 'react';
import { computeScore } from './scoring';
import { useGameStore } from './store';
import type { IndexedTree, SavedGame } from './types';

const NOTICE_MS = 3000;

/** One line on where a parked tree stands. */
function describeTree(game: SavedGame): string {
  const count = `${game.nodes.length} ${game.nodes.length === 1 ? 'node' : 'nodes'}`;
  if (game.gamePhase === 'ended') return `Finished · ${computeScore(game.nodes).total}/100`;
  if (game.gamePhase === 'opening') return `Opening · ${count}`;
  return `In play · ${count}`;
}

/**
 * The left-hand column: every tree, one per question, in the order they were
 * planted. Selecting one brings it onto the board and parks the tree that was
 * there; the forest is untouched either way.
 */
export default function QuestionIndex() {
  const trees = useGameStore(state => state.trees);
  const currentTreeId = useGameStore(state => state.currentTreeId);
  const isSharedView = useGameStore(state => state.isSharedView);
  const gamePhase = useGameStore(state => state.gamePhase);
  const switchTree = useGameStore(state => state.switchTree);
  const newTree = useGameStore(state => state.newTree);
  const removeTree = useGameStore(state => state.removeTree);

  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const needle = query.trim().toLowerCase();
  const shown = useMemo(
    () => (needle ? trees.filter(tree => tree.game.question.toLowerCase().includes(needle)) : trees),
    [trees, needle],
  );

  const select = (tree: IndexedTree) => setNotice(switchTree(tree.id).message);

  const remove = (tree: IndexedTree) => {
    const question = tree.game.question;
    const prompt =
      tree.id === currentTreeId
        ? `Delete "${question}"? It leaves the question index and the board is cleared. The forest keeps any finished tree.`
        : `Delete "${question}" from the question index?`;
    if (!window.confirm(prompt)) return;
    removeTree(tree.id);
    setNotice(`Removed "${question}"`);
  };

  const total = trees.length;
  const meta = needle
    ? `Showing ${shown.length} of ${total} for “${query.trim()}”`
    : `Showing all questions · ${total} ${total === 1 ? 'item' : 'items'}`;

  return (
    <aside className="index" aria-labelledby="index-title">
      <div className="index-head">
        <h2 id="index-title" className="index-title">
          Question index
        </h2>
        <div className="find">
          <label htmlFor="find-question" className="label">
            Find:
          </label>
          <input
            id="find-question"
            type="search"
            className="input"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search questions…"
          />
        </div>
        <div className="index-meta">{meta}</div>
      </div>

      <div className="index-section">
        <span className="label">Questions (select to view tree)</span>
      </div>

      {isSharedView && (
        <p className="index-shared">
          A shared board is on the stage, read-only and not in your index. Pick a question to go back to your own
          trees.
        </p>
      )}

      {shown.length === 0 ? (
        <p className="index-empty">
          {total === 0 ? 'No trees yet. Plant a question on the right and it appears here.' : 'No questions match.'}
        </p>
      ) : (
        <ul className="index-list">
          {shown.map(tree => {
            const isCurrent = tree.id === currentTreeId;
            return (
              <li key={tree.id} className={`index-row${isCurrent ? ' is-current' : ''}`}>
                <button
                  type="button"
                  className="index-select"
                  onClick={() => select(tree)}
                  aria-current={isCurrent ? 'true' : undefined}
                  title={
                    isCurrent
                      ? 'This tree is on the board'
                      : 'Brings this tree onto the board; the one being played is parked here'
                  }
                >
                  <span className="index-bullet" aria-hidden="true">
                    {isCurrent ? '●' : '○'}
                  </span>
                  <span className="index-text">
                    <span className="index-question">{tree.game.question}</span>
                    <span className="index-status">{isCurrent ? 'Current tree' : describeTree(tree.game)}</span>
                  </span>
                  <span className="index-chevron" aria-hidden="true">
                    ›
                  </span>
                </button>
                <button
                  type="button"
                  className="index-delete"
                  onClick={() => remove(tree)}
                  aria-label={`Delete "${tree.game.question}" from the question index`}
                  title="Delete from the question index"
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {notice && (
        <p role="status" className="index-notice">
          {notice}
        </p>
      )}

      <div className="index-foot">
        <span>
          {total} {total === 1 ? 'question' : 'questions'} total
        </span>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={newTree}
          disabled={gamePhase === 'setup'}
          title="Parks the tree on the board here and clears the stage for a new question"
        >
          + New tree
        </button>
      </div>
    </aside>
  );
}
