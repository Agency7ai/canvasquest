/**
 * Lives outside api/ on purpose: Vercel deploys every file in that folder as
 * a function, and a test is not one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSpeakHandler,
  DEFAULT_MODEL_ID,
  DEFAULT_VOICE_ID,
  MAX_TEXT_CHARS,
  RATE_LIMIT,
  RATE_WINDOW_MS,
  ttsUrl,
} from '../api/speak.ts';
import type { SpeakDeps } from '../api/speak.ts';

const SITE = 'http://localhost:5199';
const KEY = 'sk-test-only';
const MP3 = new Uint8Array([73, 68, 51]);

const audio = () => new Response(MP3, { status: 200, headers: { 'content-type': 'audio/mpeg' } });

const post = (body: string, headers: Record<string, string> = {}) =>
  new Request(`${SITE}/api/speak`, {
    method: 'POST',
    headers: { origin: SITE, 'content-type': 'application/json', ...headers },
    body,
  });

const speak = (text: unknown, headers?: Record<string, string>) => post(JSON.stringify({ text }), headers);

function setUp(
  env: SpeakDeps['env'] = { ELEVENLABS_API_KEY: KEY },
  options: { now?: () => number; fetch?: typeof fetch } = {},
) {
  const fetchImpl = options.fetch ?? vi.fn<typeof fetch>(async () => audio());
  return { ...createSpeakHandler({ env, fetch: fetchImpl, now: options.now }), fetchImpl };
}

const lastBody = (fetchImpl: typeof fetch): unknown =>
  JSON.parse(String(vi.mocked(fetchImpl).mock.lastCall?.[1]?.body));

describe('GET /api/speak', () => {
  it('says whether the site has a voice, and nothing more', async () => {
    const { GET } = setUp();
    const response = await GET(new Request(`${SITE}/api/speak`));
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({ voice: 'elevenlabs' });
    expect(body).not.toContain(KEY);

    const { GET: silent } = setUp({});
    expect(await (await silent(new Request(`${SITE}/api/speak`))).json()).toEqual({ voice: null });
  });
});

describe('POST /api/speak', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads the text in the ElevenLabs voice and passes the audio through', async () => {
    const { POST, fetchImpl } = setUp();
    const response = await POST(speak('Your turn.'));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('audio/mpeg');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(MP3);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      ttsUrl(DEFAULT_VOICE_ID),
      expect.objectContaining({
        method: 'POST',
        headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      }),
    );
    expect(lastBody(fetchImpl)).toEqual({ text: 'Your turn.', model_id: DEFAULT_MODEL_ID });
  });

  it('uses the voice and model from the environment', async () => {
    const { POST, fetchImpl } = setUp({
      ELEVENLABS_API_KEY: KEY,
      ELEVENLABS_VOICE_ID: 'voice-2',
      ELEVENLABS_TTS_MODEL: 'eleven_v3',
    });
    await POST(speak('Hello'));
    expect(fetchImpl).toHaveBeenCalledWith(ttsUrl('voice-2'), expect.anything());
    expect(lastBody(fetchImpl)).toEqual({ text: 'Hello', model_id: 'eleven_v3' });
  });

  it('has no voice without a key, and does not call ElevenLabs', async () => {
    const { POST, fetchImpl } = setUp({});
    const response = await POST(speak('Hello'));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: expect.stringContaining('no ElevenLabs key') });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('speaks only for its own pages', async () => {
    const { POST, fetchImpl } = setUp();
    expect((await POST(speak('Hello', { origin: 'https://elsewhere.example' }))).status).toBe(403);
    const anonymous = new Request(`${SITE}/api/speak`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'Hello' }),
    });
    expect((await POST(anonymous)).status).toBe(403);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('knows its public host behind the Vercel proxy', async () => {
    const { POST } = setUp();
    const request = new Request('http://lambda.internal/api/speak', {
      method: 'POST',
      headers: {
        origin: 'https://canvasquest.vercel.app',
        'x-forwarded-host': 'canvasquest.vercel.app',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text: 'Hello' }),
    });
    expect((await POST(request)).status).toBe(200);
  });

  it('wants a JSON body with something to say, no longer than an announcement', async () => {
    const { POST } = setUp();
    expect((await POST(post('not json'))).status).toBe(400);
    expect((await POST(speak(''))).status).toBe(400);
    expect((await POST(speak('   '))).status).toBe(400);
    expect((await POST(speak(42))).status).toBe(400);
    expect((await POST(speak('x'.repeat(MAX_TEXT_CHARS + 1)))).status).toBe(413);
    expect((await POST(speak('x'.repeat(MAX_TEXT_CHARS)))).status).toBe(200);
  });

  it('reports an ElevenLabs failure by status only, never the key', async () => {
    const { POST } = setUp(undefined, {
      fetch: async () => new Response(`bad key ${KEY}`, { status: 401 }),
    });
    const response = await POST(speak('Hello'));
    expect(response.status).toBe(502);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({ error: 'ElevenLabs answered 401' });
    expect(body).not.toContain(KEY);
  });

  it('says when ElevenLabs cannot be reached', async () => {
    const { POST } = setUp(undefined, {
      fetch: async () => {
        throw new TypeError('fetch failed');
      },
    });
    const response = await POST(speak('Hello'));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'ElevenLabs could not be reached' });
  });

  it('rate-limits each address, and forgets after the window', async () => {
    let clock = 1_000_000;
    const { POST, fetchImpl } = setUp(undefined, { now: () => clock });
    const say = (address: string) =>
      POST(speak('Hello', { 'x-forwarded-for': `${address}, 10.0.0.1` }));

    for (let i = 0; i < RATE_LIMIT; i += 1) expect((await say('203.0.113.7')).status).toBe(200);
    const refused = await say('203.0.113.7');
    expect(refused.status).toBe(429);
    expect(await refused.json()).toEqual({ error: expect.stringContaining('Too many') });
    expect((await say('198.51.100.2')).status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(RATE_LIMIT + 1);

    clock += RATE_WINDOW_MS + 1;
    expect((await say('203.0.113.7')).status).toBe(200);
  });
});
