import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useConversation,
  useConversationClientTool,
  useConversationControls,
} from '@elevenlabs/react';
import { applyMove, readBoard } from './moves';
import type { BoardSummary, MoveName } from './moves';
import { OPENING_MOVES, describeAction, useGameStore } from './store';
import type { GamePhase, TreeNode } from './types';

const AGENT_ID = import.meta.env.VITE_ELEVENLABS_AGENT_ID ?? '';

/** How many of the agent's recent actions the panel lists. */
const LOG_ROWS = 5;

/** How long after the human stops editing a note the agent hears about it. */
const NOTE_UPDATE_MS = 1500;

const NODE_FIELDS_APART_FROM_NOTE: Array<keyof TreeNode> = [
  'id',
  'label',
  'kind',
  'parentId',
  'createdBy',
  'isGap',
  'gapReason',
  'gapBy',
  'url',
];

/** The nodes whose note changed, when notes are all that changed on the board. */
function editedNotes(before: TreeNode[], after: TreeNode[]): TreeNode[] {
  if (before.length !== after.length) return [];
  const edited: TreeNode[] = [];
  for (let i = 0; i < after.length; i += 1) {
    const was = before[i];
    const now = after[i];
    if (NODE_FIELDS_APART_FROM_NOTE.some(key => was[key] !== now[key])) return [];
    if (was.note !== now.note) edited.push(now);
  }
  return edited;
}

/** What the agent should do next, given where the game is. */
function instructions(board: BoardSummary): string {
  switch (board.gamePhase) {
    case 'setup':
      return 'No game has started. Ask the human what they want to learn, then plant the root with that question as its label.';
    case 'opening':
      return `You are opening the game on "${board.question}": plant the root with the question as its label if the board is empty, grow up to ${OPENING_MOVES} free branches (${board.openingMovesLeft} left), then call pass to hand over to the human.`;
    case 'playing':
      return board.currentPlayer === 'agent'
        ? 'It is your turn: make exactly one move now.'
        : "It is the human's turn, so wait.";
    case 'ended':
      return `The game is over with a final score of ${board.score} out of 100. Do not call any more move tools.`;
  }
}

/** What the human just did, as far as the store can tell. */
function describeChange(board: BoardSummary, from: GamePhase, boardChanged: boolean): string {
  if (board.gamePhase === 'setup') return 'The human reset the game.';
  if (board.gamePhase === 'ended') return '';
  if (board.gamePhase !== from) {
    if (from === 'setup') return `A new game started on "${board.question}".`;
    if (from === 'ended') return 'The human reopened the game by undoing your last move.';
    if (from === 'opening') return 'The opening is over.';
    return 'The human undid one of your opening moves.';
  }
  if (boardChanged) return 'The human changed the board.';
  return board.currentPlayer === 'agent'
    ? 'The human passed without moving.'
    : 'The human skipped your turn.';
}

