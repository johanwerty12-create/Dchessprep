# Board geometry and personal learning loop

## Changes

The uneven squares came from auto-sized grid rows combined with intrinsic SVG
piece sizing. The board now declares eight equal rows and columns; piece images
are positioned within each square. Mobile board panels fill their available width.
This also keeps pointer coordinate mapping aligned with the rendered board.

Review now retains the genuine restricted-search played principal variation,
alongside the best variation. The decision lesson shows both with explicit score
perspective, legal replay and search-depth limitations. Redundant comparison UI
was removed. Terminal moves retain a legal one-move line and terminal score.

Players can save their own takeaway and add the selected decision to practice.
The takeaway appears after answering in training, survives reanalysis and backup
serialization, and is separate from engine evidence. Save operations guard against
conflicting analysis, restore, export and deletion operations. Old reviews remain
usable; missing played lines require reanalysis rather than fabricated evidence.

## Actual verification

- Final production browser: desktop all 64 cells between 58.921875 and 58.9375
  CSS pixels; maximum width/height difference 0.015625 (pixel rounding).
- 390px viewport: all 64 cells exactly 41.875 by 41.875 pixels.
- 320px viewport: all 64 cells exactly 33.125 by 33.125 pixels, including sparse
  promotion position. Legal e4, a7-a8 queen promotion and flip succeeded.
  Page scroll width matched client width at both phone sizes.
- Browser regression harness: decoded piece SVGs, semantic rows, one board Tab
  entry, 10 legal move samples, equal geometry before/after, synthetic pointer
  cancellation and no horizontal overflow passed. Synthetic touch is not device testing.
- Earlier in this task at isolated origin 49327: real depth-12 Scholar's Mate review,
  Nf6 played/best replay, saved takeaway, refresh/reopen, reanalysis preserving note,
  selected-card training with g6 accepted, and takeaway revealed after grading passed.
  Read-only IndexedDB checks verified all seven played PVs start with the actual move,
  are legal from the pre-move board, and retain consistent mover/White perspectives.
  Backup JSON validation preserved the actual three QA records and note; this was
  serialization validation, not a new import UI round trip.
- Final rerun: 32 unit tests passed, no failures. Genuine Stockfish 18 Lite identity,
  Scholar's Mate full review (7 plies, 13 same-root searches; final Qxf7# Best),
  Fool's Mate, independently enumerated mate-in-one, forced-loss defense, stalemate
  and three legal MultiPV lines passed. Full Scholar review took 10,049ms on this host.
- Production build, piece hashes/licenses/offline coverage and static Pages artifact
  checks passed. Final build removes the temporary browser harness.

## Measurements and limits

Final JS 403,716 bytes (123.70kB gzip); CSS 63,909 bytes (12.72kB gzip).
Stockfish remains the authentic optional Lite WASM; no replacement/dependency added.
Final browser harness's ten tap-pair samples averaged 72ms, maximum 104ms, including
four explicitly awaited animation frames per sample. This is not isolated input latency.
Main-page heap was 18,812,187 bytes including harness/iframe and excluding worker/WASM.
Fresh QA origin storage was 550,789 bytes before downloading the optional engine.
Warm asset transfer was zero from cache; cold transfer and total engine memory were
not measured. Older engine-installed-origin measurements are in earlier reports.

Physical touch, assistive screen readers, installed PWA and public HTTPS acceptance
remain outstanding. Earlier offline/data audit evidence is in RELEASE_VERIFICATION.md;
this geometry/lesson pass does not claim a new complete offline release audit.
Verdict: BETA pending those release checks. No commit, push, deployment or user-data
deletion was performed.
