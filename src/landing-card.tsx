import { useState } from 'react';
import type { CSSProperties } from 'react';
import { buildAgentPrompt } from './agent-prompt';
import { MOVES_PER_PLAYER, OPENING_MOVES, useGameStore } from './store';
import { hasWebMCP as detectWebMCP } from './use-webmcp';

const AGENT_ID = import.meta.env.VITE_ELEVENLABS_AGENT_ID ?? '';

const PRESET_QUESTIONS = [
  'How should I learn agentic web apps?',
  'How do I get started with woodworking?',
  'What do I need to know to run a small business?',
  'How should I learn to read Arabic?',
];

interface LandingCardProps {
  /**
   * Called once the agent prompt is on the clipboard, with the topic it was
   * built for, so the next panel can say so.
   */
  onPromptCopied: (topic: string) => void;
}

/**
 * The landing card floats over the forest before a game exists. Its job is to
 * get an agent to open the game: it copies the prompt that tells the agent to
 * plant and grow, and starts the game so the forest shows the sprout while
 * the agent works. Planting by hand is the fallback.
 */
export default function LandingCard({ onPromptCopied }: LandingCardProps) {
  const startGame = useGameStore(state => state.startGame);
  const plant = useGameStore(state => state.plant);
  const grove = useGameStore(state => state.grove);
  const isVoiceConnected = useGameStore(state => state.isVoiceConnected);
  const [topic, setTopic] = useState('');
  const [hint, setHint] = useState('');
  const webMCP = detectWebMCP();
  const prompt = buildAgentPrompt(topic);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  };

  const startWithAgent = async () => {
    // The clipboard write starts inside the click, which browsers require.
    const copied = await copy(prompt);
    if (copied) onPromptCopied(topic.trim());
    if (!topic.trim()) {
      setHint(
        copied
          ? 'Prompt copied. Paste it into your agent: it asks what you want to learn, then plants the root.'
          : 'The browser blocked the clipboard. Open the prompt below and copy it into your agent.',
      );
      return;
    }
    const result = startGame(topic);
    if (!result.success) setHint(result.message);
  };

  const plantYourself = () => {
    const result = plant(topic, 'human');
    if (!result.success) setHint(result.message);
  };

  const hasTopic = topic.trim().length > 0;

  return (
    <div style={wrapperStyle}>
      <section aria-labelledby="landing-title" style={cardStyle}>
        <div>
          <h2 id="landing-title" style={{ margin: 0, fontSize: '22px', color: '#0f172a' }}>
            Grow a learning tree
          </h2>
          <p style={{ margin: '6px 0 0 0', fontSize: '13px', color: '#475569', lineHeight: 1.5 }}>
            An AI agent plants the root and grows the first branches on its own. You join in, and together you
            finish the tree. Every finished tree stands in your forest.
          </p>
        </div>

        <label htmlFor="topic" style={labelStyle}>
          What do you want to learn?
        </label>
        <input
          id="topic"
          type="text"
          value={topic}
          onChange={event => {
            setTopic(event.target.value);
            setHint('');
          }}
          onKeyDown={event => {
            if (event.key === 'Enter') void startWithAgent();
          }}
          placeholder={PRESET_QUESTIONS[0]}
          autoFocus
          style={inputStyle}
        />

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {PRESET_QUESTIONS.map(preset => (
            <button
              key={preset}
              type="button"
              onClick={() => {
                setTopic(preset);
                setHint('');
              }}
              style={chipStyle}
            >
              {preset}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <button
            type="button"
            onClick={() => void startWithAgent()}
            title="Copies the prompt for your agent and starts the game with the agent opening"
            style={primaryButtonStyle}
          >
            🤖 Start with an agent
          </button>
          <button
            type="button"
            onClick={plantYourself}
            disabled={!hasTopic}
            title="Plants the root yourself; the agent then takes the first turn"
            style={{ ...secondaryButtonStyle, opacity: hasTopic ? 1 : 0.5, cursor: hasTopic ? 'pointer' : 'default' }}
          >
            🌱 Plant it yourself
          </button>
        </div>

        {hint && (
          <p role="status" style={{ margin: 0, fontSize: '12px', color: '#1e293b', lineHeight: 1.5 }}>
            {hint}
          </p>
        )}

        <ol style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: '#475569', lineHeight: 1.6 }}>
          <li>
            <strong>The agent opens.</strong> It plants the root and grows up to {OPENING_MOVES} free branches.
          </li>
          <li>
            <strong>You join in.</strong> Press Join in, or wait for the agent to pass.
          </li>
          <li>
            <strong>Grow it together.</strong> {MOVES_PER_PLAYER} moves each, then the tree is planted in your forest.
          </li>
        </ol>

        <div
          style={{
            ...statusStyle,
            background: webMCP ? '#ecfdf5' : '#fffbeb',
            color: webMCP ? '#065f46' : '#92400e',
          }}
        >
          <span aria-hidden="true">{webMCP ? '✓' : '⚠'}</span>
          <span>
            {webMCP
              ? 'WebMCP is live in this browser: the agent driving it can see the game tools. Paste the prompt into its chat.'
              : 'No WebMCP here. Open this page in an agent’s browser (Chrome with chrome://flags/#enable-webmcp-testing, or ChatGPT’s or Codex’s browser) and paste the prompt there.'}
            {AGENT_ID && !isVoiceConnected && ' Or press Start talking in the voice panel and say what you want to learn.'}
            {isVoiceConnected && ' The voice agent is listening: tell it what you want to learn and it plants the root.'}
          </span>
        </div>

        <details>
          <summary style={{ fontSize: '12px', color: '#4f46e5', cursor: 'pointer' }}>Show the agent prompt</summary>
          <blockquote style={promptStyle}>{prompt}</blockquote>
        </details>

        {grove.length > 0 && (
          <p style={{ margin: 0, fontSize: '12px', color: '#166534' }}>
            🌳 {grove.length} {grove.length === 1 ? 'tree stands' : 'trees stand'} in your forest. Click one to walk in.
          </p>
        )}
      </section>
    </div>
  );
}

const wrapperStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  padding: '24px',
  // Only the card takes clicks: the forest behind it stays draggable.
  pointerEvents: 'none',
};

const cardStyle: CSSProperties = {
  pointerEvents: 'auto',
  width: 'min(460px, 100%)',
  maxHeight: '100%',
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: '14px',
  padding: '24px',
  borderRadius: '16px',
  background: 'rgba(255, 255, 255, 0.94)',
  backdropFilter: 'blur(10px)',
  boxShadow: '0 24px 60px rgba(0, 0, 0, 0.35)',
};

const labelStyle: CSSProperties = {
  fontSize: '11px',
  fontWeight: 700,
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  marginBottom: '-8px',
};

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #cbd5e1',
  borderRadius: '8px',
  fontSize: '14px',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};

const chipStyle: CSSProperties = {
  padding: '5px 10px',
  background: '#f1f5f9',
  color: '#334155',
  border: '1px solid #e2e8f0',
  borderRadius: '999px',
  fontSize: '12px',
  cursor: 'pointer',
};

const primaryButtonStyle: CSSProperties = {
  padding: '11px 12px',
  background: '#6366f1',
  color: 'white',
  border: 'none',
  borderRadius: '8px',
  fontWeight: 600,
  fontSize: '13px',
  cursor: 'pointer',
};

const secondaryButtonStyle: CSSProperties = {
  padding: '11px 12px',
  background: 'white',
  color: '#334155',
  border: '1px solid #cbd5e1',
  borderRadius: '8px',
  fontWeight: 600,
  fontSize: '13px',
};

const statusStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '8px',
  padding: '10px 12px',
  borderRadius: '8px',
  fontSize: '12px',
  lineHeight: 1.5,
};

const promptStyle: CSSProperties = {
  margin: '8px 0 0 0',
  padding: '12px',
  background: '#f1f5f9',
  borderLeft: '3px solid #6366f1',
  borderRadius: '8px',
  fontSize: '12px',
  color: '#1e293b',
  lineHeight: 1.5,
  userSelect: 'all',
};
