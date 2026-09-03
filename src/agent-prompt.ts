import { MOVES_PER_PLAYER, OPENING_MOVES } from './store';

/**
 * The prompt the human hands to an agent so it opens the game before they
 * join. The rules live in the tool descriptions, so the prompt only has to
 * point the agent at the tools and at the topic.
 *
 * Grown out of the setup prompt on the cursor/gap-first-workspace-3cdc
 * branch, which asked the agent to discover the page's tools.
 */
export function buildAgentPrompt(topic: string): string {
  const trimmed = topic.trim();
  const open = trimmed
    ? `Call plant with the label "${trimmed}" to start the game.`
    : 'Ask me what I want to learn, then call plant with that question as the label.';
  return [
    'Use the WebMCP tools on this page to play CanvasQuest with me.',
    'Call get_board first and read each tool description: the rules are in them.',
    open,
    `Then grow up to ${OPENING_MOVES} opening branches on your own, one branch per call, and call pass to hand the board to me.`,
    `After that we alternate with ${MOVES_PER_PLAYER} moves each: make exactly one move on your turn, call get_board to see what I did, and mark a gap when you cannot fill a branch yourself.`,
  ].join(' ');
}
