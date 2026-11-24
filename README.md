# Sales Pipeline

A single screen for a 20-person sales team sharing a pipeline of 50,000 deals. It answers five complaints from the brief: which deals to work on today, saves that fail silently, deals jumping around while teammates edit, moving thousands of deals at quarter end, and working without a mouse.

There is no backend. A fake API inside the app simulates latency, failed saves and teammates' edits, and a Simulation panel lets you change those while testing.

## Run it

Requires Node 18 or newer.

```bash
npm install && npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` | TypeScript check |
| `npm run build` | Typecheck and production build into `dist/` |
| `npm run preview` | Serve the production build locally |

### Deploy

It is a static site. On Vercel or Netlify, import the repository and use build command `npm run build` with output directory `dist`. No environment variables are needed.

## Try the failure cases

Open **Simulation** from the footer (or press Shift+S). It starts at the brief's numbers (saves take 0.3–1.5 s, 10% fail); **Reset to brief defaults** puts them back after you change them. Esc closes the panel.

- **Failed save:** set failed saves to 100% and move a deal with `1`–`7`. The row returns to its old stage, shows "didn't save" with Retry, and a message explains what happened.
- **Conflict:** focus a deal, press `M` and pick a stage, then immediately click "Teammate edits the focused deal". You get a conflict to resolve instead of a silent overwrite.
- **Live updates:** raise teammate edits per minute. Changed rows flash and say who changed them, but rows keep their position until you click "N updates. Refresh order".
- **Quarter-end bulk move:** open Quarter-end cleanup, press Ctrl/⌘+A, then Move to Lost. A dark bar floating at the bottom shows progress, each row shows whether it moved, didn't save or was skipped, and at the end the bar offers Undo, Retry for the failed part and Review for the skipped ones. Cancel stops the job between batches.
- **Offline:** tick Go offline, make a few moves, then untick it and use Retry all.
- **Large lists:** open All deals (50,000 rows, 1,000 pages of 50). The footer of the table shows "Rows 1–50 of 50,000" and lets you change rows per page or type a page number. ↓ on the last row continues onto the next page, Page Up/Down change page, Home/End go to the first or last deal. Tick the header checkbox to select the page, then "Select all 50,000 matching deals" to select everything; bulk moves act on the whole selection.
- **Filters:** above the table, filter by close-date range, stage (kept in sync with the stage path) and owner (in All deals and Quarter-end cleanup). Every filter feeds the same view query, so the counts, the stage path and "Select all matching" always cover exactly the deals the table shows.

Press `?` in the app for every keyboard shortcut.

## Assumptions

- **No login.** "Viewing as" in the header stands in for it: it sets who "you" are, which decides Today and My deals and who the simulated teammates can be.
- **One user-editable field.** Users move deals between stages. Teammates in the fake API also change owners, to show that edits to different fields merge.
- **Fixed sample data.** 50,000 deals are generated from a fixed seed on every load, spread across stages roughly like a mature pipeline, so every reviewer sees the same data. Nothing is saved across a reload.
- **"Today" rules** are reasonable defaults (close date today or passed, follow-up due, closes this week, changed by a teammate today, idle for three weeks), not tuned with real users.
- **Quarter-end cleanup** means open deals whose close date passed more than 90 days ago.
- **Large moves ask first.** Moves of 100 or more deals ask for confirmation; smaller ones just happen and can be undone.
- **Simulation defaults** match the brief: saves take 0.3–1.5 s and 1 in 10 fail.

## Project structure

```
src/
  api/fakeServer.ts      Fake backend: latency, failures, lost responses, teammates, idempotency
  domain/                Types, seeded data generator, "why today" rules, formatting
  sync/engine.ts         Client state and save logic (optimistic saves, retries, conflicts, undo, bulk jobs)
  view/query.ts          Filtering, sorting and counts over 50,000 deals
  view/selection.ts      Selection model, including "all matching the filter"
  hooks/usePipelineView  Filter state and the frozen row order
  components/            React UI: header and view switch, stage path, filter bar, paginated table,
                         floating bottom bar, dialogs, simulation drawer
  components/columns.ts  Which table columns to show for the view and the width available
  components/emptyState  The message and action shown when a view has no rows
  components/pagination    Page slicing, clamping after a refresh, "Rows 51–100 of N", and keyboard moves across pages
  components/listPosition  The "Sorted by close date, oldest first" sentence
  components/filterChips   Which chips show for the view and the search
  components/dateInput     Converts the date inputs to whole-day timestamps for the close-date filter
  components/leftView      The message on a row that no longer matches the view
  components/bulkOutcome   Per-row results of the current bulk move (moved, didn't save, skipped)
```

The save logic lives in a plain TypeScript class with no React dependency, so it is tested directly and React reads it through `useSyncExternalStore`.

## Tests

`npm test` runs unit tests for the parts most likely to go wrong:

- optimistic move, failed save and retry
- a save that was applied on the server but whose response was lost, retried without applying twice
- several quick moves on one deal (only the latest is sent)
- a teammate's change arriving mid-save becomes a conflict; a change to a different field merges
- older data never overwrites newer data
- undo after a teammate's change becomes a conflict instead of overwriting them
- bulk moves with a failed batch and a conflict, retrying only the failed part, undoing only what was changed, and cancelling midway
- "why today" rules and the selection model
- owner and close-date filters applied identically to rows, counts and "select all matching"
- which columns the table shows at a given width, the empty-state message for each view, pagination (slicing, clamping after refresh, keyboard crossing pages), the sort description, filter chips, the "leaves this view" and "Updated … by …" lines, per-row bulk results, and owner initials

See [WRITEUP.md](./WRITEUP.md) for decisions, trade-offs and limitations.
