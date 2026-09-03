import { lazy, Suspense, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { ReactFlowProvider } from 'reactflow';
import { APP_NAME, APP_TAGLINE } from './app-meta';
import EndScreen from './end-screen';
import GameCanvas from './game-canvas';
import GameControls from './game-controls';
import LandingCard from './landing-card';
import OpeningPanel from './opening-panel';
import { useGameStore } from './store';
import type { Visualization } from './types';
import { useWebMCP } from './use-webmcp';
import './app.css';

const VoiceAgentIsland = lazy(() => import('./voice-agent-island'));
// three.js is split out of the main bundle and fetched as the landing page draws.
const ForestView = lazy(() => import('./forest-view'));

const VIEWS: { id: Visualization; label: string }[] = [
  { id: 'forest', label: '🌲 Forest' },
  { id: 'board', label: '🗺 Board' },
];

export default function App() {
  const { hasWebMCP } = useWebMCP();
  const isVoiceConnected = useGameStore(state => state.isVoiceConnected);
  const gamePhase = useGameStore(state => state.gamePhase);
  // Kept in the store, not local state, so an agent can read which view the
  // human is looking at.
  const visualization = useGameStore(state => state.visualization);
  const setVisualization = useGameStore(state => state.setVisualization);
  const setFocusedTreeId = useGameStore(state => state.setFocusedTreeId);
  const question = useGameStore(state => state.question);
  // The topic the landing card copied a prompt for. The prompt only depends on
  // the question, so the copy still stands while the game is about that question.
  const [copiedFor, setCopiedFor] = useState<string | null>(null);
  const promptCopied = copiedFor !== null && copiedFor === question;

  // The forest is the landing page, the opening and the ending. The flat board
  // is something the human opts into while playing, and that choice survives
  // until the next phase change.
  useEffect(() => {
    if (gamePhase !== 'playing') setVisualization('forest');
  }, [gamePhase, setVisualization]);

  const changeView = (next: Visualization) => {
    setVisualization(next);
    // Leaving the forest ends any walk-in.
    if (next !== 'forest') setFocusedTreeId(null);
  };

  const showBoard = visualization === 'board' && gamePhase !== 'setup';
  const agentStatus = hasWebMCP
    ? 'WebMCP active'
    : isVoiceConnected
      ? 'WebMCP off — voice agent playing'
      : 'WebMCP off — human-only';

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={headerStyle}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 'bold' }}>{APP_NAME}</h1>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', opacity: 0.9 }}>{APP_TAGLINE}</p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexShrink: 0 }}>
          {gamePhase !== 'setup' && (
            <div role="group" aria-label="View" style={segmentedGroupStyle}>
              {VIEWS.map(view => (
                <button
                  key={view.id}
                  type="button"
                  onClick={() => changeView(view.id)}
                  aria-pressed={visualization === view.id}
                  style={segmentStyle(visualization === view.id)}
                >
                  {view.label}
                </button>
              ))}
            </div>
          )}

          <div
            style={{
              background: hasWebMCP || isVoiceConnected ? '#10b981' : '#f59e0b',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
            }}
          >
            <span>{hasWebMCP || isVoiceConnected ? '✓' : '⚠'}</span>
            <span>{agentStatus}</span>
          </div>
        </div>
      </header>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
          {showBoard ? (
            <ReactFlowProvider>
              <GameCanvas />
            </ReactFlowProvider>
          ) : (
            <Suspense fallback={<div style={forestFallbackStyle}>Clearing the ground…</div>}>
              <ForestView />
            </Suspense>
          )}

          {gamePhase === 'setup' && <LandingCard onPromptCopied={setCopiedFor} />}

          {/* Mounted in every phase so a live voice call survives a new game. */}
          <Suspense fallback={null}>
            <VoiceAgentIsland />
          </Suspense>
        </div>

        {gamePhase === 'opening' && <OpeningPanel promptCopied={promptCopied} />}
        {gamePhase === 'playing' && <GameControls />}
        {gamePhase === 'ended' && <EndScreen />}
      </div>
    </div>
  );
}

const headerStyle: CSSProperties = {
  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  color: 'white',
  padding: '14px 24px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '16px',
  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
};

const segmentedGroupStyle: CSSProperties = {
  display: 'flex',
  gap: '2px',
  background: 'rgba(255,255,255,0.16)',
  padding: '3px',
  borderRadius: '8px',
};

const segmentStyle = (isActive: boolean): CSSProperties => ({
  border: 'none',
  borderRadius: '6px',
  padding: '6px 12px',
  fontSize: '12px',
  fontWeight: 600,
  cursor: 'pointer',
  background: isActive ? 'white' : 'transparent',
  color: isActive ? '#4c1d95' : 'rgba(255,255,255,0.85)',
});

const forestFallbackStyle: CSSProperties = {
  width: '100%',
  height: '100%',
  background: '#0d1b1e',
  display: 'grid',
  placeItems: 'center',
  color: '#64748b',
  fontSize: '13px',
};
