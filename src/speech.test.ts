import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SPEAK_ENDPOINT,
  buildSpeakRequest,
  describeSpeakFailure,
  judgeSpeakResponse,
  pickVoice,
  siteSpeaker,
} from './speech';
import type { SpeechEvents } from './speech';

const events = (): SpeechEvents => ({
  onStart: vi.fn(),
  onEnd: vi.fn(),
  onBlocked: vi.fn(),
  onError: vi.fn(),
  onUnavailable: vi.fn(),
});

/** Enough of an audio element for the site speaker. */
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

const audioResponse = () =>
  new Response(new Blob(['mp3'], { type: 'audio/mpeg' }), { status: 200, headers: { 'content-type': 'audio/mpeg' } });

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const pageResponse = () =>
  new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

afterEach(() => {
  vi.unstubAllGlobals();
  FakeAudio.instances = [];
  FakeAudio.playError = null;
});

describe('buildSpeakRequest', () => {
  it('posts the text to the site, with nothing secret about it', () => {
    const { url, init } = buildSpeakRequest('Your turn');
    expect(url).toBe(SPEAK_ENDPOINT);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', Accept: 'audio/mpeg' });
    expect(JSON.parse(String(init.body))).toEqual({ text: 'Your turn' });
  });
});

describe('judgeSpeakResponse', () => {
  it('plays audio', () => {
    expect(judgeSpeakResponse(audioResponse())).toBe('audio');
  });

  it('knows a site with no voice: no key, no function, or no POST', () => {
    expect(judgeSpeakResponse(jsonResponse(503, { error: 'no key' }))).toBe('unavailable');
    expect(judgeSpeakResponse(new Response('not found', { status: 404 }))).toBe('unavailable');
    expect(judgeSpeakResponse(new Response(null, { status: 405 }))).toBe('unavailable');
    // A static host answers the POST with the page itself.
    expect(judgeSpeakResponse(pageResponse())).toBe('unavailable');
  });

  it('treats anything else as a failure worth reporting', () => {
    expect(judgeSpeakResponse(jsonResponse(429, { error: 'slow down' }))).toBe('failed');
    expect(judgeSpeakResponse(jsonResponse(502, { error: 'ElevenLabs answered 401' }))).toBe('failed');
    expect(judgeSpeakResponse(new Response('boom', { status: 500 }))).toBe('failed');
  });
});

describe('describeSpeakFailure', () => {
  it("passes on the site's own reason", async () => {
    expect(await describeSpeakFailure(jsonResponse(502, { error: 'ElevenLabs answered 401' }))).toBe(
      'ElevenLabs answered 401',
    );
  });

  it('falls back to the status', async () => {
    expect(await describeSpeakFailure(new Response('boom', { status: 500 }))).toBe('The site voice answered 500');
    expect(await describeSpeakFailure(jsonResponse(500, { detail: 'x' }))).toBe('The site voice answered 500');
  });
});

describe('pickVoice', () => {
  it('has no voice where the page can neither play audio nor synthesise speech', () => {
    expect(pickVoice()).toBeNull();
  });

  it("prefers the site's voice wherever audio can play", () => {
    vi.stubGlobal('Audio', FakeAudio);
    expect(pickVoice()?.kind).toBe('site');
  });

  it('falls back to the browser voice where there are no audio elements', () => {
    vi.stubGlobal('window', { speechSynthesis: {}, SpeechSynthesisUtterance: class {} });
    expect(pickVoice()?.kind).toBe('browser');
  });
});

