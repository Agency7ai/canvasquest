import { beforeEach, describe, expect, it } from 'vitest';
import { computeScore } from './scoring';
import {
  MAX_GROVE,
  MOVES_PER_PLAYER,
  OPENING_MOVES,
  PASSES_TO_END,
  type MoveOutcome,
  useGameStore,
} from './store';
import type { GameAction, PlayerType, SavedGame, TreeNode } from './types';

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

  it('revisits a planted tree only between games', () => {
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

    state().resetGame();
    ok(state().startGame(QUESTION));
    rejected(state().openFromForest(tree.id));
    ok(state().joinGame());
    rejected(state().openFromForest(tree.id));
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
