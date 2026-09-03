import * as THREE from 'three';
import type { NodeKind, TreeNode } from '../types';

/**
 * Turns boards into trees: one limb per node, the root as the trunk, and every
 * child limb sprouting from a point along its parent. This is pure geometry
 * with no rendering in it, so it runs in node and is covered by tests.
 *
 * Ported from the cursor/gap-first-workspace-3cdc branch and adapted to this
 * branch's data model, where a gap is a flag on a node rather than a kind.
 */

/** What a limb looks like: its node's kind, or 'gap' when the node is flagged. */
export type LimbKind = NodeKind | 'gap';

export interface Limb {
  id: string;
  treeId: string;
  parentId: string | null;
  kind: LimbKind;
  label: string;
  depth: number;
  start: THREE.Vector3;
  /** Control point of the quadratic curve from start to end. */
  control: THREE.Vector3;
  end: THREE.Vector3;
  startRadius: number;
  endRadius: number;
  /** Nothing grows out of this limb, so foliage gathers at its end. */
  isTip: boolean;
  /**
   * Growth order within the tree. It follows the order nodes were created in,
   * so a new node is always the last thing to grow and nothing already grown
   * has to start over.
   */
  order: number;
}

export interface ForestTree {
  id: string;
  question: string;
  isActive: boolean;
  /** Where the trunk meets the ground, in scene units. */
  ground: THREE.Vector3;
  limbs: Limb[];
  height: number;
  nodeCount: number;
  gapCount: number;
}

export interface Board {
  id: string;
  question: string;
  nodes: TreeNode[];
  /** The board being played, which stands in the middle of the clearing. */
  isActive: boolean;
}

