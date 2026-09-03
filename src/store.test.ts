import { beforeEach, describe, expect, it } from 'vitest';
import { computeScore } from './scoring';
import {
  MAX_ANNOUNCEMENT_CHARS,
  MAX_GROVE,
  MAX_NOTE_CHARS,
  MOVES_PER_PLAYER,
  OPENING_MOVES,
  PASSES_TO_END,
  type MoveOutcome,
  useGameStore,
} from './store';
import type { GameAction, NoteEdit, PlayerType, SavedGame, TreeNode } from './types';

const QUESTION = 'How should I learn agentic web apps?';

const state = () => useGameStore.getState();

const budget = (player: PlayerType) => (player === 'human' ? state().humanMoves : state().agentMoves);

function nodeById(id: string): TreeNode {
  const found = state().nodes.find(n => n.id === id);
  if (!found) throw new Error(`No node ${id} on the board`);
  return found;
}

function ok(outcome: MoveOutcome): string {
  expect(outcome.success, outcome.message).toBe(true);
  return outcome.nodeId ?? '';
}

function rejected(outcome: MoveOutcome): string {
  expect(outcome.success, outcome.message).toBe(false);
  return outcome.message;
}

/** The human plants the root during the opening, which ends it: the agent is on turn. */
function plantRoot(): string {
  return ok(state().plant(QUESTION, 'human'));
}

/** The agent plants and passes straight away, so the human is on turn. */
function agentOpensAndPasses(): string {
  const root = ok(state().plant(QUESTION, 'agent'));
  ok(state().passTurn('agent'));
  return root;
}

/** Alternating branches until the game ends. */
function playUntilBudgetsRunOut(root: string): void {
  while (state().gamePhase === 'playing') {
    const player = state().currentPlayer;
    ok(state().branch(root, `Topic ${state().nodes.length}`, 'concept', player));
  }
}

/** A whole one-node game on `question`, so a tree lands in the forest. */
function growQuickTree(question: string): void {
  state().resetGame();
  ok(state().startGame(question));
  ok(state().plant(question, 'human'));
  ok(state().passTurn('agent'));
  ok(state().passTurn('human'));
  expect(state().gamePhase).toBe('ended');
}

beforeEach(() => {
  state().resetGame();
  state().setGrove([]);
  state().setTrees([], null);
  ok(state().startGame(QUESTION));
});

describe('setup', () => {
  it('starts with the agent opening on an empty board and full, separate budgets', () => {
    expect(state().gamePhase).toBe('opening');
    expect(state().question).toBe(QUESTION);
    expect(state().nodes).toHaveLength(0);
    expect(state().humanMoves).toBe(MOVES_PER_PLAYER);
    expect(state().agentMoves).toBe(MOVES_PER_PLAYER);
    expect(state().currentPlayer).toBe('agent');
    expect(state().openingMovesUsed).toBe(0);
  });

  it('refuses an empty question and any move before the game starts', () => {
    state().resetGame();
    rejected(state().startGame('   '));
    expect(state().gamePhase).toBe('setup');
    rejected(state().branch('n1', 'Too early', 'concept', 'human'));
    rejected(state().passTurn('human'));
    rejected(state().skipAgentTurn());
    rejected(state().undoLastMove());
  });

  it('only plants on an empty board and never prunes the root', () => {
    const root = plantRoot();
    rejected(state().plant('Another root', 'agent'));
    rejected(state().prune(root, 'agent'));
    expect(state().nodes).toHaveLength(1);
  });
});

