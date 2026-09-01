import { useEffect, useRef, useState } from 'react';
import { SETUP_PROMPT } from './app-meta';

interface SetupModalProps {
  /** Whether the click that opened this already put the prompt on the clipboard. */
  copied: boolean;
  onClose: () => void;
  hasWebMCP: boolean;
}

export default function SetupModal({ copied, onClose, hasWebMCP }: SetupModalProps) {
  const [recopied, setRecopied] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const copyAgain = async () => {
    try {
      await navigator.clipboard.writeText(SETUP_PROMPT);
      setRecopied(true);
      setTimeout(() => setRecopied(false), 2000);
    } catch {
      // Clipboard access can be denied; the prompt below is selectable.
    }
  };

  const onClipboard = copied || recopied;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(9, 12, 22, 0.62)',
        backdropFilter: 'blur(3px)',
        display: 'grid',
        placeItems: 'center',
        padding: '24px',
        zIndex: 100,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="setup-title"
        onClick={event => event.stopPropagation()}
        style={{
          background: 'white',
          borderRadius: '14px',
          padding: '24px',
          width: 'min(520px, 100%)',
          maxHeight: '100%',
          overflowY: 'auto',
          boxShadow: '0 24px 60px rgba(15, 23, 42, 0.35)',
        }}
      >
        <h2 id="setup-title" style={{ margin: '0 0 6px 0', fontSize: '19px', color: '#0f172a' }}>
          Paste this into Codex
        </h2>
        <p style={{ margin: '0 0 18px 0', fontSize: '13px', color: '#475569', lineHeight: 1.5 }}>
          {onClipboard
            ? 'The prompt is on your clipboard. Paste it into Codex with this page open in its browser, and the agent will discover this page’s tools and tell you how it can play.'
            : 'Copy the prompt below, then paste it into Codex with this page open in its browser.'}
        </p>

        <blockquote
          style={{
            margin: '0 0 16px 0',
            padding: '14px',
            background: '#f1f5f9',
            borderLeft: '3px solid #6366f1',
            borderRadius: '8px',
            fontSize: '13px',
            color: '#1e293b',
            lineHeight: 1.5,
            userSelect: 'all',
          }}
        >
          {SETUP_PROMPT}
        </blockquote>

        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            padding: '10px 12px',
            borderRadius: '8px',
            marginBottom: '18px',
            background: hasWebMCP ? '#ecfdf5' : '#fffbeb',
            color: hasWebMCP ? '#065f46' : '#92400e',
            fontSize: '12px',
            lineHeight: 1.5,
          }}
        >
          <span aria-hidden="true">{hasWebMCP ? '✓' : '⚠'}</span>
          <span>
            {hasWebMCP
              ? 'This browser exposes WebMCP, so this page’s tools are registered and callable right now.'
              : 'This browser does not expose WebMCP. Open the page in Codex or ChatGPT’s built-in browser, or enable chrome://flags/#enable-webmcp-testing.'}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button onClick={copyAgain} style={secondaryButtonStyle}>
            {recopied ? 'Copied' : 'Copy prompt'}
          </button>
          <button ref={closeButtonRef} onClick={onClose} style={primaryButtonStyle}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

const secondaryButtonStyle: React.CSSProperties = {
  padding: '9px 16px',
  background: 'white',
  color: '#334155',
  border: '1px solid #cbd5e1',
  borderRadius: '8px',
  fontWeight: 600,
  fontSize: '13px',
  cursor: 'pointer',
};

const primaryButtonStyle: React.CSSProperties = {
  padding: '9px 18px',
  background: '#6366f1',
  color: 'white',
  border: 'none',
  borderRadius: '8px',
  fontWeight: 600,
  fontSize: '13px',
  cursor: 'pointer',
};
