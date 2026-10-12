# Product quality and browser acceptance — 2026-10-13

**Verdict: BETA, suitable for a controlled release candidate.** The complete local
production-browser journey now passes, including exact backup restoration,
repertoire editing, practice persistence, promotion, variations, mobile geometry,
cached offline engine searches and real service-worker waiting/activation.
Physical-device touch, assistive screen readers and installed HTTPS PWA acceptance
remain release gates. Learning speed and preference over other products are unmeasured.

On Oct 13, a fresh light-theme browser pass confirmed legal board interaction and
no horizontal overflow at 320px, 390px and 1440px; the 1440px board squares were
69.16–69.17px. Visual inspection exposed the bottom board edge extending below a
900px desktop viewport. A desktop-only height cap now scales the analysis board
from 570px to the available viewport space; mobile sizing is untouched. The CSS
change passed a clean build, all 50 unit tests, Stockfish verification and both
static asset/Pages checks. The browser session timed out when reopening the rebuilt
app, so the final desktop height cap itself is not yet runtime-verified.

The production source, tests and deployment configuration are still untracked by
Git (except the modified README). A Git-integrated deploy from the current commit
would therefore be incomplete. The app also has no public HTTPS preview in this
workspace.

## Final resumed acceptance evidence

On empty disposable origin `127.0.0.1:49339`, the browser harness reached its final
**COMPLETE** line. It imported three legal games, reviewed Scholar's Mate with
genuine Stockfish, saved practice, compared two Reti move orders, renamed and
shortened a repertoire without deleting practice history, and exercised Library
search/links, notebook notes and queued tournament changes. The real UI export Blob
was restored through the actual file input with automated File/DataTransfer events.
Games, reviews, repertoire, tournament/opponent and training records matched the
export exactly; malformed input changed nothing. Only its identified Scholar test
game and linked records were deleted, then recovered through that backup. No user
library was reset. Returning after reload restored personal recall evidence.

The run also passed promotion, legal/illegal moves, flip, arrow toggling, imported
PGN side variations, and 320/390px equal-square/no-overflow assertions. Separate
board checks verified one Tab entry, eight rows, decoded SVGs, synthetic touch
cancellation, mobile panel parity and More-dialog focus restoration. Real browser
keyboard Enter/Arrow navigation played e2-e4. These are automated browser inputs;
they are not physical-device or screen-reader tests.

With the preview server stopped, the shell reloaded, restored records reopened,
a changed depth-10 full-game review completed, and a newly loaded mate-in-one FEN
returned Qg7# / +M1 with actual cached Stockfish. Network-disconnected phone behavior
and installed-PWA behavior were not inferred from this server-unavailable check.

A temporary **built output only** cache-version change exercised the real worker:
the new version waited while old tabs remained open, preserved old shell/engine
caches and all 14 records, then activated after those tabs closed, removed the old
app cache and preserved the engine and exact records. The final rebuild restores
the production worker and removes every temporary QA page.

Browser engine fault injection also passed: stream cancellation reports AbortError
and same-length corrupt cached bytes recover authentic engine bytes. Actual
IndexedDB clone errors, injected transaction interruption and injected quota failure
rolled back without partial replacement. Quota exhaustion was simulated, not induced
by filling the user's disk.

Test harness fixes in this pass wait for asynchronous import/edit transactions and
use the actual annotation toggle name. Those timing/selector failures were not
reported as application defects. No new product failure was observed in the
completed journeys. Existing verified feature/data fixes are retained.

### Measured performance and practical limits

- 50 unit tests passed; genuine packaged Stockfish verification passed again.
  The Node full Scholar review took 33,119ms under that run's host load.
- Browser seven-ply depth-12 full reviews, including persistence: 62,120ms,
  30,555ms and 2,789ms across runs. Host load/warm state varied; this range is not
  evidence of a code optimization or a mobile speed guarantee. Long games at
  high depth remain a performance risk, with cancellation/progress available.
- A separate browser engine initialization: 3,022ms; depth-12 mate search: 1,023ms.
  A 20ms responsiveness timer's largest observed gap was 73ms over 196 samples.