describe('opening', () => {
  it('lets the agent plant for free and stay in its opening', () => {
    const root = ok(state().plant(QUESTION, 'agent'));
    expect(root).toBe('n1');
    expect(state().gamePhase).toBe('opening');
    expect(state().currentPlayer).toBe('agent');
    expect(budget('agent')).toBe(MOVES_PER_PLAYER);
    expect(state().history.at(-1)).toMatchObject({ type: 'plant', costsMove: false, opening: true });
  });

  it('gives the agent free opening branches, then hands the board to the human', () => {
    const root = ok(state().plant(QUESTION, 'agent'));
    for (let i = 1; i < OPENING_MOVES; i++) {
      const move = state().branch(root, `Opening topic ${i}`, 'concept', 'agent');
      ok(move);
      expect(move.message).toContain(`opening move ${i} of ${OPENING_MOVES}`);
      expect(state().gamePhase).toBe('opening');
      expect(state().openingMovesUsed).toBe(i);
    }
    const last = state().branch(root, 'Last opening topic', 'concept', 'agent');
    ok(last);
    expect(last.message).toContain('opening is complete');
    expect(state().gamePhase).toBe('playing');
    expect(state().currentPlayer).toBe('human');
    expect(state().openingMovesUsed).toBe(OPENING_MOVES);
    expect(budget('agent')).toBe(MOVES_PER_PLAYER);
    expect(budget('human')).toBe(MOVES_PER_PLAYER);
    expect(state().history.every(action => !action.costsMove)).toBe(true);
  });

  it('ends the opening when the agent passes', () => {
    const root = ok(state().plant(QUESTION, 'agent'));
    ok(state().branch(root, 'Agent loops', 'concept', 'agent'));
    ok(state().passTurn('agent'));
    expect(state().gamePhase).toBe('playing');
    expect(state().currentPlayer).toBe('human');
    expect(state().consecutivePasses).toBe(0);
    expect(budget('agent')).toBe(MOVES_PER_PLAYER);
  });

  it('keeps the human out of board moves until they join, but lets them annotate', () => {
    const root = ok(state().plant(QUESTION, 'agent'));
    expect(rejected(state().branch(root, 'Too early', 'concept', 'human'))).toMatch(/join/i);
    expect(rejected(state().passTurn('human'))).toMatch(/join/i);
    expect(rejected(state().skipAgentTurn())).toMatch(/join/i);
    ok(state().annotate(root, { note: 'Start here' }, 'human'));
    expect(nodeById(root).note).toBe('Start here');
    expect(state().gamePhase).toBe('opening');
  });

  it('lets the human join, which ends the opening and gives them the turn', () => {
    const root = ok(state().plant(QUESTION, 'agent'));
    ok(state().joinGame());
    expect(state().gamePhase).toBe('playing');
    expect(state().currentPlayer).toBe('human');
    rejected(state().joinGame());
    ok(state().branch(root, 'My topic', 'concept', 'human'));
    expect(budget('human')).toBe(MOVES_PER_PLAYER - 1);
  });

  it('skips the opening when the human plants the root themselves', () => {
    plantRoot();
    expect(state().gamePhase).toBe('playing');
    expect(state().currentPlayer).toBe('agent');
    expect(budget('human')).toBe(MOVES_PER_PLAYER);
  });

  it('starts a game from the setup screen when either player plants', () => {
    state().resetGame();
    ok(state().plant('How do I get started with woodworking?', 'human'));
    expect(state().question).toBe('How do I get started with woodworking?');
    expect(state().gamePhase).toBe('playing');
    expect(state().currentPlayer).toBe('agent');
    expect(state().nodes).toHaveLength(1);

    state().resetGame();
    ok(state().plant('How should I learn to read Arabic?', 'agent'));
    expect(state().question).toBe('How should I learn to read Arabic?');
    expect(state().gamePhase).toBe('opening');
    expect(state().currentPlayer).toBe('agent');
    expect(state().openingMovesUsed).toBe(0);
  });

  it('undoes opening moves back into the opening, even after the human joined', () => {
    const root = ok(state().plant(QUESTION, 'agent'));
    ok(state().branch(root, 'First', 'concept', 'agent'));
    ok(state().branch(root, 'Second', 'concept', 'agent'));
    ok(state().joinGame());

    ok(state().undoLastMove());
    expect(state().gamePhase).toBe('opening');
    expect(state().currentPlayer).toBe('agent');
    expect(state().openingMovesUsed).toBe(1);
    expect(state().nodes).toHaveLength(2);

    ok(state().undoLastMove());
    expect(state().openingMovesUsed).toBe(0);
    expect(state().nodes).toHaveLength(1);

    ok(state().undoLastMove());
    expect(state().nodes).toHaveLength(0);
    expect(state().gamePhase).toBe('opening');
    expect(rejected(state().undoLastMove())).toBe('No moves to undo');
  });
});

