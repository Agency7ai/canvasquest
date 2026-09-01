import { ConversationProvider } from '@elevenlabs/react';
import VoiceAgent from './voice-agent';

/**
 * Loaded lazily so the ElevenLabs WebRTC SDK stays out of the initial bundle:
 * the board is interactive before the voice stack finishes downloading.
 */
export default function VoiceAgentIsland() {
  return (
    <ConversationProvider>
      <VoiceAgent />
    </ConversationProvider>
  );
}
