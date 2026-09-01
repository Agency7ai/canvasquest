import { useState } from 'react';
import { useGameStore } from './store';
import { toMarkdown, toJSON, download, slugify } from './export';

export default function GapPanel() {
  const nodes = useGameStore(state => state.nodes);
  const question = useGameStore(state => state.question);
  const markClear = useGameStore(state => state.markClear);
  const importSession = useGameStore(state => state.importSession);
  const [copied, setCopied] = useState<'markdown' | 'json' | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);

  const handleImport = () => {
    const result = importSession(importText);
    if (result.success) {
      setIsImporting(false);
      setImportText('');
      setImportError(null);
    } else {
      setImportError(result.message);
    }
  };

  const gaps = nodes.filter(node => node.kind === 'gap');

  const handleCopy = async (format: 'markdown' | 'json') => {
    const contents =
      format === 'markdown' ? toMarkdown({ question, nodes }) : toJSON({ question, nodes });
    try {
      await navigator.clipboard.writeText(contents);
      setCopied(format);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      download(
        `${slugify(question)}.${format === 'markdown' ? 'md' : 'json'}`,
        contents,
        format === 'markdown' ? 'text/markdown' : 'application/json'
      );
    }
  };

  const handleDownload = () => {
    download(`${slugify(question)}.md`, toMarkdown({ question, nodes }), 'text/markdown');
  };

  return (
    <section
      aria-label="Open questions and export"
      style={{ borderTop: '1px solid #e2e8f0', paddingTop: '14px', display: 'grid', gap: '10px' }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <h2
          style={{
            margin: 0,
            fontSize: '11px',
            fontWeight: 700,
            color: '#64748b',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          Open questions
        </h2>
        <span style={{ fontSize: '12px', color: gaps.length ? '#b91c1c' : '#166534', fontWeight: 600 }}>
          {gaps.length}
        </span>
      </div>

      {gaps.length === 0 ? (
        <p style={{ margin: 0, fontSize: '12px', color: '#64748b', lineHeight: 1.5 }}>
          {nodes.length === 0
            ? 'Nothing mapped yet. Start talking, or plant a root to begin.'
            : 'No open questions. Mark a node as a gap when you hit something you cannot answer.'}
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '6px' }}>
          {gaps.map(gap => (
            <li
              key={gap.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '6px',
                padding: '8px',
              }}
            >
              <span style={{ flex: 1, fontSize: '12px', color: '#7f1d1d', wordBreak: 'break-word' }}>
                {gap.label}
              </span>
              <button
                onClick={() => markClear(gap.id, 'human')}
                aria-label={`Mark "${gap.label}" as resolved`}
                style={{
                  border: 'none',
                  background: '#166534',
                  color: 'white',
                  borderRadius: '5px',
                  padding: '4px 8px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Resolve
              </button>
            </li>
          ))}
        </ul>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
        <button onClick={() => handleCopy('markdown')} style={exportButtonStyle}>
          {copied === 'markdown' ? 'Copied' : 'Copy MD'}
        </button>
        <button onClick={() => handleCopy('json')} style={exportButtonStyle}>
          {copied === 'json' ? 'Copied' : 'Copy JSON'}
        </button>
        <button onClick={handleDownload} style={exportButtonStyle}>
          Download
        </button>
      </div>

      <button
        onClick={() => {
          setIsImporting(value => !value);
          setImportError(null);
        }}
        aria-expanded={isImporting}
        style={{ ...exportButtonStyle, padding: '8px' }}
      >
        {isImporting ? 'Cancel import' : 'Import JSON'}
      </button>

      {isImporting && (
        <div style={{ display: 'grid', gap: '6px' }}>
          <label htmlFor="import-json" style={{ fontSize: '11px', color: '#64748b' }}>
            Paste exported JSON to rebuild the canvas. This replaces the current board.
          </label>
          <textarea
            id="import-json"
            value={importText}
            onChange={event => {
              setImportText(event.target.value);
              setImportError(null);
            }}
            rows={5}
            placeholder='{ "question": "...", "nodes": [ ... ] }'
            style={{
              width: '100%',
              padding: '8px',
              border: `1px solid ${importError ? '#fca5a5' : '#cbd5e1'}`,
              borderRadius: '6px',
              fontSize: '11px',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              resize: 'vertical',
            }}
          />
          {importError && (
            <p role="alert" style={{ margin: 0, fontSize: '11px', color: '#b91c1c' }}>
              {importError}
            </p>
          )}
          <button
            onClick={handleImport}
            disabled={!importText.trim()}
            style={{
              ...exportButtonStyle,
              padding: '8px',
              background: importText.trim() ? '#6366f1' : '#e2e8f0',
              color: importText.trim() ? 'white' : '#94a3b8',
              border: 'none',
              cursor: importText.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            Rebuild canvas
          </button>
        </div>
      )}
    </section>
  );
}

const exportButtonStyle: React.CSSProperties = {
  padding: '8px 4px',
  background: 'white',
  color: '#334155',
  border: '1px solid #cbd5e1',
  borderRadius: '6px',
  fontWeight: 600,
  fontSize: '11px',
  cursor: 'pointer',
};
