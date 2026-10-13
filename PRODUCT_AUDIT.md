# Product and workspace audit — 2026-10-12

## Release-quality follow-through — 2026-10-13

Added a repeatable `npm run check:release` gate and a GitHub Actions workflow for
pushes, pull requests, or manual runs on the release-candidate branch. It runs the
unit suite, production build, compressed initial-route size budget, authentic
Stockfish verification, asset-license checks, and static deployment/offline checks.
The initial route is budgeted at 150 KiB gzip JavaScript and 20 KiB gzip CSS; the
engine stays on demand. External actions are pinned to immutable commit SHAs and
the checkout step does not persist credentials. No telemetry was added.

Local evidence on this worktree: `npm run check:release` passed 56/56 tests, the
production build, the actual packaged Stockfish 18 Lite WASM searches (including
a seven-ply Scholar's Mate review with 13 same-root searches, final `Qxf7#` marked
Best, about 2.4 seconds on this host), the piece-license/offline checks, the
static deployment checks, and the gzip budgets. Initial assets measured 129.22
kB JavaScript and 14.07 kB CSS in Vite output. CI has not run remotely because
these changes have not been pushed. The current evaluation-bar/live-search UI
changes were not run in a browser during this pass; browser and device checks
remain separate acceptance gates. No commit, push, deployment, or data deletion.

Verdict remains **BETA** until the updated board experience and workflow run are
verified in browser/preview conditions. This audit does not claim competitive
superiority or faster learning without player studies.

**Resumed acceptance:** see `FINAL_ACCEPTANCE.md` for the completed production-browser
journey, exact backup restore, mobile geometry, offline searches and real worker
waiting/activation. The partial browser statuses below are historical evidence.

## Verdict

BETA. The app provides a useful personal preparation workflow, but this audit
found a real multi-game Prep Map crash. That alone ruled out claiming release
readiness before repairs. It is fixed and verified in the production browser.
Complete browser coverage of every workspace remains pending because automatic
approval review interrupted further actions with a service rate-limit failure.

The concrete reason to return is a connected local study desk: import real games,
review with authentic Stockfish, keep personal lessons, compare a repertoire with
actual opponent games, and rehearse due positions with saved recall evidence.
It does not require an account or server. This is a useful product position;
preference over established products and player retention have not been measured.

Official baseline consulted: https://lichess.org/features and
https://lichess.org/@/lichess/blog/learn-from-your-mistakes/WFvLpiQA .

## Follow-up product-quality pass — 2026-10-13

Three workflow defects were fixed during the follow-up:

- Multi-game imports now identify repeated games independently of their display
  names. A numbered label added to the second copy could previously make the
  same PGN appear new. Detection also reads the latest saved games before the
  import, and batch detection includes earlier games from the same file. Tests
  cover duplicate names, in-batch repetition, existing records, and distinct
  opponent/color metadata.
- The training overview now calls the list “Saved schedule” and sorts due cards
  first, upcoming reviews by date, then paused positions. Previously it showed
  every saved card under “Due cards,” including future and paused positions.
- “Reviewed today” now groups timestamps in the player’s local timezone rather
  than UTC, avoiding a wrong day around midnight in non-UTC regions.

The current `npm run check:release` passed 59/59 automated tests, production
build, initial-route size budgets, genuine packaged Stockfish 18 Lite WASM
verification, asset licensing/offline coverage, and static deployment checks.
The initial bundles measured 129.58 kB JavaScript and 14.07 kB CSS (Vite gzip
figures); the independent gzip budget check reported 125.1 KiB JavaScript and
13.6 KiB CSS, within 150/20 KiB budgets. Stockfish remains outside the initial
bundle and was verified on demand. The complete engine verification ran a
seven-ply Scholar’s Mate review with 13 searches, final `Qxf7#` classified Best,
and terminal graph state in 2,689 ms on this host, plus Fool’s Mate, a legal
mate-in-one, forced-loss defense, stalemate, MultiPV, live streaming and stop.

This follow-up was not browser-tested: the available browser automation was
unavailable for another interaction pass. No physical-device, remote CI,
preview, or offline browser result is claimed. No dependency, commit, push,
deployment, or user-data deletion was made. Verdict remains **BETA** until the
current board and these workflow updates pass real browser acceptance.
Established products already offer analysis, studies and mistake practice. Do not
market those capabilities as exclusive inventions. The value proposition should
describe the connected, private preparation workflow this app actually delivers.

## Defects and improvements

1. **Prep Map crash:** with two distinct opening prefixes, transposition matching
   called `.some()` and `.includes()` on Sets. Reproduced with two imported PGNs;
   browser logged TypeError and rendered a blank application. Matching now
   iterates the Set and uses `.has()`. Extracted logic is covered by actual legal
   move-order/transposition, color and frequency regression cases.
2. **Unknown PGN dates:** the standard `????.??.??` date reached Intl formatting
   as Invalid Date and threw RangeError. Date formatting now handles unknown and
   malformed values, rejects impossible calendar dates and preserves the day
   of valid PGN dates. Prep recency also uses normalized valid date keys.