export default function VoiceAgent() {
  const [error, setError] = useState<string | null>(null);
  const [lastToolError, setLastToolError] = useState<string | null>(null);
  // Unconfigured, the panel is only a setup hint, so it starts out of the way.
  const [isExpanded, setIsExpanded] = useState(AGENT_ID !== '');
  const isAgentActingRef = useRef(false);

  const controls = useConversationControls();

  const conversation = useConversation({
    onConnect: () => {
      setError(null);
      // Sent as context rather than a prompt override so the agent needs no
      // dashboard override permissions to be usable here.
      const board = readBoard();
      controls.sendContextualUpdate(
        `The board state is: ${JSON.stringify(board)}. ${instructions(board)} ` +
          'Call get_board before each move to refresh it.'
      );
    },
    onError: (message: unknown) => setError(String(message)),
  });

  const { status, isSpeaking } = conversation;
  const isConnected = status === 'connected';

  // The log reads from the same history the controls show, so the two panels
  // can never disagree about what the agent did.
  const history = useGameStore(state => state.history);
  const recentAgentActions = history.filter(action => action.player === 'agent').slice(-LOG_ROWS).reverse();

  // The board pauses on the agent's turn only while an agent is actually
  // present, so the rest of the app needs to know a voice agent is live.
  const setVoiceConnected = useGameStore(state => state.setVoiceConnected);
  useEffect(() => {
    setVoiceConnected(isConnected);
    return () => setVoiceConnected(false);
  }, [isConnected, setVoiceConnected]);

  // Every voice tool funnels into applyMove, the same entry point the WebMCP
  // tools use, so the voice agent plays by exactly the same rules.
  const runMove = useCallback((name: MoveName, params: Record<string, unknown>) => {
    // The tool result already reports this change back to the agent, so the
    // board watcher below must not narrate it a second time.
    const result = applyMove(name, params ?? {});
    const readOnly = name === 'get_board' || name === 'get_node_state';
    // An announcement changes nothing on the board, so it leaves no change of
    // the agent's own for the watcher to skip.
    isAgentActingRef.current = result.success && !readOnly && name !== 'announce';

    // Successful moves show up in the shared history; only failures need a
    // line of their own here.
    if (!readOnly) {
      setLastToolError(result.success ? null : `${name}: ${result.message}`);
    }

    return JSON.stringify(result);
  }, []);

  // Voice reaches the agent instantly but canvas clicks do not, so changes the
  // agent did not make are pushed to it as they happen. Without this the agent
  // only discovers the human's moves the next time it happens to call get_board.
  useEffect(() => {
    if (!isConnected) return;

    const initial = useGameStore.getState();
    let previous = {
      moves: initial.history.length,
      nodes: initial.nodes,
      player: initial.currentPlayer,
      phase: initial.gamePhase,
    };
    let debounce: ReturnType<typeof setTimeout> | undefined;

    const unsubscribe = useGameStore.subscribe(state => {
      // A run of note edits shares one history entry, so the nodes themselves
      // are watched too: a note being written changes nothing else.
      const boardChanged = state.history.length !== previous.moves || state.nodes !== previous.nodes;
      const turnChanged = state.currentPlayer !== previous.player;
      const phaseChanged = state.gamePhase !== previous.phase;
      if (!boardChanged && !turnChanged && !phaseChanged) return;
      const from = previous.phase;
      // The editor saves as the human types, so a note arrives as a stream of
      // small changes. Those get a lighter word, later, without the board.
      const edited =
        turnChanged || phaseChanged || state.history.length < previous.moves
          ? []
          : editedNotes(previous.nodes, state.nodes);
      previous = {
        moves: state.history.length,
        nodes: state.nodes,
        player: state.currentPlayer,
        phase: state.gamePhase,
      };

      if (isAgentActingRef.current) {
        isAgentActingRef.current = false;
        return;
      }

      clearTimeout(debounce);
      debounce = setTimeout(() => {
        if (edited.length > 0) {
          const where = edited.map(node => `"${node.label}" (${node.id})`).join(' and ');
          controls.sendContextualUpdate(
            `The human edited the note on ${where}. Call get_node_state to read it before writing there yourself.`,
          );
          return;
        }
        const board = readBoard();
        controls.sendContextualUpdate(
          [describeChange(board, from, boardChanged), `The board is now ${JSON.stringify(board)}.`, instructions(board)]
            .filter(Boolean)
            .join(' '),
        );
      }, edited.length > 0 ? NOTE_UPDATE_MS : 250);
    });

    return () => {
      unsubscribe();
      clearTimeout(debounce);
    };
  }, [isConnected, controls]);

  useConversationClientTool('get_board', () => runMove('get_board', {}));
  useConversationClientTool('get_node_state', (params: Record<string, unknown>) => runMove('get_node_state', params));
  useConversationClientTool('plant', (params: Record<string, unknown>) => runMove('plant', params));
  useConversationClientTool('branch', (params: Record<string, unknown>) => runMove('branch', params));
  useConversationClientTool('prune', (params: Record<string, unknown>) => runMove('prune', params));
  useConversationClientTool('mark_gap', (params: Record<string, unknown>) => runMove('mark_gap', params));
  useConversationClientTool('annotate', (params: Record<string, unknown>) => runMove('annotate', params));
  useConversationClientTool('edit_note', (params: Record<string, unknown>) => runMove('edit_note', params));
  useConversationClientTool('pass', () => runMove('pass', {}));
  useConversationClientTool('announce', (params: Record<string, unknown>) => runMove('announce', params));

  const handleConnect = useCallback(async () => {
    setError(null);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError('Microphone permission is required for the voice agent.');
      return;
    }

    try {
      await conversation.startSession({
        agentId: AGENT_ID,
        connectionType: 'webrtc',
      });
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : 'Could not start the voice session.');
    }
  }, [conversation]);

  const handleDisconnect = useCallback(() => {
    conversation.endSession();
  }, [conversation]);

  const statusLabel = !AGENT_ID
    ? 'Not configured'
    : isConnected
      ? isSpeaking
        ? 'Agent speaking'
        : 'Listening'
      : status === 'connecting'
        ? 'Connecting'
        : 'Offline';

  const orbColor = !AGENT_ID
    ? '#94a3b8'
    : isConnected
      ? isSpeaking
        ? '#f59e0b'
        : '#10b981'
      : '#64748b';

  return (
    <div
      style={{
        position: 'absolute',
        left: '16px',
        bottom: '16px',
        zIndex: 10,
        width: isExpanded ? '288px' : 'auto',
        background: 'rgba(255, 255, 255, 0.96)',
        backdropFilter: 'blur(8px)',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        boxShadow: '0 8px 24px rgba(15, 23, 42, 0.12)',
        padding: '14px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div
          aria-hidden="true"
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: orbColor,
            boxShadow: isConnected ? `0 0 0 6px ${orbColor}22` : 'none',
            transition: 'background 200ms ease, box-shadow 200ms ease',
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>Voice Agent</div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>{statusLabel}</div>
        </div>
        <button
          onClick={() => setIsExpanded(value => !value)}
          aria-label={isExpanded ? 'Collapse voice agent panel' : 'Expand voice agent panel'}
          aria-expanded={isExpanded}
          style={{
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: '#64748b',
            fontSize: '16px',
            padding: '4px',
            lineHeight: 1,
          }}
        >
          {isExpanded ? '\u2212' : '+'}
        </button>
      </div>

      {isExpanded && (
        <>
          {!AGENT_ID ? (
            <p style={{ fontSize: '12px', color: '#475569', lineHeight: 1.5, margin: '12px 0 0 0' }}>
              Set <code style={{ background: '#f1f5f9', padding: '1px 4px', borderRadius: '3px' }}>
                VITE_ELEVENLABS_AGENT_ID
              </code>{' '}
              in <code style={{ background: '#f1f5f9', padding: '1px 4px', borderRadius: '3px' }}>.env</code>{' '}
              to let a voice agent play. See the README for the ten client tools to add to your agent.
            </p>
          ) : (
            <button
              onClick={isConnected ? handleDisconnect : handleConnect}
              disabled={status === 'connecting'}
              style={{
                width: '100%',
                marginTop: '12px',
                padding: '10px',
                background: isConnected ? '#ef4444' : '#6366f1',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '13px',
                cursor: status === 'connecting' ? 'wait' : 'pointer',
                opacity: status === 'connecting' ? 0.7 : 1,
              }}
            >
              {isConnected ? 'End voice session' : 'Start talking'}
            </button>
          )}

          {error && (
            <p
              role="alert"
              style={{
                margin: '10px 0 0 0',
                padding: '8px',
                background: '#fef2f2',
                color: '#b91c1c',
                borderRadius: '6px',
                fontSize: '12px',
                lineHeight: 1.4,
              }}
            >
              {error}
            </p>
          )}

          {lastToolError && (
            <p
              style={{
                margin: '10px 0 0 0',
                padding: '8px',
                background: '#fff7ed',
                color: '#9a3412',
                borderRadius: '6px',
                fontSize: '12px',
                lineHeight: 1.4,
              }}
            >
              Last rejected call: {lastToolError}
            </p>
          )}

          {recentAgentActions.length > 0 && (
            <div style={{ marginTop: '12px', borderTop: '1px solid #e2e8f0', paddingTop: '10px' }}>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#64748b',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  marginBottom: '6px',
                }}
              >
                Agent moves
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '4px' }}>
                {recentAgentActions.map(action => (
                  <li
                    key={action.timestamp}
                    style={{
                      fontSize: '12px',
                      color: '#166534',
                      display: 'flex',
                      gap: '6px',
                      alignItems: 'baseline',
                    }}
                  >
                    <code style={{ fontSize: '11px', opacity: 0.8 }}>{action.type}</code>
                    <span style={{ color: '#475569' }}>{describeAction(action)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
