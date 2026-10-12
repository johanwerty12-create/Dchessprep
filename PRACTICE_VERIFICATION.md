# Personal practice loop — 2026-10-12

## Player benefit

The missing workflow was a short return session grounded in the player's own
study, with evidence of what they remembered. Today now offers up to five due
positions from saved mistakes and repertoire. Training gives a bounded session,
then offers the remaining due positions. Returning players can see their saved
recall outcomes from the past seven days.

This is a product hypothesis, not evidence of retention or superiority to another
site. Real player testing remains necessary. Existing strengths are local privacy,
offline analysis, genuine Stockfish, and connected review/preparation/practice.

## Corrections and implementation

- Training previously awarded full recall credit after a hint. Unaided recall,
  hint-assisted recall, a miss followed by a match, and answer reveal are now
  distinct saved outcomes. Only unaided recall extends the existing schedule;
  other outcomes return in ten minutes.
- A move outside saved alternatives previously exposed the engine's answer
  immediately. Feedback now invites another attempt or deliberate reveal and
  states that unrecorded engine alternatives have not been evaluated here.
- Training previously marked completion before awaiting persistence. A position
  now completes only after IndexedDB succeeds. Failure keeps the result pending
  and offers Retry saving attempt. Attempt IDs make repeated saved retries
  idempotent. The UI blocks additional answers during a pending write.
- App persistence reads the latest saved card and checks its position/target.
  Practice saves guard conflicting library deletion, backup export and restore.
- Each card stores at most 30 practice events. Counts explicitly describe saved
  attempts; older review counts are never converted into invented recall history.
  Backup validation accepts legacy cards and rejects malformed/illegal histories.
- Redundant methodology text is behind About these results. The new return card
  uses the existing design and routes to the existing training studio.

## Actual tests

37 unit tests passed, including five new regressions for due-order/queue limits,
spacing after hints/misses/reveals, idempotent retries, bounded honest history,
and backup round trips/invalid history rejection. Production build, piece/license
checks and static Pages checks passed.

Real browser production workflow ran at an empty disposable origin on port 49330.
The test added six legal repertoire fixtures, never cleared a database, and passed:

1. Five of six due positions selected; sixth untouched.
2. Injected QuotaExceededError into the real browser IndexedDB write: no completed
   position, no changed records/schedules, visible retry action.
3. Retry persisted exactly one attempt; hint did not receive full credit.
4. Incorrect saved-line attempt did not reveal the answer automatically.
5. Five actual saved outcomes: recalled, assisted, missed, revealed, recalled.
6. Completion reported all five persisted results and offered the remaining card.
7. Actual six records survived backup JSON serialization and validation.
8. Reloaded Today restored two unaided recalls and the other recorded outcomes.

The storage-full exception was deliberately injected; it was not a physically
filled device. The backup check was serialization/validation, not another backup
import UI round trip. Fixtures were legal repertoire targets; they do not replace
the separate actual Stockfish validation.

Genuine packaged Stockfish 18 Lite WASM verification passed: full Scholar's Mate
7 plies / 13 same-root searches in 9,697ms; final Qxf7# Best and terminal graph;
Fool's Mate; independently enumerated mate-in-one; forced-loss defense; stalemate;
and three legal MultiPV lines. No engine replacement or dependency added.

Final bundle: JS 409.17kB / 125.53kB gzip and CSS 68.79kB / 13.46kB gzip.
Combined gzip growth from the prior mobile build is about 1.33kB. Practice storage
is bounded to 30 events per card; total worker memory and cold transfer were not
remeasured in this pass.

## Limits and status

Final mobile visual opening was rejected by automatic approval review because
the approval service hit a rate limit (429). It was not executed. The final small
copy change and additional app-level write guards received build/unit/static
verification, but could not receive a fresh browser pass after that rejection.
No screenshot of those final changes is claimed.

The temporary browser harness is removed by the final build. Data on the QA origin
remains intact. Physical devices, screen readers, new-player understanding,
installed HTTPS PWA acceptance and whether players actually return remain unverified.

Verdict: BETA. No commit, push, deployment, user-data deletion or backend introduced.
