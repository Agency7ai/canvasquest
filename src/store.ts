import { create } from 'zustand';
import { fillsGap } from './scoring';
import type {
  ActionType,
  GameAction,
  GameState,
  NodeContent,
  NodeKind,
  PlayerType,
  TreeNode,
} from './types';

// ---------------------------------------------------------------------------
// Rule constants
// ---------------------------------------------------------------------------

/** Moves each player gets. Passing and annotating never spend one. */
export const MOVES_PER_PLAYER = 6;

/** Turns yielded in a row (pass or skip, no move between) that end the game. */
export const PASSES_TO_END = 2;

/** Kinds a child node may have. The root is created only by plant. */
export const BRANCH_KINDS: readonly NodeKind[] = ['concept', 'resource', 'skill'];

// Short ids so a voice agent can say and hear them reliably.
let nodeCounter = 0;
const nextNodeId = () => `n${++nodeCounter}`;

export interface MoveOutcome {
  success: boolean;
  message: string;
  nodeId?: string;
}

const fail = (message: string): MoveOutcome => ({ success: false, message });
const ok = (message: string, nodeId?: string): MoveOutcome =>
  nodeId === undefined ? { success: true, message } : { success: true, message, nodeId };

export const otherPlayer = (player: PlayerType): PlayerType =>
  player === 'human' ? 'agent' : 'human';

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

const budgetOf = (state: Pick<GameState, 'humanMoves' | 'agentMoves'>, player: PlayerType) =>
  player === 'human' ? state.humanMoves : state.agentMoves;

/**
 * Who moves next: the preferred player if they still have moves, otherwise the
 * other one, or null when both budgets are spent and the game is over.
 */
export function resolveTurn(
  preferred: PlayerType,
  humanMoves: number,
  agentMoves: number,
): PlayerType | null {
  if (humanMoves <= 0 && agentMoves <= 0) return null;
  const preferredMoves = preferred === 'human' ? humanMoves : agentMoves;
  return preferredMoves > 0 ? preferred : otherPlayer(preferred);
}

/** Only http(s) links are stored. A bare domain gets https:// in front. */
export function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

/**
 * Trims note and url. A field that is absent is left alone; a field given as
 * an empty string comes back as undefined, which withContent treats as clear.
 */
function parseContent(content: NodeContent): { value: NodeContent; error?: string } {
  const value: NodeContent = {};
  if (content.note !== undefined) value.note = content.note.trim() || undefined;
  if (content.url !== undefined) {
    const raw = content.url.trim();
    if (!raw) {
      value.url = undefined;
    } else {
      const url = normalizeUrl(raw);
      if (!url) return { value, error: 'URL must be an http:// or https:// link' };
      value.url = url;
    }
  }
  return { value };
}

/** Applies note/url changes, dropping keys that were cleared. */
function withContent(node: TreeNode, content: NodeContent): TreeNode {
  const next: TreeNode = { ...node, ...content };
  if (next.note === undefined) delete next.note;
  if (next.url === undefined) delete next.url;
  return next;
}

function clearGap(node: TreeNode): TreeNode {
  const cleared: TreeNode = { ...node, isGap: false };
  delete cleared.gapReason;
  return cleared;
}

/** One-line summary of a history entry, shared by every move log. */
export function describeAction(action: GameAction): string {
  const label = action.label ? `"${action.label}"` : (action.nodeId ?? 'node');
  switch (action.type) {
    case 'plant':
      return `planted root ${label}`;
    case 'branch':
      return `added ${action.kind ?? 'node'} ${label}`;
    case 'prune':
      return `pruned ${label}`;
    case 'mark_gap':
      return `marked ${label} as a gap`;
    case 'annotate':
      return `annotated ${label}`;
  }
}

interface GameStore extends GameState {
  isVoiceConnected: boolean;
  setVoiceConnected: (connected: boolean) => void;
  startGame: (question: string) => MoveOutcome;
  resetGame: () => void;
  plant: (label: string, player: PlayerType, content?: NodeContent) => MoveOutcome;
  branch: (
    parentId: string,
    label: string,
    kind: NodeKind,
    player: PlayerType,
    content?: NodeContent,
  ) => MoveOutcome;
  prune: (nodeId: string, player: PlayerType) => MoveOutcome;
  markGap: (nodeId: string, player: PlayerType, reason?: string) => MoveOutcome;
  /** Free: consumes no move and does not change the turn. */
  annotate: (nodeId: string, content: NodeContent, player: PlayerType) => MoveOutcome;
  /** Free: yields the turn. Two yields in a row end the game. */
  passTurn: (player: PlayerType) => MoveOutcome;
  /** The human forcing the agent to yield; counts as an agent pass. */
  skipAgentTurn: () => MoveOutcome;
  /** Reverts the most recent action, which must be the agent's. */
  undoLastMove: () => MoveOutcome;
}