- Ten legal tap-pair/paint samples: mean 150ms, maximum 179ms, including four
  animation frames per sample; this is not pure pointer latency.
- Main-page heap: 10,834,390 bytes, excluding worker/WASM. Engine-inclusive storage
  sample: 7,916,619 bytes. Total worker memory was not measured.
- Actual initial asset decoded bytes: JS 415,442 and CSS 69,351. Transfer reported
  zero in the cached run, so no fresh network-transfer claim is made. Build gzip
  sizes remain 127.33kB JS / 13.58kB CSS, engine downloaded on demand.
- Board squares measured exactly 42.375px at 390px and 33.625px at 320px in the
  tested layout, within the regression tolerance of 0.1 CSS pixel.

### Before and after

| Earlier weakness | Current verified behavior |
| --- | --- |
| Unequal board rows and intrinsic piece sizing | 64 equal cells, local SVGs, compact mobile controls |
| Scholar's Mate mislabeled and negative terminal graph | Best move, White terminal win, consistent saved review |
| Multiple opening rows crashed Prep Map | Legal transpositions, real samples and color-aware comparisons |
| Library records led to generic or disabled destinations | Requested tournament opens; search shortcut works |
| Repertoire required replacement rather than editing | Rename keeps history; removed positions pause safely |
| Practice additions could race and duplicate | One card per game/ply, saved recall survives restore/reload |
| Tournament date/checklist writes lost state | Exact date and rapid checklist changes persist |

