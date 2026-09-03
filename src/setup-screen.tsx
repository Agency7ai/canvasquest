import { useState } from 'react';
import { MOVES_PER_PLAYER, useGameStore } from './store';

const PRESET_QUESTIONS = [
  'How should I learn agentic web apps?',
  'How do I get started with woodworking?',
  'What do I need to know to run a small business?',
  'How should I learn to read Arabic?',
];

const HOW_TO_PLAY = [
  'You and an AI agent take turns growing one learning tree from your question.',
  `Each player has ${MOVES_PER_PLAYER} moves: plant the root, branch a concept, resource or skill, prune, or mark a gap. Passing and notes are free.`,
  'Flag a gap where knowledge is missing; a resource or skill placed under it closes the gap.',
  'The game ends when both players are out of moves or both pass in a row. Score up to 100.',
];

const inputStyle = {
  width: '100%',
  padding: '12px 14px',
  border: '1px solid #cbd5e1',
  borderRadius: '8px',
  fontSize: '16px',
  boxSizing: 'border-box' as const,
};

export default function SetupScreen() {
  const startGame = useGameStore(state => state.startGame);
  const [question, setQuestion] = useState('');
  const [error, setError] = useState('');

  const start = (value: string) => {
    const result = startGame(value);
    if (!result.success) setError(result.message);
  };

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: '#f8fafc',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '560px',
          background: 'white',
          borderRadius: '16px',
          padding: '32px',
          boxShadow: '0 12px 32px rgba(15, 23, 42, 0.08)',
          border: '1px solid #e2e8f0',
        }}
      >
        <h1 style={{ margin: '0 0 6px 0', fontSize: '26px', color: '#0f172a' }}>🌱 CanvasQuest</h1>
        <p style={{ margin: '0 0 20px 0', color: '#475569', fontSize: '14px' }}>
          Grow a learning tree together with an AI agent, one move at a time.
        </p>

        <form
          onSubmit={event => {
            event.preventDefault();
            start(question);
          }}
        >
          <label
            htmlFor="setup-question"
            style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '8px' }}
          >
            What do you want to learn?
          </label>
          <input
            id="setup-question"
            type="text"
            autoFocus
            value={question}
            onChange={event => {
              setQuestion(event.target.value);
              setError('');
            }}
            placeholder="Type a question, or pick one below"
            style={inputStyle}
          />
          <button
            type="submit"
            style={{
              width: '100%',
              marginTop: '10px',
              padding: '12px',
              background: '#6366f1',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '15px',
              cursor: 'pointer',
            }}
          >
            Start game
          </button>
        </form>

        {error && (
          <p role="alert" style={{ margin: '10px 0 0 0', color: '#b91c1c', fontSize: '13px' }}>
            {error}
          </p>
        )}

        <div style={{ margin: '20px 0 8px 0', fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Or start from a preset
        </div>
        <div style={{ display: 'grid', gap: '8px' }}>
          {PRESET_QUESTIONS.map(preset => (
            <button
              key={preset}
              type="button"
              onClick={() => start(preset)}
              style={{
                textAlign: 'left',
                padding: '10px 12px',
                background: '#f1f5f9',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                fontSize: '14px',
                color: '#0f172a',
                cursor: 'pointer',
              }}
            >
              {preset}
            </button>
          ))}
        </div>

        <h2 style={{ margin: '24px 0 8px 0', fontSize: '15px', color: '#0f172a' }}>How to play</h2>
        <ol style={{ margin: 0, paddingLeft: '20px', color: '#475569', fontSize: '13px', lineHeight: 1.6 }}>
          {HOW_TO_PLAY.map(line => (
            <li key={line}>{line}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}
