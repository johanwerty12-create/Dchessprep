# Chessdesk

Chessdesk is a private, offline-first chess preparation workspace. Games, reviews, opponents, repertoire lines, training cards, and tournament notes stay in the browser's IndexedDB. There is no account, backend, remote analysis service, or runtime font dependency.

## Run it

```sh
npm ci
npm run dev
```

Build and preview the production PWA:

```sh
npm run build
npm run preview
```

The build copies only the Stockfish 18 lite single-threaded browser assets into `dist/engine/`. The application shell and chess rules do not require the engine. Stockfish downloads only when a user asks for analysis and is cached on that device for offline use.

## Main workflows

The original board uses locally bundled Chessnut SVGs by Alexis Luengas (Apache-2.0), supports tap and pointer dragging, keyboard square navigation, legal destination hints, promotion choices and study arrows/circles. Board settings retain square colors, coordinates, destinations and orientation locally. In annotation mode, gestures mark squares without moving pieces; marks belong to the current position and clear when the position changes. Right-drag marks work on desktop; keyboard users can use the From/To annotation controls. No Chessground code is bundled. See `public/pieces/chessnut/provenance.json` and `THIRD_PARTY_NOTICES.md` for exact upstream files and notices.

The mobile More menu opens every workspace, including Repertoire Clash, Tournament Workspace and the Library. Prepared lines link to the actual matching games and can be added to practice directly; re-adding them preserves existing review progress. Analysis-board engine variations can be replayed in the existing move tree and saved as a normal PGN study.

- **Game review:** paste a standard PGN or choose a `.pgn` file. Legal SAN, setup FEN, comments, and standard PGN variations are validated before saving. A PGN database can contain up to 500 games and 20 MB per import; a single game is limited to 5 MB and 2,000 plies.
- **Stockfish review:** analyze a completed game with depth or per-position time limits and one to three lines. The top move and played move are searched from the same pre-move position using the same limit; the played-move search uses UCI `searchmoves`. Scores stay in the root side-to-move perspective for comparison, then convert once to White perspective for the graph. Results, search depth, nodes, best line, and mate scores are stored per ply. Partial work is saved after each ply and can be resumed with matching settings.
- **Move labels:** labels are a study heuristic, not a calibrated accuracy score. Centipawn-loss bands change by material phase: opening 20/40/75/170 cp, middlegame 25/50/90/190 cp, and endgame 30/60/105/210 cp for best/good/inaccuracy/mistake cutoffs; larger losses are blunders. Forced mate scores are handled separately. Search depth affects certainty. Chessdesk does not report an accuracy percentage.
- **Prep map:** opening prefixes, sample sizes, color counts, recency, most common next four plies, and transpositions are computed from imported PGNs. Priorities sort by observed game count, then recency. The page describes historical games and does not predict future moves.
- **Repertoire clash:** compare color-compatible saved lines with identified opponents' games. Matching follows legal positions, so transpositions count when the prepared continuation appears after a different move order; games with unknown player color are excluded from match rates and rehearsal-gap counts.
- **Analysis board:** make legal moves, navigate a branch tree, load FEN or PGN, export PGN variations, and optionally request local MultiPV analysis. The board supports castling, en passant, promotion, check, checkmate, stalemate, repetition, and the fifty-move rule through `chess.js`.
- **Training studio:** turn engine-confirmed critical positions or prepared repertoire lines into cards. Reviews use SM-2 scheduling: first successful interval 1 day, next 6 days, then ease-adjusted intervals; missed cards return after 10 minutes.
- **Tournament workspace:** organize events, opponents, round colors, prep tasks, notes, and linked post-match game reviews.
- **Personal library:** search and filter local records, export a versioned JSON backup, and validate a full backup before an atomic restore. Storage errors and quota limits are surfaced in the UI.

Engine analysis is for completed games and study positions. Do not use engine assistance during an active competitive game.

## Stockfish provenance

