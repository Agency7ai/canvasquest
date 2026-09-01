import { lazy, Suspense } from 'react';
import { ReactFlowProvider } from 'reactflow';
import GameCanvas from './game-canvas';
import GameControls from './game-controls';
import { useWebMCP } from './use-webmcp';
import { useGameStore } from './store';
import './app.css';

const VoiceAgentIsland = lazy(() => import('./voice-agent-island'));

export default function App() {
  const { hasWebMCP } = useWebMCP();
  const isVoiceConnected = useGameStore(state => state.isVoiceConnected);
  const mode = useGameStore(state => state.mode);
  const setMode = useGameStore(state => state.setMode);

  const agentStatus = hasWebMCP
    ? 'WebMCP active'
    : isVoiceConnected
      ? 'WebMCP off — voice agent playing'
      : 'WebMCP off — human-only';

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          padding: '16px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '16px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold' }}>CanvasQuest</h1>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', opacity: 0.9 }}>
            {mode === 'game'
              ? 'Collaborative learning game with a voice agent'
              : 'Map what you know, and what you do not, out loud'}
          </p>
        </div>

        <div
          role="group"
          aria-label="Session mode"
          style={{
            display: 'flex',
            gap: '2px',
            background: 'rgba(255,255,255,0.16)',
            padding: '3px',
            borderRadius: '8px',
          }}
        >
          {(['workspace', 'game'] as const).map(option => (
            <button
              key={option}
              onClick={() => setMode(option)}
              aria-pressed={mode === option}
              style={{
                border: 'none',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                textTransform: 'capitalize',
                background: mode === option ? 'white' : 'transparent',
                color: mode === option ? '#4c1d95' : 'rgba(255,255,255,0.85)',
              }}
            >
              {option}
            </button>
          ))}
        </div>
        <div
          style={{
            background: hasWebMCP || isVoiceConnected ? '#10b981' : '#f59e0b',
            padding: '6px 12px',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            whiteSpace: 'nowrap',
          }}
        >
          <span>{hasWebMCP || isVoiceConnected ? '✓' : '⚠'}</span>
          <span>{agentStatus}</span>
        </div>
      </header>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
          <ReactFlowProvider>
            <GameCanvas />
          </ReactFlowProvider>
          <Suspense fallback={null}>
            <VoiceAgentIsland />
          </Suspense>
        </div>
        <GameControls />
      </div>
    </div>
  );
}
