import { computeScore, scoreRows } from './scoring';
import type { TreeNode } from './types';

const SLUG_MAX_CHARS = 60;

/** "How should I learn Rust?" -> "how-should-i-learn-rust" */
export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_CHARS)
    .replace(/-+$/g, '');
  return slug || 'canvasquest';
}

/**
 * The finished tree as nested markdown bullets, followed by the score. Each
 * bullet is prefixed with its kind; notes, links and gaps sit beneath it.
 */
export function gameToMarkdown(question: string, nodes: TreeNode[]): string {
  const ids = new Set(nodes.map(n => n.id));
  const byId = new Map(nodes.map(n => [n.id, n]));
  const children = new Map<string, TreeNode[]>();
  const roots: TreeNode[] = [];
  for (const node of nodes) {
    if (node.parentId !== null && ids.has(node.parentId)) {
      const siblings = children.get(node.parentId);
      if (siblings) siblings.push(node);
      else children.set(node.parentId, [node]);
    } else {
      roots.push(node);
    }
  }

  const lines: string[] = [`# ${question}`, ''];
  const seen = new Set<string>();
  const walk = (node: TreeNode, depth: number) => {
    if (seen.has(node.id)) return;
    seen.add(node.id);
    const indent = '  '.repeat(depth);
    lines.push(`${indent}- [${node.kind}] ${node.label}`);
    if (node.note) {
      // A Markdown note can run to many lines: they are nested under the bullet.
      const [first = '', ...rest] = node.note.split('\n');
      lines.push(`${indent}  - note: ${first}`);
      for (const line of rest) lines.push(line.trim() ? `${indent}    ${line}` : '');
    }
    if (node.url) lines.push(`${indent}  - link: [${node.url}](${node.url})`);
    if (node.isGap) lines.push(`${indent}  - ❓ gap: ${node.gapReason ?? 'open'}`);
    for (const child of children.get(node.id) ?? []) walk(child, depth + 1);
  };
  for (const root of roots) walk(root, 0);

  const score = computeScore(nodes);
  lines.push('', `## Score: ${score.total}/100`, '', '| Component | Points |', '| --- | --- |');
  for (const row of scoreRows(score)) {
    lines.push(`| ${row.label} | ${row.max === null ? row.points : `${row.points} / ${row.max}`} |`);
  }
  lines.push(`| **Total** | **${score.total} / 100** |`);

  if (score.openGaps.length > 0) {
    lines.push('', '### Open gaps', '');
    for (const id of score.openGaps) {
      const node = byId.get(id);
      if (!node) continue;
      const why = node.isGap
        ? (node.gapReason ?? 'marked as a gap')
        : 'no resource or skill beneath it';
      lines.push(`- ${node.label}: ${why}`);
    }
  }

  return `${lines.join('\n')}\n`;
}