The engine is the `stockfish@18.0.0` browser package from [nmrugg/stockfish.js v18.0.0](https://github.com/nmrugg/stockfish.js/releases/tag/v18.0.0), whose release identifies upstream [official Stockfish commit `cb3d4ee`](https://github.com/official-stockfish/Stockfish/tree/cb3d4ee). The product ships that release's `stockfish-18-lite-single.js` and `stockfish-18-lite-single.wasm` files unchanged. The lite WASM build includes its NNUE evaluation network and does not need cross-origin isolation headers. It runs as a single-threaded Web Worker with a 32 MB hash.

The engine download is approximately 7.3 MB. These files are excluded from the initial static bundle and are fetched from the same origin only on demand. Service Worker/Cache Storage retains them for later offline use. The generated distribution includes Stockfish's GPLv3 license, authors list, and corresponding source references, plus license texts for the shipped JavaScript dependencies, under `dist/licenses/`.

## Verification

```sh
npm run check:release
```

The release gate runs all unit tests, builds the production PWA, checks the initial JavaScript and CSS gzip budgets, searches positions with the exact Stockfish 18 lite WASM asset, verifies piece licensing and offline coverage, and checks static deployment paths and headers. Run an individual command such as `npm run verify:engine` when iterating on one area.

GitHub Actions runs the same gate on pushes and pull requests targeting `codex/vercel-release-candidate`, and supports a manual run. The initial-route budgets are 150 KiB gzip for JavaScript and 20 KiB gzip for CSS; the Stockfish WASM stays out of the first load and remains separately byte-verified. Browser workflows and installed/offline device checks are acceptance steps beyond CI. The app has no telemetry, so release quality relies on reproducible tests and explicit preview acceptance rather than collecting player data.

The browser application requires a modern browser with Web Workers, WebAssembly, IndexedDB, Cache Storage, and Service Workers. Service Workers require HTTPS in deployment (localhost is allowed during development).

## Deployment

For Vercel, use the repository root, Vite framework, `npm ci` install, `npm run build` build and `dist` output. `vercel.json` includes the Vite static build, SPA fallback, explicit manifest/WASM/worker/icon MIME types and revalidation for version-sensitive PWA and engine files. Workspace navigation currently uses local React state; no server routes or backend are needed. This follows [Vercel's Vite and SPA guidance](https://vercel.com/docs/frameworks/frontend/vite).

To create a preview from the connected Git project, push the release-candidate branch and open its Vercel Preview deployment. For a local CLI preview instead, run the verification commands below and then `npx vercel` from the repository root; complete Vercel login/project linking when prompted and leave `--prod` off. On the returned HTTPS URL, check `/`, `/manifest.webmanifest`, `/sw.js`, both `/icons/icon-*.png` files and `/engine/stockfish-18-lite-single.wasm`. Confirm `application/manifest+json`, `text/javascript`, `image/png` and `application/wasm` response types, worker and engine revalidation headers, installability, then repeat an offline reload and cached Stockfish review.

The Vite base, manifest, icon, and service worker use the site root, so configure the Cloudflare Pages project with repository root `/`, build command `npm ci && npm run build`, and output directory `dist`. The build versions both the app-shell cache and the Stockfish cache from the packaged files. `npm run check:pages` checks those generated paths, licensing files, engine identity by byte comparison, file sizes, offline-cache entries, and static Pages fallback assumptions. It cannot verify HTTP headers or browser behavior without a deployed URL.

For a controlled preview upload, create or select a Cloudflare Pages project, authenticate Wrangler, then run:

```sh
npx wrangler login
npx wrangler pages project list
# If needed, create a Direct Upload project in the Cloudflare dashboard or run:
npx wrangler pages project create
npm ci
npm run build
npm run check:pages
npx wrangler pages deploy dist --project-name <project-name> --branch=release-candidate
```

Cloudflare returns the branch preview URL. Verify that URL over HTTPS before promoting the deployment. The Pages static host supplies file content types and normal asset revalidation; this project does not add custom cache headers. Pages serves the single-page app from `index.html` when there is no root `404.html`, which this build intentionally does not generate. Confirm `/sw.js`, `/manifest.webmanifest`, `/engine/stockfish-18-lite-single.js`, and `/engine/stockfish-18-lite-single.wasm` are reachable from the preview origin. The WASM file is below Pages' 25 MiB per-file limit.

No Cloudflare credentials, Pages project configuration, or Wrangler installation are available in this workspace, so no Cloudflare preview has been uploaded. A local `dist/` upload can include the complete static build without changing Git state.

## Current limits

- Stockfish uses the lite single-threaded WASM build to keep the optional engine download smaller and memory use bounded. It is not as strong or as fast as Stockfish's large multi-threaded build.
- Prep and repertoire statistics are only as complete as the games a user imports. There is no external opening database or invented opponent prediction.
- PGN accepts standard chess SAN and standard RAV variations; chess variants such as Chess960 are outside the current rules model.
- Data is local to one browser profile. Export a backup before moving devices or clearing site data.
