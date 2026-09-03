import { describe, expect, it } from 'vitest';
import { commonPrefixLength, mergeNote } from './note-merge';

const BASE = 'Intro paragraph here.\n\nSecond paragraph stays.';

describe('mergeNote', () => {
  it('keeps the draft when the store already says the same, whitespace aside', () => {
    expect(mergeNote('# Plan\n\nMine.\n', '# Plan', '# Plan\n\nMine.')).toBe('# Plan\n\nMine.\n');
  });

  it('takes the new note when the human has not typed anything', () => {
    expect(mergeNote(BASE, BASE, 'Rewritten.')).toBe('Rewritten.');
    expect(mergeNote('', '', '## Agent\n\nHello.')).toBe('## Agent\n\nHello.');
  });

  it('puts text the agent appended after what the human is typing', () => {
    expect(mergeNote(`${BASE}\n\nMy new para`, BASE, `${BASE}\n\n## Agent\n\nA thought.`)).toBe(
      `${BASE}\n\nMy new para\n\n## Agent\n\nA thought.`,
    );
    expect(mergeNote('Mine so far', '', '## Agent')).toBe('Mine so far\n\n## Agent');
  });

  it('replays a replacement elsewhere in the note around the human’s typing', () => {
    const theirs = BASE.replace('Intro paragraph here.', 'A better intro.');
    expect(mergeNote(`${BASE}\n\nMy new para`, BASE, theirs)).toBe(`${theirs}\n\nMy new para`);
    const cut = BASE.replace('\n\nSecond paragraph stays.', '');
    expect(mergeNote(`Typed first.\n\n${BASE}`, BASE, cut)).toBe(`Typed first.\n\n${cut}`);
  });

  it('gives up when both sides changed the same passage or the passage is ambiguous', () => {
    const theirs = BASE.replace('Intro paragraph here.', 'A better intro.');
    expect(mergeNote(BASE.replace('here.', 'HERE!'), BASE, theirs)).toBeNull();
    expect(mergeNote('a a a a', 'a a', 'b a')).toBeNull();
  });
});

describe('commonPrefixLength', () => {
  it('counts the shared start of two strings', () => {
    expect(commonPrefixLength('abcd', 'abxy')).toBe(2);
    expect(commonPrefixLength('', 'abc')).toBe(0);
    expect(commonPrefixLength('same', 'same')).toBe(4);
  });
});
