import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { buildAgentPrompt } from './agent-prompt';
import MoveHistory from './move-history';
import {
  asideStyle,
  button,
  darkSectionStyle,
  feedbackStyle,
  footnoteStyle,
  headingStyle,
  sectionStyle,
  twoColumns,
} from './panel';
import { MOVES_PER_PLAYER, OPENING_MOVES, type MoveOutcome, useGameStore } from './store';
import { hasWebMCP as detectWebMCP } from './use-webmcp';

const FEEDBACK_MS = 4000;
const COPIED_MS = 2500;

interface OpeningPanelProps {
  /** True when the landing card already put the prompt on the clipboard. */
  promptCopied: boolean;
}

/**
 * The right-hand column while the agent opens the game. The human watches the
 * tree grow, can hand the prompt to an agent that is not connected yet, and
 * can join in whenever they like.
 */
export default function OpeningPanel({ promptCopied }: OpeningPanelProps) {
  const question = useGameStore(state => state.question);
  const nodes = useGameStore(state => state.nodes);
  const history = useGameStore(state => state.history);
  const openingMovesUsed = useGameStore(state => state.openingMovesUsed);
  const isVoiceConnected = useGameStore(state => state.isVoiceConnected);
  const joinGame = useGameStore(state => state.joinGame);
  const undoLastMove = useGameStore(state => state.undoLastMove);
  const resetGame = useGameStore(state => state.resetGame);

  const [feedback, setFeedback] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(''), FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const webMCP = detectWebMCP();
  const canUndo = history.length > 0 && history[history.length - 1].player === 'agent';
  const movesLeft = OPENING_MOVES - openingMovesUsed;
  const prompt = buildAgentPrompt(question);

  const act = (result: MoveOutcome) => setFeedback(result.message);

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
    } catch {
      setFeedback('The browser blocked the clipboard: select the prompt and copy it by hand');
    }
  };

  const handleReset = () => {
    if (window.confirm('Reset the game? The board and the saved progress will be cleared.')) {
      resetGame();
    }
  };

  const status =
    nodes.length === 0
      ? 'Waiting for the agent to plant the root.'
      : movesLeft > 0
        ? `The agent is growing the tree: ${movesLeft} free ${movesLeft === 1 ? 'branch' : 'branches'} left. It passes when it is done.`
        : 'The agent has used its opening branches and should pass now.';

  const connection = webMCP
    ? 'An agent is connected through WebMCP.'
    : isVoiceConnected
      ? 'The voice agent is connected and has been told to open the game.'
      : 'No agent is connected to this page yet.';

  return (
    <aside style={asideStyle}>
      <section style={darkSectionStyle}>
        <div style={{ fontSize: '11px', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          🤖 The agent is setting up
        </div>
        <div style={{ fontWeight: 600, fontSize: '14px', marginTop: '2px', lineHeight: 1.3 }}>{question}</div>
        <div style={{ marginTop: '10px' }}>
          Opening moves: {openingMovesUsed} of {OPENING_MOVES} · {nodes.length} {nodes.length === 1 ? 'node' : 'nodes'}
        </div>
      </section>

      {feedback && (
        <div role="status" style={feedbackStyle}>
          {feedback}
        </div>
      )}

      <section style={{ ...sectionStyle, background: '#fef3c7', borderColor: '#f59e0b' }}>
        <div style={{ ...headingStyle, color: '#92400e' }}>Step 1 · The agent opens</div>
        <div style={{ fontSize: '13px', color: '#78350f', lineHeight: 1.4 }}>
          {status} {connection}
        </div>
      </section>

      {!isVoiceConnected && (
        <section style={sectionStyle}>
          <div style={headingStyle}>Agent prompt</div>
          <div style={{ fontSize: '12px', color: '#475569', lineHeight: 1.5 }}>
            {webMCP
              ? 'Paste this into the chat of the agent driving this browser.'
              : 'Open this page in an agent’s browser (Chrome with WebMCP enabled, or ChatGPT’s or Codex’s browser) and paste this into its chat.'}
          </div>
          <blockquote style={promptStyle}>{prompt}</blockquote>
          <button type="button" onClick={() => void copyPrompt()} style={button('#0f172a')}>
            {copied ? 'Copied ✓' : promptCopied ? 'Copy prompt again' : 'Copy agent prompt'}
          </button>
          {promptCopied && !copied && (
            <div style={{ fontSize: '12px', color: '#166534' }}>The prompt is on your clipboard.</div>
          )}
        </section>
      )}

      <section style={sectionStyle}>
        <div style={headingStyle}>Step 2 · You join in</div>
        <div style={{ fontSize: '12px', color: '#475569', lineHeight: 1.5 }}>
          {nodes.length === 0
            ? 'Joining now means you plant the root yourself and the agent takes the next turn.'
            : 'Joining ends the opening. The board is yours, and turns alternate from there.'}
        </div>
        <button
          type="button"
          onClick={() => act(joinGame())}
          title="Ends the agent's opening and gives you the turn"
          style={{ ...button('#6366f1'), padding: '11px 12px' }}
        >
          Join in now →
        </button>
        <div style={twoColumns}>
          <button
            type="button"
            onClick={() => act(undoLastMove())}
            disabled={!canUndo}
            title="Takes back the agent's most recent opening move"
            style={{ ...button('#64748b'), opacity: canUndo ? 1 : 0.5, cursor: canUndo ? 'pointer' : 'default' }}
          >
            ↶ Undo agent
          </button>
          <button
            type="button"
            onClick={handleReset}
            style={{ ...button('white'), color: '#b91c1c', border: '1px solid #fecaca' }}
          >
            Reset game
          </button>
        </div>
      </section>

      <MoveHistory history={history} emptyText="No moves yet. The agent plants the root first." />

      <p style={footnoteStyle}>
        The opening is free: the agent&apos;s first {OPENING_MOVES} branches cost nothing. Once you join, each player
        has {MOVES_PER_PLAYER} moves, and the finished tree is planted in your forest.
      </p>
    </aside>
  );
}

const promptStyle: CSSProperties = {
  margin: 0,
  padding: '10px 12px',
  background: '#f1f5f9',
  borderLeft: '3px solid #6366f1',
  borderRadius: '6px',
  fontSize: '12px',
  color: '#1e293b',
  lineHeight: 1.5,
  userSelect: 'all',
};
