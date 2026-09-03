import { lazy, Suspense, useEffect, useState } from 'react';
import { ReactFlowProvider } from 'reactflow';
import { APP_NAME, APP_TAGLINE } from './app-meta';
import AgentAnnouncer from './announcer';
import EndScreen from './end-screen';
import GameCanvas from './game-canvas';
import GameControls from './game-controls';
import LandingCard from './landing-card';
import OpeningPanel from './opening-panel';
import QuestionIndex from './question-index';
import { useGameStore } from './store';
import type { Visualization } from './types';
import { useWebMCP } from './use-webmcp';
import './app.css';

const VoiceAgentIsland = lazy(() => import('./voice-agent-island'));
// The ElevenLabs voice panel is parked for now. Set this to true to bring it
// back; nothing else about the voice agent has been removed.
const SHOW_VOICE_AGENT = false;
// three.js is split out of the main bundle and fetched as the page draws.
const ForestView = lazy(() => import('./forest-view'));
// The Markdown editor and its renderer load the first time a note is opened.
const NoteEditor = lazy(() => import('./note-editor'));

const VIEWS: { id: Visualization; label: string }[] = [
  { id: 'forest', label: 'Forest' },
  { id: 'board', label: 'Board' },
];

interface StageText {
  title: string;
  sub: string;
  hint: string;
}

/** The title over the canvas and the hint bar under it, per view. */
const STAGE_TEXT: Record<Visualization, StageText> = {
  forest: {
    title: 'Tree in the clearing',
    sub: 'Click a node to walk in',
    hint: 'Drag to look · scroll to walk closer · click a limb to select · double-click to step back',
  },
  board: {
    title: 'The board',
    sub: 'Click a node to select it',
    hint: 'Drag to pan · scroll to zoom · click a node to select · double-click to open its note',
  },
};

/** Before a question is planted the clearing holds only the forest. */
const SETUP_STAGE: StageText = {
  title: 'The clearing',
  sub: 'Your forest, and room for a new tree',
  hint: 'Drag to look · scroll to walk closer · click a tree to walk in · double-click to step back',
};

/** The leaf beside the wordmark. */
function LeafMark() {
  return (
    <svg className="leaf-mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M20 4 C 10 4, 4 11, 4 20 C 13 20, 20 14, 20 4 Z" fill="currentColor" />
      <path
        d="M4 20 C 9 15, 13 11, 18 6"
        stroke="var(--paper)"
        strokeWidth="1.4"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

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
  // The topic the setup panel copied a prompt for. The prompt only depends on
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
  const agentLive = hasWebMCP || isVoiceConnected;
  const agentStatus = hasWebMCP
    ? 'WebMCP active'
    : isVoiceConnected
      ? 'WebMCP off · voice agent playing'
      : 'WebMCP off · human-only';
  const stage = gamePhase === 'setup' ? SETUP_STAGE : STAGE_TEXT[showBoard ? 'board' : 'forest'];

  return (
    <div className="terminal">
      <div className="screen">
        <header className="app-header">
          <div className="brand">
            <LeafMark />
            <h1 className="wordmark">{APP_NAME}</h1>
            <p className="tagline">{APP_TAGLINE}</p>
          </div>

          <div className="header-right">
            <div role="group" aria-label="View" className="view-switch">
              {VIEWS.map(view => {
                const disabled = view.id === 'board' && gamePhase === 'setup';
                return (
                  <button
                    key={view.id}
                    type="button"
                    onClick={() => changeView(view.id)}
                    aria-pressed={visualization === view.id}
                    disabled={disabled}
                    title={disabled ? 'Start a tree to see the board' : undefined}
                    className={`view-btn${visualization === view.id ? ' is-active' : ''}`}
                  >
                    {view.label}
                  </button>
                );
              })}
            </div>

            <div className={`badge ${agentLive ? 'badge-live' : 'badge-warn'}`}>{agentStatus}</div>
          </div>
        </header>

        <div className="columns">
          <QuestionIndex />

          <main className="stage">
            <div className="stage-head">
              <h2 className="stage-title">{stage.title}</h2>
              <span className="stage-sub">{stage.sub}</span>
            </div>

            <div className="stage-canvas">
              {showBoard ? (
                <ReactFlowProvider>
                  <GameCanvas />
                </ReactFlowProvider>
              ) : (
                <Suspense fallback={<div className="canvas-fallback">Clearing the ground…</div>}>
                  <ForestView />
                </Suspense>
              )}

              {/* Mounted in every phase so a live voice call survives a new game. */}
              {SHOW_VOICE_AGENT && (
                <Suspense fallback={null}>
                  <VoiceAgentIsland />
                </Suspense>
              )}

              {/* What the agent last said, shown and read aloud in every phase. */}
              <AgentAnnouncer />
            </div>

            <p className="hint-bar">{stage.hint}</p>
          </main>

          {gamePhase === 'setup' && <LandingCard onPromptCopied={setCopiedFor} />}
          {gamePhase === 'opening' && <OpeningPanel promptCopied={promptCopied} />}
          {gamePhase === 'playing' && <GameControls />}
          {gamePhase === 'ended' && <EndScreen />}
        </div>
      </div>

      {/* The terminal the screen sits in: a nameplate and a power light, nothing louder. */}
      <span className="nameplate" aria-hidden="true">
        CanvasQuest terminal · CQ-21
      </span>
      <span className="power-led" aria-hidden="true" />

      {/* A node's Markdown note, full screen over the header, the canvas and the panels. */}
      <Suspense fallback={null}>
        <NoteEditor />
      </Suspense>
    </div>
  );
}
