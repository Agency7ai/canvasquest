import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useConversation,
  useConversationClientTool,
  useConversationControls,
} from '@elevenlabs/react';
import { applyMove, readBoard } from './moves';
import type { MoveName } from './moves';
import { useGameStore } from './store';

const AGENT_ID = import.meta.env.VITE_ELEVENLABS_AGENT_ID ?? '';

interface ToolCallEntry {
  id: number;
  name: MoveName;
  message: string;
  success: boolean;
}

let toolCallId = 0;

export default function VoiceAgent() {
  const [toolCalls, setToolCalls] = useState<ToolCallEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const isAgentActingRef = useRef(false);

  const controls = useConversationControls();

  const conversation = useConversation({
    onConnect: () => {
      setError(null);
      // Sent as context rather than a prompt override so the agent needs no
      // dashboard override permissions to be usable here.
      controls.sendContextualUpdate(
        `The board state is: ${JSON.stringify(readBoard())}. ` +
          'Call get_board before each move to refresh it.'
      );
    },
    onError: (message: unknown) => setError(String(message)),
  });

  const { status, isSpeaking } = conversation;
  const isConnected = status === 'connected';

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
    isAgentActingRef.current = true;
    const result = applyMove(name, params ?? {});

    if (name !== 'get_board') {
      setToolCalls(previous => [
        { id: ++toolCallId, name, message: result.message, success: result.success },
        ...previous,
      ].slice(0, 5));
    }

    return JSON.stringify(result);
  }, []);

  // Voice reaches the agent instantly but canvas clicks do not, so changes the
  // agent did not make are pushed to it as they happen. Without this the agent
  // only discovers the human's moves the next time it happens to call get_board.
  useEffect(() => {
    if (!isConnected) return;

    const initial = useGameStore.getState();
    let previous = { moves: initial.history.length, player: initial.currentPlayer };
    let debounce: ReturnType<typeof setTimeout> | undefined;

    const unsubscribe = useGameStore.subscribe(state => {
      const boardChanged = state.history.length !== previous.moves;
      const turnChanged = state.currentPlayer !== previous.player;
      if (!boardChanged && !turnChanged) return;
      previous = { moves: state.history.length, player: state.currentPlayer };

      if (isAgentActingRef.current) {
        isAgentActingRef.current = false;
        return;
      }

      clearTimeout(debounce);
      debounce = setTimeout(() => {
        const board = readBoard();
        const lead = boardChanged
          ? 'The human changed the board.'
          : 'The human passed without moving.';
        controls.sendContextualUpdate(
          `${lead} The board is now ${JSON.stringify(board)}. ` +
            (board.currentPlayer === 'agent'
              ? 'It is your turn: make exactly one move now.'
              : "It is the human's turn, so wait.")
        );
      }, 250);
    });

    return () => {
      unsubscribe();
      clearTimeout(debounce);
    };
  }, [isConnected, controls]);

  useConversationClientTool('get_board', () => runMove('get_board', {}));
  useConversationClientTool('plant', (params: Record<string, unknown>) => runMove('plant', params));
  useConversationClientTool('branch', (params: Record<string, unknown>) => runMove('branch', params));
  useConversationClientTool('prune', (params: Record<string, unknown>) => runMove('prune', params));
  useConversationClientTool('mark_gap', (params: Record<string, unknown>) => runMove('mark_gap', params));
  useConversationClientTool('mark_clear', (params: Record<string, unknown>) => runMove('mark_clear', params));

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
          {isExpanded ? '−' : '+'}
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
              to let a voice agent play. See the README for the six client tools to add to your agent.
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

          {toolCalls.length > 0 && (
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
                {toolCalls.map(call => (
                  <li
                    key={call.id}
                    style={{
                      fontSize: '12px',
                      color: call.success ? '#166534' : '#b91c1c',
                      display: 'flex',
                      gap: '6px',
                      alignItems: 'baseline',
                    }}
                  >
                    <code style={{ fontSize: '11px', opacity: 0.8 }}>{call.name}</code>
                    <span style={{ color: '#475569' }}>{call.message}</span>
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
