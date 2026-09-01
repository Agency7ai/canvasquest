import { useGameStore } from './store';
import type { Visualization } from './store';
import { ACTIVE_BOARD_ID } from './app-meta';
import type { NodeKind } from './types';

export interface MoveResult {
  success: boolean;
  message: string;
  nodeId?: string;
  node?: NodeDetail;
  board: BoardSummary;
}

export interface NodeDetail {
  id: string;
  label: string;
  kind: NodeKind;
  parentId: string | null;
  parentLabel: string | null;
  childIds: string[];
  selected: boolean;
}

export interface BoardSummary {
  question: string;
  totalNodes: number;
  gapNodes: number;
  movesRemaining: number;
  currentPlayer: string;
  gameStatus: string;
  /** What the human currently has selected, in either visualisation. */
  selectedNodeId: string | null;
  /** Which visualisation is on screen. */
  visualization: Visualization;
  /**
   * The root of the tree the forest camera has stepped inside, when that tree
   * is the board being edited. Null when nothing is focused, or when the
   * focused tree is a planted session whose nodes are not currently loaded.
   */
  focusedNodeId: string | null;
  /** The focused tree itself, including planted ones that are not open. */
  focusedTree: { id: string; label: string; isActive: boolean } | null;
  nodes: Array<{ id: string; label: string; kind: NodeKind; parentId: string | null }>;
}

function readFocus(state: ReturnType<typeof useGameStore.getState>) {
  const { focusedTreeId } = state;
  if (!focusedTreeId) return { focusedNodeId: null, focusedTree: null };

  if (focusedTreeId === ACTIVE_BOARD_ID) {
    const root = state.nodes.find(node => node.parentId === null);
    return {
      focusedNodeId: root?.id ?? null,
      focusedTree: root
        ? { id: ACTIVE_BOARD_ID, label: root.label, isActive: true }
        : null,
    };
  }

  // A planted tree is a different session; its nodes are not on the board, so
  // there is no node id here that the other tools could resolve.
  const planted = state.grove.find(session => session.id === focusedTreeId);
  return {
    focusedNodeId: null,
    focusedTree: planted
      ? { id: planted.id, label: planted.question, isActive: false }
      : null,
  };
}

export function readBoard(): BoardSummary {
  const state = useGameStore.getState();
  const { focusedNodeId, focusedTree } = readFocus(state);

  return {
    question: state.question,
    totalNodes: state.nodes.length,
    gapNodes: state.nodes.filter(n => n.kind === 'gap').length,
    movesRemaining: state.movesRemaining,
    currentPlayer: state.currentPlayer,
    gameStatus: state.gameStatus,
    selectedNodeId: state.selectedNodeId || null,
    visualization: state.visualization,
    focusedNodeId,
    focusedTree,
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

function describeNode(nodeId: string, board: BoardSummary): MoveResult {
  const { nodes } = useGameStore.getState();
  const node = nodes.find(candidate => candidate.id === nodeId);

  if (!node) {
    return { success: false, message: `Node not found: ${nodeId}`, board };
  }

  const parent = node.parentId
    ? nodes.find(candidate => candidate.id === node.parentId)
    : undefined;

  return {
    success: true,
    message: `${node.label} (${node.kind})`,
    nodeId: node.id,
    node: {
      id: node.id,
      label: node.label,
      kind: node.kind,
      parentId: node.parentId,
      parentLabel: parent?.label ?? null,
      childIds: nodes.filter(candidate => candidate.parentId === node.id).map(child => child.id),
      selected: node.id === board.selectedNodeId,
    },
    board,
  };
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
  | 'get_node_state'
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

    case 'get_node_state': {
      const board = readBoard();
      const reference = typeof input.nodeId === 'string' ? input.nodeId.trim() : '';

      // With no argument, report what the human is looking at: their selection
      // first, otherwise the tree the forest camera has stepped inside.
      if (!reference) {
        const implied = board.selectedNodeId ?? board.focusedNodeId;

        if (!implied) {
          return {
            success: false,
            message: board.focusedTree
              ? `Nothing is selected. The camera is inside the planted session “${board.focusedTree.label}”, which is not open for editing.`
              : 'No node is currently selected.',
            board,
          };
        }

        return describeNode(implied, board);
      }

      const nodeId = resolveNodeId(reference);
      if (!nodeId) {
        return {
          success: false,
          message: `Node not found: ${reference}. Call get_board for valid ids.`,
          board,
        };
      }
      return describeNode(nodeId, board);
    }

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
    additionalProperties?: boolean;
  };
}

const NODE_REFERENCE = 'The id (for example "n2") or the exact label of the target node.';

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'get_board',
    description:
      'Read the current board: the seed question, every node with its id, label and kind, which node the human has selected, plus moves remaining and whose turn it is. Call this before making a move so you know which node ids exist.',
    readOnly: true,
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_node_state',
    description:
      'Read one node in detail: its label, kind, parent, children, and whether it is selected. Omit nodeId to inspect whatever the human currently has selected on the canvas, which is how to answer questions about "this node".',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description:
            'A node id such as "n4", or the node\'s exact label. Omit to inspect the selected node.',
        },
      },
      additionalProperties: false,
    },
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
