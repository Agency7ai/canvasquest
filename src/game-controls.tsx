import { useEffect, useMemo, useState } from 'react';
import MoveHistory from './move-history';
import { computeScore } from './scoring';
import { AUTO_SKIP_MS, IDLE_PASS_MS, MOVES_PER_PLAYER, type MoveOutcome, useGameStore } from './store';
import type { NodeContent, NodeKind, TreeNode } from './types';
import { hasWebMCP as detectWebMCP } from './use-webmcp';

const FEEDBACK_MS = 4000;

/**
 * Counts down the human's idle time while a voice agent is live. Keyed by the
 * parent on every sign of activity, so mounting is what restarts the clock.
 */
function IdlePassTimer({ onExpire }: { onExpire: () => void }) {
  const [deadline] = useState(() => Date.now() + IDLE_PASS_MS);
  const [secondsLeft, setSecondsLeft] = useState(IDLE_PASS_MS / 1000);

  useEffect(() => {
    const tick = setInterval(
      () => setSecondsLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000))),
      250,
    );
    const timer = setTimeout(onExpire, Math.max(0, deadline - Date.now()));
    return () => {
      clearInterval(tick);
      clearTimeout(timer);
    };
  }, [deadline, onExpire]);

  return (
    <p className="feedback feedback-amber">
      Idle: the agent takes over in {secondsLeft}s. Any edit resets the clock.
    </p>
  );
}

/** How much of a note the side panel shows before pointing at the editor. */
const NOTE_PREVIEW_CHARS = 140;

