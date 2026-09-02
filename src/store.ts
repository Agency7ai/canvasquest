import { create } from 'zustand';
import type { GameState, TreeNode, GameAction, PlayerType, NodeKind } from './types';

const DEFAULT_QUESTION = 'How should I learn agentic web apps?';
const TOTAL_MOVES = 10;

// Short ids so a voice agent can say and hear them reliably.
let nodeCounter = 0;
const nextNodeId = () => `n${++nodeCounter}`;

interface GameStore extends GameState {
  isVoiceConnected: boolean;
  setVoiceConnected: (connected: boolean) => void;
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

export const useGameStore = create<GameStore>((set, get) => ({
  nodes: [],
  currentPlayer: 'human',
  movesRemaining: TOTAL_MOVES,
  gameStatus: 'playing',
  question: DEFAULT_QUESTION,
  history: [],
  isVoiceConnected: false,

  setVoiceConnected: (connected: boolean) => set({ isVoiceConnected: connected }),

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
      currentPlayer: player === 'human' ? 'agent' : 'human',
      movesRemaining: state.movesRemaining - 1,
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
      currentPlayer: player === 'human' ? 'agent' : 'human',
      movesRemaining: state.movesRemaining - 1,
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

    set({
      nodes: state.nodes.filter(n => !toRemove.has(n.id)),
      currentPlayer: player === 'human' ? 'agent' : 'human',
      movesRemaining: state.movesRemaining - 1,
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
      currentPlayer: player === 'human' ? 'agent' : 'human',
      movesRemaining: state.movesRemaining - 1,
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
      currentPlayer: player === 'human' ? 'agent' : 'human',
      movesRemaining: state.movesRemaining - 1,
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
      question: question || DEFAULT_QUESTION,
      history: [],
    });
  },

  checkWinCondition: () => {
    const state = get();
    
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
}));
