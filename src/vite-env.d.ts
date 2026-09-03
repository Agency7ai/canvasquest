/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ELEVENLABS_AGENT_ID?: string;
  /** Text-to-speech key for the announcement voice. Ships in the bundle: use a restricted key. */
  readonly VITE_ELEVENLABS_API_KEY?: string;
  readonly VITE_ELEVENLABS_VOICE_ID?: string;
  readonly VITE_ELEVENLABS_TTS_MODEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
