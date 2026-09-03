/**
 * App identity in one place: the header, the landing card, the document title and the
 * README all read from here, so renaming the app is a one-line change.
 *
 * Merged from the cursor/gap-first-workspace branch, which called the app "Study Tree".
 * The repository and the implementation brief call it CanvasQuest, so that name stays
 * until the product name is settled.
 */
export const APP_NAME = 'CanvasQuest';

/** Board id for the session currently being edited, as opposed to one planted in the forest. */
export const ACTIVE_BOARD_ID = 'active';

export const APP_TAGLINES = {
  game: 'Grow a learning tree with an AI agent, then plant it in your forest',
  workspace: 'Map what you know, and what you do not, out loud',
} as const;

/**
 * Handed to an agent to get it to discover this page's WebMCP tools itself, which is the
 * fastest way to confirm the integration is live.
 */
export const SETUP_PROMPT =
  'Use WebMCP tools in this browser to inspect all available tools and tell me what you can do.';
