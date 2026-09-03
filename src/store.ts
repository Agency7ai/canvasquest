import { create } from 'zustand';
import { computeScore, fillsGap } from './scoring';
import type {
  ActionType,
  GameAction,
  GameState,
  NodeContent,
  NodeKind,
  PlantedTree,
  PlayerType,
  SavedGame,
  TreeNode,
  Visualization,
} from './types';

// ---------------------------------------------------------------------------
// Rule constants
// ---------------------------------------------------------------------------

/** Moves each player gets. Planting, passing and annotating never spend one. */
export const MOVES_PER_PLAYER = 6;

/**
 * Free moves the agent makes on its own before the human joins. The opening
 * ends after this many, or as soon as the agent passes or the human joins.
 */
export const OPENING_MOVES = 3;

/** Turns yielded in a row (pass or skip, no move between) that end the game. */
export const PASSES_TO_END = 2;

/** Idle time on the human's turn, with a voice agent live, before the turn passes. */
export const IDLE_PASS_MS = 15_000;

/** Delay before an absent agent's turn is skipped automatically. */
export const AUTO_SKIP_MS = 1_000;

/** Debounce for writing the game to localStorage. */
export const PERSIST_DEBOUNCE_MS = 300;

/** Finished trees kept standing in the forest; the oldest falls when it is full. */
export const MAX_GROVE = 12;

/** Kinds a child node may have. The root is created only by plant. */
export const BRANCH_KINDS: readonly NodeKind[] = ['concept', 'resource', 'skill'];

// Short ids so a voice agent can say and hear them reliably.
let nodeCounter = 0;
const nextNodeId = () => `n${++nodeCounter}`;

