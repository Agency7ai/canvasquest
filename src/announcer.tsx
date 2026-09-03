import { useEffect, useRef, useState } from 'react';
import { browserSpeaker, canUseBrowserVoice, pickVoice } from './speech';
import type { Cancel, Speaker, SpeechEvents } from './speech';
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
 * and its handoff line over the board and reads them aloud: with an ElevenLabs
 * voice when a text-to-speech key is configured, otherwise with the browser's
 * own speech synthesis, so a text-only agent can still say "your turn". A
 * connected voice agent already speaks for itself, so while a voice session
 * is live only the text is shown.
 */
export default function AgentAnnouncer() {
  const announcement = useGameStore(state => state.announcement);
  const dismiss = useGameStore(state => state.dismissAnnouncement);

  // Chosen once per page: the ElevenLabs voice when a key is configured, else
  // the browser's own, else nothing to read with.
  const [voice] = useState(pickVoice);
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

    const events: Omit<SpeechEvents, 'onError'> = {
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
    const start = (speak: Speaker, onError: SpeechEvents['onError']) => {
      cancelRef.current();
      cancelRef.current = speak(lines, { ...events, onError });
    };
    const giveUp = (message: string) => {
      setSpeaking(false);
      note(message);
    };

    // When ElevenLabs fails the browser voice steps in, so the line is still heard.
    start(voice.speak, message => {
      if (voice.kind === 'elevenlabs' && canUseBrowserVoice()) {
        note(`${message}. Using the browser voice instead.`);
        start(browserSpeaker, giveUp);
      } else {
        giveUp(message);
      }
    });

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
