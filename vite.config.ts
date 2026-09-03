import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import type { Connect, Plugin } from 'vite'
import type { ServerResponse } from 'node:http'
import { createSpeakHandler } from './api/speak.ts'
import type { SpeakHandler } from './api/speak.ts'

/** The Web Request the speak handler expects, built from what Node's server received. */
async function toRequest(req: Connect.IncomingMessage): Promise<Request> {
  const headers = new Headers()
  for (const [name, value] of Object.entries(req.headers)) {
    for (const each of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      headers.append(name, each)
    }
  }
  if (!headers.has('x-forwarded-for') && req.socket.remoteAddress) {
    headers.set('x-forwarded-for', req.socket.remoteAddress)
  }
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  const method = req.method ?? 'GET'
  return new Request(`http://${req.headers.host ?? 'localhost'}${req.originalUrl ?? req.url ?? '/'}`, {
    method,
    headers,
    body: method === 'GET' || method === 'HEAD' ? null : Buffer.concat(chunks),
  })
}

async function send(response: Response, res: ServerResponse): Promise<void> {
  res.statusCode = response.status
  response.headers.forEach((value, name) => res.setHeader(name, value))
  res.end(Buffer.from(await response.arrayBuffer()))
}

/**
 * Serves /api/speak from the dev and preview servers with the handler Vercel
 * deploys from api/speak.ts, so announcements speak locally with the key in
 * .env.local. The production build itself stays static.
 */
function speakEndpoint(env: Record<string, string | undefined>): Plugin {
  const mount = (middlewares: Connect.Server) => {
    const handler: SpeakHandler = createSpeakHandler({ env })
    middlewares.use('/api/speak', (req, res, next) => {
      const handle = req.method === 'GET' ? handler.GET : req.method === 'POST' ? handler.POST : null
      if (!handle) {
        res.statusCode = 405
        res.setHeader('Allow', 'GET, POST')
        res.end()
        return
      }
      toRequest(req)
        .then(handle)
        .then(response => send(response, res))
        .catch(next)
    })
  }
  return {
    name: 'canvasquest:speak-endpoint',
    configureServer: server => mount(server.middlewares),
    configurePreviewServer: server => mount(server.middlewares),
  }
}

export default defineConfig(({ mode }) => ({
  // The empty prefix reads every variable, not only VITE_ ones: the speak
  // endpoint needs ELEVENLABS_API_KEY, which must never reach the bundle.
  plugins: [react(), speakEndpoint(loadEnv(mode, process.cwd(), ''))],
}))
