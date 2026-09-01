export const APP_NAME = 'Study Tree';

export const APP_TAGLINES = {
  game: 'Collaborative learning game with a voice agent',
  workspace: 'Map what you know, and what you do not, out loud',
} as const;

/** Handed to an agent to get it to discover this page's WebMCP tools itself,
 *  which is the fastest way to confirm the integration is live. */
export const SETUP_PROMPT =
  'Use WebMCP tools in this browser to inspect all available tools and tell me what you can do.';
