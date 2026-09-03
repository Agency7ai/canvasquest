import { describe, expect, it } from 'vitest';
import {
  AUTHORSHIP_FULL,
  AUTHORSHIP_HALF,
  BALANCE_PER_KIND,
  CONTENT_MAX,
  COVERAGE_MAX,
  COVERAGE_PER_CONCEPT,
  DEPTH_MAX_LEVELS,
  DEPTH_PER_LEVEL,
  GAP_PENALTY,
  computeImplicitGaps,
  computeScore,
  scoreRows,
} from './scoring';
import type { NodeKind, PlayerType, TreeNode } from './types';

function node(
  id: string,
  kind: NodeKind,
  parentId: string | null,
  createdBy: PlayerType = 'human',
  extra: Partial<TreeNode> = {},
): TreeNode {
  return { id, label: id, kind, parentId, createdBy, isGap: false, ...extra };
}

/** Two covered concepts, one explicit gap, content on two nodes, both players active. */
const exampleBoard: TreeNode[] = [
  node('n1', 'root', null, 'human'),
  node('n2', 'concept', 'n1', 'agent'),
  node('n3', 'resource', 'n2', 'human', { url: 'https://example.com/guide' }),
  node('n4', 'concept', 'n1', 'human'),
  node('n5', 'skill', 'n4', 'agent', { note: 'Practise daily' }),
  node('n6', 'concept', 'n1', 'agent', { isGap: true, gapReason: 'Which framework?' }),
];

describe('computeImplicitGaps', () => {
  it('flags concepts with no resource or skill anywhere beneath them', () => {
    const nodes = [
      node('n1', 'root', null),
      node('n2', 'concept', 'n1'),
      node('n3', 'concept', 'n1'),
      node('n4', 'concept', 'n3'),
      node('n5', 'resource', 'n4'),
      node('n6', 'concept', 'n1'),
      node('n7', 'skill', 'n6'),
    ];
    // n3 is covered through its grandchild, n4 through its child; n2 is bare.
    expect(computeImplicitGaps(nodes)).toEqual(['n2']);
  });

  it('never flags the root, resources or skills', () => {
    const nodes = [node('n1', 'root', null), node('n2', 'resource', 'n1'), node('n3', 'skill', 'n1')];
    expect(computeImplicitGaps(nodes)).toEqual([]);
  });
});

describe('computeScore', () => {
  it('scores an empty board as zero', () => {
    expect(computeScore([])).toEqual({
      total: 0,
      coverage: 0,
      depth: 0,
      balance: 0,
      authorship: 0,
      content: 0,
      gapPenalty: 0,
      openGaps: [],
    });
  });

  it('adds up a full example board', () => {
    const score = computeScore(exampleBoard);
    expect(score.coverage).toBe(2 * COVERAGE_PER_CONCEPT);
    expect(score.depth).toBe(2 * DEPTH_PER_LEVEL);
    expect(score.balance).toBe(3 * BALANCE_PER_KIND);
    expect(score.authorship).toBe(AUTHORSHIP_FULL);
    expect(score.content).toBe(2);
    // n6 is both an explicit gap and a bare concept, and is counted once.
    expect(score.openGaps).toEqual(['n6']);
    expect(score.gapPenalty).toBe(GAP_PENALTY);
    expect(score.total).toBe(12 + 10 + 15 + 20 + 2 - 5);
  });

  it('caps coverage, depth and content', () => {
    const nodes: TreeNode[] = [node('n1', 'root', null)];
    let parent = 'n1';
    for (let i = 0; i < 7; i++) {
      const id = `c${i}`;
      nodes.push(node(id, 'concept', parent, 'agent', { note: 'why it matters' }));
      parent = id;
    }
    for (let i = 0; i < 5; i++) {
      nodes.push(node(`r${i}`, 'resource', parent, 'human', { url: 'https://example.com' }));
    }
    const score = computeScore(nodes);
    expect(score.coverage).toBe(COVERAGE_MAX);
    expect(score.depth).toBe(DEPTH_PER_LEVEL * DEPTH_MAX_LEVELS);
    expect(score.content).toBe(CONTENT_MAX);
    expect(score.openGaps).toEqual([]);
  });

  it('gives half authorship credit when a player added only one node', () => {
    const nodes = [
      node('n1', 'root', null, 'human'),
      node('n2', 'concept', 'n1', 'human'),
      node('n3', 'skill', 'n2', 'agent'),
    ];
    expect(computeScore(nodes).authorship).toBe(AUTHORSHIP_HALF);
  });

  it('gives no authorship credit for a solo tree', () => {
    const nodes = [node('n1', 'root', null, 'human'), node('n2', 'skill', 'n1', 'human')];
    expect(computeScore(nodes).authorship).toBe(0);
  });

  it('never goes below zero', () => {
    const nodes = [
      node('n1', 'root', null),
      node('n2', 'concept', 'n1'),
      node('n3', 'concept', 'n1'),
      node('n4', 'concept', 'n1'),
    ];
    // depth 5 + balance 5 - three implicit gaps at 5 each = -5, clamped to 0
    expect(computeScore(nodes).total).toBe(0);
    expect(computeScore(nodes).gapPenalty).toBe(3 * GAP_PENALTY);
  });

  it('lists breakdown rows that add up to the total', () => {
    const score = computeScore(exampleBoard);
    const rows = scoreRows(score);
    expect(rows.map(row => row.label)).toEqual([
      'Coverage',
      'Depth',
      'Kind balance',
      'Shared authorship',
      'Content',
      'Open gaps',
    ]);
    expect(rows.reduce((sum, row) => sum + row.points, 0)).toBe(score.total);
    expect(rows[rows.length - 1].max).toBeNull();
  });
});