/** Highest n<number> id in a node list, so restored games keep ids unique. */
function highestNodeNumber(nodes: TreeNode[]): number {
  return nodes.reduce((max, node) => {
    const match = /^n(\d+)$/.exec(node.id);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
}

const newTreeId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** The selection survives a change only if the node still exists. */
const keepSelection = (selectedNodeId: string | null, nodes: TreeNode[]) =>
  selectedNodeId !== null && nodes.some(n => n.id === selectedNodeId) ? selectedNodeId : null;

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

/**
 * Puts a finished board in the forest, replacing an older tree grown from the
 * same question. An empty board plants nothing. Newest trees come last.
 */
export function plantTree(grove: PlantedTree[], question: string, nodes: TreeNode[]): PlantedTree[] {
  if (nodes.length === 0) return grove;
  const existing = grove.find(tree => tree.question === question);
  const tree: PlantedTree = {
    id: existing?.id ?? newTreeId(),
    question,
    nodes,
    score: computeScore(nodes).total,
    plantedAt: Date.now(),
  };
  return [...grove.filter(t => t.question !== question), tree].slice(-MAX_GROVE);
}

interface GameStore extends GameState {
  isVoiceConnected: boolean;
  setVoiceConnected: (connected: boolean) => void;
  /** The node the human clicked, shared by the forest, the board and the controls. */
  selectedNodeId: string | null;
  selectNode: (nodeId: string | null) => void;
  /** True when the board came from a share link and must not be autosaved. */
  isSharedView: boolean;
  /** The forest is the default everywhere; the flat board is a labelled alternative. */
  visualization: Visualization;
  setVisualization: (visualization: Visualization) => void;
  /** The tree the viewer has stepped into, by board id, or null for the whole clearing. */
  focusedTreeId: string | null;
  setFocusedTreeId: (treeId: string | null) => void;
  /** Finished trees standing around the clearing. */
  grove: PlantedTree[];
  setGrove: (grove: PlantedTree[]) => void;
  loadGame: (saved: SavedGame, options?: { shared?: boolean }) => void;
  /** Starts a game on the question and hands the empty board to the agent to open. */
  startGame: (question: string) => MoveOutcome;
  resetGame: () => void;
  /** The human stepping in during the agent's opening; the opening ends. */
  joinGame: () => MoveOutcome;
  /**
   * Free. Before a game has started this starts one with the label as the
   * question; the agent doing so begins its opening.
   */
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
  /** Brings a planted tree back as the active, finished board. */
  openFromForest: (treeId: string) => MoveOutcome;
  removeFromForest: (treeId: string) => void;
}

const initialState: GameState = {
  question: '',
  gamePhase: 'setup',
  nodes: [],
  currentPlayer: 'human',
  humanMoves: MOVES_PER_PLAYER,
  agentMoves: MOVES_PER_PLAYER,
  consecutivePasses: 0,
  openingMovesUsed: 0,
  history: [],
};

const JOIN_HINT =
  'The agent is still setting up the board: press Join in to take over, or wait for it to pass';

const turnMessage = (player: PlayerType) =>
  player === 'agent'
    ? "It is the human's turn: wait for them to move or pass before acting"
    : "It is the agent's turn: wait for it to move, or skip it";

/** Why the board cannot be changed right now, or null when play is open. */
function blocked(state: GameState, player?: PlayerType): string | null {
  if (state.gamePhase === 'setup') {
    return player === 'agent'
      ? 'The game has not started: call plant with the question as its label to start one'
      : 'The game has not started: choose a question first';
  }
  if (state.gamePhase === 'ended') return 'The game is over';
  return null;
}

/** Why `player` cannot make a board move right now, or null if they can. */
function guardMove(state: GameState, player: PlayerType): string | null {
  const why = blocked(state, player);
  if (why) return why;
  // The opening belongs to the agent alone, and its moves there are free.
  if (state.gamePhase === 'opening') return player === 'agent' ? null : JOIN_HINT;
  if (state.currentPlayer !== player) return turnMessage(player);
  if (budgetOf(state, player) <= 0) return `The ${player} has no moves left`;
  return null;
}

export const useGameStore = create<GameStore>((set, get) => {
  /** Builds the history entry for an action, snapshotting nodes for undo. */
  const record = (
    type: ActionType,
    player: PlayerType,
    costsMove: boolean,
    fields: Pick<GameAction, 'nodeId' | 'parentId' | 'label' | 'kind' | 'opening'>,
  ): GameAction => ({
    type,
    player,
    costsMove,
    timestamp: Date.now(),
    before: get().nodes,
    ...fields,
  });

  /** Ends the game and plants the finished tree in the forest. */
  const endGame = (patch: Partial<GameState> = {}) => {
    const state = get();
    const nodes = patch.nodes ?? state.nodes;
    set({ ...patch, gamePhase: 'ended', grove: plantTree(state.grove, state.question, nodes) });
  };

  const finalScore = (nodes: TreeNode[]) =>
    `. The game is over: final score ${computeScore(nodes).total} out of 100`;

  /**
   * State changes shared by every board move. In the opening the agent's move
   * is free and counted; otherwise the mover is charged, the turn goes to
   * whoever can still play, and the game ends when nobody can. Returns what to
   * append to the move's message.
   */
  const spend = (player: PlayerType, action: GameAction, nodes: TreeNode[]): string => {
    const state = get();
    const selectedNodeId = keepSelection(state.selectedNodeId, nodes);

    if (state.gamePhase === 'opening') {
      const openingMovesUsed = state.openingMovesUsed + 1;
      const complete = openingMovesUsed >= OPENING_MOVES;
      set({
        nodes,
        openingMovesUsed,
        consecutivePasses: 0,
        history: [...state.history, { ...action, costsMove: false, opening: true }],
        gamePhase: complete ? 'playing' : 'opening',
        currentPlayer: complete ? 'human' : 'agent',
        selectedNodeId,
      });
      return complete
        ? ". The opening is complete: it is the human's turn"
        : ` (opening move ${openingMovesUsed} of ${OPENING_MOVES})`;
    }

    const humanMoves = state.humanMoves - (player === 'human' ? 1 : 0);
    const agentMoves = state.agentMoves - (player === 'agent' ? 1 : 0);
    const next = resolveTurn(otherPlayer(player), humanMoves, agentMoves);
    const patch = {
      nodes,
      humanMoves,
      agentMoves,
      consecutivePasses: 0,
      history: [...state.history, action],
      selectedNodeId,
    };
    if (next) {
      set({ ...patch, currentPlayer: next, gamePhase: 'playing' });
      return '';
    }
    endGame(patch);
    return finalScore(nodes);
  };

  /** A pass or a skip. Costs nothing, but two in a row end the game. */
  const yieldTurn = (from: PlayerType, verb: string): MoveOutcome => {
    const state = get();
    const to = otherPlayer(from);
    const consecutivePasses = state.consecutivePasses + 1;
    if (consecutivePasses >= PASSES_TO_END) {
      endGame({ consecutivePasses });
      return ok(
        `${capitalize(from)} ${verb}. Both players yielded in a row, so the game is over${finalScore(state.nodes)}`,
      );
    }
    if (budgetOf(state, to) <= 0) {
      endGame({ consecutivePasses });
      return ok(
        `${capitalize(from)} ${verb} and the ${to} has no moves left, so the game is over${finalScore(state.nodes)}`,
      );
    }
    set({ currentPlayer: to, consecutivePasses });
    return ok(`${capitalize(from)} ${verb}. It is the ${to}'s turn`);
  };

  return {
    ...initialState,
    isVoiceConnected: false,
    selectedNodeId: null,
    isSharedView: false,
    visualization: 'forest',
    focusedTreeId: null,
    grove: [],

    setVoiceConnected: connected => set({ isVoiceConnected: connected }),

    selectNode: nodeId => set({ selectedNodeId: nodeId }),

    setVisualization: visualization => set({ visualization }),

    setFocusedTreeId: treeId => set({ focusedTreeId: treeId }),

    setGrove: grove => set({ grove }),

    loadGame: (saved, options = {}) => {
      nodeCounter = Math.max(
        highestNodeNumber(saved.nodes),
        ...saved.history.map(action => highestNodeNumber(action.before)),
      );
      set({
        question: saved.question,
        nodes: saved.nodes,
        humanMoves: saved.humanMoves,
        agentMoves: saved.agentMoves,
        currentPlayer: saved.currentPlayer,
        gamePhase: saved.gamePhase,
        history: saved.history,
        openingMovesUsed: saved.openingMovesUsed,
        consecutivePasses: 0,
        selectedNodeId: null,
        focusedTreeId: null,
        isSharedView: options.shared ?? false,
      });
    },

    startGame: question => {
      const trimmed = question.trim();
      if (!trimmed) return fail('Enter a question to start the game');
      nodeCounter = 0;
      set({
        ...initialState,
        question: trimmed,
        gamePhase: 'opening',
        currentPlayer: 'agent',
        selectedNodeId: null,
        focusedTreeId: null,
        isSharedView: false,
      });
      return ok(`Game started: "${trimmed}". The agent opens`);
    },

    resetGame: () => {
      nodeCounter = 0;
      set({ ...initialState, selectedNodeId: null, focusedTreeId: null, isSharedView: false });
    },

    joinGame: () => {
      const state = get();
      if (state.gamePhase !== 'opening') {
        return fail(state.gamePhase === 'playing' ? 'You are already in the game' : (blocked(state) ?? ''));
      }
      set({ gamePhase: 'playing', currentPlayer: 'human', consecutivePasses: 0 });
      return ok(
        state.nodes.length === 0
          ? 'You joined the game: plant the root to begin'
          : 'You joined the game: it is your turn',
      );
    },

    plant: (rawLabel, player, content = {}) => {
      const state = get();
      if (state.gamePhase === 'ended') return fail('The game is over');
      if (state.nodes.length > 0) return fail('Root already exists: branch from it instead');
      if (state.gamePhase === 'playing' && state.currentPlayer !== player) {
        return fail(turnMessage(player));
      }

      const label = rawLabel.trim();
      if (!label) return fail('A label is required');

      const parsed = parseContent(content);
      if (parsed.error) return fail(parsed.error);

      // Before a game exists the root's label is the question, and the mover
      // has started a game. The agent planting before the human has joined
      // is the start of its opening.
      const starting = state.gamePhase === 'setup';
      if (starting) nodeCounter = 0;
      const agentOpens = player === 'agent' && state.gamePhase !== 'playing';
      const root = withContent(
        { id: nextNodeId(), label, kind: 'root', parentId: null, createdBy: player, isGap: false },
        parsed.value,
      );
      const action = record('plant', player, false, {
        nodeId: root.id,
        label,
        kind: 'root',
        ...(agentOpens ? { opening: true } : {}),
      });
      set({
        ...(starting ? { ...initialState, question: label, isSharedView: false } : {}),
        nodes: [root],
        history: [...(starting ? [] : state.history), action],
        consecutivePasses: 0,
        gamePhase: agentOpens ? 'opening' : 'playing',
        currentPlayer: agentOpens ? 'agent' : otherPlayer(player),
        selectedNodeId: null,
      });
      return ok(
        agentOpens
          ? `Planted root "${label}". Grow up to ${OPENING_MOVES} opening branches, then pass`
          : `Planted root "${label}". It is the ${otherPlayer(player)}'s turn`,
        root.id,
      );
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
      const suffix = spend(player, action, nodes);

      const summary = `Added ${capitalize(kind)} "${label}" under "${parent.label}"`;
      return ok(`${closesGap ? `${summary} — gap closed` : summary}${suffix}`, child.id);
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
      const suffix = spend(player, action, state.nodes.filter(n => !toRemove.has(n.id)));
      return ok(`Pruned "${node.label}" and ${toRemove.size - 1} descendants${suffix}`);
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
      const suffix = spend(
        player,
        action,
        state.nodes.map(n => {
          if (n.id !== nodeId) return n;
          const flagged: TreeNode = { ...n, isGap: true, gapReason };
          if (!gapReason) delete flagged.gapReason;
          return flagged;
        }),
      );
      return ok(`Marked "${node.label}" as a gap${gapReason ? `: ${gapReason}` : ''}${suffix}`);
    },

    annotate: (nodeId, content, player) => {
      const state = get();
      const why = blocked(state, player);
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
      const why = blocked(state, player);
      if (why) return fail(why);
      if (state.gamePhase === 'opening') {
        // The agent passing is how the opening should end; the human has a
        // Join button for stepping in and no reason to pass.
        if (player === 'human') return fail(JOIN_HINT);
        set({ gamePhase: 'playing', currentPlayer: 'human', consecutivePasses: 0 });
        return ok("Agent finished the opening. It is the human's turn");
      }
      if (state.currentPlayer !== player) return fail(`It is the ${state.currentPlayer}'s turn`);
      return yieldTurn(player, 'passed');
    },

    skipAgentTurn: () => {
      const state = get();
      const why = blocked(state);
      if (why) return fail(why);
      if (state.gamePhase === 'opening') {
        return fail('The agent is setting up the board: press Join in to take over instead of skipping');
      }
      if (state.currentPlayer !== 'agent') return fail("It is not the agent's turn");
      return yieldTurn('agent', 'was skipped');
    },

    // Undo restores the snapshot taken before the action, so every kind of
    // action, prune included, comes back exactly as it was.
    undoLastMove: () => {
      const state = get();
      if (state.gamePhase === 'setup') return fail(blocked(state) ?? 'The game has not started');
      if (state.isSharedView) return fail('A board opened from a share link is read-only');

      const last = state.history[state.history.length - 1];
      if (!last) return fail('No moves to undo');
      if (last.player !== 'agent') return fail('Only the most recent agent action can be undone');

      // Undoing an opening move puts the agent back in its opening, one move
      // earlier, whether or not the human has joined since; Join is one click.
      if (last.opening) {
        set({
          nodes: last.before,
          history: state.history.slice(0, -1),
          consecutivePasses: 0,
          gamePhase: 'opening',
          currentPlayer: 'agent',
          openingMovesUsed:
            last.type === 'plant' ? state.openingMovesUsed : Math.max(0, state.openingMovesUsed - 1),
          selectedNodeId: keepSelection(state.selectedNodeId, last.before),
        });
        return ok(`Undid: agent ${describeAction(last)}. The agent is back in its opening`);
      }

      // Undo is also allowed once the game is over: the agent's final move may
      // have been the one that ended it, and the human gets to contest it.
      const agentMoves = state.agentMoves + (last.costsMove ? 1 : 0);
      const nextPlayer = resolveTurn('human', state.humanMoves, agentMoves);
      const reopened = state.gamePhase === 'ended' && nextPlayer !== null;
      set({
        nodes: last.before,
        history: state.history.slice(0, -1),
        agentMoves,
        consecutivePasses: 0,
        currentPlayer: nextPlayer ?? 'human',
        gamePhase: reopened ? 'playing' : state.gamePhase,
        selectedNodeId: keepSelection(state.selectedNodeId, last.before),
      });
      return ok(`Undid: agent ${describeAction(last)}${reopened ? ' — the game is back on' : ''}`);
    },

    openFromForest: treeId => {
      const state = get();
      if (state.gamePhase === 'opening' || state.gamePhase === 'playing') {
        return fail('Finish or reset the current game before revisiting a planted tree');
      }
      const tree = state.grove.find(t => t.id === treeId);
      if (!tree) return fail('That tree is no longer in the forest');
      get().loadGame({
        question: tree.question,
        nodes: tree.nodes,
        humanMoves: 0,
        agentMoves: 0,
        currentPlayer: 'human',
        gamePhase: 'ended',
        history: [],
        openingMovesUsed: 0,
      });
      return ok(`Revisiting "${tree.question}"`);
    },

    removeFromForest: treeId => {
      const state = get();
      set({
        grove: state.grove.filter(tree => tree.id !== treeId),
        focusedTreeId: state.focusedTreeId === treeId ? null : state.focusedTreeId,
      });
    },
  };
});