The useful reason to return is the connected private workflow: personal game
mistakes → saved takeaways → scheduled recall → repertoire/opponent preparation.
Lichess already offers analysis, studies and mistake practice; those features are
not exclusive inventions (https://lichess.org/features). This app's workflow and
local privacy are a product proposition, not proven competitive superiority.
Observe new players completing import/review/practice/return tasks before claiming
faster understanding or stronger retention.

The remaining sections record the earlier partial pass and implementation history;
pending labels there are superseded only by the explicit resumed evidence above.

Final recheck: `npm test` passed **50/50**, `npm run build` passed,
`npm run check:assets` and `npm run check:pages` passed. New browser scripts passed
`node --check`; `git diff --check` passed with the existing README CRLF warning.
The final output contains the production cache version `a20d4300590a` and no
`dist/__qa__` directory. No commit, push, deployment or user-database reset.

### Repeat real worker lifecycle checks

Prepare the QA pages after building, serve an empty disposable origin and complete
acceptance first. Open `/__qa__/update-lifecycle.html`, click Save update baseline.
Change **only** the built `dist/sw.js` APP_CACHE suffix to a different 12-digit
hex version (the run used `000000000012`), then click Verify waiting update. Close
every tab on that test origin, reopen the lifecycle page and click Verify activated
update. Both checks must report PASS for exact data and engine preservation.

The optional failed-installation check is **not browser-verified**. To reproduce
its intended controlled fault, save a fresh baseline, change the built cache suffix
again, and temporarily throw `new Error('QA installation interruption')` immediately
after `await cache.addAll(SHELL)` inside the install try block. Verify failed
installation should observe a redundant candidate, retain the active worker/cache
and compare records exactly. This simulates an interrupted installation; it does
not disconnect a physical device. Rebuild immediately after any such fixture change.

## Scorecard

| Area | Automated/source evidence | Browser evidence this pass | Status |
| --- | --- | --- | --- |
| Stockfish correctness | Genuine packaged 18 Lite searches and chess regressions pass | Full import/analyze/practice journey and cached searches pass | Local acceptance passed |
| Tournament and Library | Round-write, date and backup regressions pass | Exact date, rapid tasks, targeted event, search, notebook and deletion/restore pass | Local acceptance passed |
| Repertoire editing | Rename, pause/reactivate, history and backup tests pass | Rename, pause, comparison, practice and exact restoration pass | Local acceptance passed |
| Board and accessibility | SVG hashes, licensing, legal-move logic, mapping and coordinate contrast pass | Promotion, variations, keyboard, annotations, focus and 320/390 layouts pass | Physical/assistive checks pending |
| Offline/PWA and data | Lifecycle, rollback, cascade and compatibility regressions pass | Server-stopped reload/new searches, exact restore and real waiting/activation pass | HTTPS installation/device gates pending |

Physical-device touch, virtual keyboards, assistive screen readers and installed
HTTPS PWA behavior were not tested. Browser viewport evidence is distinct from
physical-device evidence. Previous reports remain historical evidence, not a fresh
pass on every final change.

## Implemented fixes

- Added legal repertoire editing. Renaming preserves card IDs, schedules and recall
  history. Positions removed from the prepared line are paused, not deleted;
  restoring those positions reactivates the same cards. Paused cards are excluded
  from due counts. Edits and additions are serialized per line, use saved records,
  and commit the line plus affected cards in one IndexedDB transaction.
- Empty lines are rejected; repeated submits are guarded. Edit opens with focus
  on the form. A save against a removed line cannot silently recreate it.
- Tournament date input now responds to input as well as change events. During
  browser automation, the input displayed 2026-10-20 while the saved event retained
  an empty date. This discrepancy was reproduced twice; the correction is built,
  but a new date-picker/browser run remains pending. Physical picker behavior
  was not established as broken by that automated input test.
- Round updates now queue per tournament, read the latest record and patch one
  task by ID. Rapid task/status writes preserve other tasks, notes and event date.
- Library opens the selected tournament, prepared-line editor, practice card or
  opponent notebook entry. Training cards use their actual names so different
  positions are distinguishable. Saved opponent notes are visible in the notebook.
- Coordinate text had duplicate CSS that reduced it to 7px and translucent colors.
  It now has a 9px minimum and high-contrast dark-square backing. Coordinate color
  tests pass the 4.5:1 text threshold across palettes. Selection/focus uses two
  contrasting rings. This is calculated color evidence, not a complete accessibility
  certification or screen-reader test.
- Backup validation rejects corrupt opponent notes and invalid paused-card dates
  before replacement, while legacy records without those optional fields remain valid.

## Historical partial runtime evidence before resumed acceptance

On fresh local origin 49332, the production browser performed:

1. Created Acceptance Black with a saved notebook note.
2. Created Acceptance Open, added a White round/preparation note, checked both
   tasks and selected Prepared. After reload the task checked attributes remained.
   Stronger exact-record/status assertions are in the pending acceptance harness.
3. Opened Personal Library, focused search with Ctrl-K, searched Acceptance Open
   and navigated back to Tournament Workspace through its record link.
4. Storage displayed 0.6 MB used and a browser-managed site budget.
5. Reproduced the calendar-field state discrepancy with a second named QA event.

No new browser game deletion, backup restoration, repertoire editing, training
completion, board gestures or offline result is claimed. The full harness was
prepared, but its execution/results were not observed before the connection failed.
No screenshot of final changes is claimed.

## Checks and measurements

- **50 unit tests passed, 0 failed.** Six added cases cover repertoire-edit safety,
  corrupt optional data, queued round changes and coordinate contrast.
- Genuine Stockfish 18 Lite WASM verification passed: Scholar's Mate 7 plies,
  13 same-root searches, Qxf7# Best, terminal White graph; Fool's Mate; independent
  legal mate-in-one; forced-loss defense; stalemate; three legal MultiPV lines.
  Full Scholar review took **11,409ms in the Node engine harness** on this host.
  This is not a mobile/browser analysis benchmark.
- Production build, asset hashes/licenses, static Pages checks and JavaScript
  syntax checks passed. git diff --check passed with the existing README CRLF warning.
- Final JS **415.44kB / 127.33kB gzip**; CSS **69.35kB / 13.58kB gzip**.
  No dependencies added. Browser responsiveness, cold transfer and total worker
  memory were not remeasured in this pass.
- 12 unmodified Chessnut SVGs total **45,166 bytes**. Pinned upstream Apache-2.0
  license and Alexis Luengas copyright were rechecked; complete notices, provenance,
  built copies and offline manifest coverage passed.
  Sources: https://raw.githubusercontent.com/LexLuengas/chessnut-pieces/2b8eaf14a31edad7e9deb53b1473e1d4857868a9/LICENSE.txt
  and https://raw.githubusercontent.com/LexLuengas/chessnut-pieces/2b8eaf14a31edad7e9deb53b1473e1d4857868a9/COPYRIGHT.txt .
- Original board code includes tap/drag Pointer Events, legal destinations, promotion,
  check/last-move feedback, orientation, arrows/circles, keyboard grid navigation,
  preferences and variation replay. No Chessground code or Lichess branding added.
- Final dist excludes the temporary QA pages. Working tree is preserved, including
  the existing untracked application. No commit, push or deployment.

## Finish browser acceptance reproducibly

Use an **empty disposable origin**; never point the acceptance harness at a user
library. It refuses existing records, creates named QA fixtures, captures the real
UI backup export, verifies the deletion target, removes only its own game and
linked records, then restores the captured backup and compares records exactly.
Restore files and input events are injected by the test; this does not certify a
physical file-picker or touch experience.

```powershell
npm run build
node scripts/prepare-browser-check.mjs
npm run preview -- --host 127.0.0.1 --port 49334 --strictPort
```

Open `http://127.0.0.1:49334/__qa__/acceptance.html` and click Run isolated product
acceptance. The test covers several PGNs, real full-game Stockfish, two legal
Reti transpositions, duplicate practice requests, editing, saved recall, variation
navigation, promotion, annotations, 320/390 geometry, safe QA deletion and exact
backup restoration. A result is a pass only when its final COMPLETE line appears.
Use a new origin if a partial run created fixtures; do not purge an existing library.

Then run the existing `/__qa__/index.html` checks for atomic restoration,
engine/cache integrity, geometry and focus. Each page states its database scope;
fault injection belongs only on disposable origins. Rebuild afterward to remove
the temporary test pages from dist.

Still required before READY (completed local checks above supersede earlier pending items):

1. On the final HTTPS host repeat cold installation, cached shell/engine reload,
   new full-game and board searches in airplane mode, exact backup restoration
   into a separate browser profile and return-session persistence.
2. Repeat an interrupted app installation in the real installed browser. The extra
   failed-installation browser harness timed out at connection dispatch before it
   ran. Interrupted-installation automated regressions pass; actual waiting and
   successful activation with intact data were verified locally.
3. On actual 320/390 devices, test tap, drag, promotion, scrolling conflicts,
   orientation, virtual keyboard and safe areas. Repeat with VoiceOver/TalkBack/NVDA.
4. On the intended HTTPS host, install, reopen in airplane mode and repeat cached
   analysis and backup acceptance. No public-host or installation result is claimed here.

## Vercel release-candidate preparation — 2026-10-13

The Vercel package now provides the Vite build output, a SPA fallback, explicit
manifest/WASM/worker/icon MIME types, and `no-cache` for the service worker,
offline asset manifest, manifest and same-URL engine assets. The build includes
the retained SVG mark plus original 192px and 512px PNG versions; both PNGs are
included in the offline cache and verified for dimensions, PNG structure and
brand colors. The PNGs were generated from the existing local vector artwork by
`npm run icons:generate`, which uses only Node's standard library.

This pass passed 52/52 unit tests, the production build, genuine Stockfish 18
verification (seven-ply Scholar's Mate full review: 2,512ms on this host), piece
license/provenance checks, static package checks and `git diff --check`. These
are local build and engine measurements, not constrained-device benchmarks.

The in-app browser could not connect to the local Vite preview from its isolated
browser environment. Therefore the latest desktop height cap and this package's
rendering were not verified in a fresh browser session. Prior browser and offline
acceptance results above remain valid for the builds they tested; this pass does
not claim Vercel HTTPS, installability or physical-device verification. No Vercel
CLI or linked Vercel project was found, so no remote preview was deployed.
