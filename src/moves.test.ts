import { beforeEach, describe, expect, it } from 'vitest';
import { ACTIVE_BOARD_ID } from './app-meta';
import { applyMove, readBoard } from './moves';
import { MAX_ANNOUNCEMENT_CHARS, MOVES_PER_PLAYER, OPENING_MOVES, useGameStore } from './store';

const QUESTION = 'How should I learn agentic web apps?';

beforeEach(() => {
  const state = useGameStore.getState();
  state.resetGame();
  state.setVisualization('forest');
  state.startGame(QUESTION);
  // The human plants the root, which ends the opening: the agent is on turn.
  state.plant(QUESTION, 'human');
});

describe('applyMove', () => {
  it('resolves a parent by label and reports the board after the move', () => {
    const result = applyMove('branch', { parentId: QUESTION, label: 'Agent loops', kind: 'concept' });
    expect(result.success, result.message).toBe(true);
    expect(result.board.totalNodes).toBe(2);
    expect(result.board.currentPlayer).toBe('human');
    expect(result.board.agentMoves).toBe(MOVES_PER_PLAYER - 1);
    expect(result.board.nodes.find(n => n.id === result.nodeId)?.createdBy).toBe('agent');
  });

  it('rejects the gap pseudo-kind and unknown kinds', () => {
    const gap = applyMove('branch', { parentId: 'n1', label: 'Missing bit', kind: 'gap' });
    expect(gap.success).toBe(false);
    expect(gap.message).toContain('mark_gap');
    const unknown = applyMove('branch', { parentId: 'n1', label: 'Odd', kind: 'idea' });
    expect(unknown.success).toBe(false);
    expect(unknown.board.agentMoves).toBe(MOVES_PER_PLAYER);
  });

  it('asks for get_board when a reference matches no single node', () => {
    const result = applyMove('prune', { nodeId: 'nothing like this' });
    expect(result.success).toBe(false);
    expect(result.message).toContain('No single node');
  });

  it('lists implicit gaps and the live score in the board', () => {
    const branch = applyMove('branch', { parentId: 'n1', label: 'Agent loops', kind: 'concept' });
    const board = readBoard();
    expect(board.implicitGaps).toEqual([branch.nodeId]);
    expect(board.openGaps).toEqual([branch.nodeId]);
    expect(board.score).toBe(5 + 5 + 10 - 5);
    expect(board.gamePhase).toBe('playing');
  });

  it('keeps annotate and get_board free', () => {
    const note = applyMove('annotate', { nodeId: 'n1', note: 'Start here' });
    expect(note.success, note.message).toBe(true);
    expect(note.board.agentMoves).toBe(MOVES_PER_PLAYER);
    expect(applyMove('get_board', {}).board.currentPlayer).toBe('agent');
  });
});

describe('get_node_state', () => {
  it('reads the node the human selected when no reference is given', () => {
    const branch = applyMove('branch', { parentId: 'n1', label: 'Agent loops', kind: 'concept' });
    useGameStore.getState().selectNode(branch.nodeId ?? null);
    const result = applyMove('get_node_state', {});
    expect(result.success, result.message).toBe(true);
    expect(result.node?.id).toBe(branch.nodeId);
    expect(result.node?.parentLabel).toBe(QUESTION);
    expect(result.node?.selected).toBe(true);
    expect(result.node?.childIds).toEqual([]);
    expect(result.board.agentMoves).toBe(MOVES_PER_PLAYER - 1);
  });

  it('reads a node by id or label and lists its children', () => {
    const branch = applyMove('branch', { parentId: 'n1', label: 'Agent loops', kind: 'concept' });
    const byLabel = applyMove('get_node_state', { nodeId: QUESTION });
    expect(byLabel.success, byLabel.message).toBe(true);
    expect(byLabel.node?.id).toBe('n1');
    expect(byLabel.node?.parentLabel).toBeNull();
    expect(byLabel.node?.childIds).toEqual([branch.nodeId]);
    expect(byLabel.node?.selected).toBe(false);
    expect(applyMove('get_node_state', { nodeId: 'n1' }).node?.kind).toBe('root');
  });

  it('explains when nothing is selected or the reference matches no node', () => {
    useGameStore.getState().selectNode(null);
    const none = applyMove('get_node_state', {});
    expect(none.success).toBe(false);
    expect(none.message).toContain('Nothing is selected');
    const missing = applyMove('get_node_state', { nodeId: 'nothing like this' });
    expect(missing.success).toBe(false);
    expect(missing.message).toContain('No single node');
  });
});

describe('readBoard', () => {
  it('exposes the opening, the selection, the visualization and the focused tree', () => {
    const state = useGameStore.getState();
    state.resetGame();
    state.startGame(QUESTION);
    expect(readBoard().gamePhase).toBe('opening');
    expect(readBoard().openingMovesLeft).toBe(OPENING_MOVES);
    expect(readBoard().focusedTree).toBeNull();
    expect(readBoard().visualization).toBe('forest');

    state.setVisualization('board');
    state.setFocusedTreeId(ACTIVE_BOARD_ID);
    const board = readBoard();
    expect(board.visualization).toBe('board');
    expect(board.focusedTree).toEqual({ id: ACTIVE_BOARD_ID, question: QUESTION, isActive: true });
    expect(board.selectedNodeId).toBeNull();

    state.setFocusedTreeId('not-a-tree');
    expect(readBoard().focusedTree).toBeNull();
  });
});

