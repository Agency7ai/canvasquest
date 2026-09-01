import { lazy, Suspense, useState } from 'react';
import { ReactFlowProvider } from 'reactflow';
import GameCanvas from './game-canvas';
import GameControls from './game-controls';
import { useWebMCP } from './use-webmcp';
import { useGameStore } from './store';
import './app.css';

const VoiceAgentIsland = lazy(() => import('./voice-agent-island'));
const ForestView = lazy(() => import('./forest-view'));

type CanvasView = 'canvas' | 'forest';

const segmentedGroupStyle: React.CSSProperties = {
  display: 'flex',
  gap: '2px',
  background: 'rgba(255,255,255,0.16)',
  padding: '3px',
  borderRadius: '8px',
};

const segmentStyle = (isActive: boolean): React.CSSProperties => ({
  border: 'none',
  borderRadius: '6px',
  padding: '6px 12px',
  fontSize: '12px',
  fontWeight: 600,
  cursor: 'pointer',
  textTransform: 'capitalize',
  background: isActive ? 'white' : 'transparent',
  color: isActive ? '#4c1d95' : 'rgba(255,255,255,0.85)',
});

export default function App() {
  const { hasWebMCP } = useWebMCP();
  const isVoiceConnected = useGameStore(state => state.isVoiceConnected);
  const mode = useGameStore(state => state.mode);
  const setMode = useGameStore(state => state.setMode);
  const [view, setView] = useState<CanvasView>('canvas');

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

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <div role="group" aria-label="Session mode" style={segmentedGroupStyle}>
            {(['workspace', 'game'] as const).map(option => (
              <button
                key={option}
                onClick={() => setMode(option)}
                aria-pressed={mode === option}
                style={segmentStyle(mode === option)}
              >
                {option}
              </button>
            ))}
          </div>

          <div role="group" aria-label="Visualisation" style={segmentedGroupStyle}>
            {(['canvas', 'forest'] as const).map(option => (
              <button
                key={option}
                onClick={() => setView(option)}
                aria-pressed={view === option}
                style={segmentStyle(view === option)}
              >
                {option}
              </button>
            ))}
          </div>
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
          {view === 'canvas' ? (
            <ReactFlowProvider>
              <GameCanvas />
            </ReactFlowProvider>
          ) : (
            <Suspense
              fallback={
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    background: '#0d1b1e',
                    display: 'grid',
                    placeItems: 'center',
                    color: '#64748b',
                    fontSize: '13px',
                  }}
                >
                  Clearing the ground…
                </div>
              }
            >
              <ForestView />
            </Suspense>
          )}
          <Suspense fallback={null}>
            <VoiceAgentIsland />
          </Suspense>
        </div>
        <GameControls />
      </div>
    </div>
  );
}