/** The first line of a note without its Markdown dressing, plus how much more there is. */
function notePreview(note: string): string {
  const lines = note.split('\n').filter(line => line.trim());
  const first = lines[0]?.replace(/^[\s#>*\-+]+|[*_`]/g, '').trim() ?? '';
  const clipped = first.length > NOTE_PREVIEW_CHARS ? `${first.slice(0, NOTE_PREVIEW_CHARS)}…` : first;
  const more = lines.length - 1;
  return more > 0 ? `${clipped} (+${more} more ${more === 1 ? 'line' : 'lines'})` : clipped;
}

/** Details of the selected node, the way into its Markdown note, and the free URL form. */
function SelectedNodeCard({
  node,
  onAnnotate,
  onOpenNote,
  onClose,
}: {
  node: TreeNode;
  onAnnotate: (content: NodeContent) => void;
  onOpenNote: () => void;
  onClose: () => void;
}) {
  const [url, setUrl] = useState(node.url ?? '');
  const dirty = url !== (node.url ?? '');

  return (
    <section className="panel panel-selected">
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span className="tag">{node.kind}</span>
        <div className="question-line" style={{ flex: 1 }}>
          {node.label}
        </div>
        <code className="code">{node.id}</code>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Clear selection">
          ✕
        </button>
      </div>
      <div className="muted">
        {node.kind} · created by {node.createdBy}
      </div>
      {node.isGap && (
        <div className="gap-line">
          Gap{node.gapBy ? ` marked by the ${node.gapBy}` : ''}
          {node.gapReason ? `: ${node.gapReason}` : ''}
        </div>
      )}
      {node.url && (
        <a className="link" href={node.url} target="_blank" rel="noreferrer">
          {node.url}
        </a>
      )}

      <span className="label">Note</span>
      <p className="copy" style={{ overflowWrap: 'anywhere' }}>
        {node.note ? notePreview(node.note) : 'No note yet.'}
      </p>
      <button
        type="button"
        className="btn btn-dark"
        onClick={onOpenNote}
        title="Opens the note full screen: Markdown with a live preview. Notes are free"
      >
        View markdown
      </button>

      <form
        onSubmit={event => {
          event.preventDefault();
          onAnnotate({ url });
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}
      >
        <label htmlFor="node-url" className="label">
          URL
        </label>
        <input
          id="node-url"
          type="text"
          className="input"
          value={url}
          onChange={event => setUrl(event.target.value)}
          placeholder="https://…"
        />
        <button type="submit" className="btn btn-ghost" disabled={!dirty} title="Links are free: they never cost a move">
          Save URL (free)
        </button>
      </form>
    </section>
  );
}

export default function GameControls() {
  const {
    nodes,
    currentPlayer,
    humanMoves,
    agentMoves,
    gamePhase,
    question,
    history,
    selectedNodeId,
    isVoiceConnected,
    plant,
    branch,
    prune,
    markGap,
    unmarkGap,
    annotate,
    undoLastMove,
    passTurn,
    skipAgentTurn,
    resetGame,
    selectNode,
    openNoteEditor,
  } = useGameStore();

  const [newLabel, setNewLabel] = useState('');
  const [newKind, setNewKind] = useState<NodeKind>('concept');
  const [gapReason, setGapReason] = useState('');
  const [feedback, setFeedback] = useState('');

  const hasAgent = detectWebMCP() || isVoiceConnected;
  const isHumanTurn = currentPlayer === 'human';
  const score = useMemo(() => computeScore(nodes), [nodes]);
  const selected = nodes.find(n => n.id === selectedNodeId) ?? null;

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(''), FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [feedback]);

  // With no agent connected there is nobody to take the agent's turn, so it is
  // skipped after a short pause the human can see.
  useEffect(() => {
    if (hasAgent || currentPlayer !== 'agent' || gamePhase !== 'playing') return;
    const timer = setTimeout(() => {
      const result = skipAgentTurn();
      setFeedback(result.message);
    }, AUTO_SKIP_MS);
    return () => clearTimeout(timer);
  }, [hasAgent, currentPlayer, gamePhase, skipAgentTurn]);

  // Any of these changing counts as activity and restarts the idle clock.
  const idleActive = isVoiceConnected && isHumanTurn && gamePhase === 'playing';
  const activityKey = `${nodes.length}|${history.length}|${selectedNodeId ?? ''}|${newLabel}|${gapReason}`;

  const act = (result: MoveOutcome) => {
    setFeedback(result.message);
    if (result.success) {
      setNewLabel('');
      setGapReason('');
    }
  };

  const requireSelection = (): TreeNode | null => {
    if (!selected) setFeedback('Select a node first: click a limb in the forest or on the board, or pick it from the list');
    return selected;
  };

  const handleBranch = () => {
    const parent = requireSelection();
    if (parent) act(branch(parent.id, newLabel, newKind, 'human'));
  };

  const handlePrune = () => {
    const target = requireSelection();
    if (target) act(prune(target.id, 'human'));
  };

  const handleMarkGap = () => {
    const target = requireSelection();
    if (target) act(markGap(target.id, 'human', gapReason));
  };

  const handleUnmarkGap = () => {
    const target = requireSelection();
    if (target) act(unmarkGap(target.id));
  };

  // Only the gaps the human marked can be taken back; the agent's must be filled.
  const canUnmark = selected?.isGap === true && selected.gapBy === 'human';

  const handleReset = () => {
    if (
      window.confirm(
        'Reset this tree? It leaves the question index and the board is cleared. The forest keeps any finished tree.',
      )
    ) {
      resetGame();
    }
  };

  return (
    <aside className="aside">
      <section className="panel panel-dark">
        <span className="label">Question</span>
        <div className="question-line">{question}</div>
        <div className="stats">
          <div className="stat">
            Human: {humanMoves} moves · Agent: {agentMoves} moves
          </div>
          <div className="stat">
            Turn: <strong>{isHumanTurn ? 'Human' : 'Agent'}</strong>
          </div>
          <div className="stat">
            Score: {score.total}/100 · Open gaps: {score.openGaps.length}
          </div>
        </div>
      </section>

      {feedback && (
        <p role="status" className="feedback">
          {feedback}
        </p>
      )}

      {selected && (
        <SelectedNodeCard
          key={`${selected.id}|${selected.note ?? ''}|${selected.url ?? ''}`}
          node={selected}
          onAnnotate={content => act(annotate(selected.id, content, 'human'))}
          onOpenNote={() => openNoteEditor(selected.id)}
          onClose={() => selectNode(null)}
        />
      )}

      {isHumanTurn ? (
        <section className="panel">
          <span className="label">Move</span>
          {idleActive && (
            <IdlePassTimer
              key={activityKey}
              onExpire={() => {
                const result = passTurn('human');
                setFeedback(`Idle for ${IDLE_PASS_MS / 1000}s. ${result.message}`);
              }}
            />
          )}

          <input
            id="node-label"
            type="text"
            className="input"
            value={newLabel}
            onChange={event => setNewLabel(event.target.value)}
            placeholder={nodes.length === 0 ? 'Root label (defaults to the question)' : 'New node label'}
          />

          {nodes.length === 0 ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => act(plant(newLabel.trim() || question, 'human'))}
              title="Free: planting never costs a move"
            >
              Plant root (free)
            </button>
          ) : (
            <>
              <select
                id="target-node"
                className="input"
                value={selectedNodeId ?? ''}
                onChange={event => selectNode(event.target.value || null)}
              >
                <option value="">Target: click a node or choose one…</option>
                {nodes.map(node => (
                  <option key={node.id} value={node.id}>
                    {node.id} · {node.kind} · {node.label}
                    {node.isGap ? ' · gap' : ''}
                  </option>
                ))}
              </select>
              <div className="two-columns">
                <select
                  id="node-kind"
                  className="input"
                  value={newKind}
                  onChange={event => setNewKind(event.target.value as NodeKind)}
                >
                  <option value="concept">Concept</option>
                  <option value="resource">Resource</option>
                  <option value="skill">Skill</option>
                </select>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleBranch}
                  title="Adds the label under the target node"
                >
                  Branch
                </button>
              </div>
              <div className="two-columns">
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={handlePrune}
                  title="Removes the target node and everything under it"
                >
                  Prune
                </button>
                {canUnmark ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleUnmarkGap}
                    title="Free: clears the gap you marked and gives the move back"
                  >
                    Unmark gap
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-warn"
                    onClick={handleMarkGap}
                    title="Flags the target node as a gap for the other player to fill"
                  >
                    Mark gap
                  </button>
                )}
              </div>
              <input
                id="gap-reason"
                type="text"
                className="input"
                value={gapReason}
                onChange={event => setGapReason(event.target.value)}
                placeholder="Gap reason (optional)"
              />
            </>
          )}

          <div className="two-columns">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => act(undoLastMove())}
              title="Reverts the agent's most recent action and refunds its move"
            >
              ↶ Undo agent
            </button>
            <button
              type="button"
              className="btn btn-dark"
              onClick={() => act(passTurn('human'))}
              title="Free. Two passes in a row end the game, so passing with no agent connected ends it"
            >
              Pass →
            </button>
          </div>
        </section>
      ) : (
        <section className="panel panel-amber">
          <span className="label">Agent&apos;s turn</span>
          <p className="copy">
            {hasAgent
              ? 'Waiting for the agent to call a tool. Skip it if it stalls.'
              : `No agent is connected, so this turn is skipped in ${AUTO_SKIP_MS / 1000}s.`}
          </p>
          <div className="two-columns">
            <button
              type="button"
              className="btn btn-warn"
              onClick={() => act(skipAgentTurn())}
              title="Counts as the agent passing"
            >
              Skip agent
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => act(undoLastMove())}
              title="Reverts the agent's most recent action and refunds its move"
            >
              ↶ Undo agent
            </button>
          </div>
        </section>
      )}

      <MoveHistory history={history} emptyText="No moves yet. Plant the root to begin." />

      <button type="button" className="btn btn-danger-outline" onClick={handleReset}>
        Reset tree
      </button>

      <p className="footnote">
        Each player has {MOVES_PER_PLAYER} moves. Branching, pruning and marking gaps cost one; planting, passing,
        notes and links are free. Score comes from coverage, depth, a mix of kinds, shared authorship and content,
        minus 5 per open gap. The finished tree is planted in your forest and stays in the question index.
      </p>
    </aside>
  );
}
