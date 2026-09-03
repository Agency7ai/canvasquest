import type { NodeKind, PlayerType, TreeNode } from './types';

// ---------------------------------------------------------------------------
// Scoring constants. Everything here is a pure function of the node list, so
// the store, the UI and the tests can all share one implementation.
// ---------------------------------------------------------------------------

/** Points per concept that has at least one resource or skill beneath it. */
export const COVERAGE_PER_CONCEPT = 6;
export const COVERAGE_MAX = 30;

/** Points per level of depth beyond the root, up to DEPTH_MAX_LEVELS. */
export const DEPTH_PER_LEVEL = 5;
export const DEPTH_MAX_LEVELS = 3;

/** Points for having at least one node of each non-root kind. */
export const BALANCE_PER_KIND = 5;

/** Points when both players created at least MIN_NODES_FULL / MIN_NODES_HALF nodes. */
export const AUTHORSHIP_FULL = 20;
export const AUTHORSHIP_HALF = 10;
export const AUTHORSHIP_FULL_MIN_NODES = 2;
export const AUTHORSHIP_HALF_MIN_NODES = 1;

/** Points per node carrying a note or a url, up to CONTENT_MAX. */
export const CONTENT_PER_NODE = 1;
export const CONTENT_MAX = 10;

/** Points lost per gap (explicit or implicit) still open. */
export const GAP_PENALTY = 5;

export const SCORE_MIN = 0;
export const SCORE_MAX = 100;

export interface ScoreBreakdown {
  total: number;
  coverage: number;
  depth: number;
  balance: number;
  authorship: number;
  content: number;
  /** Total penalty already subtracted from total, as a positive number. */
  gapPenalty: number;
  /** Ids of every open gap, explicit and implicit, without duplicates. */
  openGaps: string[];
}

/** Resources and skills are what fill a gap and give a concept coverage. */
export function fillsGap(kind: NodeKind): boolean {
  return kind === 'resource' || kind === 'skill';
}

function childrenOf(nodes: TreeNode[]): Map<string | null, TreeNode[]> {
  const map = new Map<string | null, TreeNode[]>();
  for (const node of nodes) {
    const siblings = map.get(node.parentId);
    if (siblings) siblings.push(node);
    else map.set(node.parentId, [node]);
  }
  return map;
}

/** Whether any node beneath `id` (not `id` itself) is a resource or skill. */
function hasFillingDescendant(id: string, children: Map<string | null, TreeNode[]>): boolean {
  const stack = [...(children.get(id) ?? [])];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (seen.has(node.id)) continue;
    seen.add(node.id);
    if (fillsGap(node.kind)) return true;
    stack.push(...(children.get(node.id) ?? []));
  }
  return false;
}

/**
 * Concepts with no resource or skill anywhere beneath them. They are never
 * stored: the canvas draws them and scoring penalises them, but a player who
 * branches a resource under one makes it disappear without spending a move
 * on bookkeeping.
 */
export function computeImplicitGaps(nodes: TreeNode[]): string[] {
  const children = childrenOf(nodes);
  return nodes
    .filter(n => n.kind === 'concept' && !hasFillingDescendant(n.id, children))
    .map(n => n.id);
}

/** Depth of every node, root at 0. Orphans (missing parent) count as roots. */
function depthsOf(nodes: TreeNode[]): Map<string, number> {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const depths = new Map<string, number>();
  const depthOf = (node: TreeNode, trail: Set<string>): number => {
    const known = depths.get(node.id);
    if (known !== undefined) return known;
    const parent = node.parentId === null ? undefined : byId.get(node.parentId);
    // A cycle can only come from corrupt saved data; treat it as a root.
    const depth = parent && !trail.has(parent.id) ? depthOf(parent, trail.add(node.id)) + 1 : 0;
    depths.set(node.id, depth);
    return depth;
  };
  for (const node of nodes) depthOf(node, new Set());
  return depths;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function computeScore(nodes: TreeNode[]): ScoreBreakdown {
  const children = childrenOf(nodes);

  const coveredConcepts = nodes.filter(
    n => n.kind === 'concept' && hasFillingDescendant(n.id, children),
  ).length;
  const coverage = Math.min(COVERAGE_MAX, coveredConcepts * COVERAGE_PER_CONCEPT);

  const maxDepth = Math.max(0, ...depthsOf(nodes).values());
  const depth = Math.min(maxDepth, DEPTH_MAX_LEVELS) * DEPTH_PER_LEVEL;

  const kinds = new Set(nodes.map(n => n.kind));
  const balance =
    (['concept', 'resource', 'skill'] as const).filter(kind => kinds.has(kind)).length *
    BALANCE_PER_KIND;

  const authored = (player: PlayerType) => nodes.filter(n => n.createdBy === player).length;
  const fewest = Math.min(authored('human'), authored('agent'));
  const authorship =
    fewest >= AUTHORSHIP_FULL_MIN_NODES
      ? AUTHORSHIP_FULL
      : fewest >= AUTHORSHIP_HALF_MIN_NODES
        ? AUTHORSHIP_HALF
        : 0;

  const withContent = nodes.filter(n => Boolean(n.note?.trim()) || Boolean(n.url?.trim())).length;
  const content = Math.min(CONTENT_MAX, withContent * CONTENT_PER_NODE);

  const explicitGaps = nodes.filter(n => n.isGap).map(n => n.id);
  const openGaps = [...new Set([...explicitGaps, ...computeImplicitGaps(nodes)])];
  const gapPenalty = openGaps.length * GAP_PENALTY;

  const total = clamp(
    coverage + depth + balance + authorship + content - gapPenalty,
    SCORE_MIN,
    SCORE_MAX,
  );

  return { total, coverage, depth, balance, authorship, content, gapPenalty, openGaps };
}
