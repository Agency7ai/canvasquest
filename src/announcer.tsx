import { useEffect, useRef, useState } from 'react';
import { browserVoice, canUseBrowserVoice, pickVoice } from './speech';
import type { Cancel, Speaker, SpeechEvents, Voice } from './speech';
import { useGameStore } from './store';

/** Remembered per browser, so a muted page stays muted across games. */
const MUTED_KEY = 'canvasquest:announcements-muted';

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTED_KEY, muted ? '1' : '0');
  } catch {
    // Without storage the choice still holds for this visit.
  }
}

const noop: Cancel = () => {};

/**
 * The agent's voice on the page. Each announce call shows the agent's summary
 * and its handoff line over the board and reads them aloud: with the site's
 * voice, ElevenLabs text-to-speech behind /api/speak, when the site has a key,
 * otherwise with the browser's own speech synthesis, so a text-only agent can
 * still say "your turn". A connected voice agent already speaks for itself, so
 * while a voice session is live only the text is shown.
 */
export default function AgentAnnouncer() {
  const announcement = useGameStore(state => state.announcement);
  const dismiss = useGameStore(state => state.dismissAnnouncement);

  // The site's voice wherever audio can play, else the browser's own, else
  // nothing to read with. A site without a voice (no key, or a static host
  // with no function) hands over to the browser voice for the rest of the visit.
  const [voice, setVoice] = useState<Voice | null>(pickVoice);
  const [muted, setMuted] = useState(readMuted);
  const [speaking, setSpeaking] = useState(false);
  // Browsers refuse to play sound until the page has been clicked or tapped once.
  const [blocked, setBlocked] = useState(false);
  // Why the voice fell back or fell silent, shown under the announcement it
  // belongs to; a new announcement simply starts without one.
  const [voiceNote, setVoiceNote] = useState<{ id: number; message: string } | null>(null);

  // Speech starts for a new announcement only, never because the mute toggle
  // re-rendered, so the effect reads the mute state through a ref.
  const mutedRef = useRef(muted);
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  // The running speech, so the mute button can stop it mid-sentence.
  const cancelRef = useRef<Cancel>(noop);

  useEffect(() => {
    if (!announcement || !voice || mutedRef.current) return;
    // A live voice agent narrates itself; the page talking over it is noise.
    if (useGameStore.getState().isVoiceConnected) return;

    const lines = [announcement.summary, announcement.handoff].filter((line): line is string => Boolean(line));
    const note = (message: string) => setVoiceNote({ id: announcement.id, message });

    const events: Omit<SpeechEvents, 'onError' | 'onUnavailable'> = {
      onStart: () => {
        setBlocked(false);
        setSpeaking(true);
      },
      onEnd: () => setSpeaking(false),
      onBlocked: () => {
        setSpeaking(false);
        setBlocked(true);
      },
    };
    const start = (
      speak: Speaker,
      onError: SpeechEvents['onError'],
      onUnavailable: SpeechEvents['onUnavailable'],
    ) => {
      cancelRef.current();
      cancelRef.current = speak(lines, { ...events, onError, onUnavailable });
    };
    const giveUp = (message: string) => {
      setSpeaking(false);
      note(message);
    };

    start(
      voice.speak,
      message => {
        // When the site's voice fails the browser voice steps in, so the line
        // is still heard. The browser voice never reports itself unavailable.
        if (voice.kind === 'site' && canUseBrowserVoice()) {
          note(`${message}. Using the browser voice instead.`);
          start(browserVoice.speak, giveUp, noop);
        } else {
          giveUp(message);
        }
      },
      () => {
        // No site voice here: switch to the browser's for good. The effect runs
        // again with the new voice and reads this announcement with it.
        setVoice(canUseBrowserVoice() ? browserVoice : null);
      },
    );

    return () => {
      cancelRef.current();
      cancelRef.current = noop;
      setSpeaking(false);
    };
  }, [announcement, voice]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    writeMuted(next);
    if (next) {
      cancelRef.current();
      setSpeaking(false);
    }
  };

  const muteLabel = muted ? 'Read announcements aloud' : 'Stop reading announcements aloud';

  return (
    // Always mounted, so assistive tech treats each new line as a live update.
    <div role="status" aria-live="polite" aria-atomic="true" className="announce-region">
      {announcement && (
        <div key={announcement.id} className="announcement">
          <span className="announcement-tag">Agent</span>
          <div className="announcement-body">
            <p className="announcement-summary">{announcement.summary}</p>
            {announcement.handoff && <p className="announcement-handoff">{announcement.handoff}</p>}
            {blocked && !muted && (
              <p className="announcement-hint">
                The browser plays announcements aloud only once you have clicked the page.
              </p>
            )}
            {voiceNote?.id === announcement.id && !muted && <p className="announcement-hint">{voiceNote.message}</p>}
          </div>
          <div className="announcement-actions">
            {voice && (
              <button
                type="button"
                onClick={toggleMute}
                aria-pressed={muted}
                aria-label={muteLabel}
                title={`${muteLabel} (${voice.label})`}
                className={`btn btn-ghost${speaking ? ' is-speaking' : ''}`}
              >
                {muted ? 'Unmute' : 'Mute'}
              </button>
            )}
            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss announcement"
              title="Dismiss"
              className="btn btn-ghost"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
