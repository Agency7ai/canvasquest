/**
 * The voices that read announcements aloud. The site's voice is ElevenLabs
 * text-to-speech behind /api/speak (see api/speak.ts), so no key reaches the
 * browser. The browser's own speech synthesis is the other, and steps in when
 * the site cannot speak: no key configured, no function on a static host, or
 * a request that fails.
 */

export interface SpeechEvents {
  /** Sound has started. */
  onStart: () => void;
  /** The last line has finished, or the speech was stopped. */
  onEnd: () => void;
  /** The browser refused to play sound before the page was clicked. */
  onBlocked: () => void;
  /** The voice failed this time; the message is fit to show on the page. */
  onError: (message: string) => void;
  /** This page has no such voice at all (no key, no endpoint): no use trying again this visit. */
  onUnavailable: () => void;
}

/** Stops the speech. Safe to call more than once, or after it has ended. */
export type Cancel = () => void;

/** Reads the lines aloud, in order, and reports how it went. */
export type Speaker = (lines: string[], events: SpeechEvents) => Cancel;

/** Where the page asks the site to voice a line. */
export const SPEAK_ENDPOINT = '/api/speak';

/** The request that asks the site for one piece of text as audio. */
export function buildSpeakRequest(text: string): { url: string; init: RequestInit } {
  return {
    url: SPEAK_ENDPOINT,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text }),
    },
  };
}

/** What the site answered: audio to play, no voice to be had, or a failure to report. */
export type SpeakVerdict = 'audio' | 'unavailable' | 'failed';

export function judgeSpeakResponse(response: Response): SpeakVerdict {
  if (response.ok) {
    // A static host answers a POST with its index page; a real voice with audio.
    return (response.headers.get('content-type') ?? '').startsWith('audio/') ? 'audio' : 'unavailable';
  }
  // 503: the site has no key. 404: nothing behind the path. 405 and 501: a
  // server that takes no POST there. None of them changes within a visit.
  return [404, 405, 501, 503].includes(response.status) ? 'unavailable' : 'failed';
}

/** The site's own account of a failure when it gave one, else the bare status. */
export async function describeSpeakFailure(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    const error = typeof body === 'object' && body !== null && 'error' in body ? body.error : null;
    if (typeof error === 'string' && error) return error;
  } catch {
    // Not JSON: the status will have to do.
  }
  return `The site voice answered ${response.status}`;
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
  // fetch rejects with a TypeError when the network stops the call.
  if (error instanceof TypeError) return 'The site voice could not be reached';
  return error instanceof Error ? error.message : String(error);
};

/**
 * Reads the lines with the site's voice: one request to /api/speak, played
 * through an audio element. Everything is torn down on cancel, so a new
 * announcement can cut an old one off mid-sentence.
 */
export function siteSpeaker(fetchImpl: FetchLike = (url, init) => fetch(url, init)): Speaker {
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

    const { url, init } = buildSpeakRequest(lines.join(LINE_BREAK));
    fetchImpl(url, { ...init, signal: controller.signal })
      .then(async response => {
        const verdict = judgeSpeakResponse(response);
        if (verdict === 'unavailable') {
          if (!cancelled) events.onUnavailable();
          return;
        }
        if (verdict === 'failed') throw new Error(await describeSpeakFailure(response));
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
          events.onError('The site voice audio could not be played');
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
  kind: 'site' | 'browser';
  /** For the mute button's tooltip. */
  label: string;
  speak: Speaker;
}

export const browserVoice: Voice = { kind: 'browser', label: 'browser voice', speak: browserSpeaker };

/**
 * The best voice this page can use, or null when it cannot speak at all. The
 * site's voice comes first wherever audio can play; whether the site really
 * has one only shows on the first request, which is why a speaker can report
 * itself unavailable.
 */
export function pickVoice(): Voice | null {
  if (typeof Audio === 'function' && typeof fetch === 'function') {
    return { kind: 'site', label: 'site voice', speak: siteSpeaker() };
  }
  return canUseBrowserVoice() ? browserVoice : null;
}
