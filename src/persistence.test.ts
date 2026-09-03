import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  STORAGE_KEY,
  TREES_KEY,
  buildShareUrl,
  loadIndex,
  restoreGame,
  startAutosave,
} from './persistence';
import { PERSIST_DEBOUNCE_MS, useGameStore, type MoveOutcome } from './store';
import type { SavedGame } from './types';

// Vitest runs in node: a Map stands in for localStorage and a bare object for
// window, which the share-link helpers only read and replaceState on.
const storage = new Map<string, string>();
const location = { hash: '', href: 'http://localhost/', pathname: '/', search: '' };
vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => void storage.set(key, value),
  removeItem: (key: string) => void storage.delete(key),
});
vi.stubGlobal('window', { location, history: { replaceState: () => undefined } });

const state = () => useGameStore.getState();

function ok(outcome: MoveOutcome): string {
  expect(outcome.success, outcome.message).toBe(true);
  return outcome.nodeId ?? '';
}

const flush = () => vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS + 1);

/** Forgets everything in memory, as a reload would, keeping what is on disk. */
function forget(): void {
  state().setTrees([], null);
  state().resetGame();
  state().setGrove([]);
}

const finished: SavedGame = {
  question: 'A finished question',
  nodes: [{ id: 'n1', label: 'A finished question', kind: 'root', parentId: null, createdBy: 'human', isGap: false }],
  humanMoves: 0,
  agentMoves: 0,
  currentPlayer: 'human',
  gamePhase: 'ended',
  history: [],
  openingMovesUsed: 0,
};

beforeEach(() => {
  vi.useFakeTimers();
  storage.clear();
  location.hash = '';
  forget();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the question index on disk', () => {
  it('saves every tree and brings back the one on the board', () => {
    const stop = startAutosave();
    ok(state().startGame('First question'));
    ok(state().plant('First question', 'human'));
    flush();
    const first = state().currentTreeId;
    state().newTree();
    ok(state().plant('Second question', 'human'));
    ok(state().branch('n1', 'A topic', 'concept', 'agent'));
    flush();
    stop();
    const second = state().currentTreeId;

    forget();
    expect(restoreGame()).toBe('saved');
    expect(state().question).toBe('Second question');
    expect(state().nodes).toHaveLength(2);
    expect(state().currentTreeId).toBe(second);
    expect(state().trees.map(t => t.id)).toEqual([first, second]);
    expect(state().trees[0].game.question).toBe('First question');
    expect(state().trees[0].game.nodes).toHaveLength(1);
    expect(state().trees[1].game.nodes).toHaveLength(2);
  });

  it('restores the index with nothing on the board after a new tree', () => {
    const stop = startAutosave();
    ok(state().startGame('First question'));
    flush();
    state().newTree();
    flush();
    stop();
    expect(storage.has(STORAGE_KEY)).toBe(false);

    forget();
    expect(restoreGame()).toBe('none');
    expect(state().gamePhase).toBe('setup');
    expect(state().currentTreeId).toBeNull();
    expect(state().trees.map(t => t.game.question)).toEqual(['First question']);
  });

  it('adopts a game saved before the index existed', () => {
    storage.set(STORAGE_KEY, JSON.stringify(finished));
    expect(restoreGame()).toBe('saved');
    expect(state().question).toBe(finished.question);
    expect(state().trees).toHaveLength(1);
    expect(state().trees[0].game.question).toBe(finished.question);
    expect(state().currentTreeId).toBe(state().trees[0].id);
  });

  it('skips entries that are not games', () => {
    storage.set(
      TREES_KEY,
      JSON.stringify({
        currentTreeId: 'gone',
        trees: [{ id: 'good', game: finished, updatedAt: 1 }, { id: 'bad', game: { question: 1 }, updatedAt: 1 }, 'junk'],
      }),
    );
    expect(loadIndex()).toEqual({ currentTreeId: null, trees: [{ id: 'good', game: finished, updatedAt: 1 }] });
  });

  it('keeps the index and the saved game while a shared board is open', () => {
    const stop = startAutosave();
    ok(state().startGame('My question'));
    ok(state().plant('My question', 'human'));
    flush();
    stop();
    const mine = state().currentTreeId;

    location.hash = new URL(buildShareUrl(finished)).hash;
    forget();
    expect(restoreGame()).toBe('shared');
    expect(state().isSharedView).toBe(true);
    expect(state().currentTreeId).toBeNull();
    expect(state().trees.map(t => t.id)).toEqual([mine]);

    const stopShared = startAutosave();
    state().selectNode('n1');
    flush();
    stopShared();
    expect(loadIndex().currentTreeId).toBe(mine);
    expect(JSON.parse(storage.get(STORAGE_KEY) ?? '{}').question).toBe('My question');

    // Leaving the link brings the viewer's own game back, still in its entry.
    location.hash = '';
    forget();
    expect(restoreGame()).toBe('saved');
    expect(state().question).toBe('My question');
    expect(state().currentTreeId).toBe(mine);
    expect(state().trees).toHaveLength(1);
  });
});
