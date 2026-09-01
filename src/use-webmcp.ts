import { useEffect, useRef } from 'react';
import { useGameStore } from './store';
import type { NodeKind } from './types';

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
          execute: (input: Record<string, unknown>) => Promise<{
            content: Array<{ type: 'text'; text: string }>;
          }>;
        },
        options?: { signal?: AbortSignal }
      ) => Promise<void>;
    };
  }
}

export function useWebMCP() {
  const registeredRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const hasWebMCP = typeof document.modelContext?.registerTool === 'function';
    
    if (!hasWebMCP || registeredRef.current) {
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const registerTools = async () => {
      try {
        await document.modelContext!.registerTool!({
          name: 'plant',
          description: 'Plant the root node of the learning tree. Can only be called once at the start. Use a clear, concise label that captures the main learning question.',
          inputSchema: {
            type: 'object',
            properties: {
              label: {
                type: 'string',
                description: 'The label for the root node, typically phrased as a question or learning goal',
              },
            },
            required: ['label'],
          },
          execute: async (input) => {
            const { label } = input as { label: string };
            const result = useGameStore.getState().plant(label, 'agent');
            return {
              content: [{ 
                type: 'text' as const, 
                text: JSON.stringify({ 
                  success: result.success, 
                  message: result.message,
                  nodeId: result.nodeId,
                  currentState: {
                    totalNodes: useGameStore.getState().nodes.length,
                    movesRemaining: useGameStore.getState().movesRemaining,
                    currentPlayer: useGameStore.getState().currentPlayer,
                  },
                }) 
              }],
            };
          },
        }, { signal: controller.signal });

        await document.modelContext!.registerTool!({
          name: 'branch',
          description: 'Add a new branch (child node) to an existing node. Choose the appropriate kind: "concept" for ideas/topics, "resource" for learning materials, "skill" for abilities to develop, or "gap" for knowledge gaps.',
          inputSchema: {
            type: 'object',
            properties: {
              parentId: {
                type: 'string',
                description: 'The ID of the parent node to branch from',
              },
              label: {
                type: 'string',
                description: 'A short, clear label for the new node (2-5 words)',
              },
              kind: {
                type: 'string',
                enum: ['concept', 'resource', 'skill', 'gap'],
                description: 'The type of node: concept (idea/topic), resource (book/course), skill (ability), or gap (knowledge gap)',
              },
            },
            required: ['parentId', 'label', 'kind'],
          },
          execute: async (input) => {
            const { parentId, label, kind } = input as { parentId: string; label: string; kind: NodeKind };
            const result = useGameStore.getState().branch(parentId, label, kind, 'agent');
            return {
              content: [{ 
                type: 'text' as const, 
                text: JSON.stringify({ 
                  success: result.success, 
                  message: result.message,
                  nodeId: result.nodeId,
                  currentState: {
                    totalNodes: useGameStore.getState().nodes.length,
                    movesRemaining: useGameStore.getState().movesRemaining,
                    gapNodes: useGameStore.getState().nodes.filter(n => n.kind === 'gap').length,
                    currentPlayer: useGameStore.getState().currentPlayer,
                  },
                }) 
              }],
            };
          },
        }, { signal: controller.signal });

        await document.modelContext!.registerTool!({
          name: 'prune',
          description: 'Remove a node and all its descendants from the tree. Use this to remove incorrect or unnecessary branches. Cannot prune the root node.',
          inputSchema: {
            type: 'object',
            properties: {
              nodeId: {
                type: 'string',
                description: 'The ID of the node to prune',
              },
            },
            required: ['nodeId'],
          },
          execute: async (input) => {
            const { nodeId } = input as { nodeId: string };
            const result = useGameStore.getState().prune(nodeId, 'agent');
            return {
              content: [{ 
                type: 'text' as const, 
                text: JSON.stringify({ 
                  success: result.success, 
                  message: result.message,
                  currentState: {
                    totalNodes: useGameStore.getState().nodes.length,
                    movesRemaining: useGameStore.getState().movesRemaining,
                    currentPlayer: useGameStore.getState().currentPlayer,
                  },
                }) 
              }],
            };
          },
        }, { signal: controller.signal });

        await document.modelContext!.registerTool!({
          name: 'mark_gap',
          description: 'Mark a node as a knowledge gap (something that needs to be learned or clarified). Gap nodes prevent winning the game.',
          inputSchema: {
            type: 'object',
            properties: {
              nodeId: {
                type: 'string',
                description: 'The ID of the node to mark as a gap',
              },
            },
            required: ['nodeId'],
          },
          execute: async (input) => {
            const { nodeId } = input as { nodeId: string };
            const result = useGameStore.getState().markGap(nodeId, 'agent');
            return {
              content: [{ 
                type: 'text' as const, 
                text: JSON.stringify({ 
                  success: result.success, 
                  message: result.message,
                  currentState: {
                    totalNodes: useGameStore.getState().nodes.length,
                    gapNodes: useGameStore.getState().nodes.filter(n => n.kind === 'gap').length,
                    movesRemaining: useGameStore.getState().movesRemaining,
                    currentPlayer: useGameStore.getState().currentPlayer,
                  },
                }) 
              }],
            };
          },
        }, { signal: controller.signal });

        await document.modelContext!.registerTool!({
          name: 'mark_clear',
          description: 'Clear a gap marker from a node, converting it back to a concept. Use this when a knowledge gap has been filled.',
          inputSchema: {
            type: 'object',
            properties: {
              nodeId: {
                type: 'string',
                description: 'The ID of the gap node to clear',
              },
            },
            required: ['nodeId'],
          },
          execute: async (input) => {
            const { nodeId } = input as { nodeId: string };
            const result = useGameStore.getState().markClear(nodeId, 'agent');
            return {
              content: [{ 
                type: 'text' as const, 
                text: JSON.stringify({ 
                  success: result.success, 
                  message: result.message,
                  currentState: {
                    totalNodes: useGameStore.getState().nodes.length,
                    gapNodes: useGameStore.getState().nodes.filter(n => n.kind === 'gap').length,
                    movesRemaining: useGameStore.getState().movesRemaining,
                    currentPlayer: useGameStore.getState().currentPlayer,
                    gameStatus: useGameStore.getState().gameStatus,
                  },
                }) 
              }],
            };
          },
        }, { signal: controller.signal });

        registeredRef.current = true;
        console.log('[WebMCP] Tools registered successfully');
      } catch (error) {
        console.error('[WebMCP] Failed to register tools:', error);
      }
    };

    registerTools();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const hasWebMCP = typeof document.modelContext?.registerTool === 'function';
  return { hasWebMCP, registered: registeredRef.current };
}