const initialState: GameState = {
  question: '',
  gamePhase: 'setup',
  nodes: [],
  currentPlayer: 'human',
  humanMoves: MOVES_PER_PLAYER,
  agentMoves: MOVES_PER_PLAYER,
  consecutivePasses: 0,
  history: [],
};

/** Why the board cannot be changed right now, or null when play is open. */
function blocked(state: GameState): string | null {
  if (state.gamePhase === 'setup') return 'The game has not started: choose a question first';
  if (state.gamePhase === 'ended') return 'The game is over';
  return null;
}

/** Why `player` cannot spend a move right now, or null if they can. */
function guardMove(state: GameState, player: PlayerType): string | null {
  const why = blocked(state);
  if (why) return why;
  if (state.currentPlayer !== player) {
    return player === 'agent'
      ? "It is the human's turn: wait for them to move or pass before acting"
      : "It is the agent's turn: wait for it to move, or skip it";
  }
  if (budgetOf(state, player) <= 0) return `The ${player} has no moves left`;
  return null;
}

export const useGameStore = create<GameStore>((set, get) => {
  /** Builds the history entry for an action, snapshotting nodes for undo. */
  const record = (
    type: ActionType,
    player: PlayerType,
    costsMove: boolean,
    fields: Pick<GameAction, 'nodeId' | 'parentId' | 'label' | 'kind'>,
  ): GameAction => ({
    type,
    player,
    costsMove,
    timestamp: Date.now(),
    before: get().nodes,
    ...fields,
  });

  /**
   * State changes shared by every move that costs a turn: charge the mover,
   * hand the turn to whoever can still play, and end the game when nobody can.
   */
  const spend = (player: PlayerType, action: GameAction, nodes: TreeNode[]) => {
    const state = get();
    const humanMoves = state.humanMoves - (player === 'human' ? 1 : 0);
    const agentMoves = state.agentMoves - (player === 'agent' ? 1 : 0);
    const next = resolveTurn(otherPlayer(player), humanMoves, agentMoves);
    set({
      nodes,
      humanMoves,
      agentMoves,
      consecutivePasses: 0,
      history: [...state.history, action],
      currentPlayer: next ?? state.currentPlayer,
      gamePhase: next ? 'playing' : 'ended',
    });
  };

  /** A pass or a skip. Costs nothing, but two in a row end the game. */
  const yieldTurn = (from: PlayerType, verb: string): MoveOutcome => {
    const state = get();
    const to = otherPlayer(from);
    const consecutivePasses = state.consecutivePasses + 1;
    if (consecutivePasses >= PASSES_TO_END) {
      set({ gamePhase: 'ended', consecutivePasses });
      return ok(`${capitalize(from)} ${verb}. Both players yielded in a row, so the game is over`);
    }
    if (budgetOf(state, to) <= 0) {
      set({ gamePhase: 'ended', consecutivePasses });
      return ok(`${capitalize(from)} ${verb} and the ${to} has no moves left, so the game is over`);
    }
    set({ currentPlayer: to, consecutivePasses });
    return ok(`${capitalize(from)} ${verb}. It is the ${to}'s turn`);
  };

  return {
    ...initialState,
    isVoiceConnected: false,

    setVoiceConnected: connected => set({ isVoiceConnected: connected }),

    startGame: question => {
      const trimmed = question.trim();
      if (!trimmed) return fail('Enter a question to start the game');
      nodeCounter = 0;
      set({ ...initialState, question: trimmed, gamePhase: 'playing' });
      return ok(`Game started: ${trimmed}`);
    },

    resetGame: () => {
      nodeCounter = 0;
      set({ ...initialState });
    },

    plant: (rawLabel, player, content = {}) => {
      const state = get();
      const why = guardMove(state, player);
      if (why) return fail(why);

      const label = rawLabel.trim();
      if (!label) return fail('A label is required');
      if (state.nodes.length > 0) return fail('Root already exists: branch from it instead');

      const parsed = parseContent(content);
      if (parsed.error) return fail(parsed.error);

      const root = withContent(
        { id: nextNodeId(), label, kind: 'root', parentId: null, createdBy: player, isGap: false },
        parsed.value,
      );
      const action = record('plant', player, true, { nodeId: root.id, label, kind: 'root' });
      spend(player, action, [root]);
      return ok(`Planted root "${label}"`, root.id);
    },

    branch: (parentId, rawLabel, kind, player, content = {}) => {
      const state = get();
      const why = guardMove(state, player);
      if (why) return fail(why);

      const label = rawLabel.trim();
      if (!label) return fail('A label is required');
      if (!BRANCH_KINDS.includes(kind)) {
        return fail(
          `Kind must be one of ${BRANCH_KINDS.join(', ')}. A gap is a flag, not a kind: branch a node and then mark_gap it`,
        );
      }

      const parent = state.nodes.find(n => n.id === parentId);
      if (!parent) return fail('Parent node not found');

      const parsed = parseContent(content);
      if (parsed.error) return fail(parsed.error);

      // A resource or skill placed directly under a gap is the answer to it.
      const closesGap = parent.isGap && fillsGap(kind);
      const child = withContent(
        { id: nextNodeId(), label, kind, parentId, createdBy: player, isGap: false },
        parsed.value,
      );
      const nodes = [
        ...state.nodes.map(n => (closesGap && n.id === parentId ? clearGap(n) : n)),
        child,
      ];
      const action = record('branch', player, true, { nodeId: child.id, parentId, label, kind });
      spend(player, action, nodes);

      const summary = `Added ${capitalize(kind)} "${label}" under "${parent.label}"`;
      return ok(closesGap ? `${summary} — gap closed` : summary, child.id);
    },

    prune: (nodeId, player) => {
      const state = get();
      const why = guardMove(state, player);
      if (why) return fail(why);

      const node = state.nodes.find(n => n.id === nodeId);
      if (!node) return fail('Node not found');
      if (node.kind === 'root') return fail('Cannot prune the root');

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

      const action = record('prune', player, true, { nodeId, label: node.label, kind: node.kind });
      spend(player, action, state.nodes.filter(n => !toRemove.has(n.id)));
      return ok(`Pruned "${node.label}" and ${toRemove.size - 1} descendants`);
    },

    markGap: (nodeId, player, reason) => {
      const state = get();
      const why = guardMove(state, player);
      if (why) return fail(why);

      const node = state.nodes.find(n => n.id === nodeId);
      if (!node) return fail('Node not found');
      if (node.kind === 'root') return fail('The root cannot be a gap: mark one of its branches instead');
      if (node.isGap) return fail(`"${node.label}" is already a gap`);
      const filled = state.nodes.find(n => n.parentId === nodeId && fillsGap(n.kind));
      if (filled) {
        return fail(
          `"${node.label}" already has the ${filled.kind} "${filled.label}" under it, so it is not a gap`,
        );
      }

      const gapReason = reason?.trim() || undefined;
      const action = record('mark_gap', player, true, { nodeId, label: node.label, kind: node.kind });
      spend(
        player,
        action,
        state.nodes.map(n => {
          if (n.id !== nodeId) return n;
          const flagged: TreeNode = { ...n, isGap: true, gapReason };
          if (!gapReason) delete flagged.gapReason;
          return flagged;
        }),
      );
      return ok(`Marked "${node.label}" as a gap${gapReason ? `: ${gapReason}` : ''}`);
    },

    annotate: (nodeId, content, player) => {
      const state = get();
      const why = blocked(state);
      if (why) return fail(why);

      const node = state.nodes.find(n => n.id === nodeId);
      if (!node) return fail('Node not found');

      const parsed = parseContent(content);
      if (parsed.error) return fail(parsed.error);

      const changes: string[] = [];
      if ('note' in parsed.value) changes.push(parsed.value.note ? 'note' : 'cleared note');
      if ('url' in parsed.value) changes.push(parsed.value.url ? 'url' : 'cleared url');
      if (changes.length === 0) return fail('Provide a note or a url to annotate');

      const action = record('annotate', player, false, { nodeId, label: node.label, kind: node.kind });
      set({
        nodes: state.nodes.map(n => (n.id === nodeId ? withContent(n, parsed.value) : n)),
        history: [...state.history, action],
      });
      return ok(`Updated ${changes.join(' and ')} on "${node.label}"`);
    },

    passTurn: player => {
      const state = get();
      const why = blocked(state);
      if (why) return fail(why);
      if (state.currentPlayer !== player) return fail(`It is the ${state.currentPlayer}'s turn`);
      return yieldTurn(player, 'passed');
    },

    skipAgentTurn: () => {
      const state = get();
      const why = blocked(state);
      if (why) return fail(why);
      if (state.currentPlayer !== 'agent') return fail("It is not the agent's turn");
      return yieldTurn('agent', 'was skipped');
    },

    // Undo restores the snapshot taken before the action, so every kind of
    // action, prune included, comes back exactly as it was.
    undoLastMove: () => {
      const state = get();
      const why = blocked(state);
      if (why) return fail(why);

      const last = state.history[state.history.length - 1];
      if (!last) return fail('No moves to undo');
      if (last.player !== 'agent') return fail('Only the most recent agent action can be undone');

      const agentMoves = state.agentMoves + (last.costsMove ? 1 : 0);
      set({
        nodes: last.before,
        history: state.history.slice(0, -1),
        agentMoves,
        consecutivePasses: 0,
        currentPlayer: resolveTurn('human', state.humanMoves, agentMoves) ?? 'human',
      });
      return ok(`Undid: agent ${describeAction(last)}`);
    },
  };
});
