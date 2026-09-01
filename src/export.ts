import type { TreeNode } from './types';

interface ExportInput {
  question: string;
  nodes: TreeNode[];
}

const KIND_NOTE: Record<string, string> = {
  resource: 'resource',
  skill: 'skill',
  gap: 'open question',
};

/**
 * Nested bullets rather than a flat list: the shape of the tree is most of the
 * value, and it has to survive a paste into notes or a doc.
 */
export function toMarkdown({ question, nodes }: ExportInput): string {
  const root = nodes.find(node => node.parentId === null);
  const lines: string[] = [`# ${question}`, ''];

  const walk = (node: TreeNode, depth: number) => {
    const indent = '  '.repeat(depth);
    const note = KIND_NOTE[node.kind];
    const marker = node.kind === 'gap' ? '- [ ] ' : '- ';
    lines.push(`${indent}${marker}${node.label}${note ? ` _(${note})_` : ''}`);
    nodes.filter(child => child.parentId === node.id).forEach(child => walk(child, depth + 1));
  };

  if (root) {
    nodes.filter(node => node.parentId === root.id).forEach(node => walk(node, 0));
  } else {
    nodes.forEach(node => walk(node, 0));
  }

  const gaps = nodes.filter(node => node.kind === 'gap');
  if (gaps.length) {
    lines.push('', '## Open questions', '');
    gaps.forEach(gap => lines.push(`- [ ] ${gap.label}`));
  }

  return `${lines.join('\n')}\n`;
}

export function toJSON({ question, nodes }: ExportInput): string {
  return `${JSON.stringify(
    {
      question,
      exportedAt: new Date().toISOString(),
      nodes: nodes.map(({ id, label, kind, parentId }) => ({ id, label, kind, parentId })),
    },
    null,
    2
  )}\n`;
}

export function download(filename: string, contents: string, mimeType: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'session'
  );
}
