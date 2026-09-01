import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GameState, TreeNode, GameAction, PlayerType, NodeKind } from './types';

const DEFAULT_QUESTION = 'How should I learn agentic web apps?';
const TOTAL_MOVES = 10;

// Short ids so a voice agent can say and hear them reliably.
let nodeCounter = 0;
const nextNodeId = () => `n${++nodeCounter}`;

/**
 * Game mode is the timed challenge: a fixed move budget and strict alternation.
 * Workspace mode is the open-ended tool: no budget, no turn order, so a human
 * and an agent can both keep editing for as long as the session is useful.
 */
export type SessionMode = 'game' | 'workspace';

export interface PlantedSession {
  id: string;
  question: string;
  nodes: TreeNode[];
  plantedAt: number;
}

function turnAdvance(state: { mode: SessionMode; movesRemaining: number }, player: PlayerType) {
  if (state.mode === 'workspace') return {};
  return {
    currentPlayer: (player === 'human' ? 'agent' : 'human') as PlayerType,
    movesRemaining: state.movesRemaining - 1,
  };
}

interface GameStore extends GameState {
  mode: SessionMode;
  isVoiceConnected: boolean;
  selectedNodeId: string;
  /** Positions the human dragged, which override the computed layout. */
  positions: Record<string, { x: number; y: number }>;
  setMode: (mode: SessionMode) => void;
  setQuestion: (question: string) => void;
  setVoiceConnected: (connected: boolean) => void;
  setSelectedNodeId: (nodeId: string) => void;
  setNodePosition: (nodeId: string, position: { x: number; y: number }) => void;
  resetLayout: () => void;
  importSession: (raw: string) => { success: boolean; message: string };
  /** Sessions planted in the forest, each standing as its own tree. */
  grove: PlantedSession[];
  plantInForest: () => { success: boolean; message: string };
  openFromForest: (sessionId: string) => { success: boolean; message: string };
  removeFromForest: (sessionId: string) => void;
  plant: (label: string, player: PlayerType) => { success: boolean; message: string; nodeId?: string };
  branch: (parentId: string, label: string, kind: NodeKind, player: PlayerType) => { success: boolean; message: string; nodeId?: string };
  prune: (nodeId: string, player: PlayerType) => { success: boolean; message: string };
  markGap: (nodeId: string, player: PlayerType) => { success: boolean; message: string };
  markClear: (nodeId: string, player: PlayerType) => { success: boolean; message: string };
  undoLastMove: () => { success: boolean; message: string };
  passTurn: () => { success: boolean; message: string };
  resetGame: (question?: string) => void;
  checkWinCondition: () => void;
}

