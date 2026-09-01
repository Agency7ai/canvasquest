import { useGameStore } from './store';
import type { NodeKind } from './types';

export interface MoveResult {
  success: boolean;
  message: string;
  nodeId?: string;
  board: BoardSummary;
}

export interface BoardSummary {
  question: string;
  totalNodes: number;
  gapNodes: number;
  movesRemaining: number;
  currentPlayer: string;
  gameStatus: string;
  nodes: Array<{ id: string; label: string; kind: NodeKind; parentId: string | null }>;
}

export function readBoard(): BoardSummary {
  const state = useGameStore.getState();
  return {
    question: state.question,
    totalNodes: state.nodes.length,
    gapNodes: state.nodes.filter(n => n.kind === 'gap').length,
    movesRemaining: state.movesRemaining,
    currentPlayer: state.currentPlayer,
    gameStatus: state.gameStatus,
    nodes: state.nodes.map(n => ({
      id: n.id,
      label: n.label,
      kind: n.kind,
      parentId: n.parentId,
    })),
  };
}

/**
 * Voice agents rarely echo an id correctly, so accept either the exact id or a
 * case-insensitive (and partial) label match.
 */
function resolveNodeId(reference: string): string | null {
  const { nodes } = useGameStore.getState();
  const needle = reference.trim().toLowerCase();

  const byId = nodes.find(n => n.id.toLowerCase() === needle);
  if (byId) return byId.id;

  const byExactLabel = nodes.find(n => n.label.toLowerCase() === needle);
  if (byExactLabel) return byExactLabel.id;

  const byPartialLabel = nodes.filter(n => n.label.toLowerCase().includes(needle));
  if (byPartialLabel.length === 1) return byPartialLabel[0].id;

  return null;
}

function unresolved(reference: string): MoveResult {
  return {
    success: false,
    message: `No single node matches "${reference}". Call get_board and use an exact id or label.`,
    board: readBoard(),
  };
}

export type MoveName =
  | 'get_board'
  | 'plant'
  | 'branch'
  | 'prune'
  | 'mark_gap'
  | 'mark_clear';

/**
 * The one implementation of every agent move. Both the WebMCP tools and the
 * ElevenLabs voice client tools route through here, so the two surfaces can
 * never drift apart or bypass the game rules.
 */
export function applyMove(name: MoveName, input: Record<string, unknown>): MoveResult {
  const store = useGameStore.getState();

  switch (name) {
    case 'get_board':
      return { success: true, message: 'Current board', board: readBoard() };

    case 'plant': {
      const label = String(input.label ?? '').trim();
      if (!label) {
        return { success: false, message: 'A label is required.', board: readBoard() };
      }
      const result = store.plant(label, 'agent');
      return { ...result, board: readBoard() };
    }

    case 'branch': {
      const label = String(input.label ?? '').trim();
      const kind = String(input.kind ?? 'concept') as NodeKind;
      const reference = String(input.parentId ?? '');
      if (!label) {
        return { success: false, message: 'A label is required.', board: readBoard() };
      }
      const parentId = resolveNodeId(reference);
      if (!parentId) return unresolved(reference);
      const result = store.branch(parentId, label, kind, 'agent');
      return { ...result, board: readBoard() };
    }

    case 'prune': {
      const reference = String(input.nodeId ?? '');
      const nodeId = resolveNodeId(reference);
      if (!nodeId) return unresolved(reference);
      const result = store.prune(nodeId, 'agent');
      return { ...result, board: readBoard() };
    }

    case 'mark_gap': {
      const reference = String(input.nodeId ?? '');
      const nodeId = resolveNodeId(reference);
      if (!nodeId) return unresolved(reference);
      const result = store.markGap(nodeId, 'agent');
      return { ...result, board: readBoard() };
    }

    case 'mark_clear': {
      const reference = String(input.nodeId ?? '');
      const nodeId = resolveNodeId(reference);
      if (!nodeId) return unresolved(reference);
      const result = store.markClear(nodeId, 'agent');
      return { ...result, board: readBoard() };
    }
  }
}

export interface ToolDefinition {
  name: MoveName;
  description: string;
  readOnly: boolean;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

const NODE_REFERENCE = 'The id (for example "n2") or the exact label of the target node.';

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'get_board',
    description:
      'Read the current board: the seed question, every node with its id, label and kind, plus moves remaining and whose turn it is. Call this before making a move so you know which node ids exist.',
    readOnly: true,
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'plant',
    description:
      'Plant the root node of the learning tree. Only valid as the very first move, when the board is empty. Use the seed question as the label.',
    readOnly: false,
    inputSchema: {
      type: 'object',
      properties: {
        label: {
          type: 'string',
          description: 'Label for the root node, usually the learning question itself.',
        },
      },
      required: ['label'],
    },
  },
  {
    name: 'branch',
    description:
      'Expand an existing node with a new child node. This is the main way to grow the tree toward the win condition of five or more nodes.',
    readOnly: false,
    inputSchema: {
      type: 'object',
      properties: {
        parentId: { type: 'string', description: `${NODE_REFERENCE} This node becomes the parent.` },
        label: { type: 'string', description: 'A short label for the new node, two to five words.' },
        kind: {
          type: 'string',
          enum: ['concept', 'resource', 'skill', 'gap'],
          description:
            'concept for an idea or topic, resource for a book or course, skill for an ability to practise, gap for something still unknown.',
        },
      },
      required: ['parentId', 'label', 'kind'],
    },
  },
  {
    name: 'prune',
    description:
      'Remove a node and all of its descendants. Use this to cut an off-topic or duplicated branch. The root cannot be pruned.',
    readOnly: false,
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: NODE_REFERENCE },
      },
      required: ['nodeId'],
    },
  },
  {
    name: 'mark_gap',
    description:
      'Flag a node as an open knowledge gap. Any remaining gap node blocks the win, so only mark what genuinely needs filling.',
    readOnly: false,
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: NODE_REFERENCE },
      },
      required: ['nodeId'],
    },
  },
  {
    name: 'mark_clear',
    description:
      'Clear the gap flag on a node once it has been addressed, turning it back into a concept. Clearing every gap is required to win.',
    readOnly: false,
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: NODE_REFERENCE },
      },
      required: ['nodeId'],
    },
  },
];
