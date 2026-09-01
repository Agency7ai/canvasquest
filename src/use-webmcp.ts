import { useEffect, useState } from 'react';
import { applyMove, TOOL_DEFINITIONS } from './moves';
import type { MoveName } from './moves';

declare global {
  interface Document {
    modelContext?: {
      registerTool?: (
        tool: {
          name: string;
          description: string;
          inputSchema: {
            type: 'object';
            properties: Record<string, unknown>;
            required?: string[];
          };
          annotations?: { readOnlyHint?: boolean };
          execute: (input: Record<string, unknown>) => Promise<{
            content: Array<{ type: 'text'; text: string }>;
          }>;
        },
        options?: { signal?: AbortSignal }
      ) => Promise<void>;
    };
  }
}

export const hasWebMCP = () => typeof document.modelContext?.registerTool === 'function';

// Registration is a property of the document, not of any one component, so the
// guard lives at module scope. Strict Mode remounts and multiple hook callers
// then share a single registration instead of racing each other.
let registrationState: 'idle' | 'pending' | 'registered' = 'idle';

const isDuplicateRegistration = (error: unknown) =>
  error instanceof Error && /already registered/i.test(error.message);

async function registerTools(signal: AbortSignal): Promise<void> {
  for (const tool of TOOL_DEFINITIONS) {
    if (signal.aborted) return;

    try {
      await document.modelContext!.registerTool!(
        {
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: { readOnlyHint: tool.readOnly },
          execute: async (input) => {
            const result = applyMove(tool.name as MoveName, input ?? {});
            return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
          },
        },
        { signal }
      );
    } catch (error) {
      // A remount can leave a tool of the same name behind; keeping the
      // existing registration is the correct idempotent outcome.
      if (!isDuplicateRegistration(error)) throw error;
    }
  }
}

export function useWebMCP() {
  const [registered, setRegistered] = useState(registrationState === 'registered');

  useEffect(() => {
    if (!hasWebMCP() || registrationState !== 'idle') {
      setRegistered(registrationState === 'registered');
      return;
    }

    registrationState = 'pending';
    const controller = new AbortController();

    registerTools(controller.signal)
      .then(() => {
        if (controller.signal.aborted) return;
        registrationState = 'registered';
        setRegistered(true);
        console.log(`[WebMCP] Registered ${TOOL_DEFINITIONS.length} tools`);
      })
      .catch((error: unknown) => {
        // Strict Mode's double mount aborts the first attempt mid-flight. That
        // is expected teardown, not a failure worth surfacing, and cleanup has
        // already reset the state for the next mount.
        if (controller.signal.aborted) return;
        registrationState = 'idle';
        console.error('[WebMCP] Failed to register tools:', error);
      });

    return () => {
      // Reset synchronously: React runs this before the next mount's effect, so
      // the remount must find the state free rather than stuck on 'pending'.
      if (registrationState === 'pending') registrationState = 'idle';
      controller.abort();
    };
  }, []);

  return { hasWebMCP: hasWebMCP(), registered };
}
