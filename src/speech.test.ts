import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MODEL_ID,
  DEFAULT_VOICE_ID,
  OUTPUT_FORMAT,
  buildTtsRequest,
  elevenLabsConfig,
  elevenLabsSpeaker,
  pickVoice,
} from './speech';
import type { SpeechEvents } from './speech';

const KEY = 'sk_test';
const CONFIG = { apiKey: KEY, voiceId: 'voice1', modelId: 'model1' };

const events = (): SpeechEvents => ({ onStart: vi.fn(), onEnd: vi.fn(), onBlocked: vi.fn(), onError: vi.fn() });

/** Enough of an audio element for the ElevenLabs speaker. */
class FakeAudio {
  static instances: FakeAudio[] = [];
  static playError: unknown = null;
  onplaying: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  paused = false;
  src: string;

  constructor(src: string) {
    this.src = src;
    FakeAudio.instances.push(this);
  }

  play(): Promise<void> {
    if (FakeAudio.playError) return Promise.reject(FakeAudio.playError);
    this.onplaying?.();
    return Promise.resolve();
  }

  pause(): void {
    this.paused = true;
  }
}

const audioResponse = () => new Response(new Blob(['mp3'], { type: 'audio/mpeg' }), { status: 200 });

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

afterEach(() => {
  vi.unstubAllGlobals();
  FakeAudio.instances = [];
  FakeAudio.playError = null;
});

describe('elevenLabsConfig', () => {
  it('is off without a key', () => {
    expect(elevenLabsConfig({})).toBeNull();
    expect(elevenLabsConfig({ VITE_ELEVENLABS_API_KEY: '   ' })).toBeNull();
  });

  it('fills in the stock voice and the flash model', () => {
    expect(elevenLabsConfig({ VITE_ELEVENLABS_API_KEY: KEY })).toEqual({
      apiKey: KEY,
      voiceId: DEFAULT_VOICE_ID,
      modelId: DEFAULT_MODEL_ID,
    });
  });

  it('takes a voice and a model override', () => {
    expect(
      elevenLabsConfig({
        VITE_ELEVENLABS_API_KEY: ` ${KEY} `,
        VITE_ELEVENLABS_VOICE_ID: 'voice1',
        VITE_ELEVENLABS_TTS_MODEL: 'eleven_multilingual_v2',
      }),
    ).toEqual({ apiKey: KEY, voiceId: 'voice1', modelId: 'eleven_multilingual_v2' });
  });
});

describe('buildTtsRequest', () => {
  it('posts the text to the voice with the key in a header', () => {
    const { url, init } = buildTtsRequest('Your turn', CONFIG);
    expect(url).toBe(`https://api.elevenlabs.io/v1/text-to-speech/voice1?output_format=${OUTPUT_FORMAT}`);
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'xi-api-key': KEY, 'Content-Type': 'application/json' });
    expect(JSON.parse(String(init.body))).toEqual({ text: 'Your turn', model_id: 'model1' });
  });
});

describe('pickVoice', () => {
  it('has no voice where the page can neither play audio nor synthesise speech', () => {
    expect(pickVoice({})).toBeNull();
    expect(pickVoice({ VITE_ELEVENLABS_API_KEY: KEY })).toBeNull();
  });

  it('prefers ElevenLabs when a key is set and audio can play', () => {
    vi.stubGlobal('Audio', FakeAudio);
    expect(pickVoice({ VITE_ELEVENLABS_API_KEY: KEY })?.kind).toBe('elevenlabs');
    expect(pickVoice({})).toBeNull();
  });

  it('falls back to the browser voice without a key', () => {
    vi.stubGlobal('window', { speechSynthesis: {}, SpeechSynthesisUtterance: class {} });
    expect(pickVoice({})?.kind).toBe('browser');
  });
});

describe('elevenLabsSpeaker', () => {
  it('sends the lines as one request and plays the audio through to the end', async () => {
    vi.stubGlobal('Audio', FakeAudio);
    const fetchImpl = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => audioResponse());
    const handlers = events();

    elevenLabsSpeaker(CONFIG, fetchImpl)(['I pruned a branch.', 'Your turn.'], handlers);
    await vi.waitFor(() => expect(handlers.onStart).toHaveBeenCalled());

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain('/text-to-speech/voice1');
    expect(JSON.parse(String(init.body)).text).toBe('I pruned a branch.\n\nYour turn.');

    FakeAudio.instances[0].onended?.();
    expect(handlers.onEnd).toHaveBeenCalled();
    expect(handlers.onError).not.toHaveBeenCalled();
    expect(handlers.onBlocked).not.toHaveBeenCalled();
  });

  it('reports the status when ElevenLabs refuses the request', async () => {
    vi.stubGlobal('Audio', FakeAudio);
    const handlers = events();

    elevenLabsSpeaker(CONFIG, async () => new Response('nope', { status: 401 }))(['Hello'], handlers);
    await vi.waitFor(() => expect(handlers.onError).toHaveBeenCalledWith('ElevenLabs answered 401'));

    expect(handlers.onStart).not.toHaveBeenCalled();
    expect(FakeAudio.instances).toHaveLength(0);
  });

  it('says the network is the problem when the call never gets through', async () => {
    vi.stubGlobal('Audio', FakeAudio);
    const handlers = events();

    elevenLabsSpeaker(CONFIG, async () => {
      throw new TypeError('Failed to fetch');
    })(['Hello'], handlers);
    await vi.waitFor(() => expect(handlers.onError).toHaveBeenCalledWith('ElevenLabs could not be reached'));
  });

  it('tells the page when the browser blocks playback', async () => {
    vi.stubGlobal('Audio', FakeAudio);
    FakeAudio.playError = Object.assign(new Error('blocked'), { name: 'NotAllowedError' });
    const handlers = events();

    elevenLabsSpeaker(CONFIG, async () => audioResponse())(['Hello'], handlers);
    await vi.waitFor(() => expect(handlers.onBlocked).toHaveBeenCalled());

    expect(handlers.onError).not.toHaveBeenCalled();
    expect(handlers.onStart).not.toHaveBeenCalled();
  });

  it('stays silent once cancelled', async () => {
    vi.stubGlobal('Audio', FakeAudio);
    let release: (() => void) | undefined;
    const fetchImpl = (_url: string, init: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        release = () => resolve(audioResponse());
        init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    const handlers = events();

    const cancel = elevenLabsSpeaker(CONFIG, fetchImpl)(['Hello'], handlers);
    cancel();
    release?.();
    await settle();

    expect(FakeAudio.instances).toHaveLength(0);
    expect(handlers.onStart).not.toHaveBeenCalled();
    expect(handlers.onError).not.toHaveBeenCalled();
  });

  it('stops the audio when cancelled mid-sentence', async () => {
    vi.stubGlobal('Audio', FakeAudio);
    const handlers = events();

    const cancel = elevenLabsSpeaker(CONFIG, async () => audioResponse())(['Hello'], handlers);
    await vi.waitFor(() => expect(handlers.onStart).toHaveBeenCalled());
    cancel();

    expect(FakeAudio.instances[0].paused).toBe(true);
    FakeAudio.instances[0].onended?.();
    expect(handlers.onEnd).not.toHaveBeenCalled();
  });
});