export const useGameStore = create<GameStore>()(persist((set, get) => ({
  nodes: [],
  currentPlayer: 'human',
  movesRemaining: TOTAL_MOVES,
  gameStatus: 'playing',
  question: DEFAULT_QUESTION,
  history: [],
  mode: 'workspace',
  isVoiceConnected: false,
  selectedNodeId: '',
  positions: {},
  grove: [],

  // Planting keeps a copy standing in the clearing and leaves the current board
  // untouched, so the forest accumulates without interrupting the session.
  plantInForest: () => {
    const state = get();
    if (state.nodes.length === 0) {
      return { success: false, message: 'Nothing to plant yet.' };
    }

    const existing = state.grove.findIndex(session => session.question === state.question);
    const planted: PlantedSession = {
      id: existing >= 0 ? state.grove[existing].id : `grove-${Date.now()}`,
      question: state.question,
      nodes: state.nodes.map(node => ({ ...node })),
      plantedAt: Date.now(),
    };

    const grove = [...state.grove];
    if (existing >= 0) grove[existing] = planted;
    else grove.push(planted);

    set({ grove });
    return {
      success: true,
      message: existing >= 0 ? 'Updated this tree in the forest.' : 'Planted in the forest.',
    };
  },

  openFromForest: (sessionId: string) => {
    const session = get().grove.find(item => item.id === sessionId);
    if (!session) return { success: false, message: 'That tree is no longer in the forest.' };

    nodeCounter = session.nodes.reduce((highest, node) => {
      const parsed = Number.parseInt(node.id.replace(/^n/, ''), 10);
      return Number.isFinite(parsed) ? Math.max(highest, parsed) : highest;
    }, 0);

    set({
      nodes: session.nodes.map(node => ({ ...node })),
      question: session.question,
      history: [],
      positions: {},
      selectedNodeId: '',
      currentPlayer: 'human',
      gameStatus: 'playing',
    });

    return { success: true, message: `Opened “${session.question}”.` };
  },

  removeFromForest: (sessionId: string) =>
    set(state => ({ grove: state.grove.filter(session => session.id !== sessionId) })),

  setVoiceConnected: (connected: boolean) => set({ isVoiceConnected: connected }),

  setSelectedNodeId: (nodeId: string) => set({ selectedNodeId: nodeId }),

  setNodePosition: (nodeId, position) =>
    set(state => ({ positions: { ...state.positions, [nodeId]: position } })),

  resetLayout: () => set({ positions: {} }),

  setQuestion: (question: string) => set({ question }),

  setMode: (mode: SessionMode) =>
    set(
      mode === 'game'
        ? { mode, movesRemaining: TOTAL_MOVES, currentPlayer: 'human', gameStatus: 'playing' }
        : { mode, gameStatus: 'playing' }
    ),

  plant: (label: string, player: PlayerType) => {
    const state = get();
    
    if (state.gameStatus !== 'playing') {
      return { success: false, message: 'Game is over' };
    }
    
    if (state.nodes.length > 0) {
      return { success: false, message: 'Root already exists' };
    }

    const newNode: TreeNode = {
      id: nextNodeId(),
      label,
      kind: 'root',
      parentId: null,
      createdBy: player,
    };

    const action: GameAction = {
      type: 'plant',
      nodeId: newNode.id,
      label,
      kind: 'root',
      player,
      timestamp: Date.now(),
    };

    set({
      nodes: [newNode],
      ...turnAdvance(state, player),
      history: [...state.history, action],
    });

    get().checkWinCondition();
    return { success: true, message: `Planted root: ${label}`, nodeId: newNode.id };
  },

  branch: (parentId: string, label: string, kind: NodeKind, player: PlayerType) => {
    const state = get();
    
    if (state.gameStatus !== 'playing') {
      return { success: false, message: 'Game is over' };
    }

    const parent = state.nodes.find(n => n.id === parentId);
    if (!parent) {
      return { success: false, message: 'Parent node not found' };
    }

    const newNode: TreeNode = {
      id: nextNodeId(),
      label,
      kind,
      parentId,
      createdBy: player,
    };

    const action: GameAction = {
      type: 'branch',
      nodeId: newNode.id,
      parentId,
      label,
      kind,
      player,
      timestamp: Date.now(),
    };

    set({
      nodes: [...state.nodes, newNode],
      ...turnAdvance(state, player),
      history: [...state.history, action],
    });

    get().checkWinCondition();
    return { success: true, message: `Added branch: ${label} (${kind})`, nodeId: newNode.id };
  },

  prune: (nodeId: string, player: PlayerType) => {
    const state = get();
    
    if (state.gameStatus !== 'playing') {
      return { success: false, message: 'Game is over' };
    }

    const node = state.nodes.find(n => n.id === nodeId);
    if (!node) {
      return { success: false, message: 'Node not found' };
    }

    if (node.kind === 'root') {
      return { success: false, message: 'Cannot prune the root' };
    }

    const toRemove = new Set([nodeId]);
    const addDescendants = (id: string) => {
      state.nodes.forEach(n => {
        if (n.parentId === id) {
          toRemove.add(n.id);
          addDescendants(n.id);
        }
      });
    };
    addDescendants(nodeId);

    const action: GameAction = {
      type: 'prune',
      nodeId,
      player,
      timestamp: Date.now(),
    };

    const positions = { ...state.positions };
    toRemove.forEach(id => delete positions[id]);

    set({
      nodes: state.nodes.filter(n => !toRemove.has(n.id)),
      positions,
      selectedNodeId: toRemove.has(state.selectedNodeId) ? '' : state.selectedNodeId,
      ...turnAdvance(state, player),
      history: [...state.history, action],
    });

    get().checkWinCondition();
    return { success: true, message: `Pruned node and ${toRemove.size - 1} descendants` };
  },

  markGap: (nodeId: string, player: PlayerType) => {
    const state = get();
    
    if (state.gameStatus !== 'playing') {
      return { success: false, message: 'Game is over' };
    }

    const node = state.nodes.find(n => n.id === nodeId);
    if (!node) {
      return { success: false, message: 'Node not found' };
    }

    if (node.kind === 'gap') {
      return { success: false, message: 'Already marked as gap' };
    }

    const action: GameAction = {
      type: 'mark_gap',
      nodeId,
      player,
      timestamp: Date.now(),
    };

    set({
      nodes: state.nodes.map(n => 
        n.id === nodeId ? { ...n, kind: 'gap' } : n
      ),
      ...turnAdvance(state, player),
      history: [...state.history, action],
    });

    get().checkWinCondition();
    return { success: true, message: `Marked ${node.label} as gap` };
  },

  markClear: (nodeId: string, player: PlayerType) => {
    const state = get();
    
    if (state.gameStatus !== 'playing') {
      return { success: false, message: 'Game is over' };
    }

    const node = state.nodes.find(n => n.id === nodeId);
    if (!node) {
      return { success: false, message: 'Node not found' };
    }

    if (node.kind !== 'gap') {
      return { success: false, message: 'Node is not marked as gap' };
    }

    const action: GameAction = {
      type: 'mark_clear',
      nodeId,
      player,
      timestamp: Date.now(),
    };

    set({
      nodes: state.nodes.map(n => 
        n.id === nodeId ? { ...n, kind: 'concept' } : n
      ),
      ...turnAdvance(state, player),
      history: [...state.history, action],
    });

    get().checkWinCondition();
    return { success: true, message: `Cleared gap on ${node.label}` };
  },

  undoLastMove: () => {
    const state = get();
    
    if (state.history.length === 0) {
      return { success: false, message: 'No moves to undo' };
    }

    const lastAction = state.history[state.history.length - 1];
    
    if (lastAction.player !== 'agent') {
      return { success: false, message: 'Can only undo agent moves' };
    }

    let newNodes = [...state.nodes];
    
    switch (lastAction.type) {
      case 'plant':
        newNodes = [];
        break;
      case 'branch':
        newNodes = newNodes.filter(n => n.id !== lastAction.nodeId);
        break;
      case 'prune':
        return { success: false, message: 'Cannot undo prune (state not saved)' };
      case 'mark_gap':
      case 'mark_clear':
        if (lastAction.nodeId) {
          const originalKind = lastAction.type === 'mark_gap' ? 'concept' : 'gap';
          newNodes = newNodes.map(n => 
            n.id === lastAction.nodeId ? { ...n, kind: originalKind } : n
          );
        }
        break;
    }

    set({
      nodes: newNodes,
      currentPlayer: 'human',
      movesRemaining: state.movesRemaining + 1,
      history: state.history.slice(0, -1),
    });

    return { success: true, message: 'Undid last agent move' };
  },

  // Yielding is not a move: it costs nothing from the budget, which is what
  // lets the agent play several times in a row while the human stays quiet.
  passTurn: () => {
    const state = get();

    if (state.gameStatus !== 'playing') {
      return { success: false, message: 'Game is over' };
    }

    const next = state.currentPlayer === 'human' ? 'agent' : 'human';
    set({ currentPlayer: next });
    return { success: true, message: `Turn passed to ${next}` };
  },

  resetGame: (question?: string) => {
    nodeCounter = 0;
    set({
      nodes: [],
      currentPlayer: 'human',
      movesRemaining: TOTAL_MOVES,
      gameStatus: 'playing',
      question: question ?? get().question ?? DEFAULT_QUESTION,
      history: [],
      positions: {},
      selectedNodeId: '',
    });
  },

  importSession: (raw: string) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { success: false, message: 'That is not valid JSON.' };
    }

    const payload = parsed as { question?: unknown; nodes?: unknown };
    if (!Array.isArray(payload.nodes)) {
      return { success: false, message: 'Expected an object with a "nodes" array.' };
    }

    const kinds: NodeKind[] = ['root', 'concept', 'resource', 'skill', 'gap'];
    const imported: TreeNode[] = [];

    for (const entry of payload.nodes) {
      const node = entry as Partial<TreeNode>;
      if (typeof node.id !== 'string' || typeof node.label !== 'string') {
        return { success: false, message: 'Every node needs a string id and label.' };
      }
      if (!kinds.includes(node.kind as NodeKind)) {
        return { success: false, message: `Unknown kind "${String(node.kind)}" on node ${node.id}.` };
      }
      imported.push({
        id: node.id,
        label: node.label,
        kind: node.kind as NodeKind,
        parentId: typeof node.parentId === 'string' ? node.parentId : null,
        createdBy: node.createdBy === 'agent' ? 'agent' : 'human',
      });
    }

    const ids = new Set(imported.map(node => node.id));
    const orphan = imported.find(node => node.parentId !== null && !ids.has(node.parentId));
    if (orphan) {
      return { success: false, message: `Node ${orphan.id} references a missing parent.` };
    }

    // Ids come from a counter, so move it past everything imported or the next
    // node created will collide with one already on the board.
    nodeCounter = imported.reduce((highest, node) => {
      const parsedId = Number.parseInt(node.id.replace(/^n/, ''), 10);
      return Number.isFinite(parsedId) ? Math.max(highest, parsedId) : highest;
    }, 0);

    set({
      nodes: imported,
      question: typeof payload.question === 'string' ? payload.question : get().question,
      history: [],
      positions: {},
      selectedNodeId: '',
      currentPlayer: 'human',
      gameStatus: 'playing',
    });

    return { success: true, message: `Imported ${imported.length} nodes.` };
  },

  checkWinCondition: () => {
    const state = get();

    // Workspace sessions are open-ended; there is nothing to win or lose.
    if (state.mode === 'workspace') return;

    if (state.movesRemaining <= 0 || state.gameStatus !== 'playing') {
      const hasGaps = state.nodes.some(n => n.kind === 'gap');
      const hasEnoughNodes = state.nodes.length >= 5;
      
      if (!hasGaps && hasEnoughNodes) {
        set({ gameStatus: 'won' });
      } else if (state.movesRemaining <= 0) {
        set({ gameStatus: 'lost' });
      }
    }
  },
}), {
  name: 'canvasquest-session',
  partialize: state => ({
    nodes: state.nodes,
    question: state.question,
    history: state.history,
    mode: state.mode,
    movesRemaining: state.movesRemaining,
    currentPlayer: state.currentPlayer,
    gameStatus: state.gameStatus,
    positions: state.positions,
    grove: state.grove,
  }),
  onRehydrateStorage: () => restored => {
    // Ids are minted from a module counter, so a restored session must move the
    // counter past everything on the board or the next node reuses an id.
    if (!restored?.nodes.length) return;
    nodeCounter = restored.nodes.reduce((highest, node) => {
      const parsed = Number.parseInt(node.id.replace(/^n/, ''), 10);
      return Number.isFinite(parsed) ? Math.max(highest, parsed) : highest;
    }, 0);
  },
}));