describe('siteSpeaker', () => {
  it('sends the lines as one request and plays the audio through to the end', async () => {
    vi.stubGlobal('Audio', FakeAudio);
    const fetchImpl = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => audioResponse());
    const handlers = events();

    siteSpeaker(fetchImpl)(['I pruned a branch.', 'Your turn.'], handlers);
    await vi.waitFor(() => expect(handlers.onStart).toHaveBeenCalled());

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(SPEAK_ENDPOINT);
    expect(init.headers).not.toHaveProperty('xi-api-key');
    expect(JSON.parse(String(init.body)).text).toBe('I pruned a branch.\n\nYour turn.');

    FakeAudio.instances[0].onended?.();
    expect(handlers.onEnd).toHaveBeenCalled();
    expect(handlers.onError).not.toHaveBeenCalled();
    expect(handlers.onBlocked).not.toHaveBeenCalled();
    expect(handlers.onUnavailable).not.toHaveBeenCalled();
  });

  it('hands over when the site has no voice', async () => {
    vi.stubGlobal('Audio', FakeAudio);
    const handlers = events();

    siteSpeaker(async () => jsonResponse(503, { error: 'The site has no ElevenLabs key' }))(['Hello'], handlers);
    await vi.waitFor(() => expect(handlers.onUnavailable).toHaveBeenCalled());

    expect(handlers.onError).not.toHaveBeenCalled();
    expect(handlers.onStart).not.toHaveBeenCalled();
    expect(FakeAudio.instances).toHaveLength(0);
  });

  it('hands over on a static host, where the POST gets the page back', async () => {
    vi.stubGlobal('Audio', FakeAudio);
    const handlers = events();

    siteSpeaker(async () => pageResponse())(['Hello'], handlers);
    await vi.waitFor(() => expect(handlers.onUnavailable).toHaveBeenCalled());

    expect(handlers.onError).not.toHaveBeenCalled();
    expect(FakeAudio.instances).toHaveLength(0);
  });

  it("reports the site's reason when it refuses the request", async () => {
    vi.stubGlobal('Audio', FakeAudio);
    const handlers = events();

    siteSpeaker(async () => jsonResponse(429, { error: 'Too many announcements from this address' }))(
      ['Hello'],
      handlers,
    );
    await vi.waitFor(() => expect(handlers.onError).toHaveBeenCalledWith('Too many announcements from this address'));

    expect(handlers.onUnavailable).not.toHaveBeenCalled();
    expect(handlers.onStart).not.toHaveBeenCalled();
    expect(FakeAudio.instances).toHaveLength(0);
  });

  it('reports the status when the site fails without a reason', async () => {
    vi.stubGlobal('Audio', FakeAudio);
    const handlers = events();

    siteSpeaker(async () => new Response('boom', { status: 500 }))(['Hello'], handlers);
    await vi.waitFor(() => expect(handlers.onError).toHaveBeenCalledWith('The site voice answered 500'));
  });

  it('says the network is the problem when the call never gets through', async () => {
    vi.stubGlobal('Audio', FakeAudio);
    const handlers = events();

    siteSpeaker(async () => {
      throw new TypeError('Failed to fetch');
    })(['Hello'], handlers);
    await vi.waitFor(() => expect(handlers.onError).toHaveBeenCalledWith('The site voice could not be reached'));
  });

  it('tells the page when the browser blocks playback', async () => {
    vi.stubGlobal('Audio', FakeAudio);
    FakeAudio.playError = Object.assign(new Error('blocked'), { name: 'NotAllowedError' });
    const handlers = events();

    siteSpeaker(async () => audioResponse())(['Hello'], handlers);
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

    const cancel = siteSpeaker(fetchImpl)(['Hello'], handlers);
    cancel();
    release?.();
    await settle();

    expect(FakeAudio.instances).toHaveLength(0);
    expect(handlers.onStart).not.toHaveBeenCalled();
    expect(handlers.onError).not.toHaveBeenCalled();
    expect(handlers.onUnavailable).not.toHaveBeenCalled();
  });

  it('stops the audio when cancelled mid-sentence', async () => {
    vi.stubGlobal('Audio', FakeAudio);
    const handlers = events();

    const cancel = siteSpeaker(async () => audioResponse())(['Hello'], handlers);
    await vi.waitFor(() => expect(handlers.onStart).toHaveBeenCalled());
    cancel();

    expect(FakeAudio.instances[0].paused).toBe(true);
    FakeAudio.instances[0].onended?.();
    expect(handlers.onEnd).not.toHaveBeenCalled();
  });
});
