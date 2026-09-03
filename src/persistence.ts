import { PERSIST_DEBOUNCE_MS, useGameStore } from './store';
import type { GameAction, PlantedTree, SavedGame, TreeNode } from './types';

export const STORAGE_KEY = 'canvasquest:game';

/** The forest's planted trees, kept apart from the game so a reset never fells them. */
export const GROVE_KEY = 'canvasquest:grove';

/** The URL fragment that carries a shared board, e.g. "#game=eyJ...". */
const HASH_PREFIX = '#game=';

const KINDS: readonly string[] = ['root', 'concept', 'resource', 'skill'];
const PLAYERS: readonly string[] = ['human', 'agent'];
const PHASES: readonly string[] = ['setup', 'opening', 'playing', 'ended'];
const ACTIONS: readonly string[] = ['plant', 'branch', 'prune', 'mark_gap', 'annotate'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const optionalString = (value: unknown) => value === undefined || typeof value === 'string';

function isTreeNode(value: unknown): value is TreeNode {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.label === 'string' &&
    KINDS.includes(value.kind as string) &&
    (value.parentId === null || typeof value.parentId === 'string') &&
    PLAYERS.includes(value.createdBy as string) &&
    typeof value.isGap === 'boolean' &&
    optionalString(value.gapReason) &&
    optionalString(value.note) &&
    optionalString(value.url)
  );
}

function isGameAction(value: unknown): value is GameAction {
  if (!isRecord(value)) return false;
  return (
    ACTIONS.includes(value.type as string) &&
    PLAYERS.includes(value.player as string) &&
    typeof value.timestamp === 'number' &&
    typeof value.costsMove === 'boolean' &&
    (value.opening === undefined || typeof value.opening === 'boolean') &&
    Array.isArray(value.before) &&
    value.before.every(isTreeNode) &&
    optionalString(value.nodeId) &&
    optionalString(value.parentId) &&
    optionalString(value.label) &&
    (value.kind === undefined || KINDS.includes(value.kind as string))
  );
}

/** Saved data comes from localStorage or a URL, so it is checked field by field. */
export function isSavedGame(value: unknown): value is SavedGame {
  if (!isRecord(value)) return false;
  return (
    typeof value.question === 'string' &&
    Array.isArray(value.nodes) &&
    value.nodes.every(isTreeNode) &&
    Number.isFinite(value.humanMoves) &&
    Number.isFinite(value.agentMoves) &&
    Number.isFinite(value.openingMovesUsed) &&
    PLAYERS.includes(value.currentPlayer as string) &&
    PHASES.includes(value.gamePhase as string) &&
    Array.isArray(value.history) &&
    value.history.every(isGameAction)
  );
}

/** Games saved before the opening existed carry no opening counter. */
const withDefaults = (value: Record<string, unknown>): Record<string, unknown> => ({
  ...value,
  openingMovesUsed: value.openingMovesUsed ?? 0,
});

/** Picks the persisted fields out of the store state. */
export function snapshotGame(state: SavedGame): SavedGame {
  return {
    question: state.question,
    nodes: state.nodes,
    humanMoves: state.humanMoves,
    agentMoves: state.agentMoves,
    currentPlayer: state.currentPlayer,
    gamePhase: state.gamePhase,
    history: state.history,
    openingMovesUsed: state.openingMovesUsed,
  };
}

// ---------------------------------------------------------------------------
// localStorage
// ---------------------------------------------------------------------------

export function loadSavedGame(): SavedGame | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    const candidate = withDefaults(parsed);
    return isSavedGame(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

export function clearSavedGame(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable (private mode, quota); the game still plays.
  }
}

function writeSavedGame(saved: SavedGame): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // See clearSavedGame.
  }
}

// ---------------------------------------------------------------------------
// The grove: finished trees, kept until the viewer fells them
// ---------------------------------------------------------------------------

function isPlantedTree(value: unknown): value is PlantedTree {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.question === 'string' &&
    Array.isArray(value.nodes) &&
    value.nodes.every(isTreeNode) &&
    Number.isFinite(value.score) &&
    Number.isFinite(value.plantedAt)
  );
}

