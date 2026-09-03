import type { CSSProperties } from 'react';
import type { NodeKind, PlayerType } from './types';

/**
 * Styles shared by the right-hand column, so the opening panel, the game
 * controls and the end screen look like one panel changing with the phase.
 * Plain data only: the shared components live in their own files so fast
 * refresh keeps working.
 */

export const KIND_EMOJI: Record<NodeKind, string> = { root: '🌱', concept: '💡', resource: '📚', skill: '⚡' };
export const PLAYER_EMOJI: Record<PlayerType, string> = { human: '🧑', agent: '🤖' };

export const asideStyle: CSSProperties = {
  padding: '16px',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  background: '#f8fafc',
  borderLeft: '1px solid #e2e8f0',
  width: '360px',
  minWidth: '320px',
  overflowY: 'auto',
};

// Longhand border properties, because the phase panels override borderColor
// on sections that React swaps in place: mixing the shorthand with a longhand
// makes React warn and can leave the wrong colour behind.
export const sectionStyle: CSSProperties = {
  background: 'white',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: '#e2e8f0',
  borderRadius: '8px',
  padding: '12px',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
};

export const darkSectionStyle: CSSProperties = {
  background: '#0f172a',
  color: 'white',
  padding: '14px',
  borderRadius: '8px',
  fontSize: '13px',
};

export const headingStyle: CSSProperties = {
  fontSize: '11px',
  fontWeight: 700,
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

export const inputStyle: CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #cbd5e1',
  borderRadius: '6px',
  fontSize: '13px',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};

export const button = (background: string): CSSProperties => ({
  padding: '9px 10px',
  background,
  color: 'white',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: '13px',
});

export const twoColumns: CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' };

export const feedbackStyle: CSSProperties = {
  padding: '10px',
  background: '#ecfdf5',
  color: '#065f46',
  borderRadius: '6px',
  fontSize: '13px',
  lineHeight: 1.4,
};

export const footnoteStyle: CSSProperties = { margin: 0, fontSize: '11px', color: '#94a3b8', lineHeight: 1.5 };
