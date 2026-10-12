# Release verification — 2026-10-12

Verdict: **BETA**. The verified local workflows below pass. Physical-device touch,
spoken screen-reader output, installed-PWA behavior and public HTTPS behavior remain
unverified. No commit, push or deployment was performed.

## Fixes

- All IndexedDB writes abort on synchronous errors. Previously a DataCloneError
  after clear/queued puts could leave a transaction able to commit partial work.
- Backups export committed IndexedDB records rather than a potentially stale React
  snapshot. Restore is blocked during active analysis to prevent review writes
  crossing the replacement boundary.
- Backup validation rejects mismatched game lengths, broken game links, illegal
  repertoire moves, illegal training targets and malformed record metadata.
- Service-worker updates wait for existing tabs to close before activation and old
  cache cleanup. App versions now hash shell, metadata, worker and bundle contents.
- Promotion and import dialogs focus their controls, trap Tab, support Escape and
  return focus. Boards have eight semantic rows, one Tab stop, and arrow navigation
  scoped to the current board.

## Actual evidence

- Real browser PGN import and Stockfish review created a game, complete seven-ply
  review, repertoire line and two training cards on a disposable localhost origin.
- UI export → UI restore on a different empty origin → UI re-export: all five
  records deep-equal the original, including IDs, scores, PVs, timestamps and schedules.
  This is origin isolation within one browser profile, not a separate OS profile.
- Malformed duplicate-ID backup rejected without replacing the five records;
  canceled valid restore preserved them. Restored review reopened after reload.
- Real IndexedDB harness: synchronous clone failure, partially queued bulk import,
  injected AbortError and injected QuotaExceededError all rolled back. Successful
  replacement committed completely. Quota exhaustion and interruption were injected
  through the real transaction; no physical disk exhaustion/browser process kill.
- Real worker lifecycle: update installed/waiting while old clients remained;
  closing clients allowed activation and cleanup, leaving current app/engine caches
  and IndexedDB intact.
- With preview server stopped: full reload succeeded, genuine cached Stockfish
  completed another full Scholar's Mate review, and another reload reopened it.
  Qxf7# stayed Best and the graph reported White wins by checkmate. This is a
  server-unavailable check, not airplane mode or a public-host check.
- Real engine download cancellation reported AbortError; same-size corrupt JS
  cache recovered SHA-256-verified packaged bytes; startup and depth-12 mate search
  succeeded. App-install failure and uncached offline engine recovery have unit
  lifecycle coverage; interrupted worker installation was not fault-injected live.
- Real 320px/390px viewport checks: library and board rendered, no horizontal page
  overflow (305px/375px content width after scrollbar). Square activation, arrow
  navigation, Enter promotion, rook/knight underpromotion, modal focus trapping and
  return focus verified. Accessibility tree exposes rows, square/piece/turn labels.
  These are browser automation checks, not physical touch or spoken AT checks.

## Measurements and automated checks

- Browser Stockfish startup: 409 ms; depth-12 mate search: 53 ms; max 20 ms UI timer
  gap: 70 ms over 21 samples. This short search is not a long-game benchmark.
- Browser storage after old cache cleanup: 7,804,597 bytes; cache 7,773,440 bytes;
  IndexedDB 28,064 bytes. Earlier measurements with waiting versions were larger.
- Main-page heap reading after cleanup: 8,790,105 bytes. Worker/WASM memory is not
  exposed by the connected tooling and is not included in this figure.
- Genuine packaged engine CLI verification: Scholar/Fool's Mate, legal mate-in-one,
  forced-loss defense, stalemate and MultiPV passed. Full seven-ply review took
  2,125 ms across 13 searches. Browser full review also passed; its wall duration
  was not measured precisely.
- `npm test`: 26 passed, 0 failed; `npm run verify:engine`: passed;
  `npm run build`: passed; `npm run check:pages`: passed; `git diff --check`: passed
  with an existing README line-ending warning.
- Final production JS 389.66 kB (119.31 kB gzip), CSS 58.42 kB (11.60 kB gzip).
  Stockfish WASM 7,295,411 bytes; JS 20,670 bytes, authentic package bytes.

## Reproduce browser regressions safely

Use a disposable origin/port and do not run engine cache fault injection on a user
origin. `node scripts/prepare-browser-check.mjs` after build prepares
`/__qa__/index.html`; its database is `chessdesk-release-qa`, separate from app data.
Use the three buttons to run real IndexedDB, engine/cache and measurement checks.
Run `npm run build` afterward to remove the temporary harness from `dist`.
The browser harness is not included in normal builds and adds no dependency.

## Remaining acceptance checks

1. On HTTPS, install as a PWA on Android Chrome and iOS Safari; close it, enable
   airplane mode, reopen, reload and run a cached full-game review.
2. Interrupt the first engine download using actual connectivity loss; retry,
   restart, then confirm offline review. Confirm missing engine gives a clear error.
3. Leave a saved library open during an update; interrupt update installation,
   verify old version offline, then complete update and verify records persist.
4. Restore the exported backup in a separate browser profile/device. Compare a
   re-export exactly; test truncated JSON and missing links with original data intact.
5. Use real 320px/390px devices for tap moves, castling, en passant, promotion,
   scrolling and repeated training attempts; confirm no unintended moves.
6. Use NVDA/VoiceOver/TalkBack to verify board and modal announcements, keyboard
   selection, turn/result feedback and focus return. Check reduced-motion behavior.
7. Measure sustained analysis memory, long tasks and responsiveness on a low-end
   mobile device; the current tool cannot measure worker/WASM resident memory.

QA records remain only on isolated test origins. No existing user records were
deleted or reset. Local previews are stopped after verification.
