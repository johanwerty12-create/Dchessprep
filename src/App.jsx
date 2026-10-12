import { createSerialTaskQueue } from './task-queue.js';
import { recordPracticeAttempt } from './practice.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { StockfishEngine, ENGINE_VERSION } from './engine.js';
import { deleteRecord, deleteRecords, getRecord, listRecords, putRecord, putRecordReplacingIds, putRecords, replaceAllRecords, storageEstimate } from './db.js';
import { acceptableReviewMoves, cleanText, classifyMove, gameFromPgn, makeBackup, makeId, materialPhase, parsePgn, resumableReviewPlyCount, REVIEW_METHOD, reviewUsesCurrentMethod, sameUciMove, scoreToWhite, terminalScore, variationUci, validateBackup, withReviewLearningNote } from './domain.js';
import { isDuplicateImportedGame, linkedRecordsForGame, patchTournamentRound, reconcileRepertoirePractice, repertoireCardExists, supersededReviewIds } from './record-utils.js';
import { Button, Dialog, Icon, Pill, WorkspaceBoundary } from './components.jsx';
import { BoardLabView, ClashView, DashboardView, LibraryView, PrepMapView, ReviewView, TournamentView, TrainingView } from './views.jsx';

const navigation = [
  { group: 'WORKSPACE', items: [['home', 'Today', 'grid'], ['review', 'Game review', 'review'], ['prep', 'Prep map', 'book'], ['clash', 'Repertoire clash', 'clash']] },
  { group: 'PRACTICE', items: [['training', 'Training studio', 'training'], ['board', 'Analysis board', 'board']] },
  { group: 'EVENTS & FILES', items: [['tournament', 'Tournament workspace', 'trophy'], ['library', 'Personal library', 'library']] },
];
const pageTitles = { home: 'Today', review: 'Game review', prep: 'Prep map', clash: 'Repertoire clash', training: 'Training studio', board: 'Analysis board', tournament: 'Tournament workspace', library: 'Personal library' };

