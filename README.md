# CanvasQuest

**A cooperative learning-tree game where an AI agent plants the first branches, a human joins in, and every finished tree stands in a forest.**

Built for the [ElevenLabs WebMCP Challenge](https://elevenlabs.io/), CanvasQuest turns the question "How should I learn X?" into a turn-based game played on a tree that grows, limb by limb, in a three.js forest. The agent opens the game on its own; the human joins once there is something to react to. The human plays through buttons; the agent plays through the same rules over WebMCP or the ElevenLabs voice client tools. One rules engine, three ways in.

- Developer: Anders Kitson
- Repository: `Agency7ai/canvasquest`

The wordmark in the top left of the page reads **Study Tree**. The repository, the storage keys and the agent prompt still say CanvasQuest; only the name on the screen has changed.

## What is CanvasQuest?

You start with a question. Together, you and the agent grow a **learning tree**: concepts to understand, resources to read, skills to practise. Each player has a small budget of moves, so every branch has to earn its place. Unresolved branches are flagged as **gaps**, and the tree is scored on breadth, depth, variety, shared authorship and substance.

The tree is drawn as a real tree. The first thing a visitor sees is the **forest**: a clearing with a sprout in the middle and every tree they have grown before standing around it. The board being played grows in the middle of the clearing as moves are made, and when the game ends the finished tree is planted in the grove. A flat React Flow **board** view of the same tree is one click away while playing.

The page is laid out like a terminal screen on cream paper: the **question index** down the left lists every tree you have started, the clearing sits in the middle with a title over it and a hint bar under it, and the panel for the current phase (plant, opening, play or end) sits on the right. The screen itself rests in a very faint bezel, with a nameplate, a power light and a trace of ivy, and nothing more: the interface is the point, the terminal is set dressing.

The agent plays through tools:

- **WebMCP** (`document.modelContext`): the page registers its tools with the browser, so any WebMCP-capable agent (Chrome with the WebMCP flag, ChatGPT or Codex in their own browsers, and so on) can play.
- **ElevenLabs voice**: the same tools are exposed as ElevenLabs *client tools*, so a voice agent can play by talking to you.

Both paths call the same `applyMove()` function, which drives the same Zustand store the buttons use. There is no second implementation of any rule.

## How a game goes

1. **The forest.** The landing page is the forest in the middle of the screen, with the question index on the left and the planting panel on the right: type what you want to learn, or pick one of the presets.
2. **The agent opens.** **Start with an agent** copies a prompt for your agent to the clipboard and starts the game in the *opening* phase, with the agent on the board alone. Paste the prompt into the agent driving the browser (or, with a voice agent configured, press **Start talking** and say the topic). The agent plants the root for free, grows up to three free branches, and passes to hand the board over. You watch the tree grow while it works. The opening panel shows how far the agent has got, keeps the prompt handy, and offers **Join in now**, which ends the opening whenever you want, plus undo of the agent's last move and reset.
3. **Play.** The players alternate with six moves each. The human clicks a limb in the forest (or a node on the board) to select it and uses the side panel to branch, prune, mark a gap (or unmark one they marked, free, and get the move back), add a note or link, or pass. **View markdown** on the selected node opens its note full screen, in Markdown with a live preview; a double-click on a board node does the same. The agent calls `get_board` (or `get_node_state` for the node you have selected) and then one of the move tools. The panel shows both budgets, whose turn it is, the live score, the open gaps and the last few moves. The **Forest | Board** toggle in the header switches views; the forest comes back at every change of phase. Whenever the agent calls `announce`, its words appear over the forest and are read aloud (in an ElevenLabs voice when a text-to-speech key is configured, otherwise by the browser), "your turn" line included, so you hear when the board is yours.
4. **End.** The game ends when both budgets are spent, or when both players yield in a row. The tree is planted in your forest, and the end screen shows the score breakdown and the open gaps, and offers **Export markdown** (downloads `<question-slug>.md`), **Copy markdown**, **Copy share link** and **New tree**. New tree clears the stage for another question; the finished tree stays in the question index and in the forest. If the agent's final move ended the game, the human can still undo it from the end screen and keep playing.
5. **The question index.** Every tree you start gets a line in the left-hand column, with the question, where it stands (opening, in play, or finished with its score) and a **Current tree** mark on the one on the board. **+ New tree** at the bottom parks the tree on the board and clears the stage for another question, and it works in any phase, so you can keep several trees going at once. Click a question to bring that tree back onto the board; whatever was there is parked in its place, with its phase, turn and budgets intact. **Find** filters the list, and the ✕ on a row deletes a tree from the index (the forest keeps it if it was finished).
6. **The grove.** Up to twelve finished trees stand around the clearing; a new tree grown from the same question replaces the old one. Click a tree to walk in: the caption names it with its node and open-gap counts, **Revisit this tree** brings it back onto the board with its score, export and share link (the tree being played is parked in the question index first), and **Fell it** removes it from the forest for good.
7. **Coming back.** The game autosaves to `localStorage` and restores itself on reload, mid-game or finished; the parked trees and the grove are saved separately. **Reset tree** removes the current tree from the question index and clears the board, but leaves the forest standing. A share link encodes the whole board in the URL hash; opening one shows a read-only board with the score and export options, and never overwrites your own saved game or your index; pick a question to get back to your own trees.

### Prefer to plant yourself?

**Plant it yourself** on the planting panel plants the root by hand and starts the game with the agent on turn. With no agent connected, its turn is skipped after a second, so the human can play solo as well.

### Forest controls

- **Drag** to look around, **scroll** to walk closer.
- **Hover** a limb to see its label (and its id, on the tree being played).
- **Click** a limb to select that node. Clicking a planted tree walks into it.
- **Double-click** to step back out to the clearing.

Trees grow limb by limb as nodes are added; with the system's reduced-motion setting on, they appear full-grown. A browser without WebGL gets a message instead of the forest, and the Board view still works.

## Game rules

- **Phases.** `setup` (no game yet), `opening` (the agent alone), `playing` (alternating turns) and `ended`.
- **The opening.** Once a game starts, the board belongs to the agent. Planting the root is free, and its first three board moves (branches, as a rule) are free as well. The opening ends after the third such move, when the agent passes, or when the human presses **Join in now**. It is then the human's turn.
- **Budgets.** After the opening each player has 6 moves. The budgets are separate: the human running out never costs the agent a move, and vice versa.
- **Costly moves.** `branch`, `prune` and `mark_gap` each cost one move and must be made on your own turn.
- **Free moves.** `plant`, `annotate` (add or change a note or link), `edit_note` (add to a note or change one passage of it), `announce`, `pass`, `get_board` and `get_node_state` are free and never change whose turn it is. Anyone can annotate any node at any time while the game is running. The human can also unmark a gap they marked themselves for free, which gives the move back.
- **Announcements.** `announce` is the agent's voice on the page: a short summary of what it is doing, plus an optional "your turn" line, shown over the forest and read aloud: by an ElevenLabs voice when `VITE_ELEVENLABS_API_KEY` is set (see [Announcement voice](#announcement-voice-optional)), otherwise by the browser's own speech synthesis with no key involved. It is allowed in any phase and never touches the board or the turn. The **Mute** button on the announcement mutes the speech and the choice is remembered; the text stays. While a voice session is connected the page shows the text but stays quiet, since the agent already speaks. Browsers only play sound after the page has been clicked once, and the announcement says so if it was blocked. If the ElevenLabs request fails, the browser voice reads the line instead and the announcement says why.
- **Notes.** A node's note is a Markdown document. **View markdown** in the side panel (or a double-click on a board node) slides the note down over the whole app, source on the left and rendered preview on the right. It saves as you type (⌘S or Ctrl+S saves at once, Esc closes) and the side panel shows the first line. The agent writes in the same note through `edit_note`, appending a section or rewording one passage, and its words appear in the open editor around whatever you are typing; if the two of you change the same passage at once, a banner lets you pick a version. The agent also hears when you have edited a note, so it can read and build on it. Notes are free, capped at 20,000 characters so the board still fits a share link, and go into the exported study plan.
- **Turns.** Turns alternate after every costly move. A player with no moves left is skipped, so the other player keeps the turn until their own budget is spent.
- **Stalled agent.** The human can skip the agent's turn at any time. With no agent connected (no WebMCP tools registered and no voice session), the agent's turn is skipped automatically after one second. With a voice agent connected, fifteen seconds without a human edit passes the human's turn automatically, with a visible countdown.
- **Ending.** The game ends when both budgets reach zero, or when two yields happen in a row. A skip counts as the agent yielding, so a human who passes right after skipping the agent ends the game.
- **Planting.** Only an empty board can be planted, and only once. An agent planting from the landing page starts a game and its own opening, with the label as the question. The root can never be pruned or marked as a gap.
- **Pruning.** Pruning removes a node and everything beneath it.
- **Gaps.** A gap is a flag on a concept, not a node kind. Marking a gap says "this branch still needs something concrete". It closes automatically the moment a resource or skill is branched directly under it. You cannot mark the root, a node that is already a gap, or a node that already has a resource or skill child. Concepts with no resource or skill anywhere beneath them count as **implicit gaps** for scoring even if nobody marked them. The human can unmark a gap they marked themselves; it is free and the move comes back. A gap the agent marked stays until someone fills it.
- **Undo.** The human can take back the agent's most recent action, and only that, during the opening as well as the game. Undo refunds the agent's move, restores pruned subtrees in full, and hands the turn back to the human. It is also available on the end screen when the agent's move ended the game, which reopens the game. Shared boards are read-only and cannot be undone.
- **The grove.** A finished tree is planted when the game ends. The grove keeps the last twelve trees, and a tree grown from the same question replaces its predecessor. Revisiting a planted tree loads it as a finished board, so it can be exported and shared but not played on.
- **The question index.** Every game that has started is a tree in the index, and exactly one of them is on the board. Switching to another tree parks the current one as it stands, so its phase, turn, budgets and history survive; nothing about a tree changes while it is parked. New tree parks the current tree and clears the board to `setup`. Deleting a tree removes it from the index only, so a finished tree still stands in the forest; a shared board is never in the index.

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

The agent opens because a bare board is the confusing moment: three branches give the human something to react to instead of a blank canvas, and because the opening is free, the scaffolding never eats into the budget the agent needs for the game proper. Separate budgets keep one player from starving the other, so the tree is always the product of two authors. Free notes, links and passes let the conversation continue without burning turns, which matters when one player is a voice agent that likes to explain itself. Treating a gap as a flag rather than a node kind keeps the tree meaningful: a gap is an unfinished concept, and it closes itself when someone finishes it, so there is no bookkeeping move to spend. Implicit gaps push both players toward actionable plans, because a concept that never ends in something to read or practise is a promise nobody kept. Limiting undo to the agent's last move keeps the human in charge of the board without letting anyone rewrite history. And the score rewards exactly what a good study plan needs: breadth, depth, variety of node kinds, real collaboration and substance, while penalising open questions.

### Node types

| Kind | Meaning |
| --- | --- |
| `root` | The question. Exactly one per board, created by `plant`. The trunk in the forest. |
| `concept` | Something to understand. Can be marked as a gap. |
| `resource` | Something to read, watch or reference. Closes a gap on its parent. |
| `skill` | Something to practise. Closes a gap on its parent. |

### Available actions

| Action | Cost | Who | What it does |
| --- | --- | --- | --- |
| Plant | Free | Either, on turn | Creates the root on an empty board; from the landing page it starts the game |
| Branch | 1 move (free in the opening) | Either, on turn | Adds a concept, resource or skill under a node |
| Prune | 1 move (free in the opening) | Either, on turn | Removes a node and its subtree |
| Mark gap | 1 move (free in the opening) | Either, on turn | Flags a concept as needing more work |
| Unmark gap | Free, refunds the move | Human, any time | Clears a gap the human marked; the agent's gaps have to be filled |
| Annotate | Free | Either, any time | Adds or clears a Markdown note and a link on a node |
| Pass | Free | Either, on turn | Yields the turn; in the opening it hands the board to the human; two in a row end the game |
| Announce | Free | Agent, any time | Shows a summary and a "your turn" line over the forest and reads them aloud |
| Join in | Free | Human | Ends the agent's opening early and takes the turn |
| Skip agent | Free | Human | Yields on the agent's behalf when it stalls |
| Undo | Free | Human | Reverts the agent's most recent action |
| Revisit | Free | Human, any time | Brings a planted tree back onto the board; the tree being played is parked in the question index |
| Switch tree | Free | Human, any time | Brings a tree from the question index onto the board and parks the current one |
| New tree | Free | Human | Parks the current tree in the question index and clears the board for a new question |
| Delete tree | Free | Human | Removes a tree from the question index; the forest keeps it if it was finished |
| Fell | Free | Human | Removes a planted tree from the forest |

## Agent tools

Every agent-callable move exists in three places that must stay in sync: `TOOL_DEFINITIONS` in `src/moves.ts` (WebMCP), the `useConversationClientTool` hooks in `src/voice-agent.tsx` (ElevenLabs runtime) and `elevenlabs-tools.json` (ElevenLabs dashboard import). `src/tools-sync.test.ts` fails if they drift.

| Tool | Cost | Parameters | Description |
| --- | --- | --- | --- |
| `get_board` | Free | none | Returns the question, phase, turn, budgets, opening moves left, score, open and implicit gaps, every node, the node the human has selected, the view they are looking at and the tree they have walked into |
| `get_node_state` | Free | `nodeId?` | Returns one node in detail, with its parent, children and gap state; omit `nodeId` to get the node the human has selected |
| `plant` | Free | `label`, `note?`, `url?` | Creates the root on an empty board; before a game exists it starts one and the agent's opening |
| `branch` | 1 move (free in the opening) | `parentId`, `label`, `kind`, `note?`, `url?` | Adds a `concept`, `resource` or `skill` under a node |
| `prune` | 1 move (free in the opening) | `nodeId` | Removes a node and its subtree |
| `mark_gap` | 1 move (free in the opening) | `nodeId`, `reason?` | Flags a concept as a gap |
| `annotate` | Free | `nodeId`, `note?`, `url?` | Sets or clears a Markdown note or link |
| `edit_note` | Free | `nodeId`, `mode`, `text`, `find?` | Co-writes the note: `append` adds a paragraph at the end, `replace` swaps one passage quoted exactly (`find`) for `text`; the open editor picks the change up live |
| `pass` | Free | none | Yields the turn; in the opening, hands the board to the human |
| `announce` | Free | `summary`, `handoff?` | Shows the summary and the optional "your turn" line over the forest and reads them aloud with the configured voice; each field under 200 characters |

The rules are written into the tool descriptions, so an agent that reads them knows how the opening works, what costs a move and why a move was refused. Node references (`parentId`, `nodeId`) accept an exact id such as `n3`, an exact label, or a unique partial label, case-insensitively. Anything ambiguous is rejected with a hint to call `get_board`. Every tool returns `{ success, message, nodeId?, board }`, so the agent always sees the board after its move, including the reason a move was refused.

### The agent prompt

The landing card builds the prompt the human hands to the agent (`src/agent-prompt.ts`). It points the agent at the tools and the topic, and leaves the rules to the tool descriptions:

```text
Use the WebMCP tools on this page to play CanvasQuest with me. Call get_board first and read each tool description: the rules are in them. Call plant with the label "How should I learn agentic web apps?" to start the game. Then grow up to 3 opening branches on your own, one branch per call, and call pass to hand the board to me. After that we alternate with 6 moves each: make exactly one move on your turn, call get_board to see what I did, and mark a gap when you cannot fill a branch yourself. Call announce with a one-sentence summary of each move you make, and add a handoff line whenever you hand the board to me so the page can tell me it is my turn.
```

With no topic typed, the prompt asks the agent to ask you what you want to learn and to plant that.

## Voice agent setup (ElevenLabs)

1. Create an agent in the [ElevenLabs dashboard](https://elevenlabs.io/app/conversational-ai).
2. Import the client tools from `elevenlabs-tools.json` (one tool per entry, all of type `client`).
3. Paste the system prompt below.
4. Copy the agent id into `.env` as `VITE_ELEVENLABS_AGENT_ID` (see `.env.example`) and rebuild. The voice island in the bottom-left corner stays collapsed until an agent id is configured.
5. The voice island is parked for now: `SHOW_VOICE_AGENT` in `src/App.tsx` is `false`, so the panel is not mounted and its ElevenLabs code is never downloaded. Set it to `true` to bring the panel back.

While a session is connected, the page also sends the agent a short status line whenever the game changes: what the human just did and what the agent should do next (open the game, make one move, wait, or stop because the game is over).

### System prompt

```text
You are the agent player in CanvasQuest, a cooperative game in which you and a human grow a learning tree for a question the human chose. The tree grows in a forest on the human's screen as you play.

Rules you must follow:
- Always call get_board before your first move and after any surprise. The rules are in the tool descriptions: read them.
- If gamePhase is "setup", ask the human what they want to learn, then call plant with that question as the label. Planting is free and starts the game with your opening.
- During your opening (gamePhase "opening") you play alone and your moves are free: grow up to 3 branches under the root, one per call, then call pass to hand the board to the human. The opening also ends on its own after the third branch, or when the human joins in.
- After the opening you have 6 costly moves for the whole game: branch, prune and mark_gap each cost one. annotate, edit_note, pass, get_board and get_node_state are free. Only move when currentPlayer is "agent".
- Prefer branch. Add concepts to understand, resources to read and skills to practise. Put a resource or skill under every concept you create so it does not stay an open gap.
- Use mark_gap when a concept needs something you cannot supply yet, and say why in the reason.
- Use prune only for things that are clearly wrong or off-topic, and say so out loud first.
- Use annotate freely to add short notes and links that make the tree useful.
- When the human asks you to write with them, or you hear that they edited a note, read it with get_node_state and use edit_note: append a section, or replace one passage you quote exactly. Never retype the whole note with annotate while they are writing in it.
- Call get_node_state without a nodeId to see the node the human has selected. Reference nodes by their id (for example n3) or their exact label.
- Keep your spoken turns short: say what you are adding and why, in one or two sentences, then make the move.
- Call announce with a one-sentence summary of each move you make, and add a handoff line when you hand the board to the human. The page shows it on screen; while you are connected by voice it does not read it aloud, because you already speak.
- If a tool result says success is false, read the message, adjust, and try again or pass.
- When you are out of moves or have nothing worth adding, call pass.
```

## Announcement voice (optional)

Announcements are read aloud by the browser's own speech synthesis by default, which needs no key. To hear them in an ElevenLabs voice instead, add a text-to-speech key to `.env` and rebuild:

```text
VITE_ELEVENLABS_API_KEY=sk_...   # the ElevenLabs voice is on when this is set
VITE_ELEVENLABS_VOICE_ID=        # optional, defaults to George (JBFqnCBsd6RMkjVDRZzb)
VITE_ELEVENLABS_TTS_MODEL=       # optional, defaults to eleven_flash_v2_5
```

The page then calls the ElevenLabs text-to-speech API straight from the browser for each announcement (one request per `announce` call, summary and handoff together) and plays the audio it gets back. If the request fails, the browser voice reads the line instead and the announcement says why. Nothing is requested while announcements are muted or while a voice session is connected, since the agent already speaks then.

A `VITE_` variable is compiled into the JavaScript bundle, so anyone who can open the page can read the key. Use a key made for this purpose, restricted to text-to-speech with a credit quota, and keep it out of a public deployment; there, a small proxy that holds the key server-side is the right shape.

## WebMCP integration

On load, `src/use-webmcp.ts` looks for `document.modelContext` and registers every entry of `TOOL_DEFINITIONS` with `registerTool`. Each tool's `execute` calls `applyMove()` and returns the result as JSON text. The console prints:

```text
[WebMCP] Registered 10 tools
```

When it is absent and no voice session is connected, the header shows the agent as not connected and the agent's turn is skipped automatically, so the human can still play solo. The landing card says whether WebMCP is live in the current browser.

### Testing with ChatGPT

Open the built app in a WebMCP-capable browser, connect ChatGPT (or any WebMCP agent) to the tab, type a topic, press **Start with an agent** and paste the copied prompt into the chat. The agent should call `get_board`, plant the root, grow its opening branches, pass, and then take turns with you using the tools above.

### Testing with Chrome

1. Enable the WebMCP flag in Chrome (`chrome://flags/#enable-webmcp-testing`).
2. Load the app and check the console for `[WebMCP] Registered 10 tools`.
3. Ask the browser's agent to discover the page first: "Use WebMCP tools in this browser to inspect all available tools and tell me what you can do." It should list the ten tools; then hand it the prompt from the landing card.
4. Without an agent surface, a stub such as `document.modelContext = { registerTool() {}, unregisterTool() {} }` before load exercises the "agent connected" path by hand.

## Local development

```bash
npm ci
npm run dev
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | `tsc -b` type check, then a static Vite build into `dist/` |
| `npm test` | Vitest unit tests for the store, scoring, tools, tool-surface sync and the forest layout |
| `npm run lint` | oxlint |
| `npm run preview` | Serves the production build |

The build is fully static. There is no backend, and no key is needed to play. The optional configuration lives in `.env`: the ElevenLabs agent id, and a text-to-speech key for the announcement voice, which, like every `VITE_` variable, ends up in the bundle. `package-lock.json` is committed, so `npm ci` gives a reproducible install.

## Architecture

- **Vite + React 19 + TypeScript** (strict), **three.js** for the forest, **React Flow 11** for the board view, **Zustand 5** for state, **d3-hierarchy** for the board layout, **@elevenlabs/react** for voice, **Vitest** for tests.

### Key files

| File | Role |
| --- | --- |
| `src/store.ts` | The rules engine. Phases, the opening, budgets, turns, gaps, undo, history, the grove. Every mutation of `nodes` goes through here. |
| `src/moves.ts` | `applyMove()`, `readBoard()`, node reference resolution and `TOOL_DEFINITIONS`. The only entry point for agents. |
| `src/scoring.ts` | `computeScore()`, `computeImplicitGaps()` and the breakdown rows shown in the UI. |
| `src/persistence.ts` | Debounced `localStorage` autosave of the game and the grove, restore on load, share-link hash encoding. |
| `src/export-markdown.ts` | Turns the board into a markdown study plan for download or clipboard. |
| `src/forest/forest-layout.ts` | Turns boards into trees: one limb per node, foliage per leaf, trees placed around the clearing. Pure geometry, covered by tests. |
| `src/forest/forest-scene.ts` | The three.js scene: growth shader, lighting, orbit controls, hover and click picking, walking into a tree. |
| `src/forest-view.tsx` | The forest as a React component: feeds the scene the board plus the grove, draws the caption, tooltip and the Revisit and Fell buttons. |
| `src/question-index.tsx` | The left-hand column: every tree by question, with a search box, the current-tree mark, switching, deleting and + New tree. |
| `src/landing-card.tsx` | The right-hand panel before a game: topic, presets, Start with an agent, Plant it yourself, the prompt. |
| `src/agent-prompt.ts` | `buildAgentPrompt()`, the prompt the human hands to the agent. |
| `src/opening-panel.tsx` | The side panel during the agent's opening: progress, the prompt, Join in now, undo, reset, history. |
| `src/game-controls.tsx` | The human's controls: budgets, turn, score, gaps, history, move buttons, auto-skip and idle-pass timers. |
| `src/end-screen.tsx` | Score breakdown, open gaps, export, share link, undo and new tree. |
| `src/move-history.tsx` | The move list shared by the three side panels. |
| `src/app.css` | The whole skin: the paper palette, panels, buttons and inputs, the question index, the forest overlay, the announcement and the note sheet, plus the faint terminal bezel around the screen. |
| `src/layout.ts` | Tidy tree layout for the board view with d3-hierarchy; positions are derived, never stored. |
| `src/game-canvas.tsx` | React Flow board, store-owned selection, auto-fit. |
| `src/tree-node.tsx` | The custom React Flow node: a paper card with a kind stripe, gap and kind tags, note preview and link. |
| `src/note-editor.tsx` | A node's note as a full-screen Markdown document: source, live preview, keyboard shortcuts, saving as you type, and the agent's edits merged in live. |
| `src/note-merge.ts` | Replays a change to the saved note onto the text the human is still typing, or reports the collision. |
| `src/app-meta.ts` | App name, tagline and the id of the board being played. |
| `src/use-webmcp.ts` | Registers `TOOL_DEFINITIONS` with WebMCP. |
| `src/voice-agent.tsx` | ElevenLabs conversation panel, the client tool hooks and the status lines sent to the agent. |
| `src/voice-agent-island.tsx` | Lazy-loads the voice panel so the ElevenLabs client is only fetched when needed. |
| `src/announcer.tsx` | The agent's announcements over the forest: shows the summary and the handoff line and reads them aloud, falling back to the browser voice when ElevenLabs fails. |
| `src/speech.ts` | The two voices behind announcements: ElevenLabs text-to-speech, called straight from the browser with `VITE_ELEVENLABS_API_KEY`, and the browser's speech synthesis. |
| `elevenlabs-tools.json` | Client tool definitions for the ElevenLabs dashboard. |

### Tools vs UI

```text
Human buttons ──► store actions ─┐                                ┌──► three.js forest
                                 ├──► Zustand store (rules) ──────┤
WebMCP tools ──► applyMove() ────┤                                └──► React Flow board
ElevenLabs client tools ─────────┘
```

Selection, the current view and the tree the human has walked into live in the store too, so the forest, the board, the side panel and the agent's `get_board` all agree on what the human is looking at.

### Bundle

`npm run build` emits a static `dist/` folder. three.js and the forest are split into their own chunk and fetched as the landing page draws; the ElevenLabs client is lazy-loaded so the voice code only downloads when the island is opened.

## License

MIT, see `LICENSE`.

## Challenge submission

CanvasQuest is an entry for the ElevenLabs WebMCP Challenge. It demonstrates a single set of game rules exposed to humans through a UI, to browser agents through WebMCP, and to voice agents through ElevenLabs client tools, with no backend and no API key needed in the client, wrapped in a forest that makes the agent's work visible as it happens.
