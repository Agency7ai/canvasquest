import { useEffect, useState } from 'react';
import { buildAgentPrompt } from './agent-prompt';
import MoveHistory from './move-history';
import { MOVES_PER_PLAYER, OPENING_MOVES, type MoveOutcome, useGameStore } from './store';
import { hasWebMCP as detectWebMCP } from './use-webmcp';

const FEEDBACK_MS = 4000;
const COPIED_MS = 2500;

interface OpeningPanelProps {
  /** True when the setup panel already put the prompt on the clipboard. */
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
    if (
      window.confirm(
        'Reset this tree? It leaves the question index and the board is cleared. The forest keeps any finished tree.',
      )
    ) {
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
    <aside className="aside">
      <section className="panel panel-dark">
        <span className="label">The agent is setting up</span>
        <div className="question-line">{question}</div>
        <div className="stat">
          Opening moves: {openingMovesUsed} of {OPENING_MOVES} · {nodes.length} {nodes.length === 1 ? 'node' : 'nodes'}
        </div>
      </section>

      {feedback && (
        <p role="status" className="feedback">
          {feedback}
        </p>
      )}

      <section className="panel panel-amber">
        <span className="label">Step 1 · The agent opens</span>
        <p className="copy">
          {status} {connection}
        </p>
      </section>

      {!isVoiceConnected && (
        <section className="panel">
          <span className="label">Agent prompt</span>
          <p className="copy">
            {webMCP
              ? 'Paste this into the chat of the agent driving this browser.'
              : 'Open this page in an agent’s browser (Chrome with WebMCP enabled, or ChatGPT’s or Codex’s browser) and paste this into its chat.'}
          </p>
          <blockquote className="prompt" style={{ margin: 0 }}>
            {prompt}
          </blockquote>
          <button type="button" className="btn btn-dark" onClick={() => void copyPrompt()}>
            {copied ? 'Copied ✓' : promptCopied ? 'Copy prompt again' : 'Copy agent prompt'}
          </button>
          {promptCopied && !copied && <p className="footnote footnote-moss">The prompt is on your clipboard.</p>}
        </section>
      )}

      <section className="panel">
        <span className="label">Step 2 · You join in</span>
        <p className="copy">
          {nodes.length === 0
            ? 'Joining now means you plant the root yourself and the agent takes the next turn.'
            : 'Joining ends the opening. The board is yours, and turns alternate from there.'}
        </p>
        <button
          type="button"
          className="btn btn-primary btn-tall"
          onClick={() => act(joinGame())}
          title="Ends the agent's opening and gives you the turn"
        >
          Join in now →
        </button>
        <div className="two-columns">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => act(undoLastMove())}
            disabled={!canUndo}
            title="Takes back the agent's most recent opening move"
          >
            ↶ Undo agent
          </button>
          <button type="button" className="btn btn-danger-outline" onClick={handleReset}>
            Reset tree
          </button>
        </div>
      </section>

      <MoveHistory history={history} emptyText="No moves yet. The agent plants the root first." />

      <p className="footnote">
        The opening is free: the agent&apos;s first {OPENING_MOVES} branches cost nothing. Once you join, each player
        has {MOVES_PER_PLAYER} moves, and the finished tree is planted in your forest.
      </p>
    </aside>
  );
}