3. **Library dead ends:** non-game entries were disabled. Saved reviews now open
   their linked game; training, repertoire and notebook/event records open their
   workspaces. The displayed Ctrl/Command-K shortcut now focuses search and has
   a visible focus outline. Prep game-link icons gained accessible labels.
4. **Storage display:** navigator.storage.estimate supplies `usage`, but the UI
   read `used`. It now displays actual usage and labels quota as the site budget.
5. **Repeated practice additions:** concurrent calls could both read stale React
   records and create duplicate game/ply cards. Additions now run sequentially
   per game and read the saved training records before creating cards. Tests
   cover overlapping additions, independent sources and retry after failure.
6. **Error recovery:** unexpected workspace render errors now offer navigation
   to Today/Library and Reload instead of trapping the whole app on a blank page.
   Practice-source, tournament-create and deletion failures show recoverable
   feedback; failed deletion keeps the record. No data-reset action was added.

Final runtime checks of items 2–6 are still pending after the browser interruption.
They passed production compilation; data/date/queue logic received unit coverage.
The error-boundary fallback, shortcut and linked-record navigation have not been
claimed as browser-tested in this pass.

## Actual coverage this pass

| Workspace | What actually ran |
| --- | --- |
| Today | Production page opened with empty QA library; import dialog opened. |
| Game Review | Two legal PGNs imported together, with opponent name and Black color. |
| Prep Map | Crash reproduced before fix; after fix both opening rows, exact sample/color counts and accessible game links rendered. |
| Repertoire Clash | Saved a legal White Reti line; one exact match among two compatible games, one gap; practice link created four legal positions. |
| Training | Four saved positions displayed. Session/reveal action was rejected before execution; no new session result claimed. |
| Tournament/Notebook | Source and failure paths audited; browser creation/round workflow pending. |
| Library | Source fixes and production compilation; new navigation/shortcut/storage checks pending. |
| Analysis Board | Prior browser evidence in MOBILE_VERIFICATION.md; no new board search in this pass. |

Earlier backup, IndexedDB, service-worker and offline evidence remains in
RELEASE_VERIFICATION.md. Earlier mobile and personal-practice evidence remains
in MOBILE_VERIFICATION.md and PRACTICE_VERIFICATION.md. Those historical checks
do not establish that every final page was exercised during this pass.

## Automated checks and measurements

- 44 unit tests passed, zero failures. Seven added cases cover preparation,
  date handling and concurrent additions.
- Genuine Stockfish 18 Lite packaged JS/WASM identity passed. Scholar's Mate
  full review: 7 plies, 13 same-root searches, final Qxf7# Best, terminal graph,
  4,101ms on this host. Fool's Mate, independent mate-in-one, forced-loss defense,
  stalemate and three legal MultiPV lines passed.
- Production build, syntax checks for extracted modules, piece hashes/licensing,
  offline asset references and static Pages compatibility checks passed.
- Final JS 411,732 bytes / 126.31kB gzip; CSS 68,873 bytes / 13.48kB gzip.
  Growth from the previous practice build: approximately 0.80kB combined gzip.
  No dependencies added. Worker memory, cold transfer and final UI latency were
  not remeasured; prior measurements are clearly scoped in earlier reports.
- git diff --check passed with the existing README line-ending warning. Final
  dist contains no temporary browser harness. No commit, push or deployment.

## Remaining acceptance, without risking a user library

Use a new origin/profile and keep an exported original backup available.

1. Import the Scholar PGN and two legal Reti move orders, including a game tagged
   `[Date "????.??.??"]`. Visit Today/Library/Prep; none should crash, and the Reti
   rows should link as transpositions with explicit sample counts.
2. Open every Library record type. Game/review entries should open the correct
   game; other entries should reach their workspace. Ctrl/Command-K should focus
   search visibly. Verify displayed storage against browser storage estimate.
3. Create an opponent note and tournament; add a round; update both task boxes
   and round status; refresh and check all records. Exercise failed writes on a
   disposable QA profile and confirm an error with original data retained.
4. Analyze a full game, save a takeaway, add the same critical moments rapidly
   twice, then inspect actual records: one training card per game/ply. Complete
   hinted, unaided and revealed attempts; refresh and verify logs/schedules.
5. Export backup, restore into another isolated profile, re-export and compare
   records exactly. Invalid/truncated imports must leave the destination intact.
6. Close old tabs to finish service-worker update; reload with connectivity off,
   reopen saved review, and run cached Stockfish. Verify installed PWA and update
   recovery on actual HTTPS, Android and iOS before declaring READY.
7. Repeat the board/practice journey on 320px and 390px devices with physical
   touch and assistive technology. Ask real players to complete import -> review
   -> lesson -> practice unprompted, record friction/time, and compare that same
   task with their usual chess application. This establishes usability evidence
   without inventing competitive or retention claims.

The automatic approval service returned 429 and rejected the next browser action.
It was not executed. No alternate browser or indirect command bypass was used.
QA records on port 49331 were retained; no legitimate records were deleted.