function normalizeError(error) { return error instanceof Error ? error.message : 'Something went wrong. Try again.'; }
function readTheme() { try { return localStorage.getItem('chessdesk-theme') || 'dark'; } catch { return 'dark'; } }
function downloadText(filename, content, type = 'text/plain;charset=utf-8') { const url = URL.createObjectURL(new Blob([content], { type })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function sanFromUci(fen, uci) {
  if (!uci) return '';
  const chess = new Chess(fen);
  const move = chess.moves({ verbose: true }).find((item) => variationUci(item) === uci);
  return move?.san || uci;
}
function pvToSan(fen, pv) {
  const chess = new Chess(fen);
  const san = [];
  for (const uci of pv || []) {
    const move = chess.moves({ verbose: true }).find((item) => variationUci(item) === uci);
    if (!move) break;
    san.push(move.san);
    chess.move({ from: move.from, to: move.to, promotion: move.promotion });
  }
  return san.join(' ');
}

function App() {
  const [view, setView] = useState('home');
  const [workspaceRecordId, setWorkspaceRecordId] = useState(null);
  const [records, setRecords] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [theme, setTheme] = useState(readTheme);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [activeGameId, setActiveGameId] = useState('');
  const [reviewPly, setReviewPly] = useState(0);
  const [analysisState, setAnalysisState] = useState('idle');
  const [analysisProgress, setAnalysisProgress] = useState({ position: 0, total: 0, percent: 0, label: '' });
  const [engineInfo, setEngineInfo] = useState(null);
  const [engineName, setEngineName] = useState('');
  const [engineStatus, setEngineStatus] = useState('idle');
  const [engineDownload, setEngineDownload] = useState({ percent: 0 });
  const [depth, setDepth] = useState(12);
  const [movetime, setMovetime] = useState(0);
  const [multipv, setMultipv] = useState(2);
  const [storageUsage, setStorageUsage] = useState(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const analysisController = useRef(null);
  const noteWrite = useRef(false);
  const practiceWrite = useRef(false);
  const criticalTrainingQueue = useRef(createSerialTaskQueue());
  const lineTrainingJobs = useRef(new Map());
  const lineRecordQueue = useRef(createSerialTaskQueue());
  const tournamentQueue = useRef(createSerialTaskQueue());
  const engineRef = useRef(null);
  const importInput = useRef(null);

  if (!engineRef.current) {
    engineRef.current = new StockfishEngine({ onStatus: (status) => setEngineStatus(status), onInfo: (info) => setEngineInfo(info) });
  }

  const refreshRecords = useCallback(async () => {
    const all = await listRecords();
    setRecords(all);
    return all;
  }, []);

  useEffect(() => {
    let mounted = true;
    refreshRecords().then((all) => { if (mounted) { setLoaded(true); if (all.length) setNotice(''); } }).catch((issue) => { if (mounted) { setError(normalizeError(issue)); setLoaded(true); } });
    storageEstimate().then((estimate) => { if (mounted) setStorageUsage(estimate); });
    if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('/sw.js').catch(() => setNotice('Offline support could not be enabled in this browser.'));
    const onlineChange = () => setOnline(navigator.onLine);
    const installEvent = (event) => { event.preventDefault(); setInstallPrompt(event); };
    window.addEventListener('online', onlineChange); window.addEventListener('offline', onlineChange); window.addEventListener('beforeinstallprompt', installEvent);
    return () => { mounted = false; window.removeEventListener('online', onlineChange); window.removeEventListener('offline', onlineChange); window.removeEventListener('beforeinstallprompt', installEvent); analysisController.current?.abort(); engineRef.current?.restart(); };
  }, [refreshRecords]);

  useEffect(() => { document.documentElement.dataset.theme = theme; try { localStorage.setItem('chessdesk-theme', theme); } catch { /* theme remains available for this session */ } }, [theme]);
  useEffect(() => { if (!notice) return undefined; const timer = setTimeout(() => setNotice(''), 5_500); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => { setError(''); }, [view]);

  const activeGame = records.find((record) => record.id === activeGameId) || null;
  const activeParsed = useMemo(() => { if (!activeGame?.pgn) return null; try { return parsePgn(activeGame.pgn); } catch { return null; } }, [activeGame]);
  const gameReviews = records.filter((record) => record.kind === 'review' && record.gameId === activeGameId).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  const activeReview = gameReviews.find(reviewUsesCurrentMethod) || null;
  const staleReview = activeReview ? null : gameReviews[0] || null;

  const showError = (issue) => { setError(normalizeError(issue)); setNotice(''); };
  const showNotice = (message) => { setNotice(message); setError(''); };
  const persistRecord = async (record, successMessage) => {
    let saved;
    try { saved = await putRecord(record); }
    catch (issue) { showError(issue); throw issue; }
    setRecords((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
    storageEstimate().then(setStorageUsage);
    if (successMessage) showNotice(successMessage);
    return saved;
  };

  const saveImportedText = async (pgn, extras) => {
    const input = String(pgn || '').trim();
    if (new TextEncoder().encode(input).byteLength > 20_000_000) throw new Error('This PGN database is larger than 20 MB. Split it into smaller imports.');
    const segments = splitPgnDatabase(input);
    if (!segments.length) throw new Error('No PGN game was found in that file.');
    if (segments.length > 500) throw new Error('This import contains more than 500 games. Split it into smaller files to keep the browser responsive.');
    const imported = [];
    for (const [index, segment] of segments.entries()) {
      try {
        const record = gameFromPgn(segment, extras);
        if (segments.length > 1 && !extras.name) record.name = `${record.name} · ${index + 1}`;
        if (extras.name && segments.length === 1) record.name = cleanText(extras.name, 120);
        imported.push(record);
      } catch (issue) { throw new Error(`Game ${index + 1} could not be imported: ${issue.message}`); }
    }
    const existingGames = records.filter((record) => record.kind === 'game');
    const duplicates = imported.filter((record) => existingGames.some((existing) => isDuplicateImportedGame(existing, record)));
    const toSave = imported.filter((record) => !duplicates.includes(record));
    if (toSave.length) await putRecords(toSave);
    await refreshRecords();
    const selected = toSave[0] || existingGames.find((existing) => isDuplicateImportedGame(existing, imported[0]));
    setActiveGameId(selected?.id || imported[0].id); setReviewPly(0); setView('review'); setImportOpen(false);
    showNotice(toSave.length
      ? `${toSave.length} legal game${toSave.length === 1 ? '' : 's'} saved${duplicates.length ? `; ${duplicates.length} exact duplicate${duplicates.length === 1 ? '' : 's'} skipped` : ''}.`
      : `No new games saved. ${duplicates.length} exact duplicate${duplicates.length === 1 ? ' was' : 's were'} already in your library.`);
  };

  const addRepertoireLine = (record, editing = false) => lineRecordQueue.current(record.id, async () => {
    if (practiceWrite.current) throw new Error("Wait for your practice result to finish saving before editing a prepared line.");
    const previous = await getRecord(record.id);
    if (editing && !previous) throw new Error("That prepared line was removed. Add it as a new line instead.");
    const cards = previous ? reconcileRepertoirePractice(await listRecords('training'), previous, record) : [];
    try { await putRecords([record, ...cards]); } catch (issue) { showError(issue); throw issue; }
    await refreshRecords(); showNotice(previous ? 'Prepared line updated. Practice history preserved.' : 'Prepared line saved.');
  });
  const addOpponent = async (record) => {
    if (records.some((item) => item.kind === 'opponent' && item.name.toLowerCase() === record.name.toLowerCase())) throw new Error('An opponent with that name is already in your notebook.');
    await persistRecord(record, `${record.name} added to the opponent notebook.`);
  };
  const addTournament = async (record) => { await persistRecord(record, `${record.name} created.`); };
  const addRound = (tournamentId, round) => tournamentQueue.current(tournamentId, async () => {
    const tournament = await getRecord(tournamentId);
    if (!tournament || tournament.kind !== 'tournament') throw new Error('That tournament no longer exists. Refresh the page and retry.');
    await persistRecord({ ...tournament, rounds: [...(tournament.rounds || []), round], updatedAt: new Date().toISOString() }, 'Round ' + round.number + ' added.');
  });
  const updateRound = (tournamentId, roundId, patch) => tournamentQueue.current(tournamentId, async () => {
    const tournament = await getRecord(tournamentId);
    if (!tournament || tournament.kind !== 'tournament') throw new Error('That tournament no longer exists.');
    await persistRecord(patchTournamentRound(tournament, roundId, patch));
  });
  const removeTournament = async (tournament) => {
    if (!window.confirm(`Delete “${tournament.name}” and its ${tournament.rounds?.length || 0} round notes? This cannot be undone.`)) return;
    try { await deleteRecord(tournament.id); } catch (issue) { showError(issue); return; } setRecords((current) => current.filter((item) => item.id !== tournament.id)); showNotice('Tournament removed.');
  };

  const deleteLibraryRecord = async (record) => {
    if (practiceWrite.current) { showNotice('Wait for your practice result to finish saving before deleting a record.'); return; }
    if (noteWrite.current) { showNotice('Wait for your takeaway to finish saving before deleting a record.'); return; }
    const related = record.kind === 'game' ? linkedRecordsForGame(records, record.id).filter((item) => item.id !== record.id) : [];
    const reviews = related.filter((item) => item.kind === 'review').length;
    const cards = related.filter((item) => item.kind === 'training').length;
    const detail = [reviews && `${reviews} saved engine review${reviews === 1 ? '' : 's'}`, cards && `${cards} linked training card${cards === 1 ? '' : 's'}`].filter(Boolean).join(' and ');
    if (!window.confirm(`Delete “${record.name || record.white || record.kind}”${detail ? ` and its ${detail}` : ''}? This cannot be undone.`)) return;
    try { await deleteRecords([...related, record].map((item) => item.id)); } catch (issue) { showError(issue); return; }
    setRecords((current) => current.filter((item) => item.id !== record.id && !related.some((review) => review.id === item.id)));
    if (record.id === activeGameId) { setActiveGameId(''); setReviewPly(0); }
    showNotice('Record deleted.');
  };

  const deleteLine = async (line) => {
    if (!window.confirm(`Delete the prepared line “${line.name}”?`)) return;
    try { await deleteRecord(line.id); } catch (issue) { showError(issue); return; } setRecords((current) => current.filter((item) => item.id !== line.id)); showNotice('Prepared line removed.');
  };

  const addCriticalToTraining = (game, review) => criticalTrainingQueue.current(game?.id || "missing-game", async () => {
    if (!game || !review) return 0;
    const critical = review.moves.filter((move) => ['Inaccuracy', 'Mistake', 'Blunder', 'Missed win'].includes(move.label) && move.bestUci && move.fenBefore);
    const existing = new Set((await listRecords('training')).map((record) => `${record.gameId}:${record.ply}`));
    const now = new Date().toISOString();
    const cards = critical.filter((move) => !existing.has(`${game.id}:${move.ply}`)).map((move) => ({ id: makeId('card'), kind: 'training', sourceType: 'critical', sourceName: game.name, gameId: game.id, name: `${game.name} · ${move.san}`, fen: move.fenBefore, targetUci: move.bestUci, acceptableUci: acceptableReviewMoves(move), targetSan: move.bestSan, ply: move.ply, color: move.color, actualSan: move.san, label: move.label, depth: move.depth, engineName: review.engineName, easeFactor: 2.5, intervalDays: 0, repetitions: 0, reviews: 0, dueAt: now, createdAt: now, updatedAt: now }));
    if (cards.length) await putRecords(cards);
    if (cards.length) await refreshRecords();
    return cards.length;
  });

  const addLineToTraining = (line) => {
    const sourceId = line.id;
    if (lineTrainingJobs.current.has(sourceId)) return lineTrainingJobs.current.get(sourceId);
    const job = lineRecordQueue.current(sourceId, async () => {
    line = await getRecord(sourceId);
    if (!line) throw new Error("That prepared line no longer exists.");
    const savedTraining = await listRecords('training');
    const chess = new Chess(line.startFen);
    const cards = [];
    for (const [index, san] of line.moves.entries()) {
      const beforeFen = chess.fen();
      const move = chess.move(san, { strict: true });
      if (move.color === line.color && !repertoireCardExists([...savedTraining, ...cards], line, beforeFen, variationUci(move))) {
        cards.push({ id: makeId('card'), kind: 'training', sourceType: 'repertoire', sourceLineId: line.id, sourceName: line.name, name: `${line.name} · ${move.san}`, fen: beforeFen, targetUci: variationUci(move), targetSan: move.san, ply: index + 1, color: line.color, easeFactor: 2.5, intervalDays: 0, repetitions: 0, reviews: 0, dueAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      }
    }
    if (cards.length) { await putRecords(cards); await refreshRecords(); }
    return cards.length;
    }).finally(() => lineTrainingJobs.current.delete(sourceId));
    lineTrainingJobs.current.set(sourceId, job);
    return job;
  };

  const gradeTrainingCard = async (card, attempt) => {
    if (practiceWrite.current) throw new Error('Another practice result is being saved. Retry when it finishes.');
    practiceWrite.current = true;
    try {
      const current = await getRecord(card.id);
      if (current?.retiredAt) throw new Error('This practice position was paused after a line edit. Reopen training.');
      if (!current || current.kind !== 'training') throw new Error('This position is no longer saved. Reopen training.');
      if (current.fen !== card.fen || current.targetUci !== card.targetUci) throw new Error('This saved position has changed. Reopen training before answering.');
      return await persistRecord(recordPracticeAttempt(current, attempt));
    } finally { practiceWrite.current = false; }
  };

  const saveEnginePosition = async ({ fen, targetUci, targetSan, score, line, name }) => {
    const card = { id: makeId('card'), kind: 'training', sourceType: 'engine-position', sourceName: name || 'Analysis board', name: `${name || 'Engine position'} · ${targetSan}`, fen, targetUci, acceptableUci: [targetUci], targetSan, score, line, ply: 0, color: new Chess(fen).turn(), engineName: engineName || 'Stockfish 18 Lite', easeFactor: 2.5, intervalDays: 0, repetitions: 0, reviews: 0, dueAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    await persistRecord(card, 'Engine line saved as a training position.');
  };

  const startFullAnalysis = async () => {
    if (noteWrite.current) { showNotice('Your takeaway is being saved. Start analysis when it finishes.'); return; }
    if (!activeGame || !activeParsed) return;
    if (analysisController.current) return;
    const parsed = activeParsed;
    const moveCount = parsed.mainline.length;
    const existing = activeReview;
    const engineBuild = `Stockfish.js v18.0.0 · upstream Stockfish/official-stockfish@cb3d4ee · ${REVIEW_METHOD}`;
    const resumeFrom = resumableReviewPlyCount(existing, { gameId: activeGame.id, positions: parsed.positions, mainline: parsed.mainline, depth, movetime, multipv, engineBuild });
    const resume = resumeFrom !== null;
    const startPly = resume ? resumeFrom : 0;
    const now = new Date().toISOString();
    const review = { id: resume ? existing.id : makeId('review'), kind: 'review', reviewMethod: REVIEW_METHOD, gameId: activeGame.id, gameName: activeGame.name, engineName: ENGINE_VERSION, engineBuild, depth: movetime ? null : depth, movetime: movetime || null, multipv, moves: resume ? [...existing.moves] : [], learningNotes: { ...(existing?.learningNotes || {}) }, totalPlies: moveCount, complete: false, startedAt: now, ...(resume ? { resumedAt: now } : {}), createdAt: resume ? existing.createdAt : now, updatedAt: now };
    let analyzed = resume ? [...existing.moves] : [];
    const controller = new AbortController(); analysisController.current = controller;
    setAnalysisState('starting'); setAnalysisProgress({ position: startPly, total: moveCount, percent: Math.floor(startPly / moveCount * 100), label: resume ? `Resuming at position ${startPly + 1}` : 'Starting Stockfish 18' }); setEngineDownload({ percent: 0 });
    const downloadStatus = new Map();
    try {
      const engine = engineRef.current;
      setEngineName(await engine.ensureEngine({ signal: controller.signal, onDownload: ({ asset, loaded, total, cached }) => {
        downloadStatus.set(asset, { loaded: loaded || total, total: total || loaded });
        const totals = [...downloadStatus.values()].reduce((sum, item) => ({ loaded: sum.loaded + item.loaded, total: sum.total + item.total }), { loaded: 0, total: 0 });
        const percent = totals.total ? Math.min(100, Math.floor(totals.loaded / totals.total * 100)) : 0;
        setEngineDownload({ ...totals, percent, cached }); setAnalysisState('downloading');
      } }));
      if (controller.signal.aborted) return;
      setAnalysisState('analyzing');
      const playedGame = new Chess(parsed.startFen);
      for (let index = 0; index < startPly; index++) {
        const move = parsed.mainline[index];
        const replayed = playedGame.move({ from: move.from, to: move.to, promotion: move.promotion });
        if (!replayed || playedGame.fen() !== parsed.positions[index + 1].fen) throw new Error(`Saved review positions no longer match the game before move ${index + 2}. The old review remains intact.`);
      }
      for (let index = startPly; index < moveCount; index++) {
        if (controller.signal.aborted) break;
        const move = parsed.mainline[index];
        const fenBefore = parsed.positions[index].fen;
        const fenAfter = parsed.positions[index + 1].fen;
        if (playedGame.fen() !== fenBefore) throw new Error(`The saved FEN is out of sync before move ${index + 1}. Existing saved data is intact.`);
        const actualMove = playedGame.move({ from: move.from, to: move.to, promotion: move.promotion });
        if (!actualMove || actualMove.color !== move.color || playedGame.fen() !== fenAfter) throw new Error(`The saved game move and position became misaligned at move ${index + 1}. Existing saved data is intact.`);
        const percentBefore = Math.floor(index / moveCount * 100);
        setAnalysisProgress({ position: index + 1, total: moveCount, percent: percentBefore, label: `Best lines · ${Math.ceil((index + 1) / 2)}${index % 2 ? '…' : '.'}` });
        const before = await engine.analyze(fenBefore, { depth, movetime, multipv });
        if (controller.signal.aborted) break;
        const best = before.variations[0];
        if (!best?.score) throw new Error(`Stockfish returned no evaluation for move ${index + 1}. The engine was stopped; existing saved data is intact.`);
        const bestUci = best.pv?.[0] || before.bestmove || '';
        if (best.pv?.[0] && before.bestmove && best.pv[0] !== before.bestmove) throw new Error(`Stockfish returned inconsistent best-move data at move ${index + 1}. Existing saved data is intact.`);
        const moverColor = move.color;
        if (best.score.perspective && best.score.perspective !== moverColor) throw new Error(`Stockfish returned a best score from the wrong side at move ${index + 1}. Existing saved data is intact.`);
        const terminal = terminalScore(playedGame, moverColor, { finalResult: index === moveCount - 1 ? parsed.result : '*' });
        let playedScore = terminal;
        let playedVariation = terminal ? { pv: [variationUci(move)], san: move.san, score: terminal, depth: null } : null;
        if (!terminal) {
          const playedUci = variationUci(move);
          const playedSearch = await engine.analyze(fenBefore, { depth, movetime, multipv: 1, searchMoves: [playedUci] });
          if (controller.signal.aborted) break;
          const playedLine = playedSearch.variations[0];
          if (!playedLine?.score || !sameUciMove(playedSearch.bestmove, playedUci) || !sameUciMove(playedLine.pv?.[0], playedUci)) throw new Error(`Stockfish did not return the restricted played move at move ${index + 1}. Existing saved data is intact.`);
          if (playedLine.score.perspective && playedLine.score.perspective !== moverColor) throw new Error(`Stockfish returned a played-move score from the wrong side at move ${index + 1}. Existing saved data is intact.`);
          // Both scores come from the same pre-move FEN, side-to-move perspective, and search limit.
          playedScore = playedLine.score;
          playedVariation = { ...playedLine, san: pvToSan(fenBefore, playedLine.pv) };
        }
        const bestMove = sanFromUci(fenBefore, bestUci);
        const phase = materialPhase(fenBefore);
        const equivalent = sameUciMove(bestUci, variationUci(move));
        const classified = classifyMove(best.score, playedScore, phase, { equivalent });
        const entry = {
          ply: index + 1, san: move.san, color: moverColor, uci: variationUci(move), fenBefore, fenAfter,
          scoreStage: REVIEW_METHOD, bestUci, bestSan: bestMove, bestScore: best.score, playedScore, playedVariation,
          whiteScore: scoreToWhite(playedScore, moverColor), terminal: terminal?.termination || null,
          lossCp: classified.lossCp, label: classified.label, phase,
          depth: best.depth, nodes: best.nodes, time: best.time,
          lines: before.variations.map((line) => ({ ...line, san: pvToSan(fenBefore, line.pv) })),
        };
        analyzed.push(entry);
        review.moves = [...analyzed]; review.updatedAt = new Date().toISOString();
        await putRecord(review);
        setRecords((current) => [review, ...current.filter((item) => item.id !== review.id)]);
        setAnalysisProgress({ position: index + 1, total: moveCount, percent: Math.floor((index + 1) / moveCount * 100), label: `Position ${index + 1} of ${moveCount}` });
      }
      if (controller.signal.aborted) {
        setAnalysisState('idle'); showNotice(analyzed.length ? `${analyzed.length} of ${moveCount} positions saved. Run the same search settings to resume.` : 'Analysis stopped before any positions were saved.'); return;
      }
      const completeReview = { ...review, moves: analyzed, complete: true, completedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      const obsoleteReviewIds = supersededReviewIds(records, activeGame.id, completeReview.id);
      await putRecordReplacingIds(completeReview, obsoleteReviewIds);
      setRecords((current) => [completeReview, ...current.filter((item) => item.id !== completeReview.id && !obsoleteReviewIds.includes(item.id))]);
      setAnalysisState('complete'); setReviewPly(moveCount); showNotice(`Stockfish 18 analyzed ${analyzed.length} plies. The review is saved locally.`);
    } catch (issue) {
      if (issue?.name === 'AbortError') { setAnalysisState('idle'); showNotice(analyzed.length ? `${analyzed.length} of ${moveCount} positions saved. Run the same search settings to resume.` : 'Engine download cancelled before a position was saved.'); }
      else { setAnalysisState('failed'); setAnalysisProgress((current) => ({ ...current, error: normalizeError(issue) })); showError(issue); }
    } finally { if (analysisController.current === controller) analysisController.current = null; }
  };

  const saveLearningNote = async (reviewId, ply, text) => {
    if (analysisController.current || noteWrite.current) throw new Error('Wait for analysis or the current save to finish before saving a takeaway.');
    noteWrite.current = true;
    try {
      const saved = await getRecord(reviewId);
      if (!saved) throw new Error('This review no longer exists. Reopen the game before saving.');
      await persistRecord(withReviewLearningNote(saved, ply, text));
    } finally { noteWrite.current = false; }
  };

  const cancelAnalysis = () => { analysisController.current?.abort(); engineRef.current?.cancel(); setAnalysisProgress((current) => ({ ...current, label: 'Stopping safely…' })); };

  const analyzeBoard = async (fen, options) => {
    if (noteWrite.current) throw new Error('Wait for your takeaway to finish saving before starting analysis.');
    if (analysisController.current) throw new Error('Another Stockfish analysis is already running. Stop it before starting this search.');
    const controller = new AbortController(); analysisController.current = controller;
    setAnalysisState('starting'); setEngineDownload({ percent: 0 });
    const downloadStatus = new Map();
    let succeeded = false;
    try {
      const name = await engineRef.current.ensureEngine({ signal: controller.signal, onDownload: (progress) => {
        downloadStatus.set(progress.asset, { loaded: progress.loaded || progress.total, total: progress.total || progress.loaded });
        const totals = [...downloadStatus.values()].reduce((sum, item) => ({ loaded: sum.loaded + item.loaded, total: sum.total + item.total }), { loaded: 0, total: 0 });
        setEngineDownload({ ...totals, percent: totals.total ? Math.floor(totals.loaded / totals.total * 100) : 0, cached: progress.cached });
        setAnalysisState('downloading');
      } });
      if (controller.signal.aborted) throw new DOMException('Analysis cancelled.', 'AbortError');
      setEngineName(name);
      setAnalysisState('analyzing');
      const result = await engineRef.current.analyze(fen, options);
      if (controller.signal.aborted) throw new DOMException('Analysis cancelled.', 'AbortError');
      succeeded = true;
      return { ...result, variations: result.variations.map((line) => ({ ...line, san: pvToSan(fen, line.pv) })) };
    } catch (issue) { if (issue?.name !== 'AbortError') setAnalysisState('failed'); throw issue; }
    finally { if (analysisController.current === controller) analysisController.current = null; if (controller.signal.aborted) setAnalysisState('idle'); else if (succeeded) setAnalysisState('complete'); }
  };
  analyzeBoard.cancel = cancelAnalysis;

  const exportGamePgn = (game) => downloadText(`${(game.name || 'chess-game').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pgn`, game.pgn, 'application/x-chess-pgn');
  const exportBackup = async () => {
    try {
      if (noteWrite.current) throw new Error('Wait for your takeaway to finish saving before exporting a backup.');
      if (practiceWrite.current) throw new Error('Wait for your practice result to finish saving before exporting a backup.');
      const saved = await listRecords();
      const data = makeBackup(saved);
      downloadText(`chessdesk-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json');
      showNotice(`${saved.length} records exported.`);
    } catch (issue) { showError(issue); }
  };
  const restoreBackup = async (file) => {
    try {
      if (file.size > 25_000_000) throw new Error('This backup is larger than 25 MB. Split the import before restoring.');
      const parsed = JSON.parse(await file.text());
      const validated = validateBackup(parsed);
      if (noteWrite.current) throw new Error('Wait for your takeaway to finish saving before restoring a backup.');
      if (practiceWrite.current) throw new Error('Wait for your practice result to finish saving before restoring a backup.');
      if (analysisController.current) throw new Error('Stop the active engine analysis before restoring a backup. Your library has not changed.');
      if (!window.confirm(`Replace the local library with ${validated.length} validated records from this backup? This will overwrite everything currently in Chessdesk.`)) return;
      await replaceAllRecords(validated); setRecords(validated); setActiveGameId(''); setReviewPly(0); showNotice(`${validated.length} records restored successfully.`); storageEstimate().then(setStorageUsage);
    } catch (issue) { showError(issue); }
  };
  const saveBoardPgn = async (pgn, name) => {
    const record = gameFromPgn(pgn, { name });
    await persistRecord(record, 'Study line saved to your library.');
    setActiveGameId(record.id); setView('review'); setReviewPly(record.moveCount);
  };
  const installApp = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  const goto = (next, recordId = null) => { setWorkspaceRecordId(recordId); setView(next); if (next === 'review' && !activeGameId) setReviewPly(0); window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); };
  const engineDownloadUpdate = (data) => setEngineDownload({ ...data, percent: data.total ? Math.min(100, Math.floor(data.loaded / data.total * 100)) : 0 });

  const content = view === 'home'
    ? <DashboardView records={records} onImport={() => setImportOpen(true)} onNavigate={goto} onSelectGame={(id) => { setActiveGameId(id); setReviewPly(0); goto('review'); }} />
    : view === 'review'
      ? <ReviewView game={activeGame} parsed={activeParsed} review={activeReview} staleReview={staleReview} records={records} currentPly={reviewPly} setCurrentPly={setReviewPly} analysisState={analysisState} analysisProgress={analysisProgress} currentInfo={engineInfo} engineName={engineName} engineStatus={engineStatus} engineDownload={engineDownload} onImport={() => setImportOpen(true)} onAnalyze={startFullAnalysis} onCancel={cancelAnalysis} onSaveToTraining={addCriticalToTraining} onSaveLearningNote={saveLearningNote} onExport={exportGamePgn} onNavigate={goto} onChangeGame={(game) => { cancelAnalysis(); setActiveGameId(game?.id || ''); setReviewPly(0); setAnalysisState('idle'); }} depth={depth} setDepth={setDepth} movetime={movetime} setMovetime={setMovetime} multipv={multipv} setMultipv={setMultipv} />
      : view === 'prep'
        ? <PrepMapView records={records} onNavigate={goto} onSelectGame={(id) => { setActiveGameId(id); setReviewPly(0); goto('review'); }} />
        : view === 'clash'
          ? <ClashView initialLineId={workspaceRecordId} records={records} onAddLine={addRepertoireLine} onDeleteLine={deleteLine} onNavigate={goto} onOpenGame={(id) => { setActiveGameId(id); setReviewPly(0); goto('review'); }} onPracticeLine={async (line) => { try { const count = await addLineToTraining(line); showNotice(count ? `${count} repertoire positions added to practice.` : 'These positions are already in training; your progress is preserved.'); goto('training'); } catch (issue) { showError(issue); } }} />
          : view === 'training'
            ? <TrainingView initialCardId={workspaceRecordId} records={records} onAddReviewCards={addCriticalToTraining} onAddLineCards={addLineToTraining} onGradeCard={gradeTrainingCard} onSaveEnginePosition={saveEnginePosition} onNavigate={goto} />
            : view === 'board'
              ? <BoardLabView onSaveGame={saveBoardPgn} onAnalyzeBoard={analyzeBoard} onCancelAnalysis={cancelAnalysis} onSaveEnginePosition={saveEnginePosition} engineStatus={engineStatus} engineName={engineName} analysisState={analysisState} engineDownload={engineDownload} currentInfo={engineInfo} />
              : view === 'tournament'
                ? <TournamentView initialRecordId={workspaceRecordId} records={records} onCreateTournament={addTournament} onCreateOpponent={addOpponent} onAddRound={addRound} onUpdateRound={updateRound} onDeleteTournament={removeTournament} onNavigate={goto} onOpenGame={(id) => { setActiveGameId(id); setReviewPly(0); goto('review'); }} />
                : <LibraryView onNavigate={goto} records={records} onExportBackup={exportBackup} onRestoreBackup={restoreBackup} onDelete={deleteLibraryRecord} onOpenGame={(id) => { setActiveGameId(id); setReviewPly(0); goto('review'); }} storageUsage={storageUsage} storageError={error} />;

  if (!loaded) return <main className="app-loading"><div className="loading-mark"><Icon name="board" size={22}/></div><div><strong>Chessdesk</strong><span>Opening your local workspace…</span></div></main>;

  return <div className="app-shell" data-theme={theme}>
    <aside className="sidebar">
      <button className="brand-lockup" onClick={() => goto('home')} aria-label="Chessdesk, go to Today"><span className="brand-mark"><Icon name="board" size={19}/></span><span><strong>chessdesk</strong><small>PREPARATION STUDIO</small></span></button>
      <nav aria-label="Main navigation" className="main-navigation">{navigation.map((section) => <div className="nav-group" key={section.group}><p className="nav-group-label">{section.group}</p>{section.items.map(([key, label, icon]) => <button key={key} onClick={() => goto(key)} className={`nav-item${view === key ? ' active' : ''}`} aria-label={label} aria-current={view === key ? 'page' : undefined}><Icon name={icon} size={17}/><span>{label}</span>{key === 'training' && records.some((item) => item.kind === 'training' && !item.retiredAt && new Date(item.dueAt) <= new Date()) && <i className="nav-dot" aria-label="Cards due"/>}</button>)}</div>)}</nav>
      <div className="sidebar-bottom"><div className="local-card"><div className="local-card-icon"><Icon name="shield" size={16}/></div><div><strong>Your study stays yours</strong><small>Stored on this device</small></div><span className={`connection-dot ${online ? 'online' : 'offline'}`} title={online ? 'Online' : 'Offline'}/></div><div className="sidebar-foot"><span>CHESSDESK 1.0</span><span className="sidebar-foot-dot">·</span><span>LOCAL FIRST</span></div></div>
    </aside>
    <div className="main-shell"><header className="topbar"><div className="topbar-left"><button className="mobile-brand" onClick={() => goto('home')} aria-label="Chessdesk home"><span className="brand-mark"><Icon name="board" size={18}/></span><strong>chessdesk</strong></button><div className="breadcrumb"><span>Workspace</span><Icon name="chevron" size={13}/><strong>{pageTitles[view]}</strong></div></div><div className="topbar-actions"><span className={`offline-pill${online ? '' : ' is-offline'}`}><i/>{online ? 'Local & ready' : 'Offline'}</span>{installPrompt && <Button icon="download" onClick={installApp}>Install app</Button>}<button className="theme-toggle" onClick={() => setTheme((value) => value === 'dark' ? 'light' : 'dark')} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17}/></button><button className="topbar-avatar" title="Personal workspace">F</button></div></header><main className="page-content" id="main-content" data-workspace={view}>{error && <div className="global-error" role="alert"><Icon name="spark" size={16}/><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error"><Icon name="close" size={15}/></button></div>}<WorkspaceBoundary key={view} onNavigate={goto}>{content}</WorkspaceBoundary></main><footer className="page-footer"><span>Chessdesk · private study, on your terms</span><button onClick={() => goto('library')}>Backup &amp; data <Icon name="chevron" size={12}/></button></footer></div>
    {notice && <div className="toast" role="status"><Icon name="check" size={16}/><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss notification"><Icon name="close" size={14}/></button></div>}
    <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} onSubmit={saveImportedText}/>
    <Dialog open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} eyebrow="YOUR WORKSPACE" title="Every tool, on your phone."><nav className="mobile-workspaces" aria-label="All workspaces">{navigation.flatMap((section) => section.items).map(([key,label,icon]) => <button type="button" key={key} onClick={() => { setMobileMenuOpen(false); goto(key); }} aria-current={view === key ? 'page' : undefined}><Icon name={icon} size={20}/><span>{label}</span><Icon name="chevron" size={14}/></button>)}</nav></Dialog>
    <nav className="mobile-nav" aria-label="Mobile navigation">{[['home','Today','grid'],['review','Review','review'],['prep','Prep','book'],['board','Board','board'],['training','Train','training']].map(([key,label,icon]) => <button key={key} onClick={() => goto(key)} className={view === key ? 'active' : ''} aria-label={label} aria-current={view === key ? 'page' : undefined}><Icon name={icon} size={18}/><span>{label}</span></button>)}<button type="button" aria-label="More workspaces" aria-haspopup="dialog" aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen(true)} className={['clash','tournament','library'].includes(view) ? 'active' : ''}><Icon name="grid" size={18}/><span>More</span></button></nav>
  </div>;
}

function splitPgnDatabase(input) {
  const normalized = String(input || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  const games = [];
  let current = [];
  let hasMoves = false;
  for (const line of lines) {
    if (/^\s*\[[A-Za-z][A-Za-z0-9_]*\s+"/.test(line) && hasMoves) {
      if (current.join('\n').trim()) games.push(current.join('\n').trim());
      current = [];
      hasMoves = false;
    }
    current.push(line);
    if (line.trim() && !/^\s*\[[A-Za-z][A-Za-z0-9_]*\s+"/.test(line) && !/^\s*[;{]/.test(line)) hasMoves = true;
  }
  if (current.join('\n').trim()) games.push(current.join('\n').trim());
  return games;
}

function ImportDialog({ open, onClose, onSubmit }) {
  const [pgn, setPgn] = useState('');
  const [name, setName] = useState('');
  const [opponent, setOpponent] = useState('');
  const [color, setColor] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try { await onSubmit(pgn, { name: name.trim(), opponent: opponent.trim(), color }); setPgn(''); setName(''); setOpponent(''); setColor(''); }
    catch (issue) { setError(normalizeError(issue)); }
    finally { setBusy(false); }
  };
  const loadFile = async (file) => { if (!file) return; if (file.size > 20_000_000) { setError('Files are limited to 20 MB. Split a large PGN database before importing.'); return; } setPgn(await file.text()); setError(''); };
  return <Dialog open={open} onClose={onClose} eyebrow="IMPORT A GAME" title="Bring in the real moves." width="large"><form className="import-form" onSubmit={submit}><div className="import-drop-row"><p>Paste a PGN or load a file. Legal moves, FEN tags, comments, and variations are checked before anything is saved.</p><input ref={fileRef} type="file" accept=".pgn,.txt,text/plain" className="visually-hidden" aria-label="Choose PGN file" onChange={(event) => loadFile(event.target.files?.[0])}/><Button type="button" icon="upload" onClick={() => fileRef.current?.click()}>Choose .pgn file</Button></div><label className="import-pgn-label">PGN<textarea required autoFocus value={pgn} onChange={(event) => setPgn(event.target.value)} rows={11} placeholder={'[Event "Club game"]\n[White "Player"]\n[Black "Opponent"]\n[Result "*"]\n\n1. e4 e5 2. Nf3 Nc6 *'}/></label><div className="form-grid form-grid-3"><label>Saved name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder="Use PGN player names"/></label><label>Opponent name<input value={opponent} onChange={(event) => setOpponent(event.target.value)} maxLength={100} placeholder="For preparation maps"/></label><label>Opponent’s color<select value={color} onChange={(event) => setColor(event.target.value)}><option value="">Unknown</option><option value="w">White</option><option value="b">Black</option></select></label></div>{error && <p className="inline-error">{error}</p>}<p className="import-privacy"><Icon name="shield" size={15}/> Import validation stays in this browser. Games are stored locally in IndexedDB.</p><div className="dialog-actions"><Button type="button" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" icon="check" disabled={!pgn.trim() || busy}>{busy ? 'Validating…' : 'Validate & save'}</Button></div></form></Dialog>;
}

export default App;
