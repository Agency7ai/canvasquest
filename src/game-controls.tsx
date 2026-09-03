import { useEffect, useMemo, useState } from 'react';
import MoveHistory from './move-history';
import {
  KIND_EMOJI,
  asideStyle,
  button,
  darkSectionStyle,
  feedbackStyle,
  footnoteStyle,
  headingStyle,
  inputStyle,
  sectionStyle,
  twoColumns,
} from './panel';
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
    <div style={{ fontSize: '12px', color: '#92400e', background: '#fef3c7', padding: '8px', borderRadius: '6px' }}>
      ⏱ Idle: the agent takes over in {secondsLeft}s. Any edit resets the clock.
    </div>
  );
}

/** Details of the selected node plus the free note / URL form. */
function SelectedNodeCard({
  node,
  onAnnotate,
  onClose,
}: {
  node: TreeNode;
  onAnnotate: (content: NodeContent) => void;
  onClose: () => void;
}) {
  const [note, setNote] = useState(node.note ?? '');
  const [url, setUrl] = useState(node.url ?? '');
  const dirty = note !== (node.note ?? '') || url !== (node.url ?? '');

  return (
    <section style={{ ...sectionStyle, borderColor: '#0f172a' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '18px' }}>{KIND_EMOJI[node.kind]}</span>
        <div style={{ flex: 1, fontWeight: 600, fontSize: '14px', color: '#0f172a', wordBreak: 'break-word' }}>
          {node.label}
        </div>
        <code style={{ fontSize: '11px', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>{node.id}</code>
        <button
          type="button"
          onClick={onClose}
          aria-label="Clear selection"
          style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b', fontSize: '14px' }}
        >
          ✕
        </button>
      </div>
      <div style={{ fontSize: '12px', color: '#64748b' }}>
        {node.kind} · created by {node.createdBy}
      </div>
      {node.isGap && (
        <div style={{ fontSize: '12px', color: '#b91c1c', fontWeight: 600 }}>
          ❓ Gap{node.gapReason ? `: ${node.gapReason}` : ''}
        </div>
      )}
      {node.url && (
        <a
          href={node.url}
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: '12px', color: '#4f46e5', wordBreak: 'break-all' }}
        >
          🔗 {node.url}
        </a>
      )}

      <form
        onSubmit={event => {
          event.preventDefault();
          onAnnotate({ note, url });
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}
      >
        <label htmlFor="node-note" style={headingStyle}>
          Note
        </label>
        <textarea
          id="node-note"
          rows={2}
          value={note}
          onChange={event => setNote(event.target.value)}
          placeholder="Why this matters, what to look for…"
          style={{ ...inputStyle, resize: 'vertical' }}
        />
        <label htmlFor="node-url" style={headingStyle}>
          URL
        </label>
        <input
          id="node-url"
          type="text"
          value={url}
          onChange={event => setUrl(event.target.value)}
          placeholder="https://…"
          style={inputStyle}
        />
        <button
          type="submit"
          disabled={!dirty}
          title="Notes and links are free: they never cost a move"
          style={{ ...button(dirty ? '#0f172a' : '#94a3b8'), cursor: dirty ? 'pointer' : 'default' }}
        >
          Save note / URL (free)
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
    annotate,
    undoLastMove,
    passTurn,
    skipAgentTurn,
    resetGame,
    selectNode,
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

  const handleReset = () => {
    if (window.confirm('Reset the game? The board and the saved progress will be cleared.')) {
      resetGame();
    }
  };

  return (
    <aside style={asideStyle}>
      <section style={darkSectionStyle}>
        <div style={{ fontSize: '11px', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Question</div>
        <div style={{ fontWeight: 600, fontSize: '14px', marginTop: '2px', lineHeight: 1.3 }}>{question}</div>
        <div style={{ marginTop: '10px' }}>
          Human: {humanMoves} moves · Agent: {agentMoves} moves
        </div>
        <div style={{ marginTop: '4px' }}>Turn: {isHumanTurn ? '🧑 Human' : '🤖 Agent'}</div>
        <div style={{ marginTop: '4px' }}>
          Score: {score.total}/100 · Open gaps: {score.openGaps.length}
        </div>
      </section>

      {feedback && (
        <div role="status" style={feedbackStyle}>
          {feedback}
        </div>
      )}

      {selected && (
        <SelectedNodeCard
          key={`${selected.id}|${selected.note ?? ''}|${selected.url ?? ''}`}
          node={selected}
          onAnnotate={content => act(annotate(selected.id, content, 'human'))}
          onClose={() => selectNode(null)}
        />
      )}

      {isHumanTurn ? (
        <section style={sectionStyle}>
          <div style={headingStyle}>Your move</div>
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
            value={newLabel}
            onChange={event => setNewLabel(event.target.value)}
            placeholder={nodes.length === 0 ? 'Root label (defaults to the question)' : 'New node label'}
            style={inputStyle}
          />

          {nodes.length === 0 ? (
            <button
              onClick={() => act(plant(newLabel.trim() || question, 'human'))}
              style={button('#6366f1')}
              title="Free: planting never costs a move"
            >
              🌱 Plant root (free)
            </button>
          ) : (
            <>
              <select
                id="target-node"
                value={selectedNodeId ?? ''}
                onChange={event => selectNode(event.target.value || null)}
                style={inputStyle}
              >
                <option value="">Target: click a node or choose one…</option>
                {nodes.map(node => (
                  <option key={node.id} value={node.id}>
                    {node.id} · {KIND_EMOJI[node.kind]} {node.label}
                    {node.isGap ? ' ❓' : ''}
                  </option>
                ))}
              </select>
              <div style={twoColumns}>
                <select
                  id="node-kind"
                  value={newKind}
                  onChange={event => setNewKind(event.target.value as NodeKind)}
                  style={inputStyle}
                >
                  <option value="concept">💡 Concept</option>
                  <option value="resource">📚 Resource</option>
                  <option value="skill">⚡ Skill</option>
                </select>
                <button onClick={handleBranch} style={button('#10b981')} title="Adds the label under the target node">
                  🌿 Branch
                </button>
              </div>
              <div style={twoColumns}>
                <button onClick={handlePrune} style={button('#ef4444')} title="Removes the target node and everything under it">
                  ✂️ Prune
                </button>
                <button
                  onClick={handleMarkGap}
                  style={button('#f97316')}
                  title="Flags the target node as a gap for the other player to fill"
                >
                  ❓ Mark gap
                </button>
              </div>
              <input
                id="gap-reason"
                type="text"
                value={gapReason}
                onChange={event => setGapReason(event.target.value)}
                placeholder="Gap reason (optional)"
                style={inputStyle}
              />
            </>
          )}

          <div style={twoColumns}>
            <button
              onClick={() => act(undoLastMove())}
              style={button('#64748b')}
              title="Reverts the agent's most recent action and refunds its move"
            >
              ↶ Undo agent
            </button>
            <button
              onClick={() => act(passTurn('human'))}
              style={button('#0f172a')}
              title="Free. Two passes in a row end the game, so passing with no agent connected ends it"
            >
              Pass →
            </button>
          </div>
        </section>
      ) : (
        <section style={{ ...sectionStyle, background: '#fef3c7', borderColor: '#f59e0b' }}>
          <div style={{ ...headingStyle, color: '#92400e' }}>🤖 Agent's turn</div>
          <div style={{ fontSize: '13px', color: '#78350f', lineHeight: 1.4 }}>
            {hasAgent
              ? 'Waiting for the agent to call a tool. Skip it if it stalls.'
              : `No agent is connected, so this turn is skipped in ${AUTO_SKIP_MS / 1000}s.`}
          </div>
          <div style={twoColumns}>
            <button onClick={() => act(skipAgentTurn())} style={button('#f59e0b')} title="Counts as the agent passing">
              Skip agent ⏭
            </button>
            <button
              onClick={() => act(undoLastMove())}
              style={button('#64748b')}
              title="Reverts the agent's most recent action and refunds its move"
            >
              ↶ Undo agent
            </button>
          </div>
        </section>
      )}

      <MoveHistory history={history} emptyText="No moves yet. Plant the root to begin." />

      <button onClick={handleReset} style={{ ...button('white'), color: '#b91c1c', border: '1px solid #fecaca' }}>
        Reset game
      </button>

      <p style={footnoteStyle}>
        Each player has {MOVES_PER_PLAYER} moves. Branching, pruning and marking gaps cost one; planting, passing,
        notes and links are free. Score comes from coverage, depth, a mix of kinds, shared authorship and content,
        minus 5 per open gap. The finished tree is planted in your forest.
      </p>
    </aside>
  );
}