export function loadGrove(): PlantedTree[] {
  try {
    const raw = localStorage.getItem(GROVE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isPlantedTree) : [];
  } catch {
    return [];
  }
}

function writeGrove(grove: PlantedTree[]): void {
  try {
    localStorage.setItem(GROVE_KEY, JSON.stringify(grove));
  } catch {
    // See clearSavedGame.
  }
}

/** Stands the saved trees back up. A share link never hides the viewer's own forest. */
export function restoreGrove(): void {
  const grove = loadGrove();
  if (grove.length > 0) useGameStore.getState().setGrove(grove);
}

/**
 * Autosaves the game whenever it changes, debounced. A board that came from a
 * share link is never saved over the viewer's own game, and returning to setup
 * (reset or new game) clears both the save and the share fragment. The grove
 * is saved whenever a tree is planted or felled, whatever board is open.
 */
export function startAutosave(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let savedGrove = useGameStore.getState().grove;
  const unsubscribe = useGameStore.subscribe(() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const state = useGameStore.getState();
      if (state.grove !== savedGrove) {
        savedGrove = state.grove;
        writeGrove(state.grove);
      }
      if (state.isSharedView) return;
      if (state.gamePhase === 'setup') {
        clearSavedGame();
        clearShareHash();
        return;
      }
      writeSavedGame(snapshotGame(state));
      // A finished board that gets reopened (undo) must not keep a stale link.
      if (state.gamePhase !== 'ended') clearShareHash();
    }, PERSIST_DEBOUNCE_MS);
  });
  return () => {
    unsubscribe();
    clearTimeout(timer);
  };
}

// ---------------------------------------------------------------------------
// Share links: the finished board, minus history, as base64url JSON in the hash
// ---------------------------------------------------------------------------

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): string | null {
  try {
    const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    return new TextDecoder().decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
  } catch {
    return null;
  }
}

export function buildShareUrl(saved: SavedGame): string {
  const shared: Omit<SavedGame, 'history'> = {
    question: saved.question,
    nodes: saved.nodes,
    humanMoves: saved.humanMoves,
    agentMoves: saved.agentMoves,
    currentPlayer: saved.currentPlayer,
    gamePhase: 'ended',
    openingMovesUsed: 0,
  };
  const url = new URL(window.location.href);
  url.hash = `game=${toBase64Url(JSON.stringify(shared))}`;
  return url.toString();
}

/** Puts the share fragment in the address bar without a navigation. */
export function applyShareHash(saved: SavedGame): void {
  window.history.replaceState(null, '', buildShareUrl(saved));
}

export function clearShareHash(): void {
  if (!window.location.hash) return;
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
}

/** The board encoded in the current URL, always as a finished, read-only game. */
export function readShareHash(): SavedGame | null {
  const { hash } = window.location;
  if (!hash.startsWith(HASH_PREFIX)) return null;
  const json = fromBase64Url(hash.slice(HASH_PREFIX.length));
  if (!json) return null;
  try {
    const parsed: unknown = JSON.parse(json);
    if (!isRecord(parsed)) return null;
    const candidate = { ...parsed, history: [], gamePhase: 'ended', openingMovesUsed: 0 };
    return isSavedGame(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

/**
 * Restores the forest, then a shared board from the URL, else the autosaved
 * game. Runs once before the first render so nothing flashes.
 */
const sameBoard = (a: SavedGame, b: SavedGame) =>
  a.question === b.question && JSON.stringify(a.nodes) === JSON.stringify(b.nodes);

export function restoreGame(): 'shared' | 'saved' | 'none' {
  restoreGrove();
  const shared = readShareHash();
  const saved = loadSavedGame();
  if (shared) {
    // Reloading one's own finished game: the address bar already carries the
    // share hash, but the local save has the history and stays editable.
    if (saved && saved.gamePhase === 'ended' && sameBoard(saved, shared)) {
      useGameStore.getState().loadGame(saved);
      return 'saved';
    }
    useGameStore.getState().loadGame(shared, { shared: true });
    return 'shared';
  }
  if (saved && saved.gamePhase !== 'setup') {
    useGameStore.getState().loadGame(saved);
    return 'saved';
  }
  return 'none';
}
