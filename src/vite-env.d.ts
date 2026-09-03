/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ELEVENLABS_AGENT_ID?: string;
  // The announcement voice's ELEVENLABS_API_KEY has no VITE_ prefix on purpose:
  // api/speak.ts reads it on the server, and it never reaches the bundle.
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
