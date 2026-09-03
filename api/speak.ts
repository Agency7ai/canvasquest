/**
 * The site's voice: reads an announcement aloud through ElevenLabs
 * text-to-speech on the page's behalf, so the ElevenLabs key stays on the
 * server and never reaches a browser.
 *
 * Vercel deploys this file as /api/speak, one export per HTTP method. The dev
 * and preview servers mount the same handler (see vite.config.ts), so
 * `npm run dev` speaks with the key in .env.local. The file imports nothing
 * of its own on purpose: Vercel compiles it by itself, outside the bundle.
 *
 *   GET  /api/speak          -> { voice: 'elevenlabs' | null }
 *   POST /api/speak { text } -> audio/mpeg, or { error } with a status
 *
 * Without a key POST answers 503 and the page falls back to the browser's
 * own voice. The key is the only secret, and a caller can only make the site
 * speak with it, never read it; still, the endpoint takes same-origin callers
 * only, caps the text at an announcement's length and rate-limits by address.
 */

/** George. */
export const DEFAULT_VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb';
export const DEFAULT_MODEL_ID = 'eleven_flash_v2_5';
export const OUTPUT_FORMAT = 'mp3_44100_128';
/** An announcement is a summary and a handoff of 200 characters each, plus the break between. */
export const MAX_TEXT_CHARS = 500;
/** Requests one address may make per window before this instance answers 429. */
export const RATE_LIMIT = 30;
export const RATE_WINDOW_MS = 60_000;

export type SpeakEnv = Record<string, string | undefined>;

export interface SpeakDeps {
  env: SpeakEnv;
  /** A stand-in for fetch, for tests. */
  fetch?: typeof fetch;
  /** A stand-in for Date.now, for tests. */
  now?: () => number;
}

export interface SpeakHandler {
  GET: (request: Request) => Promise<Response>;
  POST: (request: Request) => Promise<Response>;
}

export interface VoiceConfig {
  apiKey: string;
  voiceId: string;
  modelId: string;
}

/** The ElevenLabs settings from the environment, or null when there is no key. */
export function voiceConfig(env: SpeakEnv): VoiceConfig | null {
  const apiKey = env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    voiceId: env.ELEVENLABS_VOICE_ID?.trim() || DEFAULT_VOICE_ID,
    modelId: env.ELEVENLABS_TTS_MODEL?.trim() || DEFAULT_MODEL_ID,
  };
}

export const ttsUrl = (voiceId: string): string =>
  `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${OUTPUT_FORMAT}`;

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

const refuse = (status: number, error: string): Response => json(status, { error });

/** The hosts this request may have been addressed to: behind Vercel's proxy, or straight from the dev server. */
function ownHosts(request: Request): string[] {
  const hosts = [request.headers.get('x-forwarded-host'), request.headers.get('host')]
    .flatMap(value => (value ?? '').split(','))
    .map(host => host.trim())
    .filter(Boolean);
  try {
    hosts.push(new URL(request.url).host);
  } catch {
    // Not an absolute URL: the headers will have to do.
  }
  return hosts;
}

/** Only the page itself may ask for speech: its Origin has to be this host. */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return ownHosts(request).includes(new URL(origin).host);
  } catch {
    return false;
  }
}

/** Who is asking: Vercel's forwarded address first, then whatever the server saw. */
function callerAddress(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || request.headers.get('x-real-ip') || 'unknown';
}

/** A sliding window per address, kept in this instance's memory. Answers whether a call may go ahead. */
export function createRateLimiter(limit: number, windowMs: number, now: () => number) {
  const calls = new Map<string, number[]>();
  return (address: string): boolean => {
    const at = now();
    const since = at - windowMs;
    const recent = (calls.get(address) ?? []).filter(time => time > since);
    const allowed = recent.length < limit;
    if (allowed) recent.push(at);
    calls.set(address, recent);
    // Instances live long and addresses come and go: forget the quiet ones now and then.
    if (calls.size > 10_000) {
      for (const [key, times] of calls) if (!times.some(time => time > since)) calls.delete(key);
    }
    return allowed;
  };
}

/** The text to read, or the answer to send back when the body is not fit to read. */
async function readText(request: Request): Promise<string | Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return refuse(400, 'Send JSON with a "text" field');
  }
  const text =
    typeof body === 'object' && body !== null && 'text' in body && typeof body.text === 'string'
      ? body.text.trim()
      : '';
  if (!text) return refuse(400, 'There is nothing to say: "text" is empty');
  if (text.length > MAX_TEXT_CHARS) {
    return refuse(413, `Keep the text under ${MAX_TEXT_CHARS} characters: it is one announcement`);
  }
  return text;
}

export function createSpeakHandler(deps: SpeakDeps): SpeakHandler {
  const fetchImpl = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  const admit = createRateLimiter(RATE_LIMIT, RATE_WINDOW_MS, now);

  const GET = async (): Promise<Response> =>
    json(200, { voice: voiceConfig(deps.env) ? 'elevenlabs' : null });

  const POST = async (request: Request): Promise<Response> => {
    const config = voiceConfig(deps.env);
    if (!config) return refuse(503, 'The site has no ElevenLabs key, so no voice of its own');
    if (!isSameOrigin(request)) return refuse(403, 'Only this site may ask for its voice');
    if (!admit(callerAddress(request))) {
      return refuse(429, 'Too many announcements from this address: wait a minute');
    }

    const text = await readText(request);
    if (text instanceof Response) return text;

    let upstream: Response;
    try {
      upstream = await fetchImpl(ttsUrl(config.voiceId), {
        method: 'POST',
        headers: { 'xi-api-key': config.apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({ text, model_id: config.modelId }),
        signal: request.signal,
      });
    } catch (error) {
      console.error('[speak] ElevenLabs could not be reached:', error);
      return refuse(502, 'ElevenLabs could not be reached');
    }
    if (!upstream.ok) {
      // The function log gets ElevenLabs' reason; the page only the status.
      console.error(`[speak] ElevenLabs answered ${upstream.status}:`, (await upstream.text()).slice(0, 500));
      return refuse(502, `ElevenLabs answered ${upstream.status}`);
    }
    return new Response(await upstream.arrayBuffer(), {
      status: 200,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'audio/mpeg',
        'Cache-Control': 'no-store',
      },
    });
  };

  return { GET, POST };
}

// Vercel's entry points, one per method, on the function's own environment.
let deployed: SpeakHandler | undefined;
const live = (): SpeakHandler => (deployed ??= createSpeakHandler({ env: process.env }));

export function GET(request: Request): Promise<Response> {
  return live().GET(request);
}

export function POST(request: Request): Promise<Response> {
  return live().POST(request);
}
