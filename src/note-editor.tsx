import { useDeferredValue, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ComponentProps, SyntheticEvent } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { commonPrefixLength, mergeNote } from './note-merge';
import { MAX_NOTE_CHARS, useGameStore } from './store';
import type { TreeNode } from './types';

type Layout = 'write' | 'split' | 'preview';

const LAYOUTS: { id: Layout; label: string }[] = [
  { id: 'write', label: 'Write' },
  { id: 'split', label: 'Split' },
  { id: 'preview', label: 'Preview' },
];

/** Narrower than this and two panes have no room, so the editor opens in Write. */
const SPLIT_MIN_WIDTH = 900;

const FEEDBACK_MS = 4000;

/** The pause in typing after which the draft is saved. */
const AUTOSAVE_MS = 800;

/** Links in a note lead off the page, so they open in a new tab. */
function ExternalLink({ node: _node, ...props }: ComponentProps<'a'> & { node?: unknown }) {
  return <a {...props} target="_blank" rel="noreferrer" />;
}

const MARKDOWN_COMPONENTS = { a: ExternalLink };

/**
 * A node's note as a full-screen Markdown document. Slides down over the whole
 * app, header and side panels included, from the side panel's View markdown
 * button or a double-click on a board node. It saves as the human types, with
 * the same free annotate move the side panel uses, and it is shared with the
 * agent: what the agent writes through edit_note shows up in the text as it
 * lands, around whatever the human is typing.
 */
export default function NoteEditor() {
  const nodeId = useGameStore(state => state.noteEditorNodeId);
  const node = useGameStore(state =>
    state.noteEditorNodeId ? (state.nodes.find(n => n.id === state.noteEditorNodeId) ?? null) : null,
  );
  const close = useGameStore(state => state.closeNoteEditor);

  // The node can go while its note is open (pruned, undone, a new game):
  // close rather than edit a ghost.
  useEffect(() => {
    if (nodeId && !node) close();
  }, [nodeId, node, close]);

  if (!node) return null;
  // Keyed by node so a different node starts from a fresh draft.
  return <NoteSheet key={node.id} node={node} onClose={close} />;
}

/** A change of the draft the human did not type, so the caret can be put back. */
interface CaretShift {
  from: string;
  to: string;
}

