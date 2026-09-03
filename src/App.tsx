import { lazy, Suspense } from 'react';
import { ReactFlowProvider } from 'reactflow';
import EndScreen from './end-screen';
import GameCanvas from './game-canvas';
import GameControls from './game-controls';
import SetupScreen from './setup-screen';
import { useGameStore } from './store';
import { useWebMCP } from './use-webmcp';
import './app.css';

const VoiceAgentIsland = lazy(() => import('./voice-agent-island'));

export default function App() {
  const { hasWebMCP } = useWebMCP();
  const isVoiceConnected = useGameStore(state => state.isVoiceConnected);
  const gamePhase = useGameStore(state => state.gamePhase);

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
          padding: '12px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '16px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 'bold' }}>CanvasQuest</h1>
          <p style={{ margin: '2px 0 0 0', fontSize: '13px', opacity: 0.9 }}>
            Grow a learning tree with an AI agent
          </p>
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

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        {gamePhase === 'setup' ? (
          <SetupScreen />
        ) : (
          <>
            <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
              <ReactFlowProvider>
                <GameCanvas />
              </ReactFlowProvider>
            </div>
            {gamePhase === 'ended' ? <EndScreen /> : <GameControls />}
          </>
        )}

        {/* Mounted in every phase so a live voice call survives a new game. */}
        <Suspense fallback={null}>
          <VoiceAgentIsland />
        </Suspense>
      </div>
    </div>
  );
}
