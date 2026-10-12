# Third-party notices

## Chessnut SVG pieces

The 12 unmodified SVG pieces under `public/pieces/chessnut/` are by Alexis Luengas, copyright 2015 Alexis Luengas, under Apache License 2.0. Source: [LexLuengas/chessnut-pieces](https://github.com/LexLuengas/chessnut-pieces/tree/2b8eaf14a31edad7e9deb53b1473e1d4857868a9), pinned commit `2b8eaf14a31edad7e9deb53b1473e1d4857868a9`. The complete upstream `LICENSE.txt` and `COPYRIGHT.txt` are bundled next to the SVGs. `provenance.json` records each exact file, size and SHA-256. No upstream artwork has been modified. No separate NOTICE file exists in that upstream commit. Attribution and license are distributed locally and cached for offline use.

Lichess's [asset licensing manifest](https://github.com/lichess-org/lila/blob/master/COPYING.md) identifies Chessnut as an Apache-2.0 exception. The author's repository and license were independently checked before downloading. The board implementation is original; no Chessground code, Lichess branding, or other Lichess artwork is included.

## Stockfish 18 and Stockfish.js

Chessdesk distributes the Stockfish.js v18.0.0 lite single-threaded WebAssembly and JavaScript worker files, from [nmrugg/stockfish.js](https://github.com/nmrugg/stockfish.js/releases/tag/v18.0.0), built against [official Stockfish commit `cb3d4ee`](https://github.com/official-stockfish/Stockfish/tree/cb3d4ee). These files are distributed under GNU GPL version 3. The generated application includes the corresponding license, authors list, and source references at `dist/licenses/Stockfish-GPL-3.0.txt`, `dist/licenses/Stockfish-AUTHORS.txt`, and `dist/licenses/Stockfish-SOURCE.txt`. The upstream tag and commit provide the corresponding source and build instructions for these unmodified release assets.

Stockfish's upstream repository acknowledges neural network training data provided by Leela Chess Zero under the Open Database License. See the upstream [Stockfish README](https://github.com/official-stockfish/Stockfish#acknowledgements) and the [LCZero data license](https://opendatacommons.org/licenses/odbl/1-0/). Chessdesk does not bundle that training database; the attribution and license link are retained here for the upstream acknowledgment.

## chess.js

Chessdesk uses `chess.js` 1.4.0 by Jeff Hlywa for legal move generation, FEN, PGN, and draw-rule adjudication. It is licensed under BSD-2-Clause. Source: [jhlywa/chess.js](https://github.com/jhlywa/chess.js).

## React, React DOM, and Vite

React 19.3.0, React DOM 19.3.0, Scheduler, and Vite 8.3.4 are used under the MIT License. Their license texts are included under `dist/licenses/` with the generated application.
