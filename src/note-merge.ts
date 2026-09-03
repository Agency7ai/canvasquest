/**
 * How the note editor folds in a note that changed underneath it while the
 * human still had unsaved typing: the agent wrote to it, or a move was undone.
 */

/** Unchanged text kept on each side of a replayed edit, so it lands in the right place. */
const CONTEXT = 24;

/** Length of the longest prefix two strings share. */
export function commonPrefixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let length = 0;
  while (length < max && a[length] === b[length]) length += 1;
  return length;
}

function commonSuffixLength(a: string, b: string, max: number): number {
  let length = 0;
  while (length < max && a[a.length - 1 - length] === b[b.length - 1 - length]) length += 1;
  return length;
}

/** Two pieces of Markdown, one paragraph break apart. */
function join(head: string, tail: string): string {
  const first = head.trimEnd();
  const second = tail.trim();
  if (!first) return second;
  if (!second) return first;
  return `${first}\n\n${second}`;
}

/**
 * Returns the draft with the change from `base` to `theirs` replayed on it,
 * the draft itself when it already says the same, or null when the two edits
 * overlap and the human has to choose.
 *
 * `draft` is the text in the editor, `base` the saved note it was typed over
 * and `theirs` the note now in the store.
 */
export function mergeNote(draft: string, base: string, theirs: string): string | null {
  if (draft.trim() === theirs) return draft;
  if (draft.trim() === base) return theirs;
  // Text added at the end goes after the human's own unsaved ending.
  if (theirs.startsWith(base)) return join(draft, theirs.slice(base.length));
  // One contiguous change elsewhere is replayed where the passage it touched,
  // with a little of its surroundings, still stands untouched in the draft.
  const prefix = commonPrefixLength(base, theirs);
  const suffix = commonSuffixLength(base, theirs, Math.min(base.length, theirs.length) - prefix);
  const from = Math.max(0, prefix - CONTEXT);
  const keep = Math.min(CONTEXT, suffix);
  const passage = base.slice(from, base.length - suffix + keep);
  const replacement = theirs.slice(from, theirs.length - suffix + keep);
  if (!passage || draft.split(passage).length !== 2) return null;
  return draft.replace(passage, () => replacement);
}