describe('the agent opening through the tools', () => {
  it('plants and grows for free, then passes the board to the human', () => {
    const state = useGameStore.getState();
    state.resetGame();
    state.startGame(QUESTION);

    const plant = applyMove('plant', { label: QUESTION });
    expect(plant.success, plant.message).toBe(true);
    expect(plant.board.gamePhase).toBe('opening');
    expect(plant.board.currentPlayer).toBe('agent');

    const branch = applyMove('branch', { parentId: QUESTION, label: 'Agent loops', kind: 'concept' });
    expect(branch.success, branch.message).toBe(true);
    expect(branch.message).toContain(`opening move 1 of ${OPENING_MOVES}`);
    expect(branch.board.agentMoves).toBe(MOVES_PER_PLAYER);
    expect(branch.board.openingMovesLeft).toBe(OPENING_MOVES - 1);

    const pass = applyMove('pass', {});
    expect(pass.success, pass.message).toBe(true);
    expect(pass.board.gamePhase).toBe('playing');
    expect(pass.board.currentPlayer).toBe('human');
    expect(pass.board.openingMovesLeft).toBe(0);
  });

  it('starts a game from the setup screen when the agent plants', () => {
    useGameStore.getState().resetGame();
    const result = applyMove('plant', { label: 'How do I get started with woodworking?' });
    expect(result.success, result.message).toBe(true);
    expect(result.board.question).toBe('How do I get started with woodworking?');
    expect(result.board.gamePhase).toBe('opening');
  });
});

describe('announce', () => {
  it("shows the agent's words without spending a move or changing the turn", () => {
    applyMove('branch', { parentId: QUESTION, label: 'Agent loops', kind: 'concept' });
    const movesBefore = useGameStore.getState().history.length;
    const result = applyMove('announce', {
      summary: '  I added Agent loops under the root.  ',
      handoff: 'Your turn: put a resource under it.',
    });
    expect(result.success, result.message).toBe(true);
    expect(result.board.currentPlayer).toBe('human');
    expect(result.board.agentMoves).toBe(MOVES_PER_PLAYER - 1);
    expect(result.board.totalNodes).toBe(2);
    expect(useGameStore.getState().history).toHaveLength(movesBefore);
    expect(useGameStore.getState().announcement).toMatchObject({
      summary: 'I added Agent loops under the root.',
      handoff: 'Your turn: put a resource under it.',
    });
  });

  it('is free in every phase, even before a game starts', () => {
    useGameStore.getState().resetGame();
    const result = applyMove('announce', { summary: 'Tell me what you want to learn.' });
    expect(result.success, result.message).toBe(true);
    expect(result.board.gamePhase).toBe('setup');
    expect(useGameStore.getState().announcement?.handoff).toBeUndefined();
  });

  it('rejects an empty or long-winded announcement', () => {
    expect(applyMove('announce', {}).success).toBe(false);
    expect(applyMove('announce', { summary: '   ' }).success).toBe(false);
    expect(applyMove('announce', { summary: 'x'.repeat(MAX_ANNOUNCEMENT_CHARS + 1) }).success).toBe(false);
    expect(
      applyMove('announce', { summary: 'Short.', handoff: 'y'.repeat(MAX_ANNOUNCEMENT_CHARS + 1) }).success,
    ).toBe(false);
    expect(useGameStore.getState().announcement).toBeNull();
  });
});

describe('edit_note', () => {
  it('appends to and edits a note by label, for free, without ending the turn', () => {
    const movesBefore = useGameStore.getState().history.length;
    const appended = applyMove('edit_note', { nodeId: QUESTION, mode: 'append', text: '## Plan\n\nRead the docs.' });
    expect(appended.success, appended.message).toBe(true);
    expect(appended.nodeId).toBe('n1');
    expect(appended.board.currentPlayer).toBe('agent');
    expect(appended.board.agentMoves).toBe(MOVES_PER_PLAYER);
    expect(appended.board.nodes[0].note).toBe('## Plan\n\nRead the docs.');

    const edited = applyMove('edit_note', {
      nodeId: 'n1',
      mode: ' Replace ',
      find: 'Read the docs.',
      text: 'Read the docs, then build something.',
    });
    expect(edited.success, edited.message).toBe(true);
    expect(edited.board.nodes[0].note).toBe('## Plan\n\nRead the docs, then build something.');
    // One run of edits by the agent is one entry in the history.
    expect(useGameStore.getState().history).toHaveLength(movesBefore + 1);
  });

  it('explains a bad mode, a missing passage and an unknown node', () => {
    const mode = applyMove('edit_note', { nodeId: 'n1', mode: 'insert', text: 'x' });
    expect(mode.success).toBe(false);
    expect(mode.message).toContain('append or replace');
    expect(applyMove('edit_note', { nodeId: 'n1', mode: 'replace', text: 'x' }).message).toContain('find');
    const missing = applyMove('edit_note', { nodeId: 'n1', mode: 'replace', find: 'nowhere', text: 'x' });
    expect(missing.success).toBe(false);
    expect(missing.message).toContain('get_node_state');
    const unknown = applyMove('edit_note', { nodeId: 'No such node', mode: 'append', text: 'x' });
    expect(unknown.success).toBe(false);
    expect(useGameStore.getState().nodes[0].note).toBeUndefined();
  });
});
