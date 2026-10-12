import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, copyFile, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { Chess } from 'chess.js';
import { classifyMove, evaluationGraphValues, parsePgn, sameUciMove, scoreToWhite, terminalScore, variationPositions, variationUci } from '../src/domain.js';
import { parseUciInfo } from '../src/engine.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceEnginePath = path.join(root, 'node_modules', 'stockfish', 'src', 'stockfish-18-lite-single.js');
const sourceWasmPath = path.join(root, 'node_modules', 'stockfish', 'src', 'stockfish-18-lite-single.wasm');
const builtEnginePath = path.join(root, 'dist', 'engine', 'stockfish-18-lite-single.js');
const builtWasmPath = path.join(root, 'dist', 'engine', 'stockfish-18-lite-single.wasm');
let enginePath = sourceEnginePath;
let wasmPath = sourceWasmPath;
let usingBuiltAssets = false;
try { await access(builtEnginePath); await access(builtWasmPath); usingBuiltAssets = true; enginePath = builtEnginePath; wasmPath = builtWasmPath; }
catch { /* source-package verification remains available before the production build */ }
const checkedAssets = usingBuiltAssets ? [[builtEnginePath, sourceEnginePath, 20_670], [builtWasmPath, sourceWasmPath, 7_295_411]] : [[sourceEnginePath, sourceEnginePath, 20_670], [sourceWasmPath, sourceWasmPath, 7_295_411]];
for (const [assetPath, sourcePath, expectedLength] of checkedAssets) {
  assert.equal((await stat(assetPath)).size, expectedLength, `pinned Stockfish 18 asset length: ${path.basename(assetPath)}`);
  if (usingBuiltAssets) assert.ok((await readFile(assetPath)).equals(await readFile(sourcePath)), `built engine asset is byte-identical to stockfish@18.0.0: ${path.basename(assetPath)}`);
}
const engineHarnessDir = await mkdtemp(path.join(os.tmpdir(), 'chessdesk-stockfish-verify-'));
const runnableEnginePath = path.join(engineHarnessDir, 'stockfish-18-lite-single.cjs');
await copyFile(enginePath, runnableEnginePath);
await copyFile(wasmPath, path.join(engineHarnessDir, 'stockfish-18-lite-single.wasm'));
const child = spawn(process.execPath, [runnableEnginePath], { cwd: engineHarnessDir, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
const lines = [];
let buffer = '';
let stderr = '';
child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
child.stdout.on('data', (chunk) => { buffer += chunk; const ready = buffer.split(/\r?\n/); buffer = ready.pop() || ''; lines.push(...ready.filter(Boolean)); });
child.stderr.on('data', (chunk) => { stderr += chunk; });
const send = (command) => child.stdin.write(`${command}\n`);
const waitFor = async (predicate, label, from = 0, timeout = 30_000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    for (let index = from; index < lines.length; index++) if (predicate(lines[index])) return index;
    if (child.exitCode !== null) throw new Error(`Stockfish exited during ${label} (code ${child.exitCode}). ${stderr.slice(-500)}`);
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error(`Timed out waiting for ${label}. Last engine output: ${lines.slice(-10).join(' | ')} ${stderr.slice(-250)}`);
};
const waitReady = async () => {
  const cursor = lines.length;
  send('isready');
  await waitFor((line) => line === 'readyok', 'engine readiness', cursor);
};
const search = async (fen, { depth = 8, multipv = 1, searchMoves = [] } = {}) => {
  await waitReady();
  send(`setoption name MultiPV value ${multipv}`);
  await waitReady();
  const cursor = lines.length;
  const perspective = fen.trim().split(/\s+/)[1] === 'b' ? 'b' : 'w';
  const started = Date.now();
  send(`position fen ${fen}`);
  send(`go depth ${depth}${searchMoves.length ? ` searchmoves ${searchMoves.join(' ')}` : ''}`);
  const end = await waitFor((line) => line.startsWith('bestmove '), `depth ${depth} search`, cursor, 60_000);
  const output = lines.slice(cursor, end + 1);
  const bestLine = output.at(-1);
  const bestmove = bestLine.split(/\s+/)[1];
  const byPv = new Map();
  for (const line of output) {
    if (!line.startsWith('info ')) continue;
    const info = parseUciInfo(line);
    if (!info.score) continue;
    info.score = { ...info.score, perspective };
    const previous = byPv.get(info.multipv);
    if (!previous || info.depth >= previous.depth) byPv.set(info.multipv, info);
  }
  if (byPv.size && bestmove !== '0000' && bestmove !== '(none)') {
    const deepestReported = Math.max(...[...byPv.values()].map((line) => line.depth));
    assert.equal(deepestReported, depth, `Stockfish obeys the requested depth ${depth}, including restricted searchmoves`);
  }
  return { bestmove, variations: [...byPv.values()].sort((a, b) => a.multipv - b.multipv), output, elapsedMs: Date.now() - started };
};
const uciFor = (fen, uci) => {
  const chess = new Chess(fen);
  return chess.moves({ verbose: true }).find((move) => variationUci(move) === uci);
};
const mateInOneMoves = (fen) => {
  const chess = new Chess(fen);
  return chess.moves({ verbose: true }).filter((move) => {
    const next = new Chess(fen);
    next.move({ from: move.from, to: move.to, promotion: move.promotion });
    return next.isCheckmate();
  }).map(variationUci);
};
const assertRootSearch = (fen, result, label) => {
  const rootColor = fen.trim().split(/\s+/)[1] === 'b' ? 'b' : 'w';
  const top = result.variations[0];
  assert.ok(top?.score, `${label}: Stockfish emitted a scored principal variation`);
  assert.equal(top.score.perspective, rootColor, `${label}: root UCI score perspective is the side to move`);
  assert.ok(top.pv?.length, `${label}: scored PV has a first move`);
  assert.equal(top.pv[0], result.bestmove, `${label}: PV and UCI bestmove agree`);
  assert.ok(uciFor(fen, result.bestmove), `${label}: bestmove is legal in its root FEN`);
  return top;
};

try {
  send('uci');
  await waitFor((line) => line === 'uciok', 'UCI handshake');
  const identity = lines.find((line) => line.startsWith('id name '))?.slice(8) || '';
  assert.match(identity, /Stockfish\s+18\b/i, `Expected Stockfish 18, received ${identity || 'no id name response'}`);
  send('setoption name Threads value 1');
  send('setoption name Hash value 32');
  await waitReady();

  const scholar = parsePgn('[Event "Scholar\'s Mate"]\n[Result "1-0"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0');
  const scholarBefore = scholar.positions.at(-2).fen;
  const scholarAfter = scholar.positions.at(-1).fen;
  const scholarMove = scholar.mainline.at(-1);
  const scholarResult = await search(scholarBefore, { depth: 10, multipv: 3 });
  const scholarTop = assertRootSearch(scholarBefore, scholarResult, 'Scholar’s Mate pre-move');
  assert.equal(scholarTop.score.kind, 'mate');
  assert.equal(scholarTop.score.value, 1);
  assert.ok(mateInOneMoves(scholarBefore).includes(variationUci(scholarMove)), 'independent legal-move enumeration confirms Qxf7# is mate in one');
  assert.equal(sameUciMove(scholarResult.bestmove, variationUci(scholarMove)), true, 'actual played move matches the verified engine bestmove');
  assert.ok(scholarResult.variations.length >= 2 && scholarResult.variations.length <= 3, 'Stockfish returns multiple scored lines when MultiPV is requested');
  assert.deepEqual(scholarResult.variations.map((line) => line.multipv), scholarResult.variations.map((_line, index) => index + 1));

  const scholarAfterSearch = await search(scholarAfter, { depth: 8 });
  const scholarTerminal = terminalScore(new Chess(scholarAfter), 'w', { finalResult: scholar.result });
  assert.equal(scholarTerminal?.result, 'win');
  assert.ok(['0000', '(none)'].includes(scholarAfterSearch.bestmove), `checkmated root has no legal best move (actual UCI: ${scholarAfterSearch.bestmove})`);
  const scholarReview = classifyMove(scholarTop.score, scholarTerminal, 'opening', { equivalent: sameUciMove(scholarResult.bestmove, variationUci(scholarMove)) });
  assert.equal(scholarReview.label, 'Best');
  assert.equal(scholarReview.lossCp, null, 'terminal mate classification is not fabricated as centipawns');
  assert.equal(scoreToWhite(scholarTerminal, 'w').result, 'win');

  const fullReviewStarted = Date.now();
  const fullReview = [];
  const replayScholar = new Chess(scholar.startFen);
  let fullReviewSearches = 0;
  for (let index = 0; index < scholar.mainline.length; index++) {
    const move = scholar.mainline[index];
    const fenBefore = replayScholar.fen();
    assert.equal(fenBefore, scholar.positions[index].fen, `full review position before ply ${index + 1} is aligned`);
    const before = await search(fenBefore, { depth: 12, multipv: 2 });
    fullReviewSearches++;
    const best = assertRootSearch(fenBefore, before, `full Scholar’s Mate review ply ${index + 1}`);
    const actual = replayScholar.move({ from: move.from, to: move.to, promotion: move.promotion });
    assert.ok(actual, `full review replays legal move ${move.san}`);
    const fenAfter = replayScholar.fen();
    assert.equal(fenAfter, scholar.positions[index + 1].fen, `full review position after ply ${index + 1} is aligned`);
    const terminal = terminalScore(replayScholar, move.color, { finalResult: index === scholar.mainline.length - 1 ? scholar.result : '*' });
    let playedScore = terminal;
    if (!terminal) {
      const playedUci = variationUci(move);
      const played = await search(fenBefore, { depth: 12, searchMoves: [playedUci] });
      fullReviewSearches++;
      const playedLine = assertRootSearch(fenBefore, played, `same-root restricted played move ply ${index + 1}`);
      assert.equal(played.bestmove, playedUci, `Stockfish searchmoves evaluates the actual game move at ply ${index + 1}`);
      assert.equal(playedLine.pv[0], playedUci, `the restricted PV starts with the played move at ply ${index + 1}`);
      playedScore = playedLine.score;
    }
    const equivalent = sameUciMove(best.pv[0], variationUci(move));
    const classification = classifyMove(best.score, playedScore, 'middlegame', { equivalent });
    fullReview.push({ ply: index + 1, san: move.san, color: move.color, fenBefore, fenAfter, bestUci: best.pv[0], bestScore: best.score, playedScore, whiteScore: scoreToWhite(playedScore, move.color), label: classification.label, lines: before.variations });
  }
  assert.equal(fullReviewSearches, scholar.mainline.length * 2 - 1, 'each move gets a best-line search and same-root restricted played-move search, except the terminal move');
  assert.equal(fullReview.at(-1).san, 'Qxf7#');
  assert.equal(fullReview.at(-1).bestUci, 'h5f7');
  assert.equal(fullReview.at(-1).label, 'Best');
  const pvPositions = variationPositions(fullReview[0].fenBefore, fullReview[0].lines[0].pv);
  assert.ok(pvPositions.length > 1 && pvPositions.every((position) => new Chess(position.fen)), 'actual Stockfish principal variation replays through legal chess positions');
  assert.deepEqual(evaluationGraphValues(fullReview).at(-1), { ply: 7, value: null }, 'the final checkmate is categorical in the saved White-perspective graph');
  const fullReviewElapsed = Date.now() - fullReviewStarted;

  const fools = parsePgn('[Event "Fool\'s Mate"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1');
  const foolsBefore = fools.positions.at(-2).fen;
  const foolsResult = await search(foolsBefore, { depth: 10 });
  const foolsTop = assertRootSearch(foolsBefore, foolsResult, 'Fool’s Mate pre-move');
  assert.equal(foolsTop.score.kind, 'mate');
  assert.equal(foolsTop.score.value, 1, 'mate score is from Black-to-move perspective');
  assert.ok(mateInOneMoves(foolsBefore).includes(variationUci(fools.mainline.at(-1))));
  assert.equal(sameUciMove(foolsResult.bestmove, variationUci(fools.mainline.at(-1))), true);
  const foolsTerminal = terminalScore(new Chess(fools.positions.at(-1).fen), 'b', { finalResult: fools.result });
  assert.equal(foolsTerminal?.result, 'win');
  assert.equal(scoreToWhite(foolsTerminal, 'b').result, 'loss', 'Black’s terminal win is negative in the White-perspective graph');

  const mateFen = '7k/8/5KQ1/8/8/8/8/8 w - - 0 1';
  const mateSearch = await search(mateFen, { depth: 8 });
  const mateTop = assertRootSearch(mateFen, mateSearch, 'legal mate-in-one reference');
  assert.equal(mateTop.score.kind, 'mate');
  assert.equal(mateTop.score.value, 1);
  assert.ok(mateInOneMoves(mateFen).includes(mateSearch.bestmove), 'Stockfish mate-in-one independently verified with chess.js legal move generation');
  const mateMove = uciFor(mateFen, mateSearch.bestmove);
  const afterMate = new Chess(mateFen);
  afterMate.move({ from: mateMove.from, to: mateMove.to, promotion: mateMove.promotion });
  assert.equal(afterMate.isCheckmate(), true);

  const defenseFen = '7k/8/5K2/6Q1/8/8/8/8 b - - 0 1';
  const defenseSearch = await search(defenseFen, { depth: 8 });
  const defenseTop = assertRootSearch(defenseFen, defenseSearch, 'forced-loss defense');
  assert.equal(defenseTop.score.kind, 'mate');
  assert.equal(defenseTop.score.value, -1, 'Black is losing from Black-to-move perspective');
  const defenseMove = uciFor(defenseFen, defenseSearch.bestmove);
  const defenseAfterChess = new Chess(defenseFen);
  const defenseSan = defenseAfterChess.move({ from: defenseMove.from, to: defenseMove.to, promotion: defenseMove.promotion }).san;
  const defenseAfter = await search(defenseFen, { depth: 8, searchMoves: [defenseSearch.bestmove] });
  const defenseAfterTop = assertRootSearch(defenseFen, defenseAfter, 'same-root restricted defense');
  const defensePlayedScore = defenseAfterTop.score;
  assert.equal(defenseAfter.bestmove, defenseSearch.bestmove);
  assert.equal(defensePlayedScore.perspective, 'b');
  assert.equal(defensePlayedScore.value, defenseTop.score.value);
  assert.equal(classifyMove(defenseTop.score, defensePlayedScore).label, 'Best defense', `${defenseSan} preserves the longest forced resistance`);

  const stalemateFen = '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1';
  const stalemateSearch = await search(stalemateFen, { depth: 8 });
  const stalemateTerminal = terminalScore(new Chess(stalemateFen), 'b', { finalResult: '1/2-1/2' });
  assert.equal(stalemateTerminal?.termination, 'stalemate');
  assert.ok(['0000', '(none)'].includes(stalemateSearch.bestmove), 'stalemate root has no legal best move');

  const openingFen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2';
  const opening = await search(openingFen, { depth: 8, multipv: 3 });
  assert.ok(opening.variations.length >= 2, 'MultiPV returns distinct engine lines');
  for (const line of opening.variations) assert.ok(uciFor(openingFen, line.pv[0]), `MultiPV ${line.multipv} first move is legal`);

  console.log(`Engine identity: ${identity}`);
  console.log('UCI initialization and exact packaged Stockfish 18 lite single WASM: passed');
  console.log(`Scholar’s Mate: ${scholarResult.bestmove} score ${scholarTop.score.kind} ${scholarTop.score.value}; post-checkmate UCI ${scholarAfterSearch.bestmove}; MultiPV ${scholarResult.variations.length}; ${scholarResult.elapsedMs} ms`);
  console.log(`Full Scholar’s Mate review: ${fullReview.length} plies, ${fullReviewSearches} Stockfish searches with same-root searchmoves comparison, final Qxf7# classified ${fullReview.at(-1).label}, terminal graph value ${fullReview.at(-1).whiteScore.kind}; ${fullReviewElapsed} ms`);
  console.log(`Fool’s Mate: ${foolsResult.bestmove} score ${foolsTop.score.kind} ${foolsTop.score.value}; White/Black result conversion passed; ${foolsResult.elapsedMs} ms`);
  console.log(`Legal mate-in-one: ${mateSearch.bestmove} score ${mateTop.score.kind} ${mateTop.score.value}; independently enumerated mate ${mateMove.san}; ${mateSearch.elapsedMs} ms`);
  console.log(`Forced-loss defense: ${defenseSearch.bestmove} score ${defenseTop.score.kind} ${defenseTop.score.value}; same-root restricted score ${defenseAfterTop.score.kind} ${defenseAfterTop.score.value} remains Black-perspective; ${defenseSearch.elapsedMs + defenseAfter.elapsedMs} ms`);
  console.log(`Stalemate: terminal result ${stalemateTerminal.result}; UCI ${stalemateSearch.bestmove}`);
  console.log(`Opening MultiPV: ${opening.variations.length} legal principal variations; ${opening.elapsedMs} ms`);
  console.log('Worker flavor: lite single-threaded WASM, 32 MB hash');
} finally {
  if (child.exitCode === null) {
    send('quit');
    await Promise.race([new Promise((resolve) => child.once('exit', resolve)), new Promise((resolve) => setTimeout(resolve, 1_500))]);
    if (child.exitCode === null) child.kill();
  }
  await rm(engineHarnessDir, { recursive: true, force: true });
}
