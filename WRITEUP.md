# Sales Pipeline

A 20-person team shares about 50,000 deals. They need to know what to work on today, trust that a move saved, keep working while teammates edit, move thousands of stale deals at quarter end, and do it from the keyboard. This is one screen for that. There is no backend: a fake API inside the app delays saves, fails about one in ten, and edits deals as other people.

## What I built, and why a table

I used a table, not a board. A stage column can hold about 10,000 deals. Cards cannot show that, and they are a poor way to compare close date, value, and owner or to select thousands of rows. A paged table can. The page shows 50 rows by default (25 or 100 are available), so the browser never mounts 50,000 rows. Arrow keys cross the page boundary, and Home and End jump the whole list.

Four views sit in the header. **Today** is the deals that need this person now: close date today or recently passed, a follow-up that is due, a close this week, a teammate change today, or three weeks of silence late in the funnel. Each row says why. **My deals** is everything they own. **All deals** is the full pipeline. **Quarter-end cleanup** is open deals whose close date passed more than 90 days ago, which is the "move thousands to Lost" job.

Today and Quarter-end cleanup do not show Won or Lost on the stage path or in the stage filter. Those two views are unfinished work. A deal marked Won or Lost is done, so it leaves the list and those counts would stay at 0, which looks like the move failed. You can still move a row to Won or Lost from the table or the keyboard. The deal then drops out of Today or Quarter-end cleanup, and it is counted under Won or Lost on All deals and My deals, which keep every stage.

"Viewing as" stands in for login. It decides whose Today and My deals you see, and who the simulated teammates can be.

## Decisions, and what I rejected

**Frozen order instead of live re-sorting.** Teammate edits still update the row, and the row flashes and names who changed it. The row does not move. A count in the filter bar, "N updates. Refresh order", re-sorts only when the user asks. Re-sorting on every edit would pull deals out from under the cursor, which is the complaint in the brief. I rejected a websocket-style "the list is always the latest sort."

**Field-level conflicts instead of last-write-wins.** A save sends the stage the user saw. If that stage is still current, the move applies. If a teammate already changed the stage, the save is a conflict: the user sees both stages and chooses. A teammate edit to a different field, such as owner, merges and does not block the stage change. I rejected locking the row, which would stop 20 people working, and silent overwrite, which loses someone's move.

**Optimistic moves, with the old stage still visible.** The row shows the target stage immediately and a saving state. On failure it returns to the previous stage, says it did not save, and offers Retry. Several quick moves on one deal keep only the latest intent. Retry sends the same request id, so a save that landed on the server but whose response was lost is not applied twice.

**Bulk work in batches, not one request per deal.** A move of more than 25 deals runs as a job: batches of 200, three at a time, with a progress bar. The bar reports how many saved, how many failed, and how many were skipped because a teammate had changed them. Retry resends only the failed part. Undo puts back only the deals this job changed. Cancel stops between batches. Moves of 100 or more ask for confirmation first; smaller ones just happen and can be undone. I rejected a modal wizard and a per-row confirmation, both of which make a quarter-end cleanup unusable.

**Selection is a set, or "everything matching."** The header checkbox selects the page. "Select all matching" selects every deal in the current filter, including other pages. If the filter changes, the selection starts over, so a bulk move cannot hit deals the user is no longer looking at.

The selection bar and error messages float over the table. They do not shorten the list.

## Failed saves and teammates

The Simulation panel, opened from the footer or with Shift+S, starts at the brief's numbers: 0.3–1.5 seconds, 10% failure. It can be set to always fail, to go offline, or to raise how often teammates edit. Offline moves stay failed until the user is back online and retries.

A failed save is never only a toast. The row itself shows "didn't save" and Retry, and Shift+R retries every failed save. A conflict stays on the row until the user resolves it with Enter. Undo of a move that a teammate has since changed becomes a conflict rather than overwriting them.

## What I would do with more time

I would keep the paged table. I would not switch to a board. With more time I would add a windowed list only if one continuous scroll turned out to matter, and I would run a keyboard pass with a screen reader on the stage picker and the bulk bar. Nothing is saved across a reload; I would not add persistence without a real backend. The Today rules are defaults, not something tuned with salespeople. I would also let a user edit more than the stage, with the same expected-value check on each field.
