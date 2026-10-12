# Mobile workflow audit — 2026-10-12

## Problems fixed

- Repeated headings, player furniture and desktop spacing pushed analysis-board
  controls below the first phone screen. Compact mobile headers, larger usable
  board area and removal of redundant player rows bring controls into view.
- Engine options and import forms created a long continuous page. Mobile analysis
  now has Moves / Engine / FEN-PGN selectors; review has Moves / Analyze / Key
  moments. Panels stay mounted to preserve drafts, positions and engine state.
  Desktop still displays the existing panels together.
- Success messages shifted the board down. Board success feedback now follows
  the workspace. New/export actions remain available in the FEN-PGN panel.
- Navigation labels were 7px and move controls 31 by 29px. Navigation labels are
  now 10px; primary board/panel controls have 44px targets. Position form text is
  16px. Move lists have bounded scrolling rather than extending the whole page.
- Starting training could leave the board above the viewport. Session start and
  next-card navigation now focus the board and bring it below the mobile header.
  Training metrics are hidden during the session. Selecting a reviewed move or
  replay also brings the board into view on phones.
- Closing More restored focus before its hidden navigation was made visible.
  Dialog cleanup now unhides navigation first; keyboard focus returns to More.
- Final review position now says Final position instead of Before ply 8.

## Actual browser evidence

Production build served locally in the Codex browser; no public deployment.

- 390x844: analysis board starts at y=183.83, size 341x341; controls end at
  y=575.83, above bottom navigation at y=783.
- 320x568: board size 271x271; controls end at y=505.83, above navigation at
  y=507. No horizontal overflow. All 64 squares equal at both widths.
- PGN draft survives Engine -> FEN/PGN switching. Legal e4 and PGN study import
  preserve correct position and accessible move-tree controls.
- Keyboard Enter/ArrowUp/Enter on a7 opens promotion, focuses Promote to queen,
  and Enter produces a white queen on a8. This is keyboard/browser testing,
  not physical phone touch.
- Actual Stockfish depth-12 position search returned e4 +0.4 and d4 +0.2 with
  legal continuations. Selected engine line saved into training; e4 accepted.
- Imported Mobile workflow QA Scholar's Mate, ran actual full-game Stockfish
  review, saved and reopened it. Analyze and Key moments selectors expose the
  correct panels; terminal graph says White wins by checkmate.
- Selecting Nf6 critical moment brings the review panel to y=55.75 and focuses
  a board square. Practice-all creates cards. Starting training puts the session
  at y=56, board at y=157, focuses a square and hides dashboard metrics.
- More exposes every workspace; Escape closes it and restores More button focus.
- Desktop engine and position tools both remain visible. No browser console
  errors in the final inspected tab.

## Checks and measurements

32 unit tests passed. Production build and asset/license/static Pages checks passed.
Expanded real-browser harness passed panel visibility, position preservation,
focus entry/return, 10 legal move rounds, decoded SVGs, semantic rows/one Tab entry,
synthetic pointer cancellation, equal geometry, no overflow, and short-phone
control visibility even after success feedback.

Final browser harness: 10 move rounds averaged 206ms, maximum 292ms, including four
deliberately awaited animation frames. This is not isolated input latency.
Main-page heap 15,692,815 bytes includes harness/iframe and excludes engine worker.
Origin storage 9,825,077 bytes includes cached engine and app versions; not a clean
installation benchmark. Final JS 405,074 bytes / 124.29kB gzip; CSS 68,260 bytes /
13.37kB gzip. No dependency added. Final dist excludes the temporary QA harness.

## Research and limits

Official Lichess sources consulted:
- https://lichess.org/@/lichess/blog/the-new-mobile-app/KXlgb3X2
- https://github.com/lichess-org/mobile/issues/3093

The upstream discussion highlights discoverable analysis selectors, move-list space
and avoiding screen-edge gesture conflicts. These informed original layout changes;
no upstream implementation or branding was copied.

Verdict: BETA. Browser mechanics and responsive layouts improved and verified.
First-time comprehension requires real player usability testing; no claim that
learning speed or preference over another app has been proved. Physical iOS/Android
touch gestures, virtual keyboard behavior, screen readers, browser chrome/safe areas
and installed HTTPS PWA acceptance remain unverified. Very short landscape screens
still require scrolling. No commit, push, deployment or user-data deletion.
