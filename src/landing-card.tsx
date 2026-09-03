import { useState } from 'react';
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
 * The right-hand column before a game exists. Its job is to get an agent to
 * open the game: it copies the prompt that tells the agent to plant and grow,
 * and starts the game so the forest shows the sprout while the agent works.
 * Planting by hand is the fallback.
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
    <aside className="aside" aria-labelledby="landing-title">
      <section className="panel panel-dark">
        <span className="label">Plant a question</span>
        <h2 id="landing-title" className="title">
          Grow a learning tree
        </h2>
        <p className="copy">
          An AI agent plants the root and grows the first branches on its own. You join in, and together you finish
          the tree. Every finished tree stands in your forest.
        </p>
      </section>

      <section className="panel">
        <label htmlFor="topic" className="label">
          What do you want to learn?
        </label>
        <input
          id="topic"
          type="text"
          className="input"
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
        />

        <div className="chips">
          {PRESET_QUESTIONS.map(preset => (
            <button
              key={preset}
              type="button"
              className="chip"
              onClick={() => {
                setTopic(preset);
                setHint('');
              }}
            >
              {preset}
            </button>
          ))}
        </div>

        <div className="two-columns">
          <button
            type="button"
            className="btn btn-primary btn-tall"
            onClick={() => void startWithAgent()}
            title="Copies the prompt for your agent and starts the game with the agent opening"
          >
            Start with an agent
          </button>
          <button
            type="button"
            className="btn btn-tall"
            onClick={plantYourself}
            disabled={!hasTopic}
            title="Plants the root yourself; the agent then takes the first turn"
          >
            Plant it yourself
          </button>
        </div>

        {hint && (
          <p role="status" className="feedback">
            {hint}
          </p>
        )}
      </section>

      <section className="panel">
        <span className="label">How a game goes</span>
        <ol className="steps">
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
      </section>

      <section className={`panel ${webMCP ? 'panel-moss' : 'panel-amber'}`}>
        <span className="label">{webMCP ? 'WebMCP live' : 'No WebMCP here'}</span>
        <p className="copy">
          {webMCP
            ? 'WebMCP is live in this browser: the agent driving it can see the game tools. Paste the prompt into its chat.'
            : 'No WebMCP here. Open this page in an agent’s browser (Chrome with chrome://flags/#enable-webmcp-testing, or ChatGPT’s or Codex’s browser) and paste the prompt there.'}
          {AGENT_ID && !isVoiceConnected && ' Or press Start talking in the voice panel and say what you want to learn.'}
          {isVoiceConnected && ' The voice agent is listening: tell it what you want to learn and it plants the root.'}
        </p>
      </section>

      <details className="details">
        <summary>Show the agent prompt</summary>
        <blockquote className="prompt">{prompt}</blockquote>
      </details>

      {grove.length > 0 && (
        <p className="footnote footnote-moss">
          {grove.length} {grove.length === 1 ? 'tree stands' : 'trees stand'} in your forest. Click one to walk in.
        </p>
      )}
    </aside>
  );
}