function NoteSheet({ node, onClose }: { node: TreeNode; onClose: () => void }) {
  const annotate = useGameStore(state => state.annotate);
  const gamePhase = useGameStore(state => state.gamePhase);
  const isSharedView = useGameStore(state => state.isSharedView);
  const lastAction = useGameStore(state => state.history[state.history.length - 1]);
  // Annotating is free in any running phase; a shared or finished board is read-only.
  const canEdit = !isSharedView && (gamePhase === 'opening' || gamePhase === 'playing');

  const saved = node.note ?? '';
  const [draft, setDraft] = useState(saved);
  // The saved note the draft was last aligned with. When the store moves on
  // from it, someone other than this editor wrote the note.
  const [aligned, setAligned] = useState(saved);
  // Their version of the note, held while the human decides which to keep.
  const [conflict, setConflict] = useState<string | null>(null);
  const [layout, setLayout] = useState<Layout>(() => {
    if (!canEdit) return 'preview';
    return window.innerWidth >= SPLIT_MIN_WIDTH ? 'split' : 'write';
  });
  const [feedback, setFeedback] = useState('');
  // The rendered side lags a beat behind typing instead of slowing it down.
  const preview = useDeferredValue(draft);
  const dirty = draft.trim() !== saved;
  const overLimit = draft.trim().length > MAX_NOTE_CHARS;
  const canSave = canEdit && dirty && !overLimit;

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Where the caret was the last time the human moved it.
  const caretRef = useRef({ start: 0, end: 0 });
  const [shift, setShift] = useState<CaretShift | null>(null);
  const appliedShift = useRef<CaretShift | null>(null);

  // The note changed in the store while this sheet was open: the agent wrote
  // to it, a move was undone, or this editor's own save came back. Folded in
  // during render, so the text never shows a stale note for a frame.
  if (saved !== aligned) {
    setAligned(saved);
    const merged = mergeNote(draft, aligned, saved);
    const byAgent = lastAction?.type === 'annotate' && lastAction.player === 'agent' && lastAction.nodeId === node.id;
    if (merged === null) {
      setConflict(saved);
    } else {
      setConflict(null);
      if (merged !== draft) {
        setShift({ from: draft, to: merged });
        setDraft(merged);
        setFeedback(byAgent ? 'The agent wrote in this note' : 'The note changed and the editor took the change');
      }
    }
  }

  // After a merge the browser has thrown the caret to the end; put it back
  // where the human had it, shifted past whatever landed before it.
  useLayoutEffect(() => {
    if (!shift || appliedShift.current === shift) return;
    appliedShift.current = shift;
    const textarea = textareaRef.current;
    if (!textarea || document.activeElement !== textarea) return;
    const unchanged = commonPrefixLength(shift.from, shift.to);
    const delta = shift.to.length - shift.from.length;
    const moved = (position: number) => (position <= unchanged ? position : Math.max(unchanged, position + delta));
    const { start, end } = caretRef.current;
    textarea.setSelectionRange(moved(start), moved(end));
  }, [shift]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [layout]);

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(''), FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [feedback]);

  const save = () => {
    if (!canSave) return;
    const result = annotate(node.id, { note: draft }, 'human');
    if (!result.success) setFeedback(result.message);
  };

  const requestClose = () => {
    if (canSave && conflict === null) save();
    else if (canEdit && dirty) {
      const question = overLimit
        ? `The note is over ${MAX_NOTE_CHARS.toLocaleString()} characters and cannot be saved. Close and lose the unsaved typing?`
        : "Close and keep the agent's version of the note, losing your unsaved typing?";
      if (!window.confirm(question)) return;
    }
    onClose();
  };

  // Escape closes and ⌘S / Ctrl+S saves at once, so the note behaves like a
  // document. The handlers are read through a ref so the listener is attached
  // only once and the autosave timer always calls the current save.
  const latest = useRef({ save, requestClose });
  useEffect(() => {
    latest.current = { save, requestClose };
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        latest.current.requestClose();
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        latest.current.save();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Saving as the human types keeps the store, and so the agent, current. A
  // pending conflict holds the save, or it would overwrite the agent's version
  // before the human has chosen.
  useEffect(() => {
    if (!canSave || conflict !== null) return;
    const timer = setTimeout(() => latest.current.save(), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [canSave, conflict, draft]);

  const rememberCaret = (event: SyntheticEvent<HTMLTextAreaElement>) => {
    caretRef.current = { start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd };
  };

  const showEditor = canEdit && layout !== 'preview';
  const showPreview = !canEdit || layout !== 'write';
  const status = !canEdit
    ? 'read-only'
    : overLimit
      ? 'too long to save'
      : conflict !== null
        ? 'edits collided'
        : dirty
          ? 'saving…'
          : 'saved';

  return (
    <div className="note-sheet" role="dialog" aria-modal="true" aria-labelledby="note-editor-title">
      <header className="sheet-header">
        <span className="tag tag-light">{node.kind}</span>
        <div className="sheet-heading">
          <h2 id="note-editor-title" className="sheet-title">
            {node.label}
          </h2>
          <div className="sheet-meta">
            {node.kind} · {node.id} · created by {node.createdBy}
            {node.isGap ? ' · gap' : ''} · {status}
          </div>
        </div>
        {canEdit && (
          <div role="group" aria-label="Editor layout" className="segmented">
            {LAYOUTS.map(option => (
              <button
                key={option.id}
                type="button"
                onClick={() => setLayout(option.id)}
                aria-pressed={layout === option.id}
                className={`segment${layout === option.id ? ' is-active' : ''}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
        <button type="button" onClick={requestClose} aria-label="Close the note" title="Close (Esc)" className="sheet-close">
          ✕
        </button>
      </header>

      {conflict !== null && (
        <div role="alert" className="sheet-conflict">
          <span>
            The agent changed this note while you had unsaved typing, and the two edits overlap. Your text is on
            screen; the agent&apos;s version is in the store until you choose.
          </span>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setDraft(conflict);
              setConflict(null);
            }}
          >
            Use the agent&apos;s version
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setConflict(null)}
            title="Saves your text over the agent's change"
          >
            Keep mine
          </button>
        </div>
      )}

      <div className={`sheet-body${showEditor && showPreview ? ' is-split' : ''}`}>
        {showEditor && (
          <textarea
            ref={textareaRef}
            id="markdown-note"
            className="sheet-textarea"
            aria-label="Markdown source"
            value={draft}
            onChange={event => {
              rememberCaret(event);
              setDraft(event.target.value);
            }}
            onSelect={rememberCaret}
            onKeyUp={rememberCaret}
            onClick={rememberCaret}
            placeholder={`# ${node.label}\n\nWrite in Markdown: headings, lists, links, code…`}
            spellCheck
          />
        )}
        {showPreview && (
          <div className={`sheet-preview markdown-body${showEditor ? ' has-editor' : ''}`} aria-label="Rendered note">
            <div className="sheet-preview-inner">
              {preview.trim() ? (
                <Markdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
                  {preview}
                </Markdown>
              ) : (
                <p className="sheet-empty">
                  {canEdit ? 'Nothing written yet. The preview follows the text as you type.' : 'This node has no note.'}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <footer className="sheet-footer">
        <div role="status" className={`sheet-status${feedback ? ' is-feedback' : ''}`}>
          {feedback ||
            (canEdit
              ? 'Saves as you type; ⌘S or Ctrl+S saves now, Esc closes. The agent can write in here too: ask it to.'
              : 'Esc closes.')}
        </div>
        {canEdit && (
          <div className={`sheet-count${overLimit ? ' is-over' : ''}`}>
            {draft.length.toLocaleString()} / {MAX_NOTE_CHARS.toLocaleString()}
          </div>
        )}
      </footer>
    </div>
  );
}
