# Board and preparation upgrade — 2026-10-12

Verdict: **BETA**. The implemented local workflows pass the checks below; physical
touch, spoken screen-reader output and installed-PWA/public HTTPS checks remain open.
No commit, push, deployment or existing-record deletion was performed.

## Player value and implementation

- Replaced font-dependent board glyphs with 12 crisp local Chessnut SVG pieces.
  Kept the application's identity, themes, engine, chess rules and data architecture.
- Original Pointer Events implementation supports tap and dragging, legal drops,
  capture hints, promotion and cancellation. Drops outside the board or from an
  obsolete position cannot move pieces. HTML drag-and-drop was removed from the
  board; it was the weak path for phones.
- Added arrows/circles through tap, right-drag or keyboard From/To controls.
  Drawing is a separate mode that does not move pieces. Marks track board orientation
  and clear on a position change; they are temporary study marks, not saved PGN annotations.
- Square palette, coordinates, destinations and orientation persist locally.
  Coordinate placement and player labels now follow flipped boards. Removed redundant
  Analysis Board flip controls in favor of the shared toolbar.
- Every workspace is reachable through the mobile More sheet, including Repertoire
  Clash and Tournament Workspace. Board width measured 267px at a 320px viewport and
  337px at 390px; page content did not overflow horizontally.
- Prepared lines link to real matched games; uncovered samples open their actual
  game. Practice this line creates legal positions for the prepared side and preserves
  existing schedules. Re-adding and renaming lines recognize existing/legacy cards;
  concurrent requests share one write operation. Storage failure is surfaced.
- Genuine engine PVs can be inserted into the existing study tree for replay and
  saving. Saved/exported study results now follow the mainline checkmate, stalemate
  or insufficient-material result instead of always writing `*`. A side variation,
  resignation or claimable draw is not used to invent a decisive result.
- Removed Prep Map's arbitrary five-game confidence wording. Historical counts and
  color-compatible samples remain visible. Added no prediction or accuracy metric.
- Kept roving keyboard focus, promotion focus trapping/restoration, labelled square
  semantics and reduced-motion CSS. Added legal-destination and move/turn announcements.
  Avoided rebuilding chess history and terminal adjudication during pointer updates.

## Source and license research

Reviewed official Chessground README, Lichess asset manifest and official study/blind
mode documentation for variation replay, annotation and keyboard workflows. No
Chessground implementation or Lichess branding/artwork was copied.

Chessnut comes directly from Alexis Luengas's author repository at commit
`2b8eaf14a31edad7e9deb53b1473e1d4857868a9`, under Apache-2.0. Copyright 2015 Alexis
Luengas. The author's license/copyright and Lichess's Apache exception agree. All
12 SVGs are unmodified; the upstream has no separate NOTICE file. Complete license,
copyright and per-file SHA-256 provenance ship locally under `/pieces/chessnut/`.

- Author: https://github.com/LexLuengas/chessnut-pieces/tree/2b8eaf14a31edad7e9deb53b1473e1d4857868a9
- Lichess assets: https://github.com/lichess-org/lila/blob/master/COPYING.md
- Chessground license: https://github.com/lichess-org/chessground/blob/master/README.md
- Official UX reference: https://lichess.org/@/lichess/blog/study-chess-the-lichess-way/V0KrLSkA
- Keyboard reference: https://lichess.org/page/blind-mode-tutorial

`npm run check:assets` checks all hashes, exact built copies, SVG viewboxes, absence
of active/external SVG content and offline cache entries. No runtime third-party
asset requests or new dependency were added.

## Executed verification

- 31 unit tests passed. New cases cover 128 square/orientation mappings, boundary
  drops, preferences, arrows/circles, legacy/renamed practice-card deduplication and
  mainline study results. Existing chess, backup, review and SW regressions passed.
- Genuine packaged Stockfish verification passed: Scholar's/Fool's Mate, mate-in-one,
  forced-loss defense, stalemate, legal MultiPV and a seven-ply/13-search game review.
  The last CLI full review took 4,526ms; another run took 2,228ms. Host load varied.
- Production build, asset/license checks, Pages static-package checks and whitespace
  check passed. A pre-existing README line-ending warning remains.
- Actual browser: legal tap move and native desktop pointer drag; illegal drop
  preserved position; castling, en passant, knight promotion, flipped arrow-key
  navigation, annotations without moving pieces, promotion focus, themes and saved
  palette. Mobile 320px/390px layouts were rendered; all workspaces were reachable.
- Actual browser: Scholar's Mate import/full review, Qxf7# Best and White-win graph;
  critical training cards; prepared line exact match; repeated Practice this line
  retained six total training cards; genuine mate PV replayed and saved as a study.
  Final saved mating study displayed White won.
- Actual browser with server stopped: app reload, 32 decoded local SVGs, saved palette,
  stored records and genuine depth-12 cached Stockfish search (`Qxf7#`, mate 1).
  This is server unavailability, not physical airplane mode.
- Browser harness: all starting SVGs decoded; rows and one Tab entry point present;
  ten legal move samples passed; synthetic touch pointercancel left FEN unchanged.
  This injected event does not establish physical touch/gesture behavior.
- Previous five-record backup still passes current validation. Earlier audit's real
  export/restore comparison remains documented in RELEASE_VERIFICATION.md. The new
  browser chooser attempt stalled and did not restore; no new restore round-trip claim.

## Measurements and practical limits

Final production JS: 398.92kB, 122.28kB gzip; CSS: 62.07kB, 12.37kB gzip. Previous
build was 389.66/119.31kB JS and 58.42/11.60kB CSS. Combined gzip growth: 3.74kB.
All 12 SVGs total 45,166 bytes, loaded on board use and included in the small offline
shell installation. Stockfish's 7,295,411-byte WASM remains optional/on demand.

Warm browser resource timings reported zero transferred JS/CSS bytes from cache;
cold network transfer was not measured. Ten tap-pair test samples averaged 165ms,
maximum 216ms, including four deliberately awaited animation frames per sample.
This measures the test round, not pointer processing latency. Harness main-page heap
was 18,364,073 bytes; it includes the test page/iframe and excludes worker/WASM memory.
Storage was 12,402,475 bytes during an update with multiple app caches, including
122,355 bytes IndexedDB. Neither value is a clean-profile mobile memory benchmark.

Vercel static Vite build/output and worker/manifest revalidation configuration are
provided in vercel.json. Actual host routing, headers and HTTPS were not verified.
No backend, account service or mandatory network API was introduced.

Physical touch dragging/long press/scroll/pinch, VoiceOver/NVDA/TalkBack, reduced-motion
rendering on devices, installed-PWA behavior, cold-start transfer and total engine
memory remain unverified. Continue the acceptance checklist in RELEASE_VERIFICATION.md
before declaring READY. The temporary browser harness is absent from the final dist.
