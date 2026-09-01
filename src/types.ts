export type NodeKind = 'root' | 'concept' | 'resource' | 'skill' | 'gap';

export type PlayerType = 'human' | 'agent';

export interface TreeNode {
  id: string;
  label: string;
  kind: NodeKind;
  parentId: string | null;
  createdBy: PlayerType;
}

export interface GameState {
  nodes: TreeNode[];
  currentPlayer: PlayerType;
  movesRemaining: number;
  gameStatus: 'playing' | 'won' | 'lost';
  question: string;
  history: GameAction[];
}

export interface GameAction {
  type: 'plant' | 'branch' | 'prune' | 'mark_gap' | 'mark_clear' | 'undo';
  nodeId?: string;
  parentId?: string;
  label?: string;
  kind?: NodeKind;
  player: PlayerType;
  timestamp: number;
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
