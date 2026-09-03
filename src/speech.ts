/**
 * The voices that read announcements aloud. ElevenLabs text-to-speech when a
 * key is configured, otherwise the browser's own speech synthesis, which also
 * steps in when ElevenLabs cannot be reached.
 */

export interface SpeechEvents {
  /** Sound has started. */
  onStart: () => void;
  /** The last line has finished, or the speech was stopped. */
  onEnd: () => void;
  /** The browser refused to play sound before the page was clicked. */
  onBlocked: () => void;
  /** The voice failed; the message is fit to show on the page. */
  onError: (message: string) => void;
}

/** Stops the speech. Safe to call more than once, or after it has ended. */
export type Cancel = () => void;

/** Reads the lines aloud, in order, and reports how it went. */
export type Speaker = (lines: string[], events: SpeechEvents) => Cancel;

export interface ElevenLabsTtsConfig {
  apiKey: string;
  voiceId: string;
  modelId: string;
}

/** "George", one of ElevenLabs' stock voices. */
export const DEFAULT_VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb';
/** The low-latency model: announcements are short and should start quickly. */
export const DEFAULT_MODEL_ID = 'eleven_flash_v2_5';
export const OUTPUT_FORMAT = 'mp3_44100_128';

type SpeechEnv = Pick<
  ImportMetaEnv,
  'VITE_ELEVENLABS_API_KEY' | 'VITE_ELEVENLABS_VOICE_ID' | 'VITE_ELEVENLABS_TTS_MODEL'
>;

/** The ElevenLabs voice from the environment, or null when no key is set. */
export function elevenLabsConfig(env: SpeechEnv = import.meta.env): ElevenLabsTtsConfig | null {
  const apiKey = env.VITE_ELEVENLABS_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    voiceId: env.VITE_ELEVENLABS_VOICE_ID?.trim() || DEFAULT_VOICE_ID,
    modelId: env.VITE_ELEVENLABS_TTS_MODEL?.trim() || DEFAULT_MODEL_ID,
  };
}

/** The text-to-speech call for one piece of text. */
export function buildTtsRequest(text: string, config: ElevenLabsTtsConfig): { url: string; init: RequestInit } {
  return {
    url: `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(config.voiceId)}?output_format=${OUTPUT_FORMAT}`,
    init: {
      method: 'POST',
      headers: {
        'xi-api-key': config.apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({ text, model_id: config.modelId }),
    },
  };
}

/** Speech synthesis is a browser feature; a page without it just shows the text. */
export const canUseBrowserVoice = (): boolean =>
  typeof window !== 'undefined' &&
  'speechSynthesis' in window &&
  typeof window.SpeechSynthesisUtterance === 'function';

/** Chrome can drop an utterance queued in the same tick as a cancel. */
const BROWSER_QUEUE_DELAY_MS = 60;

export const browserSpeaker: Speaker = (lines, events) => {
  const synth = window.speechSynthesis;
  // One utterance per line: a beat between them, and each stays short enough
  // for Chrome, which cuts long utterances off with some voices.
  const utterances = lines.map(line => new SpeechSynthesisUtterance(line));
  const first = utterances[0];
  const last = utterances[utterances.length - 1];
  if (!first || !last) {
    events.onEnd();
    return () => {};
  }

  first.onstart = () => events.onStart();
  last.onend = () => events.onEnd();
  for (const utterance of utterances) {
    utterance.onerror = event => {
      if (event.error === 'not-allowed') events.onBlocked();
      else if (event.error === 'interrupted' || event.error === 'canceled') events.onEnd();
      else events.onError(`The browser voice failed (${event.error})`);
    };
  }

  // Only the latest announcement is ever heard: a new one cuts the old off.
  synth.cancel();
  const timer = setTimeout(() => {
    for (const utterance of utterances) synth.speak(utterance);
  }, BROWSER_QUEUE_DELAY_MS);

  return () => {
    clearTimeout(timer);
    for (const utterance of utterances) {
      utterance.onstart = null;
      utterance.onend = null;
      utterance.onerror = null;
    }
    synth.cancel();
  };
};

/** The lines go out as one request; a paragraph break gives a beat between them. */
const LINE_BREAK = '\n\n';

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

const isNotAllowed = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'NotAllowedError';

const describeError = (error: unknown): string => {
  // fetch rejects with a TypeError when the network or CORS stops the call.
  if (error instanceof TypeError) return 'ElevenLabs could not be reached';
  return error instanceof Error ? error.message : String(error);
};

/**
 * Reads the lines with an ElevenLabs voice: one text-to-speech request, played
 * through an audio element. Everything is torn down on cancel, so a new
 * announcement can cut an old one off mid-sentence.
 */
export function elevenLabsSpeaker(
  config: ElevenLabsTtsConfig,
  fetchImpl: FetchLike = (url, init) => fetch(url, init),
): Speaker {
  return (lines, events) => {
    const controller = new AbortController();
    let audio: HTMLAudioElement | null = null;
    let objectUrl: string | null = null;
    let cancelled = false;

    const release = () => {
      if (audio) {
        audio.onplaying = null;
        audio.onended = null;
        audio.onerror = null;
        audio.pause();
        audio = null;
      }
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
      }
    };

    const { url, init } = buildTtsRequest(lines.join(LINE_BREAK), config);
    fetchImpl(url, { ...init, signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error(`ElevenLabs answered ${response.status}`);
        const blob = await response.blob();
        if (cancelled) return;

        objectUrl = URL.createObjectURL(blob);
        const player = new Audio(objectUrl);
        audio = player;
        player.onplaying = () => events.onStart();
        player.onended = () => {
          release();
          events.onEnd();
        };
        player.onerror = () => {
          release();
          events.onError('The ElevenLabs audio could not be played');
        };
        try {
          await player.play();
        } catch (error) {
          if (cancelled) return;
          release();
          if (isNotAllowed(error)) events.onBlocked();
          else events.onError(describeError(error));
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        events.onError(describeError(error));
      });

    return () => {
      cancelled = true;
      controller.abort();
      release();
    };
  };
}

export interface Voice {
  kind: 'elevenlabs' | 'browser';
  /** For the mute button's tooltip. */
  label: string;
  speak: Speaker;
}

/** The best voice this page can use, or null when it cannot speak at all. */
export function pickVoice(env: SpeechEnv = import.meta.env): Voice | null {
  const config = elevenLabsConfig(env);
  if (config && typeof Audio === 'function') {
    return { kind: 'elevenlabs', label: 'ElevenLabs voice', speak: elevenLabsSpeaker(config) };
  }
  if (canUseBrowserVoice()) return { kind: 'browser', label: 'browser voice', speak: browserSpeaker };
  return null;
}
