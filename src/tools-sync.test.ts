import { describe, expect, it } from 'vitest';
import elevenlabsTools from '../elevenlabs-tools.json';
import { TOOL_DEFINITIONS } from './moves';
import voiceAgentSource from './voice-agent.tsx?raw';

interface ElevenLabsParameter {
  id: string;
  type: string;
  description: string;
  required: boolean;
}

interface ElevenLabsTool {
  type: string;
  name: string;
  description: string;
  parameters: ElevenLabsParameter[];
}

interface PropertySchema {
  type: string;
  description: string;
  enum?: string[];
}

const voiceTools = (elevenlabsTools as { tools: ElevenLabsTool[] }).tools;

/**
 * The three agent surfaces must never drift: WebMCP registers TOOL_DEFINITIONS,
 * the ElevenLabs dashboard uses elevenlabs-tools.json, and the voice panel
 * wires each tool by name.
 */
describe('agent tool surfaces stay in sync', () => {
  it('lists the same client tools, in the same order, for WebMCP and ElevenLabs', () => {
    expect(voiceTools.map(tool => tool.name)).toEqual(TOOL_DEFINITIONS.map(tool => tool.name));
    for (const tool of voiceTools) expect(tool.type).toBe('client');
  });

  it('mirrors every description, parameter id, type and requirement', () => {
    for (const definition of TOOL_DEFINITIONS) {
      const voice = voiceTools.find(tool => tool.name === definition.name);
      expect(voice, definition.name).toBeDefined();
      if (!voice) continue;
      expect(voice.description).toBe(definition.description);

      const properties = definition.inputSchema.properties as Record<string, PropertySchema>;
      expect(voice.parameters.map(parameter => parameter.id)).toEqual(Object.keys(properties));
      for (const parameter of voice.parameters) {
        const schema = properties[parameter.id];
        expect(parameter.type).toBe(schema.type);
        expect(parameter.required).toBe((definition.inputSchema.required ?? []).includes(parameter.id));
        expect(parameter.description).toContain(schema.description);
        for (const option of schema.enum ?? []) expect(parameter.description).toContain(option);
      }
    }
  });

  it('registers every tool as an ElevenLabs client tool hook in the voice panel', () => {
    const hooked = [...voiceAgentSource.matchAll(/useConversationClientTool\(\s*'([a-z_]+)'/g)].map(
      match => match[1],
    );
    expect(hooked).toEqual(TOOL_DEFINITIONS.map(tool => tool.name));
  });
});
