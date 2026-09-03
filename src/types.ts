export type NodeKind = 'root' | 'concept' | 'resource' | 'skill';

export type PlayerType = 'human' | 'agent';

export type GamePhase = 'setup' | 'playing' | 'ended';

export interface TreeNode {
  id: string;
  label: string;
  kind: NodeKind;
  parentId: string | null;
  createdBy: PlayerType;
  /** A gap is a flag laid over the node's real kind, never a kind of its own. */
  isGap: boolean;
  /** The challenge behind the gap, e.g. "How would you practise this?" */
  gapReason?: string;
  note?: string;
  url?: string;
}

/** Optional content attached to a node. Empty strings clear a field. */
export interface NodeContent {
  note?: string;
  url?: string;
}

export type ActionType = 'plant' | 'branch' | 'prune' | 'mark_gap' | 'annotate';

export interface GameAction {
  type: ActionType;
  player: PlayerType;
  timestamp: number;
  nodeId?: string;
  parentId?: string;
  /** Label of the node the action touched, for logs. */
  label?: string;
  kind?: NodeKind;
  /** Whether the action consumed a move; undo refunds it if so. */
  costsMove: boolean;
  /** Every node as it was before the action, so undo is lossless. */
  before: TreeNode[];
}

export interface GameState {
  question: string;
  gamePhase: GamePhase;
  nodes: TreeNode[];
  currentPlayer: PlayerType;
  /** Moves the human may still make. */
  humanMoves: number;
  /** Moves the agent may still make. */
  agentMoves: number;
  /** Turns yielded in a row (a pass or a skip) with no move between them. */
  consecutivePasses: number;
  history: GameAction[];
}

/** What survives a reload or a share link: the game minus transient UI state. */
export interface SavedGame {
  question: string;
  nodes: TreeNode[];
  humanMoves: number;
  agentMoves: number;
  currentPlayer: PlayerType;
  gamePhase: GamePhase;
  history: GameAction[];
}

export interface WebMCPTool {
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
}
