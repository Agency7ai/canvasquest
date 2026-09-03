# CanvasQuest

**A cooperative learning-tree game where a human and an AI agent build a study plan together, one move at a time.**

Built for the [ElevenLabs WebMCP Challenge](https://elevenlabs.io/), CanvasQuest turns the question "How should I learn X?" into a turn-based board game. The human plays through buttons; the agent plays through the same rules over WebMCP or the ElevenLabs voice client tools. One rules engine, three ways in.

- Developer: Anders Kitson
- Repository: `Agency7ai/canvasquest`

## What is CanvasQuest?

You start with a question. Together, you and the agent grow a **learning tree**: concepts to understand, resources to read, skills to practise. Each player has a small budget of moves, so every branch has to earn its place. Unresolved branches are flagged as **gaps**, and the tree is scored on breadth, depth, variety, shared authorship and substance.

The human plays on a React Flow canvas. The agent plays through tools:

- **WebMCP** (`document.modelContext`): the page registers its tools with the browser, so any WebMCP-capable agent (Chrome with the WebMCP flag, ChatGPT in a WebMCP browser, and so on) can play.
- **ElevenLabs voice**: the same tools are exposed as ElevenLabs *client tools*, so a voice agent can play by talking to you.

Both paths call the same `applyMove()` function, which drives the same Zustand store the buttons use. There is no second implementation of any rule.

## How a game goes

1. **Setup.** Type the question you want to plan for, or pick one of the presets. Nothing else is on the board yet.
2. **Play.** The human plants the root, then the players alternate. The human clicks a node to select it and uses the side panel to branch, prune, mark a gap, add a note or link, or pass. The agent calls `get_board` and then one of the move tools. The panel shows both budgets, whose turn it is, the live score, the open gaps and the last few moves.
3. **End.** The game ends when both budgets are spent, or when both players yield in a row. The end screen shows the score breakdown and the open gaps, and offers **Export markdown** (downloads `<question-slug>.md`), **Copy markdown**, **Copy share link** and **New game**. If the agent's final move ended the game, the human can still undo it from the end screen and keep playing.
4. **Coming back.** The game autosaves to `localStorage` and restores itself on reload, mid-game or finished. **Reset** wipes the save. A share link encodes the whole board in the URL hash; opening one shows a read-only board with the score and export options, and never overwrites your own saved game.

## Game rules

- **Budgets.** Each player has 6 moves. The budgets are separate: the human running out never costs the agent a move, and vice versa.
- **Costly moves.** `plant`, `branch`, `prune` and `mark_gap` each cost one move and must be made on your own turn.
- **Free moves.** `annotate` (add or change a note or link), `pass` and `get_board` are free and never change whose turn it is. Anyone can annotate any node at any time while the game is running.
- **Turns.** Turns alternate after every costly move. A player with no moves left is skipped, so the other player keeps the turn until their own budget is spent.
- **Stalled agent.** The human can skip the agent's turn at any time. With no agent connected (no WebMCP tools registered and no voice session), the agent's turn is skipped automatically after one second. With a voice agent connected, fifteen seconds without a human edit passes the human's turn automatically, with a visible countdown.
- **Ending.** The game ends when both budgets reach zero, or when two yields happen in a row. A skip counts as the agent yielding, so a human who passes right after skipping the agent ends the game.
- **Planting.** Only an empty board can be planted, and only once. The root can never be pruned or marked as a gap.
- **Pruning.** Pruning removes a node and everything beneath it.
- **Gaps.** A gap is a flag on a concept, not a node kind. Marking a gap says "this branch still needs something concrete". It closes automatically the moment a resource or skill is branched directly under it. You cannot mark the root, a node that is already a gap, or a node that already has a resource or skill child. Concepts with no resource or skill anywhere beneath them count as **implicit gaps** for scoring even if nobody marked them.
- **Undo.** The human can take back the agent's most recent action, and only that. Undo refunds the agent's move, restores pruned subtrees in full, and hands the turn back to the human. It is also available on the end screen when the agent's move ended the game, which reopens the game. Shared boards are read-only and cannot be undone.

### Scoring

| Component | Points | Max |
| --- | --- | --- |
| Coverage | 6 per concept that has a resource or skill anywhere beneath it | 30 |
| Depth | 5 per level below the root, up to three levels | 15 |
| Kind balance | 5 for each of concept, resource and skill present on the board | 15 |
| Shared authorship | 20 when both players created at least two nodes, 10 when both created at least one | 20 |
| Content | 1 per node with a note or a link | 10 |
| Open gaps | −5 per open gap, explicit or implicit (each node counted once) | — |

The total is clamped to the 0–100 range. The five positive components add up to 90, so the last ten points are headroom rather than something a board can earn today.

### Why these rules

Separate budgets keep one player from starving the other, so the tree is always the product of two authors. Free notes, links and passes let the conversation continue without burning turns, which matters when one player is a voice agent that likes to explain itself. Treating a gap as a flag rather than a node kind keeps the tree meaningful: a gap is an unfinished concept, and it closes itself when someone finishes it, so there is no bookkeeping move to spend. Implicit gaps push both players toward actionable plans, because a concept that never ends in something to read or practise is a promise nobody kept. Limiting undo to the agent's last move keeps the human in charge of the board without letting anyone rewrite history. And the score rewards exactly what a good study plan needs: breadth, depth, variety of node kinds, real collaboration and substance, while penalising open questions.

### Node types

| Kind | Meaning |
| --- | --- |
| `root` | The question. Exactly one per board, created by `plant`. |
| `concept` | Something to understand. Can be marked as a gap. |
| `resource` | Something to read, watch or reference. Closes a gap on its parent. |
| `skill` | Something to practise. Closes a gap on its parent. |

### Available actions

| Action | Cost | Who | What it does |
| --- | --- | --- | --- |
| Plant | 1 move | Either, on turn | Creates the root on an empty board |
| Branch | 1 move | Either, on turn | Adds a concept, resource or skill under a node |
| Prune | 1 move | Either, on turn | Removes a node and its subtree |
| Mark gap | 1 move | Either, on turn | Flags a concept as needing more work |
| Annotate | Free | Either, any time | Adds or clears a note and a link on a node |
| Pass | Free | Either, on turn | Yields the turn; two in a row end the game |
| Skip agent | Free | Human | Yields on the agent's behalf when it stalls |
| Undo | Free | Human | Reverts the agent's most recent action |

## Agent tools

Every agent-callable move exists in three places that must stay in sync: `TOOL_DEFINITIONS` in `src/moves.ts` (WebMCP), the `useConversationClientTool` hooks in `src/voice-agent.tsx` (ElevenLabs runtime) and `elevenlabs-tools.json` (ElevenLabs dashboard import). `src/tools-sync.test.ts` fails if they drift.

| Tool | Cost | Parameters | Description |
| --- | --- | --- | --- |
| `get_board` | Free | none | Returns the question, phase, turn, budgets, score, open and implicit gaps and every node |
| `plant` | 1 move | `label`, `note?`, `url?` | Creates the root on an empty board |
| `branch` | 1 move | `parentId`, `label`, `kind`, `note?`, `url?` | Adds a `concept`, `resource` or `skill` under a node |
| `prune` | 1 move | `nodeId` | Removes a node and its subtree |
| `mark_gap` | 1 move | `nodeId`, `reason?` | Flags a concept as a gap |
| `annotate` | Free | `nodeId`, `note?`, `url?` | Sets or clears a note or link |
| `pass` | Free | none | Yields the turn |

Node references (`parentId`, `nodeId`) accept an exact id such as `n3`, an exact label, or a unique partial label, case-insensitively. Anything ambiguous is rejected with a hint to call `get_board`. Every tool returns `{ success, message, nodeId?, board }`, so the agent always sees the board after its move, including the reason a move was refused.

## Voice agent setup (ElevenLabs)

1. Create an agent in the [ElevenLabs dashboard](https://elevenlabs.io/app/conversational-ai).
2. Import the client tools from `elevenlabs-tools.json` (one tool per entry, all of type `client`).
3. Paste the system prompt below.
4. Copy the agent id into `.env` as `VITE_ELEVENLABS_AGENT_ID` (see `.env.example`) and rebuild. The voice island in the bottom-left corner stays collapsed until an agent id is configured.

### System prompt

```text
You are the agent player in CanvasQuest, a cooperative game in which you and a human build a learning tree for a question the human chose.

Rules you must follow:
- Always call get_board before your first move and after any surprise. If gamePhase is "setup", ask the human to choose a question first.
- You have 6 costly moves for the whole game: plant, branch, prune and mark_gap each cost one. annotate and pass are free. Only move when currentPlayer is "agent".
- Prefer branch. Add concepts to understand, resources to read and skills to practise. Put a resource or skill under every concept you create so it does not stay an open gap.
- Use mark_gap when a concept needs something you cannot supply yet, and say why in the reason.
- Use prune only for things that are clearly wrong or off-topic, and say so out loud first.
- Use annotate freely to add short notes and links that make the tree useful.
- Reference nodes by their id (for example n3) or their exact label.
- Keep your spoken turns short: say what you are adding and why, in one or two sentences, then make the move.
- If a tool result says success is false, read the message, adjust, and try again or pass.
- When you are out of moves or have nothing worth adding, call pass.
```

## WebMCP integration

On load, `src/use-webmcp.ts` looks for `document.modelContext` and registers every entry of `TOOL_DEFINITIONS` with `registerTool`. Each tool's `execute` calls `applyMove()` and returns the result as JSON text. The console prints:

```text
[WebMCP] Registered 7 tools
```

When it is absent and no voice session is connected, the header shows the agent as not connected and the agent's turn is skipped automatically, so the human can still play solo.

### Testing with ChatGPT

Open the built app in a WebMCP-capable browser, connect ChatGPT (or any WebMCP agent) to the tab, and ask it to play. It should call `get_board`, then take turns with you using the tools above.

### Testing with Chrome

1. Enable the WebMCP flag in Chrome (`chrome://flags`, search for "WebMCP").
2. Load the app and check the console for `[WebMCP] Registered 7 tools`.
3. Use the browser's agent surface, or a stub such as `document.modelContext = { registerTool() {}, unregisterTool() {} }` before load to exercise the "agent connected" path by hand.

## Local development

```bash
npm ci
npm run dev
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | `tsc -b` type check, then a static Vite build into `dist/` |
| `npm test` | Vitest unit tests for the store, scoring, tools and tool-surface sync |
| `npm run lint` | oxlint |
| `npm run preview` | Serves the production build |

The build is fully static. There is no backend and no API key; the only optional configuration is the ElevenLabs agent id in `.env`. `package-lock.json` is committed, so `npm ci` gives a reproducible install.

## Architecture

- **Vite + React 19 + TypeScript** (strict), **React Flow 11** for the canvas, **Zustand 5** for state, **d3-hierarchy** for the tree layout, **@elevenlabs/react** for voice, **Vitest** for tests.

### Key files

| File | Role |
| --- | --- |
| `src/store.ts` | The rules engine. Budgets, turns, gaps, undo, history, game phase. Every mutation of `nodes` goes through here. |
| `src/moves.ts` | `applyMove()`, `readBoard()`, node reference resolution and `TOOL_DEFINITIONS`. The only entry point for agents. |
| `src/scoring.ts` | `computeScore()`, `computeImplicitGaps()` and the breakdown rows shown in the UI. |
| `src/layout.ts` | Tidy tree layout with d3-hierarchy; positions are derived, never stored. |
| `src/persistence.ts` | Debounced `localStorage` autosave, restore on load, share-link hash encoding. |
| `src/export-markdown.ts` | Turns the board into a markdown study plan for download or clipboard. |
| `src/setup-screen.tsx` | The question prompt and presets shown before the game starts. |
| `src/game-canvas.tsx` | React Flow canvas, store-owned selection, auto-fit. |
| `src/tree-node.tsx` | The custom React Flow node: kind colours, gap badge, note and link markers. |
| `src/game-controls.tsx` | The human's controls: budgets, turn, score, gaps, history, move buttons, auto-skip and idle-pass timers. |
| `src/end-screen.tsx` | Score breakdown, open gaps, export, share link, undo and new game. |
| `src/use-webmcp.ts` | Registers `TOOL_DEFINITIONS` with WebMCP. |
| `src/voice-agent.tsx` | ElevenLabs conversation panel and the client tool hooks. |
| `src/voice-agent-island.tsx` | Lazy-loads the voice panel so the ElevenLabs client is only fetched when needed. |
| `elevenlabs-tools.json` | Client tool definitions for the ElevenLabs dashboard. |

### Tools vs UI

```text
Human buttons ──► store actions ─┐
                                 ├──► Zustand store (rules) ──► React Flow canvas
WebMCP tools ──► applyMove() ────┤
ElevenLabs client tools ─────────┘
```

### Bundle

`npm run build` emits a static `dist/` folder. The ElevenLabs client is lazy-loaded so the voice code only downloads when the island is opened.

## License

MIT, see `LICENSE`.

## Challenge submission

CanvasQuest is an entry for the ElevenLabs WebMCP Challenge. It demonstrates a single set of game rules exposed to humans through a UI, to browser agents through WebMCP, and to voice agents through ElevenLabs client tools, with no backend and no API keys in the client.