describe('turns and budgets', () => {
  it('plants for free, charges each player their own budget and alternates the turn', () => {
    const root = plantRoot();
    expect(budget('human')).toBe(MOVES_PER_PLAYER);
    expect(budget('agent')).toBe(MOVES_PER_PLAYER);
    expect(state().currentPlayer).toBe('agent');
    expect(state().history.at(-1)?.costsMove).toBe(false);

    ok(state().branch(root, 'Agent loops', 'concept', 'agent'));
    expect(budget('human')).toBe(MOVES_PER_PLAYER);
    expect(budget('agent')).toBe(MOVES_PER_PLAYER - 1);
    expect(state().currentPlayer).toBe('human');
  });

  it('rejects a costly move made out of turn without charging anyone', () => {
    const root = plantRoot();
    const message = rejected(state().branch(root, 'Too early', 'concept', 'human'));
    expect(message).toMatch(/agent's turn/i);
    expect(budget('human')).toBe(MOVES_PER_PLAYER);
    expect(state().currentPlayer).toBe('agent');
  });

  it('lets annotate happen on either turn for free', () => {
    const root = plantRoot();
    ok(state().annotate(root, { note: 'Start here', url: 'https://example.com/start' }, 'human'));
    expect(nodeById(root).note).toBe('Start here');
    expect(nodeById(root).url).toContain('example.com');
    expect(budget('human')).toBe(MOVES_PER_PLAYER);
    expect(state().currentPlayer).toBe('agent');
    expect(state().history.at(-1)?.costsMove).toBe(false);
  });

  it('rejects an invalid url and clears a field with an empty string', () => {
    const root = plantRoot();
    rejected(state().annotate(root, { url: 'not a url' }, 'agent'));
    ok(state().annotate(root, { note: 'temporary' }, 'agent'));
    ok(state().annotate(root, { note: '' }, 'agent'));
    expect(nodeById(root).note).toBeUndefined();
  });

  it('treats pass as free and ends the game after two yields in a row', () => {
    plantRoot();
    ok(state().passTurn('agent'));
    expect(budget('agent')).toBe(MOVES_PER_PLAYER);
    expect(state().currentPlayer).toBe('human');
    expect(state().consecutivePasses).toBe(PASSES_TO_END - 1);

    ok(state().passTurn('human'));
    expect(state().gamePhase).toBe('ended');
  });

  it('resets the pass streak on a costly move', () => {
    const root = plantRoot();
    ok(state().passTurn('agent'));
    ok(state().branch(root, 'Fresh start', 'concept', 'human'));
    expect(state().consecutivePasses).toBe(0);
  });

  it('counts skipping the agent as the agent yielding', () => {
    plantRoot();
    ok(state().skipAgentTurn());
    expect(state().currentPlayer).toBe('human');
    expect(state().consecutivePasses).toBe(1);
    ok(state().passTurn('human'));
    expect(state().gamePhase).toBe('ended');
  });

  it('keeps giving the turn to the player who still has moves', () => {
    const root = plantRoot();
    for (let i = 1; i <= MOVES_PER_PLAYER; i++) {
      ok(state().passTurn('agent'));
      ok(state().branch(root, `Human topic ${i}`, 'concept', 'human'));
    }
    expect(budget('human')).toBe(0);
    expect(state().currentPlayer).toBe('agent');
    ok(state().branch(root, 'Agent topic', 'concept', 'agent'));
    expect(state().currentPlayer).toBe('agent');
  });

  it('ends the game when both budgets are spent', () => {
    const root = plantRoot();
    playUntilBudgetsRunOut(root);
    expect(budget('human')).toBe(0);
    expect(budget('agent')).toBe(0);
    expect(state().nodes).toHaveLength(2 * MOVES_PER_PLAYER + 1);
    rejected(state().branch(root, 'Late', 'concept', 'human'));
  });
});

describe('gaps', () => {
  it('closes a gap when a resource or skill is branched directly under it', () => {
    const root = plantRoot();
    const concept = ok(state().branch(root, 'Agent loops', 'concept', 'agent'));
    ok(state().markGap(concept, 'human', 'How would you build one?'));
    expect(nodeById(concept).isGap).toBe(true);
    expect(nodeById(concept).gapReason).toBe('How would you build one?');
    expect(nodeById(concept).kind).toBe('concept');

    const skill = state().branch(concept, 'Build a tool-calling loop', 'skill', 'agent');
    ok(skill);
    expect(skill.message).toContain('gap closed');
    expect(nodeById(concept).isGap).toBe(false);
    expect(nodeById(concept).gapReason).toBeUndefined();
  });

  it('keeps a gap open when only a concept is branched under it', () => {
    const root = plantRoot();
    const concept = ok(state().branch(root, 'Agent loops', 'concept', 'agent'));
    ok(state().markGap(concept, 'human'));
    ok(state().branch(concept, 'Sub-topic', 'concept', 'agent'));
    expect(nodeById(concept).isGap).toBe(true);
  });

  it('rejects marking the root, an existing gap, or a node with a resource or skill child', () => {
    const root = plantRoot();
    const concept = ok(state().branch(root, 'Agent loops', 'concept', 'agent'));
    rejected(state().markGap(root, 'human'));
    ok(state().markGap(concept, 'human'));
    rejected(state().markGap(concept, 'agent'));

    ok(state().branch(concept, 'A course', 'resource', 'agent'));
    expect(nodeById(concept).isGap).toBe(false);
    rejected(state().markGap(concept, 'human'));
    expect(budget('human')).toBe(MOVES_PER_PLAYER - 1);
  });
});

describe('undo', () => {
  it('restores a pruned subtree and refunds the agent one move', () => {
    const root = plantRoot();
    const concept = ok(state().branch(root, 'Agent loops', 'concept', 'agent'));
    const resource = ok(state().branch(concept, 'A course', 'resource', 'human'));
    ok(state().prune(concept, 'agent'));
    expect(state().nodes.map(n => n.id)).toEqual([root]);
    expect(budget('agent')).toBe(MOVES_PER_PLAYER - 2);

    ok(state().undoLastMove());
    expect(state().nodes.map(n => n.id)).toEqual([root, concept, resource]);
    expect(nodeById(resource).parentId).toBe(concept);
    expect(budget('agent')).toBe(MOVES_PER_PLAYER - 1);
    expect(state().currentPlayer).toBe('human');
    expect(state().history.at(-1)?.player).toBe('human');
  });

  it("only undoes the agent's most recent action", () => {
    const root = plantRoot();
    rejected(state().undoLastMove());
    ok(state().branch(root, 'Agent loops', 'concept', 'agent'));
    ok(state().branch(root, 'Human topic', 'concept', 'human'));
    rejected(state().undoLastMove());
    expect(state().nodes).toHaveLength(3);
  });

  it("reopens a game that the agent's move ended", () => {
    const root = agentOpensAndPasses();
    playUntilBudgetsRunOut(root);
    expect(state().history.at(-1)?.player).toBe('agent');
    ok(state().undoLastMove());
    expect(state().gamePhase).toBe('playing');
    expect(budget('agent')).toBe(1);
    expect(state().currentPlayer).toBe('agent');
  });

  it('is unavailable on a board opened from a share link', () => {
    const before: TreeNode[] = [
      { id: 'n1', label: QUESTION, kind: 'root', parentId: null, createdBy: 'human', isGap: false },
    ];
    const agentAction: GameAction = {
      type: 'branch',
      player: 'agent',
      timestamp: 0,
      nodeId: 'n2',
      costsMove: true,
      before,
    };
    const saved: SavedGame = {
      question: QUESTION,
      nodes: [...before, { ...before[0], id: 'n2', label: 'Topic', kind: 'concept', parentId: 'n1', createdBy: 'agent' }],
      humanMoves: 0,
      agentMoves: 0,
      currentPlayer: 'agent',
      gamePhase: 'ended',
      history: [agentAction],
      openingMovesUsed: 0,
    };
    state().loadGame(saved, { shared: true });
    rejected(state().undoLastMove());
    expect(state().nodes).toHaveLength(2);
  });
});

describe('loadGame', () => {
  it('continues numbering after the highest saved id', () => {
    const saved: SavedGame = {
      question: QUESTION,
      nodes: [
        { id: 'n1', label: QUESTION, kind: 'root', parentId: null, createdBy: 'human', isGap: false },
        { id: 'n7', label: 'Topic', kind: 'concept', parentId: 'n1', createdBy: 'agent', isGap: false },
      ],
      humanMoves: 3,
      agentMoves: 3,
      currentPlayer: 'human',
      gamePhase: 'playing',
      history: [],
      openingMovesUsed: 0,
    };
    state().loadGame(saved);
    const id = ok(state().branch('n1', 'Later topic', 'concept', 'human'));
    expect(id).toBe('n8');
    expect(new Set(state().nodes.map(n => n.id)).size).toBe(3);
  });

  it('resumes an interrupted opening', () => {
    const saved: SavedGame = {
      question: QUESTION,
      nodes: [{ id: 'n1', label: QUESTION, kind: 'root', parentId: null, createdBy: 'agent', isGap: false }],
      humanMoves: MOVES_PER_PLAYER,
      agentMoves: MOVES_PER_PLAYER,
      currentPlayer: 'agent',
      gamePhase: 'opening',
      history: [],
      openingMovesUsed: OPENING_MOVES - 1,
    };
    state().loadGame(saved);
    const move = state().branch('n1', 'Last opening topic', 'concept', 'agent');
    ok(move);
    expect(move.message).toContain('opening is complete');
    expect(state().gamePhase).toBe('playing');
  });
});

describe('forest', () => {
  it('plants the finished tree in the forest when the game ends', () => {
    const root = plantRoot();
    playUntilBudgetsRunOut(root);
    const { grove, nodes } = state();
    expect(grove).toHaveLength(1);
    expect(grove[0].question).toBe(QUESTION);
    expect(grove[0].nodes).toHaveLength(2 * MOVES_PER_PLAYER + 1);
    expect(grove[0].score).toBe(computeScore(nodes).total);
  });

  it('replaces the tree grown from the same question and survives a reset', () => {
    const root = plantRoot();
    playUntilBudgetsRunOut(root);
    const first = state().grove[0];

    growQuickTree(QUESTION);
    expect(state().grove).toHaveLength(1);
    expect(state().grove[0].id).toBe(first.id);
    expect(state().grove[0].nodes).toHaveLength(1);

    state().resetGame();
    expect(state().gamePhase).toBe('setup');
    expect(state().grove).toHaveLength(1);
  });

  it('keeps at most MAX_GROVE trees, felling the oldest first', () => {
    for (let i = 1; i <= MAX_GROVE + 1; i++) growQuickTree(`Question ${i}`);
    expect(state().grove).toHaveLength(MAX_GROVE);
    expect(state().grove[0].question).toBe('Question 2');
    expect(state().grove.at(-1)?.question).toBe(`Question ${MAX_GROVE + 1}`);
  });

  it('plants nothing when the game ends on an empty board', () => {
    ok(state().joinGame());
    ok(state().passTurn('human'));
    ok(state().passTurn('agent'));
    expect(state().gamePhase).toBe('ended');
    expect(state().grove).toHaveLength(0);
  });

  it('revisits a planted tree from any phase, parking the game being played', () => {
    const root = plantRoot();
    playUntilBudgetsRunOut(root);
    const tree = state().grove[0];
    rejected(state().openFromForest('not-a-tree'));

    state().resetGame();
    ok(state().openFromForest(tree.id));
    expect(state().gamePhase).toBe('ended');
    expect(state().question).toBe(QUESTION);
    expect(state().nodes).toEqual(tree.nodes);
    expect(state().isSharedView).toBe(false);

    ok(state().startGame('Another question'));
    ok(state().joinGame());
    ok(state().plant('Another question', 'human'));
    const parked = state().currentTreeId;
    ok(state().openFromForest(tree.id));
    expect(state().gamePhase).toBe('ended');
    expect(state().nodes).toEqual(tree.nodes);
    expect(state().trees.find(t => t.id === parked)?.game.gamePhase).toBe('playing');
  });

  it('fells a tree and drops the focus on it', () => {
    const root = plantRoot();
    playUntilBudgetsRunOut(root);
    const tree = state().grove[0];
    state().setFocusedTreeId(tree.id);
    state().removeFromForest(tree.id);
    expect(state().grove).toHaveLength(0);
    expect(state().focusedTreeId).toBeNull();
  });
});

describe('question index', () => {
  it('lists each started game as a tree and points at the one on the board', () => {
    expect(state().trees.map(t => t.game.question)).toEqual([QUESTION]);
    expect(state().currentTreeId).toBe(state().trees[0].id);
    ok(state().startGame('Second question'));
    expect(state().trees.map(t => t.game.question)).toEqual([QUESTION, 'Second question']);
    expect(state().currentTreeId).toBe(state().trees[1].id);
    expect(state().trees[0].game.gamePhase).toBe('opening');
  });

  it('parks the board with its moves and history when switching, and brings it back whole', () => {
    const root = plantRoot();
    ok(state().branch(root, 'Agent topic', 'concept', 'agent'));
    const first = state().currentTreeId ?? '';
    ok(state().startGame('Second question'));
    ok(state().plant('Second question', 'human'));
    const second = state().currentTreeId ?? '';
    expect(second).not.toBe(first);

    ok(state().switchTree(first));
    expect(state().currentTreeId).toBe(first);
    expect(state().question).toBe(QUESTION);
    expect(state().nodes).toHaveLength(2);
    expect(state().history).toHaveLength(2);
    expect(state().agentMoves).toBe(MOVES_PER_PLAYER - 1);
    expect(state().currentPlayer).toBe('human');
    expect(state().gamePhase).toBe('playing');
    expect(state().isSharedView).toBe(false);

    const parked = state().trees.find(t => t.id === second);
    expect(parked?.game.nodes).toHaveLength(1);
    expect(parked?.game.currentPlayer).toBe('agent');

    ok(state().switchTree(second));
    expect(state().question).toBe('Second question');
    expect(state().nodes).toHaveLength(1);
    ok(state().switchTree(second));
    rejected(state().switchTree('not-a-tree'));
  });

  it('keeps node ids unique within a tree after a switch', () => {
    plantRoot();
    ok(state().branch('n1', 'A', 'concept', 'agent'));
    const first = state().currentTreeId ?? '';
    ok(state().startGame('Second question'));
    ok(state().plant('Second question', 'human'));
    ok(state().switchTree(first));
    expect(ok(state().branch('n1', 'B', 'concept', 'human'))).toBe('n3');
  });

  it('closes the note editor and drops the selection and the announcement on a switch', () => {
    const root = plantRoot();
    ok(state().announce('Opening.'));
    state().openNoteEditor(root);
    const first = state().currentTreeId ?? '';
    ok(state().startGame('Second question'));
    ok(state().switchTree(first));
    expect(state().noteEditorNodeId).toBeNull();
    expect(state().selectedNodeId).toBeNull();
    expect(state().announcement).toBeNull();
  });

  it('starts a new tree beside the parked one and deletes trees from the index', () => {
    const first = state().currentTreeId ?? '';
    state().newTree();
    expect(state().gamePhase).toBe('setup');
    expect(state().currentTreeId).toBeNull();
    expect(state().trees.map(t => t.id)).toEqual([first]);

    ok(state().plant('Second question', 'human'));
    expect(state().trees).toHaveLength(2);
    const second = state().currentTreeId ?? '';
    expect(state().trees[1].game.nodes).toHaveLength(1);

    state().removeTree(first);
    expect(state().trees.map(t => t.id)).toEqual([second]);
    expect(state().gamePhase).toBe('playing');

    state().removeTree(second);
    expect(state().trees).toHaveLength(0);
    expect(state().gamePhase).toBe('setup');
    expect(state().currentTreeId).toBeNull();
  });

  it('drops the tree being played on reset, but keeps it on new tree', () => {
    state().resetGame();
    expect(state().trees).toHaveLength(0);
    ok(state().startGame(QUESTION));
    state().newTree();
    expect(state().trees).toHaveLength(1);
    expect(state().trees[0].game.question).toBe(QUESTION);
  });

  it('gives a shared board no entry and leaves the index alone', () => {
    const shared: SavedGame = {
      question: 'Shared question',
      nodes: [{ id: 'n1', label: 'Shared question', kind: 'root', parentId: null, createdBy: 'human', isGap: false }],
      humanMoves: 0,
      agentMoves: 0,
      currentPlayer: 'human',
      gamePhase: 'ended',
      history: [],
      openingMovesUsed: 0,
    };
    state().loadGame(shared, { shared: true });
    expect(state().currentTreeId).toBeNull();
    expect(state().trees).toHaveLength(1);
    state().resetGame();
    expect(state().trees).toHaveLength(1);
  });

  it('opens a planted tree through its own entry, keeping the history', () => {
    const root = plantRoot();
    playUntilBudgetsRunOut(root);
    const tree = state().grove[0];
    const played = state().currentTreeId ?? '';
    const moves = state().history.length;
    ok(state().startGame('Second question'));
    ok(state().openFromForest(tree.id));
    expect(state().currentTreeId).toBe(played);
    expect(state().history).toHaveLength(moves);
    expect(state().trees.map(t => t.game.question)).toEqual([QUESTION, 'Second question']);
  });

  it('adds a planted tree to the index when its game is gone', () => {
    const root = plantRoot();
    playUntilBudgetsRunOut(root);
    const tree = state().grove[0];
    state().resetGame();
    expect(state().trees).toHaveLength(0);
    ok(state().openFromForest(tree.id));
    expect(state().gamePhase).toBe('ended');
    expect(state().nodes).toEqual(tree.nodes);
    expect(state().trees).toHaveLength(1);
    expect(state().currentTreeId).toBe(state().trees[0].id);
    expect(state().trees[0].game.question).toBe(QUESTION);
  });
});

describe('announcements', () => {
  it('keeps only the latest line and numbers each one', () => {
    ok(state().announce('I am opening with three branches.'));
    const first = state().announcement;
    expect(first?.summary).toBe('I am opening with three branches.');
    expect(first?.handoff).toBeUndefined();
    ok(state().announce('Done opening.', '  Your turn: pick a branch to deepen.  '));
    const second = state().announcement;
    expect(second?.id).toBeGreaterThan(first?.id ?? 0);
    expect(second?.handoff).toBe('Your turn: pick a branch to deepen.');
    expect(state().history).toHaveLength(0);
    expect(state().currentPlayer).toBe('agent');
  });

  it('drops the line when dismissed, and when a game starts or resets', () => {
    ok(state().announce('Hello.'));
    state().dismissAnnouncement();
    expect(state().announcement).toBeNull();
    ok(state().announce('Hello again.'));
    ok(state().startGame(QUESTION));
    expect(state().announcement).toBeNull();
    ok(state().announce('And again.'));
    state().resetGame();
    expect(state().announcement).toBeNull();
  });

  it('rejects an empty or long-winded line', () => {
    rejected(state().announce('   '));
    rejected(state().announce('x'.repeat(MAX_ANNOUNCEMENT_CHARS + 1)));
    rejected(state().announce('Fine.', 'y'.repeat(MAX_ANNOUNCEMENT_CHARS + 1)));
    expect(state().announcement).toBeNull();
  });
});

describe('unmark gap', () => {
  it('lets the human clear a gap they marked, for free, and refunds the move', () => {
    const root = plantRoot();
    const concept = ok(state().branch(root, 'Agent loops', 'concept', 'agent'));
    ok(state().markGap(concept, 'human', 'Needs a resource'));
    expect(budget('human')).toBe(MOVES_PER_PLAYER - 1);
    expect(nodeById(concept).gapBy).toBe('human');
    const before = { turn: state().currentPlayer, agent: budget('agent'), moves: state().history.length };

    ok(state().unmarkGap(concept));
    expect(nodeById(concept).isGap).toBe(false);
    expect(nodeById(concept).gapReason).toBeUndefined();
    expect(nodeById(concept).gapBy).toBeUndefined();
    expect(budget('human')).toBe(MOVES_PER_PLAYER);
    expect(budget('agent')).toBe(before.agent);
    expect(state().currentPlayer).toBe(before.turn);

    const last = state().history[before.moves];
    expect(state().history).toHaveLength(before.moves + 1);
    expect(last.type).toBe('unmark_gap');
    expect(last.player).toBe('human');
    expect(last.costsMove).toBe(false);
  });

  it('refuses gaps the agent marked and nodes that are not gaps', () => {
    const root = plantRoot();
    const concept = ok(state().branch(root, 'Agent loops', 'concept', 'agent'));
    expect(rejected(state().unmarkGap(concept))).toContain('not a gap');

    ok(state().passTurn('human'));
    ok(state().markGap(concept, 'agent', 'Needs practice'));
    expect(nodeById(concept).gapBy).toBe('agent');
    expect(rejected(state().unmarkGap(concept))).toContain('marked yourself');
    expect(nodeById(concept).isGap).toBe(true);
    expect(budget('human')).toBe(MOVES_PER_PLAYER);
    rejected(state().unmarkGap('n99'));
  });

  it('lets the human mark the same node again once it is their turn', () => {
    const root = plantRoot();
    const concept = ok(state().branch(root, 'Agent loops', 'concept', 'agent'));
    ok(state().markGap(concept, 'human'));
    ok(state().unmarkGap(concept));
    // Unmarking did not hand the turn back: it is still the agent's.
    rejected(state().markGap(concept, 'human'));
    ok(state().branch(root, 'Another topic', 'concept', 'agent'));
    ok(state().markGap(concept, 'human', 'Second thoughts'));
    expect(nodeById(concept).gapReason).toBe('Second thoughts');
    expect(budget('human')).toBe(MOVES_PER_PLAYER - 1);
  });

  it('is blocked before the game starts and after it ends', () => {
    state().resetGame();
    rejected(state().unmarkGap('n1'));
    ok(state().startGame(QUESTION));
    const root = plantRoot();
    playUntilBudgetsRunOut(root);
    rejected(state().unmarkGap(root));
  });
});

describe('notes', () => {
  it('keeps a Markdown note up to the limit and refuses a longer one', () => {
    const root = plantRoot();
    const markdown = '# Heading\n\n- a list\n- with `code`\n\n[link](https://example.com)';
    ok(state().annotate(root, { note: markdown }, 'human'));
    expect(nodeById(root).note).toBe(markdown);

    ok(state().annotate(root, { note: 'x'.repeat(MAX_NOTE_CHARS) }, 'human'));
    expect(rejected(state().annotate(root, { note: 'x'.repeat(MAX_NOTE_CHARS + 1) }, 'human'))).toContain(
      String(MAX_NOTE_CHARS),
    );
    expect(nodeById(root).note).toHaveLength(MAX_NOTE_CHARS);
  });

  it('opens the editor on a node, selects it, and forgets it when the game resets', () => {
    const root = plantRoot();
    state().openNoteEditor(root);
    expect(state().noteEditorNodeId).toBe(root);
    expect(state().selectedNodeId).toBe(root);

    state().closeNoteEditor();
    expect(state().noteEditorNodeId).toBeNull();

    state().openNoteEditor(root);
    state().resetGame();
    expect(state().noteEditorNodeId).toBeNull();
  });
});

describe('co-writing a note', () => {
  const editNote = (nodeId: string, edit: NoteEdit, player: PlayerType = 'agent') =>
    state().editNote(nodeId, edit, player);

  it('appends a paragraph for free, on either turn, without touching the budgets', () => {
    const root = plantRoot();
    ok(state().annotate(root, { note: '# Plan' }, 'human'));
    const before = { history: state().history.length, player: state().currentPlayer, moves: budget('agent') };
    ok(editNote(root, { mode: 'append', text: '  ## From the agent\n\nFirst step.  ' }));
    expect(nodeById(root).note).toBe('# Plan\n\n## From the agent\n\nFirst step.');
    expect(state().currentPlayer).toBe(before.player);
    expect(budget('agent')).toBe(before.moves);
    expect(state().history).toHaveLength(before.history + 1);
    expect(state().history.at(-1)).toMatchObject({ type: 'annotate', player: 'agent', nodeId: root, costsMove: false });
    // The human writes on the agent's turn just the same.
    ok(editNote(root, { mode: 'append', text: 'Mine.' }, 'human'));
    expect(nodeById(root).note).toBe('# Plan\n\n## From the agent\n\nFirst step.\n\nMine.');
  });

  it('starts a note by appending to a node without one, and asks for text', () => {
    const root = plantRoot();
    ok(editNote(root, { mode: 'append', text: 'Fresh.' }));
    expect(nodeById(root).note).toBe('Fresh.');
    expect(rejected(editNote(root, { mode: 'append', text: '   ' }))).toContain('append');
  });

  it('replaces a passage that occurs exactly once, keeping the rest verbatim', () => {
    const root = plantRoot();
    ok(state().annotate(root, { note: 'Alpha, beta, gamma. $& stays.' }, 'human'));
    ok(editNote(root, { mode: 'replace', find: 'beta', text: 'BETA $1' }));
    expect(nodeById(root).note).toBe('Alpha, BETA $1, gamma. $& stays.');
    ok(editNote(root, { mode: 'replace', find: ' $& stays.', text: '' }));
    expect(nodeById(root).note).toBe('Alpha, BETA $1, gamma.');
  });

  it('refuses a passage that is missing or ambiguous, with a hint', () => {
    const root = plantRoot();
    ok(state().annotate(root, { note: 'one two one' }, 'human'));
    expect(rejected(editNote(root, { mode: 'replace', find: 'three', text: 'x' }))).toContain('get_node_state');
    expect(rejected(editNote(root, { mode: 'replace', find: 'one', text: 'x' }))).toContain('2 times');
    expect(rejected(editNote(root, { mode: 'replace', find: '  ', text: 'x' }))).toContain('find');
    expect(nodeById(root).note).toBe('one two one');
  });

  it('keeps the note under the cap', () => {
    const root = plantRoot();
    ok(state().annotate(root, { note: 'x'.repeat(MAX_NOTE_CHARS - 1) }, 'human'));
    expect(rejected(editNote(root, { mode: 'append', text: 'yy' }))).toContain(String(MAX_NOTE_CHARS));
    expect(nodeById(root).note).toHaveLength(MAX_NOTE_CHARS - 1);
  });

  it('is blocked before a game starts and once it has ended', () => {
    state().resetGame();
    expect(rejected(editNote('n1', { mode: 'append', text: 'x' }))).toContain('not started');
    ok(state().startGame(QUESTION));
    const root = plantRoot();
    playUntilBudgetsRunOut(root);
    expect(rejected(editNote(root, { mode: 'append', text: 'x' }))).toContain('over');
    expect(rejected(editNote('n999', { mode: 'append', text: 'x' }, 'human'))).toBeTruthy();
  });
});

describe('note history', () => {
  it('folds a run of note changes by one player on one node into a single undoable entry', () => {
    const root = plantRoot();
    const before = state().history.length;
    ok(state().annotate(root, { note: 'a' }, 'agent'));
    ok(state().annotate(root, { note: 'ab', url: 'https://example.com' }, 'agent'));
    ok(state().editNote(root, { mode: 'append', text: 'c' }, 'agent'));
    expect(state().history).toHaveLength(before + 1);
    expect(state().history.at(-1)).toMatchObject({ type: 'annotate', player: 'agent', nodeId: root });
    ok(state().undoLastMove());
    expect(nodeById(root).note).toBeUndefined();
    expect(nodeById(root).url).toBeUndefined();
    expect(state().history).toHaveLength(before);
  });

  it('starts a new entry when the player or the node changes', () => {
    const root = plantRoot();
    const child = ok(state().branch(root, 'Loops', 'concept', 'agent'));
    const before = state().history.length;
    ok(state().annotate(root, { note: 'a' }, 'human'));
    ok(state().annotate(root, { note: 'b' }, 'human'));
    ok(state().editNote(root, { mode: 'append', text: 'c' }, 'agent'));
    ok(state().editNote(root, { mode: 'append', text: 'd' }, 'human'));
    ok(state().annotate(child, { note: 'e' }, 'human'));
    expect(state().history.slice(before).map(action => `${action.player}:${action.nodeId}`)).toEqual([
      `human:${root}`,
      `agent:${root}`,
      `human:${root}`,
      `human:${child}`,
    ]);
  });
});
