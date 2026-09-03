import { beforeEach, describe, expect, it } from 'vitest';
import { applyMove, readBoard } from './moves';
import { MOVES_PER_PLAYER, useGameStore } from './store';

const QUESTION = 'How should I learn agentic web apps?';

beforeEach(() => {
  const state = useGameStore.getState();
  state.resetGame();
  state.startGame(QUESTION);
  // The human plants the root, so the agent is on turn.
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