export interface Forest {
  trees: ForestTree[];
  /** Ground radius that contains every tree, for framing the camera. */
  radius: number;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const TRUNK_HEIGHT = 7.2;
const TRUNK_RADIUS = 0.42;
/** Each generation of limbs is this much shorter and thinner than its parent. */
const LENGTH_FALLOFF = 0.72;
const RADIUS_FALLOFF = 0.56;
/** A limb with nothing growing from it tapers to this fraction of its start radius. */
const TIP_TAPER = 0.3;
/** Fraction of a limb below which no child attaches, so the trunk keeps a bare base. */
const TRUNK_BARE_FRACTION = 0.42;
const LIMB_BARE_FRACTION = 0.62;
/** Angle from vertical for a limb's first child; later siblings lean out more. */
const MIN_TILT = 0.5;
const MAX_TILT = 1.15;
/** How far the control point bows a limb outward, as a fraction of its length. */
const BOW = 0.2;
/** Grove trees stand this far from the centre, further apart as the forest grows. */
const CLEARING_BASE_RADIUS = 13;
const CLEARING_RADIUS_PER_TREE = 3.4;
/** Trees past this many on the ring go to an outer ring. */
const TREES_PER_RING = 6;
const OUTER_RING_FACTOR = 1.75;
/** A board with this many nodes or more gets the largest tree. */
const SCALE_SATURATION_NODES = 40;
/** Minimum distance between any two trunks, which the tests hold the layout to. */
export const MIN_TREE_SPACING = 6;
/** Minimum forest radius, so an empty clearing still frames sensibly. */
const MIN_FOREST_RADIUS = 8;

/** A point along a limb's curve, t from 0 at the start to 1 at the end. */
export function pointOnLimb(limb: Pick<Limb, 'start' | 'control' | 'end'>, t: number): THREE.Vector3 {
  const a = new THREE.Vector3().lerpVectors(limb.start, limb.control, t);
  const b = new THREE.Vector3().lerpVectors(limb.control, limb.end, t);
  return a.lerp(b, t);
}

/** A stable 0..1 number per id, so limbs look organic without changing between renders. */
function jitter(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return (hash % 1000) / 1000;
}

function childrenByParent(nodes: TreeNode[]): Map<string, TreeNode[]> {
  const ids = new Set(nodes.map(n => n.id));
  const map = new Map<string, TreeNode[]>();
  for (const node of nodes) {
    if (node.parentId === null || !ids.has(node.parentId)) continue;
    const siblings = map.get(node.parentId);
    if (siblings) siblings.push(node);
    else map.set(node.parentId, [node]);
  }
  return map;
}

interface GrowContext {
  treeId: string;
  childrenOf: Map<string, TreeNode[]>;
  orderOf: Map<string, number>;
  limbs: Limb[];
  visited: Set<string>;
}

function growLimb(
  ctx: GrowContext,
  node: TreeNode,
  start: THREE.Vector3,
  direction: THREE.Vector3,
  length: number,
  radius: number,
  depth: number,
  bearing: number,
): void {
  // Corrupt data could contain a cycle; every node grows at most once.
  if (ctx.visited.has(node.id)) return;
  ctx.visited.add(node.id);

  const children = ctx.childrenOf.get(node.id) ?? [];
  const end = start.clone().addScaledVector(direction, length);
  // The control point pushes the middle of the limb outward and a touch upward,
  // so no limb is a straight stick. It never sits below the limb's own base, so
  // the curve can never dip under the ground.
  const control = new THREE.Vector3()
    .lerpVectors(start, end, 0.5)
    .add(new THREE.Vector3(direction.x, 0, direction.z).multiplyScalar(length * BOW))
    .add(new THREE.Vector3(0, length * 0.05, 0));
  const endRadius = radius * (children.length > 0 ? RADIUS_FALLOFF : TIP_TAPER);

  ctx.limbs.push({
    id: node.id,
    treeId: ctx.treeId,
    parentId: node.parentId,
    kind: node.isGap ? 'gap' : node.kind,
    label: node.label,
    depth,
    start,
    control,
    end,
    startRadius: radius,
    endRadius,
    isTip: children.length === 0,
    order: ctx.orderOf.get(node.id) ?? ctx.limbs.length,
  });

  const bareFraction = depth === 0 ? TRUNK_BARE_FRACTION : LIMB_BARE_FRACTION;
  children.forEach((child, index) => {
    const spread = children.length > 1 ? index / (children.length - 1) : 0.5;
    // Siblings fan out around the parent at golden-angle steps and attach at
    // staggered heights, the last one continuing from the tip.
    const childBearing = bearing + GOLDEN_ANGLE * (index + 1) + (jitter(child.id) - 0.5) * 0.4;
    const tilt = MIN_TILT + (MAX_TILT - MIN_TILT) * spread + (jitter(child.id) - 0.5) * 0.2;
    const childDirection = new THREE.Vector3(
      Math.cos(childBearing) * Math.sin(tilt),
      Math.cos(tilt),
      Math.sin(childBearing) * Math.sin(tilt),
    ).normalize();
    const t = children.length === 1 ? 1 : bareFraction + (1 - bareFraction) * spread;
    growLimb(
      ctx,
      child,
      pointOnLimb({ start, control, end }, t),
      childDirection,
      length * LENGTH_FALLOFF,
      radius * RADIUS_FALLOFF,
      depth + 1,
      childBearing,
    );
  });
}

function buildTree(board: Board, ground: THREE.Vector3): ForestTree {
  const roots = board.nodes.filter(n => n.parentId === null || !board.nodes.some(p => p.id === n.parentId));
  const root = roots[0];
  const scale = 0.8 + Math.min(board.nodes.length, SCALE_SATURATION_NODES) / SCALE_SATURATION_NODES;
  const ctx: GrowContext = {
    treeId: board.id,
    childrenOf: childrenByParent(board.nodes),
    orderOf: new Map(board.nodes.map((node, index) => [node.id, index])),
    limbs: [],
    visited: new Set(),
  };
  if (root) {
    growLimb(
      ctx,
      root,
      ground.clone(),
      new THREE.Vector3(0, 1, 0),
      TRUNK_HEIGHT * scale,
      TRUNK_RADIUS * Math.sqrt(scale),
      0,
      jitter(board.id) * Math.PI * 2,
    );
  }
  return {
    id: board.id,
    question: board.question,
    isActive: board.isActive,
    ground,
    limbs: ctx.limbs,
    height: ctx.limbs.reduce((max, limb) => Math.max(max, limb.end.y), 0),
    nodeCount: board.nodes.length,
    gapCount: board.nodes.filter(n => n.isGap).length,
  };
}

/**
 * Grove trees stand on the half of the clearing away from the default camera,
 * spread over a half circle so none of them hides the active tree, with a
 * second, wider ring once the first is full.
 */
function grovePosition(index: number, count: number, clearingRadius: number): THREE.Vector3 {
  const ring = Math.floor(index / TREES_PER_RING);
  const onRing = Math.min(count - ring * TREES_PER_RING, TREES_PER_RING);
  const slot = index % TREES_PER_RING;
  const radius = clearingRadius * (ring === 0 ? 1 : OUTER_RING_FACTOR * ring);
  // Angles run from straight left, round the back, to straight right.
  const angle = onRing === 1 ? Math.PI * 1.5 : Math.PI + (Math.PI * slot) / (onRing - 1) + ring * 0.25;
  return new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
}

/** Builds every tree. Boards without nodes make no tree: bare ground shows a seed instead. */
export function buildForest(boards: Board[]): Forest {
  const populated = boards.filter(board => board.nodes.length > 0);
  const active = populated.find(board => board.isActive) ?? null;
  const others = populated.filter(board => board !== active);
  const clearingRadius = CLEARING_BASE_RADIUS + others.length * CLEARING_RADIUS_PER_TREE;

  const trees: ForestTree[] = [];
  if (active) trees.push(buildTree(active, new THREE.Vector3(0, 0, 0)));
  others.forEach((board, index) => {
    trees.push(buildTree(board, grovePosition(index, others.length, clearingRadius)));
  });

  const radius = trees.reduce(
    (max, tree) => Math.max(max, tree.ground.length() + tree.height * 0.6),
    MIN_FOREST_RADIUS,
  );
  return { trees, radius };
}
