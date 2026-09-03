import { computeImplicitGaps, computeScore } from './scoring';
import { useGameStore, BRANCH_KINDS, MOVES_PER_PLAYER } from './store';
import type { GamePhase, NodeKind, PlayerType } from './types';

export interface MoveResult {
  success: boolean;
  message: string;
  nodeId?: string;
  board: BoardSummary;
}

export interface BoardNode {
  id: string;
  label: string;
  kind: NodeKind;
  parentId: string | null;
  createdBy: PlayerType;
  isGap: boolean;
  gapReason?: string;
  note?: string;
  url?: string;
}

export interface BoardSummary {
  question: string;
  gamePhase: GamePhase;
  currentPlayer: PlayerType;
  humanMoves: number;
  agentMoves: number;
  totalNodes: number;
  /** Live score out of 100. */
  score: number;
  /** Every open gap, explicit and implicit. Each costs 5 points at the end. */
  openGaps: string[];
  /** Concepts with no resource or skill beneath them yet. */
  implicitGaps: string[];
  nodes: BoardNode[];
}

export function readBoard(): BoardSummary {
  const state = useGameStore.getState();
  const score = computeScore(state.nodes);
  return {
    question: state.question,
    gamePhase: state.gamePhase,
    currentPlayer: state.currentPlayer,
    humanMoves: state.humanMoves,
    agentMoves: state.agentMoves,
    totalNodes: state.nodes.length,
    score: score.total,
    openGaps: score.openGaps,
    implicitGaps: computeImplicitGaps(state.nodes),
    nodes: state.nodes.map(n => ({
      id: n.id,
      label: n.label,
      kind: n.kind,
      parentId: n.parentId,
      createdBy: n.createdBy,
      isGap: n.isGap,
      ...(n.gapReason ? { gapReason: n.gapReason } : {}),
      ...(n.note ? { note: n.note } : {}),
      ...(n.url ? { url: n.url } : {}),
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
  if (!needle) return null;

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

/** Optional string argument: absent or non-string means "not provided". */
const optionalText = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

export type MoveName =
  | 'get_board'
  | 'plant'
  | 'branch'
  | 'prune'
  | 'mark_gap'
  | 'annotate'
  | 'pass';

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
      const result = store.plant(label, 'agent', { note: optionalText(input.note) });
      return { ...result, board: readBoard() };
    }

    case 'branch': {
      const label = String(input.label ?? '').trim();
      const kind = String(input.kind ?? 'concept').trim().toLowerCase();
      const reference = String(input.parentId ?? '');
      if (!label) {
        return { success: false, message: 'A label is required.', board: readBoard() };
      }
      if (kind === 'gap') {
        return {
          success: false,
          message:
            'A gap is not a node kind. Branch a concept, resource or skill, then call mark_gap on the node that needs filling.',
          board: readBoard(),
        };
      }
      if (!BRANCH_KINDS.includes(kind as NodeKind)) {
        return {
          success: false,
          message: `Unknown kind "${kind}". Use one of: ${BRANCH_KINDS.join(', ')}.`,
          board: readBoard(),
        };
      }
      const parentId = resolveNodeId(reference);
      if (!parentId) return unresolved(reference);
      const result = store.branch(parentId, label, kind as NodeKind, 'agent', {
        note: optionalText(input.note),
        url: optionalText(input.url),
      });
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
      const result = store.markGap(nodeId, 'agent', optionalText(input.reason));
      return { ...result, board: readBoard() };
    }

    case 'annotate': {
      const reference = String(input.nodeId ?? '');
      const nodeId = resolveNodeId(reference);
      if (!nodeId) return unresolved(reference);
      const result = store.annotate(
        nodeId,
        { note: optionalText(input.note), url: optionalText(input.url) },
        'agent',
      );
      return { ...result, board: readBoard() };
    }

    case 'pass': {
      const result = store.passTurn('agent');
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

const COSTS_A_MOVE = `Costs one of your ${MOVES_PER_PLAYER} moves and ends your turn.`;

/**
 * Tool descriptions double as the rulebook the agent plays by, so each one
 * states what the move costs and which rules it can trip over.
 */
export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'get_board',
    description:
      'Read the current board: the question, every node (id, label, kind, parentId, createdBy, isGap, gapReason, note, url), both move budgets, whose turn it is, the live score out of 100, and openGaps (explicit gaps plus implicit ones: concepts with no resource or skill beneath them). Free: costs no move. Call it before every move so you use real node ids.',
    readOnly: true,
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'plant',
    description: `Plant the root node. Only valid as the first move, when the board is empty. Use the question itself as the label. ${COSTS_A_MOVE}`,
    readOnly: false,
    inputSchema: {
      type: 'object',
      properties: {
        label: {
          type: 'string',
          description: 'Label for the root node, usually the learning question itself.',
        },
        note: { type: 'string', description: 'Optional short note to attach to the root.' },
      },
      required: ['label'],
    },
  },
  {
    name: 'branch',
    description: `Add a child node under an existing node. ${COSTS_A_MOVE} A resource or skill branched directly under a gap closes that gap automatically. A concept with no resource or skill anywhere beneath it counts as an implicit gap and costs points at the end, so follow concepts with resources and skills. Scoring rewards coverage (concepts with a resource or skill under them), depth up to three levels, having all three kinds, both players contributing, and notes or urls on nodes.`,
    readOnly: false,
    inputSchema: {
      type: 'object',
      properties: {
        parentId: { type: 'string', description: `${NODE_REFERENCE} This node becomes the parent.` },
        label: { type: 'string', description: 'A short label for the new node, two to five words.' },
        kind: {
          type: 'string',
          enum: ['concept', 'resource', 'skill'],
          description:
            'concept for an idea or topic, resource for a book, course, article or tool (add its url), skill for an ability to practise.',
        },
        note: { type: 'string', description: 'Optional short note explaining the node.' },
        url: { type: 'string', description: 'Optional http(s) link, especially for a resource.' },
      },
      required: ['parentId', 'label', 'kind'],
    },
  },
  {
    name: 'prune',
    description: `Remove a node and everything under it. ${COSTS_A_MOVE} The root cannot be pruned. The human can undo your most recent action, so prune only what is clearly off-topic or duplicated.`,
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
    description: `Flag a node as an open knowledge gap that the other player should fill, keeping its kind. ${COSTS_A_MOVE} You cannot mark the root, a node that is already a gap, or a node that already has a resource or skill directly under it. Every gap still open when the game ends costs 5 points, so mark gaps you expect to be filled and give a reason.`,
    readOnly: false,
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: NODE_REFERENCE },
        reason: {
          type: 'string',
          description: 'Optional challenge question explaining what is missing.',
        },
      },
      required: ['nodeId'],
    },
  },
  {
    name: 'annotate',
    description:
      'Attach or replace a note and/or an http(s) url on any node. Free: costs no move and does not end your turn, so you can annotate on either turn. Each node with a note or url earns 1 point, up to 10. Pass an empty string to clear a field.',
    readOnly: false,
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: NODE_REFERENCE },
        note: { type: 'string', description: 'A short note for the node.' },
        url: { type: 'string', description: 'An http(s) link for the node.' },
      },
      required: ['nodeId'],
    },
  },
  {
    name: 'pass',
    description:
      'End your turn without moving. Free: costs no move. If both players yield in a row the game ends, so pass only when you have nothing to add or want the human to respond first.',
    readOnly: false,
    inputSchema: { type: 'object', properties: {} },
  },
];
