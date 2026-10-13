import { formatStudyDate as shortDate } from './dates.js';
import { opponentColor, summarizeOpponentGames } from './prep.js';
import { duePracticeCards, practiceSummary } from './practice.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { ChessBoard } from './ChessBoard.jsx';
import { readBoardPreferences } from './board-logic.js';
import { Button, EmptyState, Icon, Pill, SectionTitle } from './components.jsx';
import { cleanText, compareRepertoireLine, evaluationGraphValues, formatScore, gameFromPgn, makeId, materialPhase, parsePgn, parsePgnTree, serializePgnTree, studyMainlineResult, variationPositions, variationUci } from './domain.js';

const resultLabel = (value) => value === '1-0' ? 'White won' : value === '0-1' ? 'Black won' : value === '1/2-1/2' ? 'Draw' : 'In progress';
const toneFor = (label) => ({ Best: 'good', 'Best defense': 'good', Inaccuracy: 'warm', Mistake: 'orange', Blunder: 'bad', 'Missed win': 'bad' }[label] || 'neutral');
const glyphFor = (piece) => ({ k: 'K', q: 'Q', r: 'R', b: 'B', n: 'N', p: '' }[piece] || '');
const STANDARD_START_FEN = new Chess().fen();

function countKind(records, kind) { return records.filter((record) => record.kind === kind).length; }

export function DashboardView({ records, onImport, onNavigate, onSelectGame, onCreate }) {
  const games = records.filter((record) => record.kind === 'game');
  const reviews = records.filter((record) => record.kind === 'review');
  const tournaments = records.filter((record) => record.kind === 'tournament');
  const nextRound = tournaments.flatMap((item) => (item.rounds || []).filter((round) => round.status !== 'played').map((round) => ({ ...round, tournament: item.name }))).slice(0, 1)[0];
  const recentGames = [...games].slice(0, 4);
  const practiceCards = records.filter((r) => r.kind === "training");
  const due = duePracticeCards(practiceCards);
  const recall = practiceSummary(practiceCards);
  return <>
    <SectionTitle eyebrow="YOUR WORKSPACE" title="Prepare with clarity." description="Your chess desk, built around the work that actually moves your game forward." action={<Button icon="plus" variant="primary" onClick={onImport}>Import a game</Button>} />
    {practiceCards.length > 0 && <section className="panel daily-practice"><div><p className="eyebrow">YOUR NEXT PRACTICE</p><h2>{due.length ? Math.min(5, due.length) + (due.length === 1 ? ' position' : ' positions') + ' from your own study' : 'Your next reviews are scheduled'}</h2><p>{due.length ? due.length + ' due · mistakes and prepared lines you saved.' : 'New mistakes can become practice; saved progress stays with each position.'}</p>{recall.total > 0 && <PracticeProgress summary={recall}/>}</div><Button variant="primary" icon="training" onClick={() => onNavigate('training')}>{due.length ? 'Practice due positions' : 'Open practice'}</Button></section>}
    <section className="welcome-panel">
      <div className="welcome-copy"><p className="eyebrow">A calmer way to get ready</p><h2>Study the positions<br />that matter.</h2><p>Bring in your games, see what the engine really found, then turn the lessons into preparation you can recall at the board.</p><div className="welcome-actions"><Button icon="upload" variant="light" onClick={onImport}>Import PGN</Button><Button icon="board" variant="ghost-light" onClick={() => onNavigate('board')}>Open analysis board</Button></div></div>
      <div className="welcome-art" aria-hidden="true"><div className="art-glow"/><div className="art-board">{Array.from({ length: 64 }, (_, i) => { const row = Math.floor(i / 8); const col = i % 8; const piece = ({ 3: '♟', 4: '♙', 11: '♟', 12: '♙', 18: '♞', 27: '♗', 36: '♙', 44: '♟', 50: '♘', 59: '♖' })[i]; return <span key={i} className={(row + col) % 2 ? 'art-square art-dark' : 'art-square'}>{piece && <span>{piece}</span>}</span>; })}</div><span className="art-caption">A little more intention, every day.</span></div>
    </section>
    <section className="metric-grid" aria-label="Your library at a glance">
      <MetricCard label="Games studied" value={games.length} icon="review" detail={games.length ? `${reviews.filter((review) => review.complete).length} engine reviews saved` : 'Import a PGN to begin'} />
      <MetricCard label="Preparation lines" value={countKind(records, 'repertoire')} icon="book" detail="Your own saved variations" />
      <MetricCard label="Due for review" value={due.length} icon="training" detail="Spaced repetition queue" />
      <MetricCard label="Tournaments" value={tournaments.length} icon="trophy" detail={nextRound ? `${nextRound.tournament} · ${nextRound.opponent || 'round pending'}` : 'Plan your next event'} />
    </section>
    <section className="dashboard-lower">
      <div className="panel recent-panel"><div className="panel-heading"><div><p className="eyebrow">RECENT STUDY</p><h2>Your games</h2></div><button className="text-link" onClick={() => onNavigate('library')}>Open library <Icon name="chevron" size={14}/></button></div>
        {recentGames.length ? <div className="recent-list">{recentGames.map((game) => <button className="recent-game" key={game.id} onClick={() => onSelectGame(game.id)}><span className="recent-game-mark"><Icon name="board" size={16}/></span><span className="recent-game-main"><strong>{game.white || 'White'} <span>vs</span> {game.black || 'Black'}</strong><small>{game.opening || game.event || 'Imported game'} · {shortDate(game.date || game.createdAt)}</small></span><Pill tone={game.result === '1-0' || game.result === '0-1' ? 'good' : 'neutral'}>{game.result || '*'}</Pill><Icon name="chevron" size={15}/></button>)}</div> : <EmptyState icon="review" title="Your study starts here" description="Import a completed game and build a clear picture of what to work on." action={<Button variant="secondary" icon="upload" onClick={onImport}>Import your first PGN</Button>} />}
      </div>
      <div className="panel focus-panel"><div className="panel-heading"><div><p className="eyebrow">NEXT STEP</p><h2>Keep the loop going</h2></div><span className="small-icon"><Icon name="spark" /></span></div><div className="focus-steps"><FocusStep number="01" title="Review a real game" detail="Start with the moves you played." action="Import PGN" onClick={onImport}/><FocusStep number="02" title="Find a useful line" detail="Compare actual opponent games." action="Prep map" onClick={() => onNavigate('prep')}/><FocusStep number="03" title="Make it stick" detail="Rehearse with a real schedule." action="Training" onClick={() => onNavigate('training')}/></div></div>
    </section>
  </>;
}

function PracticeProgress({ summary }) {
  return <div className="practice-progress"><p><strong>{summary.recalled} recalled without help</strong> · {summary.assisted} with a hint · {summary.revisit} to revisit</p><details><summary>About these results</summary><p>{summary.total} saved attempts in the past 7 days, covering the last 30 attempts per position. These counts measure recall of your saved lines.</p></details></div>;
}

function MetricCard({ label, value, icon, detail }) { return <div className="metric-card"><div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon name={icon} size={16}/></span></div><strong>{value}</strong><small>{detail}</small></div>; }
function FocusStep({ number, title, detail, action, onClick }) { return <div className="focus-step"><span className="focus-number">{number}</span><div><strong>{title}</strong><small>{detail}</small></div><button onClick={onClick}>{action}<Icon name="chevron" size={13}/></button></div>; }

function ReviewPlayer({ game, color, bottom = false }) {
  const elo = game[color + 'Elo'];
  return <div className={`player-row${bottom ? ' player-row-bottom' : ''}`}><span className={`player-avatar player-${color}`}>{game[color]?.[0]?.toUpperCase() || color[0].toUpperCase()}</span><div><strong>{game[color] || (color === 'white' ? 'White' : 'Black')}</strong><small>{elo ? elo + ' Elo' : color === 'white' ? 'White pieces' : 'Black pieces'}</small></div><span className="player-tag">{color.toUpperCase()}</span></div>;
}

export function ReviewView({ game, parsed, review, staleReview, records, currentPly, setCurrentPly, analysisState, analysisProgress, currentInfo, engineName, onImport, onAnalyze, onCancel, onSaveToTraining, onSaveLearningNote, onExport, onNavigate, onChangeGame, depth, setDepth, movetime, setMovetime, multipv, setMultipv, engineStatus, engineDownload }) {
  const reviewBoardRef = useRef(null);
  const revealReviewBoard = () => {
    if (window.matchMedia('(max-width: 720px)').matches) {
      reviewBoardRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
      reviewBoardRef.current?.querySelector('.square[tabindex="0"]')?.focus({ preventScroll: true });
    }
  };
  const [mobileReviewPanel, setMobileReviewPanel] = useState("moves");
  const [showMoveNotes, setShowMoveNotes] = useState(true);
  const [pvReplay, setPvReplay] = useState(null);
  const [practiceStatus, setPracticeStatus] = useState('');
  const [pvPly, setPvPly] = useState(0);
  const [reviewOrientation, setReviewOrientation] = useState(() => readBoardPreferences().orientation);
  const games = records.filter((record) => record.kind === 'game');
  const moves = review?.moves || [];
  const live = ['starting', 'downloading', 'analyzing'].includes(analysisState);
  const selectedMove = moves[currentPly] || null;
  const currentPosition = parsed?.positions?.[currentPly];
  const mainFen = currentPosition?.fen || parsed?.startFen || new Chess().fen();
  const replayPositions = useMemo(() => pvReplay ? variationPositions(pvReplay.fen, pvReplay.pv) : [], [pvReplay]);
  const replayPosition = pvReplay ? replayPositions[Math.min(pvPly, replayPositions.length - 1)] : null;
  const fen = replayPosition?.fen || mainFen;
  const selectPly = (ply) => { setPvReplay(null); setPvPly(0); setCurrentPly(ply); revealReviewBoard(); };
  const replayLine = (line) => { if (!selectedMove?.fenBefore || !line?.pv?.length) return; setPvReplay({ fen: selectedMove.fenBefore, pv: line.pv, san: line.san, score: line.score }); setPvPly(0); revealReviewBoard(); };
  const chooseGame = (nextGame) => { setPvReplay(null); setPvPly(0); onChangeGame(nextGame); };
  const legalState = useMemo(() => { try { const chess = new Chess(fen); return chess.isGameOver() ? (chess.isCheckmate() ? `${chess.turn() === 'w' ? 'White' : 'Black'} is checkmated.` : chess.isStalemate() ? 'Draw by stalemate.' : chess.isDraw() ? 'The position is drawn.' : 'Game over.') : chess.isCheck() ? `${chess.turn() === 'w' ? 'White' : 'Black'} to move · check` : `${chess.turn() === 'w' ? 'White' : 'Black'} to move`; } catch { return ''; } }, [fen]);

  if (!game || !parsed) return <>
    <SectionTitle eyebrow="GAME REVIEW" title="See the game more clearly." description="Bring in a completed PGN to replay it, then use Stockfish 18 for grounded, move-by-move analysis." action={<Button icon="upload" variant="primary" onClick={onImport}>Import PGN</Button>} />
    {games.length ? <div className="panel select-game-panel"><div className="panel-heading"><div><p className="eyebrow">SAVED GAMES</p><h2>Choose a game to review</h2></div><button className="text-link" onClick={onImport}>Import another <Icon name="plus" size={14}/></button></div><div className="saved-game-grid">{games.map((item) => <button key={item.id} className="saved-game-card" onClick={() => chooseGame(item)}><div className="saved-game-icon"><Icon name="board"/></div><div><strong>{item.white || 'White'} <span>vs</span> {item.black || 'Black'}</strong><small>{item.opening || item.event || 'Imported game'} · {shortDate(item.date || item.createdAt)}</small></div><Pill>{item.result || '*'}</Pill><Icon name="chevron" size={15}/></button>)}</div></div> : <EmptyState icon="review" title="One game can teach a lot" description="Paste a PGN or choose a .pgn file. Every move is checked for legality before it enters your library." action={<Button icon="upload" variant="primary" onClick={onImport}>Import a completed game</Button>} />}
    <p className="ethics-note"><Icon name="shield" size={14}/> Engine assistance is for completed games and study positions. Never use it during an active competitive game.</p>
  </>;

  return <div className="review-workspace" data-mobile-panel={mobileReviewPanel}>
    <SectionTitle eyebrow="GAME REVIEW" title={game.name || `${game.white} vs ${game.black}`} description={`${game.opening || 'Opening not tagged'} · ${resultLabel(game.result)} · ${game.moveCount} plies`} action={<div className="review-title-actions"><Button icon="upload" onClick={() => { setPvReplay(null); onImport(); }}>Import game</Button><Button icon="download" onClick={() => onExport(game)}>Export PGN</Button><select className="game-switch" value={game.id} aria-label="Choose saved game" onChange={(event) => chooseGame(games.find((item) => item.id === event.target.value))}>{games.map((item) => <option value={item.id} key={item.id}>{item.white || 'White'} vs {item.black || 'Black'}</option>)}</select></div>} />
    {staleReview && !review && <div className="review-stale-note" role="status"><Icon name="shield" size={15}/><span>A saved review uses an older score-comparison method and is not shown as current analysis. The original record is preserved; run Stockfish 18 again to refresh it.</span></div>}
    <div className="ethics-note"><Icon name="shield" size={14}/> Analysis is for completed games and study positions; never use engine assistance during an active competitive game.</div>
    <div className="review-layout">
      <section className="panel board-panel" ref={reviewBoardRef}>
        <ReviewPlayer game={game} color={reviewOrientation === 'w' ? 'black' : 'white'}/>
        <div className="review-board-area"><ChessBoard orientation={reviewOrientation} onOrientationChange={setReviewOrientation} fen={fen} startFen={parsed.startFen} historyMoves={parsed.mainline.slice(0, currentPly).map((move) => move.san)} interactive={false} lastMove={replayPosition?.move ? { from: replayPosition.move.from, to: replayPosition.move.to } : currentPosition?.move ? { from: currentPosition.move.from, to: currentPosition.move.to } : null}/></div>
        <ReviewPlayer game={game} color={reviewOrientation === 'w' ? 'white' : 'black'} bottom/>
        <div className="board-status"><span className="turn-dot"/>{legalState}<span className="board-status-ply">{pvReplay ? `Stockfish line · ${pvPly} of ${replayPositions.length - 1}` : currentPly === 0 ? 'Start position' : currentPly === parsed.mainline.length ? 'Final position' : `Before ply ${currentPly + 1}`}</span></div>
        {pvReplay ? <div className="board-controls pv-controls"><IconTextButton label="PV start" icon="back" onClick={() => setPvPly(0)} disabled={pvPly === 0}/><IconTextButton label="Previous PV move" icon="back" onClick={() => setPvPly((ply) => Math.max(0, ply - 1))} disabled={pvPly === 0}/><span className="ply-counter">{pvPly} / {replayPositions.length - 1}</span><IconTextButton label="Next PV move" icon="forward" onClick={() => setPvPly((ply) => Math.min(replayPositions.length - 1, ply + 1))} disabled={pvPly >= replayPositions.length - 1}/><button className="text-link" onClick={() => setPvReplay(null)}>Return to game</button></div> : <div className="board-controls"><IconTextButton label="Start" icon="back" onClick={() => selectPly(0)} disabled={currentPly === 0}/><IconTextButton label="Previous position" icon="back" onClick={() => selectPly(Math.max(0, currentPly - 1))} disabled={currentPly === 0}/><span className="ply-counter">{currentPly} / {parsed.mainline.length}</span><IconTextButton label="Next position" icon="forward" onClick={() => selectPly(Math.min(parsed.mainline.length, currentPly + 1))} disabled={currentPly >= parsed.mainline.length}/><IconTextButton label="End" icon="forward" onClick={() => selectPly(parsed.mainline.length)} disabled={currentPly >= parsed.mainline.length}/></div>}
        <div className="mobile-board-panels" role="group" aria-label="Game review panels">{[["moves", "Moves"], ["engine", "Analyze"], ["moments", "Key moments"]].map(([key, label]) => <button key={key} type="button" aria-pressed={mobileReviewPanel === key} onClick={() => setMobileReviewPanel(key)}>{label}</button>)}</div>
      </section>
      <div className="review-side-column">{practiceStatus && <p role="status">{practiceStatus}</p>}
        <section className="panel engine-panel">
          <div className="panel-heading engine-panel-heading"><div><p className="eyebrow">LOCAL ENGINE</p><h2>Position analysis</h2></div><span className={`engine-status-dot engine-${engineStatus}`} title={engineStatus}/></div>
          <div className="engine-option-row"><label>Search limit<select disabled={live} value={movetime ? `time-${movetime}` : `depth-${depth}`} onChange={(event) => event.target.value.startsWith('time-') ? setMovetime(Number(event.target.value.slice(5))) : (setMovetime(0), setDepth(Number(event.target.value.slice(6))))}><option value="depth-10">Quick · depth 10</option><option value="depth-12">Standard · depth 12</option><option value="depth-16">Thorough · depth 16</option><option value="time-250">250 ms / position</option><option value="time-600">600 ms / position</option><option value="time-1200">1.2 s / position</option></select></label><label>Lines<select disabled={live} value={multipv} onChange={(event) => setMultipv(Number(event.target.value))}><option value="1">1 line</option><option value="2">2 lines</option><option value="3">3 lines</option></select></label></div>
          <div className="engine-controls">{live ? <Button icon="stop" variant="danger" onClick={onCancel}>Stop analysis</Button> : <Button icon="play" variant="primary" onClick={onAnalyze} disabled={!parsed?.mainline?.length}>Analyze full game</Button>}{review?.complete && <Pill tone="good">Analysis saved</Pill>}</div>
          {analysisState === 'analyzing' && <div className="analysis-progress"><div className="progress-copy"><span>{analysisProgress.label || `Position ${analysisProgress.position} of ${analysisProgress.total}`}</span><strong>{analysisProgress.percent}%</strong></div><div className="progress-track"><span style={{ width: `${analysisProgress.percent}%` }}/></div><small>{currentInfo?.depth ? `Searching to depth ${currentInfo.depth}${currentInfo.nodes ? ` · ${currentInfo.nodes.toLocaleString()} nodes` : ''}` : 'Stockfish is searching off the main thread.'}</small></div>}
          {analysisState === 'downloading' && <div className="analysis-progress"><div className="progress-copy"><span>Downloading Stockfish 18</span><strong>{engineDownload?.percent ?? 0}%</strong></div><div className="progress-track"><span style={{ width: `${engineDownload?.percent ?? 0}%` }}/></div><small>7.3 MB lite WASM · cached on this device for offline analysis</small></div>}
          {analysisState === 'starting' && <p className="engine-hint">Starting the local Stockfish worker…</p>}
          {analysisState === 'failed' && <p className="inline-error">{analysisProgress.error || 'The local engine could not start.'} You can retry; existing saved analysis is kept.</p>}
          {!review?.complete && review?.moves?.length > 0 && !live && <p className="engine-hint">{review.moves.length} of {parsed.mainline.length} plies are saved from an interrupted analysis. Run again to finish.</p>}
          {selectedMove?.lines?.length > 0 && <div className="review-engine-lines"><p className="eyebrow">TOP LINES · DEPTH {selectedMove.depth} · {selectedMove.color === 'w' ? 'WHITE' : 'BLACK'} TO MOVE</p>{selectedMove.lines.slice(0, multipv).map((line) => <div className="review-engine-line" key={line.multipv}><Pill tone={line.multipv === 1 ? 'good' : 'neutral'}>{formatScore(line.score)}</Pill><span>{line.san}</span><button className="text-link" onClick={() => replayLine(line)} aria-label={`Replay Stockfish line ${line.san || line.pv.join(' ')}`}>Replay</button></div>)}</div>}
          <p className="engine-footnote"><Icon name="shield" size={13}/>{engineName || 'Authentic Stockfish 18'} · Runs locally · Single thread</p>
        </section>
        <section className="panel evaluation-panel"><div className="panel-heading"><div><p className="eyebrow">WHITE PERSPECTIVE</p><h2>Evaluation</h2></div>{selectedMove && <Pill tone={toneFor(selectedMove.label)}>{selectedMove.label}</Pill>}</div>{review?.moves?.length ? <EvaluationChart moves={review.moves} currentPly={currentPly} onSelectPly={selectPly}/> : <div className="chart-empty"><Icon name="review"/><p>Engine results appear here after analysis.</p></div>}</section>
        <section className="panel critical-panel"><div className="panel-heading"><div><p className="eyebrow">REAL POSITIONS, REAL SIGNAL</p><h2>Critical moments</h2></div><button className="text-link" disabled={!review?.moves?.length} onClick={async () => { try { const count = await onSaveToTraining(game, review); setPracticeStatus(count ? `${count} positions added to practice.` : "These positions are already in practice; schedules are preserved."); } catch (error) { setPracticeStatus(error.message); } }}>Practice all <Icon name="chevron" size={14}/></button></div>{moves.filter((move) => ['Inaccuracy', 'Mistake', 'Blunder', 'Missed win'].includes(move.label)).length ? <div className="critical-list">{moves.filter((move) => ['Inaccuracy', 'Mistake', 'Blunder', 'Missed win'].includes(move.label)).slice(0, 4).map((move) => <button key={move.ply} className="critical-item" onClick={() => selectPly(move.ply - 1)}><span className={`critical-mark mark-${move.label.toLowerCase().replaceAll(' ', '-')}`}>{move.label === 'Blunder' || move.label === 'Missed win' ? '!' : '•'}</span><span><strong>{Math.ceil(move.ply / 2)}{move.color === 'w' ? '.' : '…'} {move.san}</strong><small>{move.label} · {move.bestSan ? `best was ${move.bestSan}` : 'review the position'}</small></span><Icon name="chevron" size={14}/></button>)}</div> : <div className="small-empty">{review?.complete ? 'No inaccuracies, mistakes, or blunders were recorded at this search limit.' : 'Analyze the game to find engine-confirmed moments to rehearse.'}</div>}</section>
      </div>
    </div>
    <section className="panel move-panel"><div className="panel-heading"><div><p className="eyebrow">MOVE BY MOVE</p><h2>Game score</h2></div><div className="move-summary">{review?.complete ? <><span><i className="legend-dot legend-best"/> Best {moves.filter((move) => move.label === 'Best' || move.label === 'Best defense').length}</span><span><i className="legend-dot legend-inaccuracy"/> Inaccuracy {moves.filter((move) => move.label === 'Inaccuracy').length}</span><span><i className="legend-dot legend-mistake"/> Mistake {moves.filter((move) => move.label === 'Mistake').length}</span><span><i className="legend-dot legend-blunder"/> Blunder {moves.filter((move) => move.label === 'Blunder' || move.label === 'Missed win').length}</span></> : <small>Run Stockfish to classify moves</small>}</div></div>
      <div className="move-list">{parsed.mainline.map((move, index) => { const entry = moves[index]; const movePly = index + 1; return <button key={`${index}-${move.san}`} className={`move-cell${currentPly === movePly - 1 ? ' move-cell-active' : ''}`} onClick={() => selectPly(movePly - 1)}><span className="move-number">{Math.floor(index / 2) + 1}{index % 2 ? '…' : '.'}</span><span className="move-san">{move.san}</span>{entry && <><span className={`move-eval eval-${toneFor(entry.label)}`}>{entry.lossCp == null ? entry.label : entry.lossCp === 0 ? '0.0' : `−${(entry.lossCp / 100).toFixed(1)}`}</span><span className={`move-quality quality-${toneFor(entry.label)}`}>{entry.label}</span></>}</button>; })}</div>
      {selectedMove && <section className="decision-lesson" aria-label="Learn from this decision">
        <div><p className="eyebrow">ONE DECISION, ONE LESSON</p><h2>{Math.ceil(selectedMove.ply / 2)}{selectedMove.color === 'w' ? '.' : '…'} {selectedMove.san}</h2><p>Compare the continuations, then write what you want to remember next time.</p></div>
        <div className="decision-comparison">
          <article><small>You played</small><strong>{selectedMove.san} <Pill>{formatScore(selectedMove.playedScore)}</Pill></strong><p>{selectedMove.playedVariation?.san || (selectedMove.terminal ? 'The move ends the game.' : 'This older review has no saved played continuation. Reanalyze to record it.')}</p><Button disabled={!selectedMove.playedVariation?.pv?.length} onClick={() => replayLine(selectedMove.playedVariation)}>Replay played line</Button></article>
          <article><small>Stockfish alternative · depth {selectedMove.depth}</small><strong>{selectedMove.bestSan} <Pill tone="good">{formatScore(selectedMove.bestScore)}</Pill></strong><p>{selectedMove.lines?.[0]?.san || 'No saved continuation'}</p><Button disabled={!selectedMove.lines?.[0]?.pv?.length} onClick={() => replayLine(selectedMove.lines[0])}>Replay best line</Button></article>
        </div>
        <p className="decision-evidence">Scores here are from {selectedMove.color === 'w' ? 'White’s' : 'Black’s'} perspective. These are recorded searches from the same starting position and moving side. A principal variation illustrates the search result; it is not proof that every reply is forced. Depth affects the result.</p>
        <LearningTakeaway key={review.id + ':' + selectedMove.ply} saved={review.learningNotes?.[selectedMove.ply] || ''} disabled={live} onSave={(text) => onSaveLearningNote(review.id, selectedMove.ply, text)}/>
        {['Inaccuracy','Mistake','Blunder','Missed win'].includes(selectedMove.label) && <DecisionPractice onAdd={() => onSaveToTraining(game, { ...review, moves: [selectedMove] })} onNavigate={() => onNavigate('training')}/>}
      </section>}
      {selectedMove && showMoveNotes && <div className="move-explanation"><div className="move-explanation-title"><span className={`quality-dot quality-dot-${toneFor(selectedMove.label)}`}/><strong>{selectedMove.label}</strong><span>{selectedMove.lossCp == null ? 'Mate-aware result' : `${(selectedMove.lossCp / 100).toFixed(1)} pawn${selectedMove.lossCp === 100 ? '' : 's'} lost by this heuristic`}</span><button onClick={() => setShowMoveNotes(false)} aria-label="Hide move explanation"><Icon name="close" size={14}/></button></div><p>{selectedMove.label === 'Best' && selectedMove.bestUci === selectedMove.uci ? `The played move ${selectedMove.san} is Stockfish 18’s top move at this search limit. ` : selectedMove.bestSan ? `Stockfish 18’s top line begins ${selectedMove.bestSan}; the played move was ${selectedMove.san}. ` : ''}{selectedMove.playedScore?.kind === 'terminal' ? `This move ends the game: ${selectedMove.playedScore.result} by ${selectedMove.playedScore.termination}.` : selectedMove.bestScore?.kind === 'mate' || selectedMove.playedScore?.kind === 'mate' ? selectedMove.label === 'Best defense' ? 'The engine found a forced loss; this move preserves the strongest defense and mate distance found.' : 'Mate scores are compared by forced outcome and distance. No centipawn-loss estimate is assigned.' : selectedMove.label === 'Best' || selectedMove.label === 'Best defense' ? 'This move stayed within the phase-adjusted centipawn-loss band.' : selectedMove.label === 'Missed win' ? 'The engine found a forced win in the position, but this move did not preserve it.' : 'The label follows a phase-adjusted centipawn-loss heuristic; it is a study aid, not an accuracy percentage.'}</p></div>}
    </section>
    <p className="classification-note">Move labels use the measured difference between the engine’s best move and the played move. Thresholds vary by opening, middlegame, or endgame; forced mates are handled separately. Search depth affects certainty. No accuracy percentage is calculated.</p>
  </div>;
}

function LearningTakeaway({ saved, disabled, onSave }) {
  const [text, setText] = useState(saved);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  return <form className="learning-takeaway" onSubmit={async (event) => { event.preventDefault(); setSaving(true); setStatus(''); try { await onSave(text); setStatus('Takeaway saved with this move and included in backups.'); } catch (error) { setStatus(error.message); } finally { setSaving(false); } }}>
    <label>My takeaway<textarea maxLength={1000} rows={3} value={text} disabled={disabled || saving} onChange={(event) => { setText(event.target.value); setStatus(''); }} placeholder="What did I overlook? What will I check before making this move next time?"/></label>
    <div><small>Your words. The engine verifies lines, not this personal note. Save before changing moves.</small><Button type="submit" disabled={disabled || saving}>{saving ? 'Saving…' : 'Save takeaway'}</Button></div>
    {status && <p role="status">{status}</p>}
  </form>;
}

function DecisionPractice({ onAdd, onNavigate }) {
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  return <div className="decision-practice"><Button disabled={saving} onClick={async () => { setSaving(true); try { const count = await onAdd(); setStatus(count ? 'This decision is ready for practice.' : 'This decision is already in training; its schedule is preserved.'); } catch (error) { setStatus(error.message); } finally { setSaving(false); } }}>Add this position to practice</Button><Button onClick={onNavigate}>Open training</Button>{status && <span role="status">{status}</span>}</div>;
}

function IconTextButton({ label, icon, ...props }) { return <button className="control-button" aria-label={label} title={label} {...props}><Icon name={icon} size={16}/></button>; }

function EvaluationChart({ moves, currentPly, onSelectPly }) {
  const width = 520, height = 104, padding = 8;
  const values = evaluationGraphValues(moves);
  const x = (index) => padding + index / Math.max(1, values.length - 1) * (width - 2 * padding);
  const y = (value) => height / 2 - Math.max(-5, Math.min(5, value)) / 5 * (height / 2 - padding);
  const segments = [];
  for (let index = 0; index < values.length; index++) {
    if (values[index].value == null) continue;
    const segment = [];
    while (index < values.length && values[index].value != null) { segment.push({ ...values[index], index }); index++; }
    segments.push(segment);
    index--;
  }
  const currentIndex = Math.min(values.length - 1, Math.max(0, currentPly));
  const finalScore = moves.at(-1)?.whiteScore;
  const resultText = finalScore?.kind === 'terminal'
    ? finalScore.result === 'draw' ? `Draw · ${finalScore.termination}` : `${finalScore.winner === 'w' ? 'White' : 'Black'} wins · ${finalScore.termination}`
    : finalScore?.kind === 'mate' ? `Forced mate for ${finalScore.value > 0 ? 'White' : 'Black'} in ${Math.abs(finalScore.value)}` : '';
  return <div className="eval-chart-wrap"><div className="chart-scale"><span>+5</span><span>0</span><span>−5</span></div><svg className="eval-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`White-perspective centipawn graph, from plus five to minus five pawns${resultText ? `. ${resultText}` : ''}`}><line x1="0" y1={height / 2} x2={width} y2={height / 2} className="chart-zero"/><g aria-hidden="true">{segments.map((segment, index) => { const points = segment.map((point) => `${x(point.index)},${y(point.value)}`).join(' '); return <g key={index}>{segment.length > 1 && <polygon points={`${x(segment[0].index)},${y(5)} ${points} ${x(segment.at(-1).index)},${y(5)}`} className="chart-area-white"/>}<polyline points={points} className="chart-line"/>{segment.length === 1 && <circle cx={x(segment[0].index)} cy={y(segment[0].value)} r="2.5" className="chart-point"/>}</g>; })}</g><line x1={x(currentIndex)} x2={x(currentIndex)} y1="0" y2={height} className="chart-cursor"/><rect x="0" y="0" width={width} height={height} fill="transparent" onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); const at = Math.round((event.clientX - rect.left) / rect.width * (values.length - 1)); onSelectPly(values[at]?.ply || 0); }} /></svg>{resultText && <p className="chart-outcome">{resultText}</p>}<div className="chart-axis"><span>Start</span><span>Move {Math.ceil(moves.length / 2)}</span><span>End</span></div></div>;
}

export function PrepMapView({ records, onNavigate, onSelectGame }) {
  const [opponentId, setOpponentId] = useState('all');
  const [color, setColor] = useState('all');
  const games = records.filter((record) => record.kind === 'game');
  const opponents = records.filter((record) => record.kind === 'opponent');
  const opponent = opponents.find((item) => item.id === opponentId);
  const filtered = games.filter((game) => opponentId === 'all' || game.opponent?.toLowerCase() === opponent?.name?.toLowerCase() || game.white?.toLowerCase() === opponent?.name?.toLowerCase() || game.black?.toLowerCase() === opponent?.name?.toLowerCase());
  const summary = useMemo(() => summarizeOpponentGames(filtered, color), [filtered, color]);
  const sampleCount = filtered.filter((game) => color === 'all' || opponentColor(game) === color).length;
  const allColorCounts = { w: filtered.filter((game) => opponentColor(game) === 'w').length, b: filtered.filter((game) => opponentColor(game) === 'b').length, unknown: filtered.filter((game) => !opponentColor(game)).length };
  return <>
    <SectionTitle eyebrow="PREP MAP" title="Know what they actually play." description="Opening patterns from imported games, with the sample size and recency kept in view." action={<Button icon="book" onClick={() => onNavigate('clash')}>Compare repertoire</Button>} />
    <section className="panel prep-filter-panel"><div className="prep-filter-intro"><div className="small-icon"><Icon name="search"/></div><div><strong>Choose a real sample</strong><small>Patterns are calculated only from games in your library.</small></div></div><div className="prep-filters"><label>Opponent<select value={opponentId} onChange={(event) => setOpponentId(event.target.value)}><option value="all">All imported games</option>{opponents.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Opponent’s color<select value={color} onChange={(event) => setColor(event.target.value)}><option value="all">Both colors</option><option value="w">White</option><option value="b">Black</option></select></label></div></section>
    <div className="prep-summary-grid"><div className="prep-summary-card"><small>Games in sample</small><strong>{sampleCount}</strong><span>Historical records · not a prediction</span></div><div className="prep-summary-card"><small>As White</small><strong>{allColorCounts.w}</strong><span>{allColorCounts.w ? 'Imported games with opponent as White' : 'No identified White games'}</span></div><div className="prep-summary-card"><small>As Black</small><strong>{allColorCounts.b}</strong><span>{allColorCounts.b ? 'Imported games with opponent as Black' : 'No identified Black games'}</span></div><div className="prep-summary-card"><small>Opening lines found</small><strong>{summary.length}</strong><span>Grouped by the first eight plies</span></div></div>
    <section className="panel prep-lines-panel"><div className="panel-heading"><div><p className="eyebrow">FROM YOUR GAME FILES</p><h2>Observed opening lines</h2></div><Pill>{sampleCount} game{sampleCount === 1 ? '' : 's'} · {color === 'all' ? 'both colors' : color === 'w' ? 'White' : 'Black'}</Pill></div>
      {summary.length ? <div className="opening-table-wrap"><table className="opening-table"><thead><tr><th>Priority</th><th>Move order · first 8 plies</th><th>Sample</th><th>Typical next · 4 plies</th><th>Color split</th><th>Most recent</th><th>Games</th></tr></thead><tbody>{summary.map((row, index) => <tr key={row.id}><td><Pill tone={index === 0 ? 'warm' : 'neutral'}>#{index + 1}</Pill></td><td><strong className="opening-san">{row.prefix}</strong>{row.transposed.length > 0 && <small className="transposition-note">Transposes with {row.transposed[0]}</small>}</td><td><strong>{row.count}</strong><small>{row.count < 3 ? 'small sample' : 'observed games'}</small></td><td className="typical-next">{row.typicalContinuation || 'No continuation available'}</td><td><div className="color-split"><span>♔ {row.colors.w}</span><span>♚ {row.colors.b}</span></div></td><td>{row.latest ? shortDate(row.latest) : 'Unknown'}</td><td><div className="table-game-links">{row.games.slice(0, 3).map((game) => <button key={game.id} onClick={() => onSelectGame(game.id)} aria-label={`Open game: ${game.white || "White"} vs ${game.black || "Black"}`} title={`${game.white || 'White'} vs ${game.black || 'Black'}`}><Icon name="review" size={14}/></button>)}</div></td></tr>)}</tbody></table></div> : <EmptyState icon="book" title={games.length ? 'No games match this filter' : 'No opponent sample yet'} description={games.length ? 'Choose another opponent or color, or import more games.' : 'Import opponent PGNs and add an opponent name to build a real preparation map.'} action={<Button icon="upload" onClick={() => onNavigate('review')}>Go to game review</Button>} />}
    </section>
    <p className="classification-note">Priorities sort by observed game count; recency breaks ties. Typical continuation is the most frequent next four plies in that exact prefix. Transpositions group by the resulting legal position. This is a historical sample, not an opponent prediction.</p>
  </>;
}

export function ClashView({ initialLineId, records, onAddLine, onDeleteLine, onNavigate, onOpenGame, onPracticeLine }) {
  const lines = records.filter((record) => record.kind === 'repertoire');
  const opponents = records.filter((record) => record.kind === 'opponent');
  const games = records.filter((record) => record.kind === 'game');
  const [opponentId, setOpponentId] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [lineName, setLineName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const lineFormRef = useRef(null);
  const lineSaveRef = useRef(false);
  const [savingLine, setSavingLine] = useState(false);
  useEffect(() => { if (showForm && lineFormRef.current) { lineFormRef.current.scrollIntoView({ block: 'start', behavior: 'instant' }); lineFormRef.current.querySelector('input')?.focus({ preventScroll: true }); } }, [showForm, editingId]);
  const [lineColor, setLineColor] = useState('w');
  const [linePgn, setLinePgn] = useState('');
  const [formError, setFormError] = useState('');
  useEffect(() => {
    const requested = lines.find((line) => line.id === initialLineId);
    if (requested) { setEditingId(requested.id); setLineName(requested.name); setLineColor(requested.color); setLinePgn(requested.pgn); setShowForm(true); }
  }, [initialLineId]);
  const opponent = opponents.find((item) => item.id === opponentId);
  const sample = games.filter((game) => opponentId === 'all' || game.opponent?.toLowerCase() === opponent?.name?.toLowerCase() || game.white?.toLowerCase() === opponent?.name?.toLowerCase() || game.black?.toLowerCase() === opponent?.name?.toLowerCase());
  const actual = sample.map((game) => { try { return { game, parsed: parsePgn(game.pgn), opponentSide: opponentColor(game) }; } catch { return null; } }).filter(Boolean);
  const comparable = actual.filter((item) => item.opponentSide === 'w' || item.opponentSide === 'b');
  const colorUnknown = actual.length - comparable.length;
  const comparisons = lines.map((line) => {
    let prepared = null;
    try { prepared = parsePgn(line.pgn); } catch { /* old or damaged repertoire records stay visible but cannot be matched */ }
    const matches = comparable.map((item) => ({ ...item, match: compareRepertoireLine(prepared, item.parsed, line.color, item.opponentSide) })).filter((item) => item.match.matched);
    return { line, matches, exactCount: matches.filter((item) => item.match.type === 'exact').length, transposedCount: matches.filter((item) => item.match.type === 'transposition').length };
  });
  const covered = new Set(comparisons.flatMap((row) => row.matches.map((item) => item.game.id)));
  const uncovered = comparable.filter(({ game }) => !covered.has(game.id)).map(({ game, parsed }) => ({ game, prefix: parsed.mainline.slice(0, 8).map((move) => move.san).join(' ') }));
  const saveLine = async (event) => {
    event.preventDefault();
    if (lineSaveRef.current) return;
    lineSaveRef.current = true; setSavingLine(true);
    try {
      const parsed = parsePgn(linePgn);
      const moves = parsed.mainline.map((move) => move.san);
      if (!moves.length) throw new Error("Add at least one legal move to this line.");
      await onAddLine({ id: editingId || makeId('line'), kind: 'repertoire', name: cleanText(lineName || moves.slice(0, 4).join(' '), 100), color: lineColor, pgn: linePgn, moves, startFen: parsed.startFen, createdAt: lines.find((line) => line.id === editingId)?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() }, Boolean(editingId));
      setShowForm(false); setEditingId(null); setLineName(''); setLinePgn(''); setFormError('');
    } catch (error) { setFormError(error.message); } finally { lineSaveRef.current = false; setSavingLine(false); }
  };
  return <>
    <SectionTitle eyebrow="REPERTOIRE CLASH" title="Find the meeting point." description="Match the lines you have prepared against positions that appear in imported games." action={<Button icon="plus" variant="primary" onClick={() => { setEditingId(null); setLineName(''); setLinePgn(''); setFormError(''); setShowForm((value) => !value); }}>{showForm ? 'Close form' : 'Add a prepared line'}</Button>} />
    {showForm && <form ref={lineFormRef} className="panel line-form" onSubmit={saveLine}><div className="panel-heading"><div><p className="eyebrow">YOUR REPERTOIRE</p><h2>{editingId ? "Edit prepared line" : "Save a prepared line"}</h2></div></div><div className="form-grid form-grid-3"><label>Line name<input value={lineName} onChange={(event) => setLineName(event.target.value)} placeholder="e.g. French · Tarrasch" maxLength={100}/></label><label>Prepared side<select value={lineColor} onChange={(event) => setLineColor(event.target.value)}><option value="w">White</option><option value="b">Black</option></select></label><label className="form-span-2">PGN line<textarea required value={linePgn} onChange={(event) => setLinePgn(event.target.value)} placeholder={'1. e4 e6 2. d4 d5 3. Nd2'} rows={3}/></label></div>{formError && <p className="inline-error">{formError}</p>}<div className="form-actions"><small>Legal moves are checked before saving. Unchanged practice retains its schedule; positions removed from the line are paused with their history kept.</small><Button type="submit" variant="primary" icon="save" disabled={savingLine}>{editingId ? "Save changes" : "Save line"}</Button></div></form>}
    <section className="panel prep-filter-panel"><div className="prep-filter-intro"><span className="small-icon"><Icon name="clash"/></span><div><strong>Actual opponent sample</strong><small>Only local games you have imported are compared.</small></div></div><label>Opponent<select value={opponentId} onChange={(event) => setOpponentId(event.target.value)}><option value="all">All imported games</option>{opponents.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></section>
    <div className="clash-count-row"><div><strong>{lines.length}</strong><span>prepared lines</span></div><div><strong>{actual.length}</strong><span>valid games in sample</span></div><div><strong>{comparable.length}</strong><span>games with known opponent color</span></div><div><strong>{comparisons.reduce((sum, row) => sum + row.matches.length, 0)}</strong><span>line/game matches observed</span></div><div><strong>{uncovered.length}</strong><span>color-compatible games without a match</span></div></div>
    {lines.length ? <div className="clash-line-list">{comparisons.map(({ line, matches, exactCount, transposedCount }) => { const compatibleCount = comparable.filter((item) => item.opponentSide !== line.color).length; return <article className="panel clash-line-card" key={line.id}><div className="clash-line-heading"><div><Pill tone={line.color === 'w' ? 'good' : 'neutral'}>{line.color === 'w' ? 'White line' : 'Black line'}</Pill><h3>{line.name}</h3></div><button className="icon-button" aria-label={`Delete ${line.name}`} onClick={() => onDeleteLine(line)}><Icon name="trash" size={16}/></button></div><p className="opening-san">{line.moves.join(' ')}</p><Button disabled={savingLine} onClick={() => { setEditingId(line.id); setLineName(line.name); setLineColor(line.color); setLinePgn(line.pgn); setFormError(''); setShowForm(true); }} aria-label={`Edit ${line.name}`}>Edit line</Button><div className="clash-line-footer"><span><Icon name="check" size={15}/>{matches.length} game{matches.length === 1 ? '' : 's'} reached this line · {exactCount} exact · {transposedCount} transposed</span><span>{compatibleCount ? `${Math.round(matches.length / compatibleCount * 100)}% of ${compatibleCount} color-compatible games` : 'No games with a known compatible color'}</span></div><div className="clash-study-actions"><Button icon="training" onClick={() => onPracticeLine(line)}>Practice this line</Button>{matches.slice(0, 3).map(({ game }) => <button className="text-link" key={game.id} onClick={() => onOpenGame(game.id)}>Open matched game: {game.white} vs {game.black}</button>)}</div></article>; })}</div> : <EmptyState icon="book" title="Start with a line you know" description="Save a prepared PGN line. Comparisons use each player's color, verified board positions, and legal transpositions in your imported games." action={<Button icon="plus" variant="primary" onClick={() => setShowForm(true)}>Add prepared line</Button>} />}
    <section className="panel gaps-panel"><div className="panel-heading"><div><p className="eyebrow">REHEARSAL GAPS</p><h2>Color-known games without a reached line</h2></div><Pill>{uncovered.length} observed</Pill></div>{uncovered.length ? <div className="gap-list">{uncovered.slice(0, 8).map(({ game, prefix }) => <div className="gap-item" key={game.id}><span className="gap-mark"><Icon name="board" size={15}/></span><span><strong>{prefix || game.opening}</strong><small>{game.opponent || `${game.white} vs ${game.black}`} · Opponent {opponentColor(game) === 'w' ? 'White' : 'Black'} · {shortDate(game.date || game.createdAt)}</small></span><button className="text-link" onClick={() => onOpenGame(game.id)}>Review game <Icon name="chevron" size={13}/></button></div>)}</div> : <div className="small-empty">{actual.length ? colorUnknown ? `${colorUnknown} game${colorUnknown === 1 ? '' : 's'} have no known opponent color, so they are not counted as repertoire gaps.` : 'Every color-compatible imported game reached at least one prepared line.' : 'Import opponent games and label the opponent’s color to check your repertoire.'}</div>}</section>
    <p className="classification-note">A line matches when the saved side is compatible with the known opponent color and its moves continue legally from the same position, including a transposition. A game may match more than one line. Unknown-color games stay visible in the sample count but are excluded from match rates and gaps; these are historical records, not predictions.</p>
  </>;
}

export function TrainingView({ initialCardId, records, onAddReviewCards, onAddLineCards, onGradeCard, onSaveEnginePosition, onNavigate }) {
  const cards = records.filter((record) => record.kind === 'training');
  const dueCards = duePracticeCards(cards);
  const recall = practiceSummary(cards);
  const reviews = records.filter((record) => record.kind === 'review' && record.moves?.length);
  const games = records.filter((record) => record.kind === 'game');
  const lines = records.filter((record) => record.kind === 'repertoire');
  const [sessionIds, setSessionIds] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [fen, setFen] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [wrong, setWrong] = useState(false);
  const [graded, setGraded] = useState(false);
  const [savedCritical, setSavedCritical] = useState('');
  const [sourceError, setSourceError] = useState('');
  const [assisted, setAssisted] = useState(false);
  const [savingAttempt, setSavingAttempt] = useState(false);
  const [pendingAttempt, setPendingAttempt] = useState(null);
  const [sessionResults, setSessionResults] = useState([]);
  const savingRef = useRef(false);
  const [showAddSources, setShowAddSources] = useState(false);
  useEffect(() => {
    const requested = cards.find((card) => card.id === initialCardId);
    if (!requested) return;
    if (requested.retiredAt) { setSourceError('This position is paused after a prepared-line edit. Its recall history remains saved.'); return; }
    setSessionIds([requested.id]); setActiveIndex(0); setFen(requested.fen); setFeedback(null); setWrong(false); setGraded(false);
  }, [initialCardId]);
  const sessionRef = useRef(null);
  const started = sessionIds.length > 0;
  useEffect(() => {
    if (!started || !sessionRef.current) return;
    sessionRef.current.querySelector('.square[tabindex="0"]')?.focus({ preventScroll: true });
    if (window.matchMedia('(max-width: 720px)').matches) sessionRef.current.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, [started, activeIndex]);
  const card = cards.find((item) => item.id === sessionIds[activeIndex]);
  const savedTakeaway = card?.gameId ? reviews.find((item) => item.gameId === card.gameId && item.learningNotes?.[card.ply])?.learningNotes[card.ply] : '';
  const progress = started ? Math.min(activeIndex, sessionIds.length) : 0;

  const beginSession = () => {
    const queue = dueCards.slice(0, 5).map((item) => item.id);
    setSessionResults([]); setAssisted(false); setPendingAttempt(null);
    setSessionIds(queue); setActiveIndex(0); setFeedback(null); setWrong(false); setGraded(false);
    if (queue.length) setFen(cards.find((item) => item.id === queue[0])?.fen || '');
  };
  const nextCard = () => {
    const next = activeIndex + 1;
    setAssisted(false); setPendingAttempt(null);
    setActiveIndex(next); setFeedback(null); setWrong(false); setGraded(false);
    const nextRecord = cards.find((item) => item.id === sessionIds[next]);
    setFen(nextRecord?.fen || '');
  };
  const saveAttempt = async (attempt) => {
    if (savingRef.current) return;
    savingRef.current = true; setSavingAttempt(true); setPendingAttempt(attempt);
    setFeedback({ tone: 'warm', text: 'Saving this attempt…' });
    try {
      await onGradeCard(card, attempt);
      setFen(attempt.fen); setGraded(true); setPendingAttempt(null);
      setSessionResults((items) => [...items, attempt.outcome]);
      setFeedback({ tone: attempt.outcome === 'recalled' ? 'good' : 'warm', text: attempt.text });
    } catch (error) {
      setFeedback({ tone: 'bad', text: 'Not saved. ' + error.message + ' Retry to keep this result and update its schedule.' });
    } finally { savingRef.current = false; setSavingAttempt(false); }
  };
  const onTryMove = async (move) => {
    if (!card || graded || pendingAttempt || savingRef.current) return;
    const played = variationUci(move);
    const acceptable = card.acceptableUci?.length ? card.acceptableUci : [card.targetUci];
    if (!acceptable.includes(played)) {
      setWrong(true);
      setFeedback({ tone: 'warm', text: card.sourceType === 'repertoire'
        ? 'Try again: this is not the saved repertoire move. You can ask for a hint or reveal it.'
        : 'This move is outside the saved engine alternatives. It has not been evaluated here. Try another move, or reveal the saved line.' });
      return;
    }
    const chess = new Chess(card.fen);
    const result = chess.move({ from: move.from, to: move.to, promotion: move.promotion });
    const outcome = wrong ? 'missed' : assisted ? 'assisted' : 'recalled';
    await saveAttempt({ id: makeId('attempt'), outcome, playedUci: played, fen: chess.fen(),
      text: result.san + ' matches a saved line. ' + (outcome === 'recalled' ? 'Recalled without help. Your next review is scheduled.' : 'Saved as ' + (outcome === 'assisted' ? 'recalled with a hint' : 'found after another attempt') + '. Revisit in 10 minutes.') });
  };
  const failCard = async () => {
    if (!card || graded || pendingAttempt || savingRef.current) return;
    const chess = new Chess(card.fen);
    const move = chess.move({ from: card.targetUci.slice(0, 2), to: card.targetUci.slice(2, 4), promotion: card.targetUci[4] });
    await saveAttempt({ id: makeId('attempt'), outcome: 'revealed', playedUci: card.targetUci, fen: chess.fen(),
      text: 'The saved move is ' + move.san + '. Recorded as revealed; revisit in 10 minutes.' });
  };
  const addReview = async (review) => {
    const game = games.find((item) => item.id === review.gameId);
    let count; try { count = await onAddReviewCards(game, review); } catch (error) { setSourceError(error.message); return; }
    setSourceError('');
    setSavedCritical(`${count} engine-confirmed critical position${count === 1 ? '' : 's'} added.`);
    setShowAddSources(false);
  };
  const addLine = async (line) => {
    let count; try { count = await onAddLineCards(line); } catch (error) { setSavedCritical(error.message); return; }
    setSavedCritical(`${count} position${count === 1 ? '' : 's'} added from ${line.name}.`);
    setShowAddSources(false);
  };
  const enginePositions = records.filter((record) => record.kind === 'board-position' && record.targetUci);
  return <>
    <SectionTitle eyebrow="TRAINING STUDIO" title="Turn good study into recall." description="Rehearse actual positions with a spaced schedule that adapts when a move is missed." action={<Button icon="plus" onClick={() => setShowAddSources((value) => !value)}>{showAddSources ? 'Close sources' : 'Add positions'}</Button>} />
    {!started && recall.total > 0 && <PracticeProgress summary={recall}/>}
    <div className="training-metrics"><div><small>Cards in library</small><strong>{cards.length}</strong></div><div><small>Due now</small><strong>{dueCards.length}</strong></div><div><small>Reviewed today</small><strong>{cards.filter((item) => item.lastReviewedAt?.slice(0, 10) === new Date().toISOString().slice(0, 10)).length}</strong></div><div><small>Engine positions</small><strong>{cards.filter((item) => item.sourceType === 'engine-position').length}</strong></div></div>
    {sourceError && <p className="inline-error" role="alert">{sourceError}</p>}
    {savedCritical && <div className="inline-success"><Icon name="check"/>{savedCritical}<button onClick={() => setSavedCritical('')} aria-label="Dismiss"><Icon name="close" size={14}/></button></div>}
    {showAddSources && <section className="panel add-source-panel"><div className="panel-heading"><div><p className="eyebrow">BUILD A REAL REVIEW QUEUE</p><h2>Choose what to rehearse</h2></div></div><div className="training-source-grid">{reviews.filter((item) => item.engineName?.includes('Stockfish 18')).map((review) => { const game = games.find((item) => item.id === review.gameId); const critical = review.moves.filter((move) => ['Inaccuracy','Mistake','Blunder','Missed win'].includes(move.label)); return <div className="training-source-card" key={review.id}><span className="small-icon"><Icon name="review"/></span><div><strong>{game?.name || 'Saved engine review'}</strong><small>{critical.length} engine-confirmed critical positions</small></div><Button onClick={() => addReview(review)} disabled={!critical.length}>Add critical</Button></div>; })}{lines.map((line) => <div className="training-source-card" key={line.id}><span className="small-icon"><Icon name="book"/></span><div><strong>{line.name}</strong><small>{line.moves.length} prepared positions · {line.color === 'w' ? 'White' : 'Black'}</small></div><Button onClick={() => addLine(line)}>Add line</Button></div>)}{!reviews.some((item) => item.engineName?.includes('Stockfish 18')) && !lines.length && <p className="source-empty">Save Stockfish 18 reviews or prepared lines first. No sample positions are preloaded.</p>}</div></section>}
    {started && card ? <section className="training-session-grid" ref={sessionRef}><section className="panel training-board-panel"><div className="training-session-top"><div><p className="eyebrow">REVIEW {Math.min(progress + 1, sessionIds.length)} OF {sessionIds.length}</p><h2>{card.sourceName || card.name || 'Study position'}</h2></div><Pill tone={card.sourceType === 'critical' ? 'warm' : card.sourceType === 'engine-position' ? 'good' : 'neutral'}>{card.sourceType === 'critical' ? 'Engine critical moment' : card.sourceType === 'engine-position' ? 'Saved engine position' : 'Prepared line'}</Pill></div><ChessBoard fen={fen || card.fen} interactive={!graded && !savingAttempt && !pendingAttempt} onMove={onTryMove} orientation={card.color || 'w'}/><div className="training-board-foot"><span><Icon name="clock" size={14}/> {card.sourceType === 'critical' ? `Move ${Math.ceil(card.ply / 2)} · ${card.label}` : card.sourceType === 'engine-position' ? 'Analysis board position' : `Move ${Math.ceil(card.ply / 2)} · ${card.sourceName || 'repertoire'}`}</span><span>{graded ? 'Result saved' : `${card.color === 'w' ? 'White' : 'Black'} to move`}</span></div></section><aside className="panel training-feedback-panel"><p className="eyebrow">RECALL FIRST</p><h2>{graded ? 'Position reviewed' : card.sourceType === 'repertoire' ? 'Find the prepared move.' : 'Find a strong engine line.'}</h2><p className="training-prompt">Tap a piece, then its destination.</p>{feedback && <div className={`training-feedback feedback-${feedback.tone}`} role="status"><Icon name={feedback.tone === 'good' ? 'check' : 'spark'} size={17}/><span>{feedback.text}</span></div>}{graded && savedTakeaway && <div className="training-takeaway"><p className="eyebrow">YOUR SAVED TAKEAWAY</p><p>{savedTakeaway}</p></div>}{pendingAttempt && !savingAttempt && <Button variant="primary" onClick={() => saveAttempt(pendingAttempt)}>Retry saving attempt</Button>}{!graded && !pendingAttempt && <Button variant="secondary" onClick={() => { setAssisted(true); setFeedback({ tone: 'warm', text: `Hint: ${card.targetSan?.[0] === 'N' ? 'a knight' : card.targetSan?.[0] === 'B' ? 'a bishop' : card.targetSan?.[0] === 'R' ? 'a rook' : card.targetSan?.[0] === 'Q' ? 'the queen' : card.targetSan?.[0] === 'K' ? 'the king' : 'a pawn'} move is part of the saved line.`}); }}>Show a piece hint</Button>}{!graded ? <Button variant="ghost" onClick={failCard} disabled={savingAttempt || Boolean(pendingAttempt)}>Show solution</Button> : <Button variant="primary" icon="forward" onClick={nextCard}>{activeIndex + 1 < sessionIds.length ? 'Next position' : 'Finish session'}</Button>}<div className="schedule-preview"><span>Next review</span><strong>{card.dueAt ? shortDate(card.dueAt) : 'After this session'}</strong><small>Intervals adapt to your answer, using SM-2 scheduling.</small></div></aside></section> : started ? <section className="panel session-complete"><div className="complete-mark"><Icon name="check" size={25}/></div><p className="eyebrow">SESSION COMPLETE</p><h2>{sessionIds.length ? `You reviewed ${sessionIds.length} position${sessionIds.length === 1 ? '' : 's'}.` : 'Nothing was due right now.'}</h2><p>{sessionResults.filter((x) => x === 'recalled').length} recalled without help · {sessionResults.filter((x) => x === 'assisted').length} with a hint · {sessionResults.filter((x) => ['missed', 'revealed'].includes(x)).length} to revisit. All {sessionResults.length} results saved.</p><Button variant="primary" icon="training" onClick={() => { setSessionIds([]); setActiveIndex(0); }}>Back to studio</Button>{dueCards.length > 0 && <Button onClick={beginSession}>Practice next {Math.min(5, dueCards.length)}</Button>}</section> : <div className="training-start-grid"><section className="panel training-start-card"><div className="training-orbit"><Icon name="training" size={27}/></div><p className="eyebrow">TODAY’S RECALL</p><h2>{dueCards.length ? `${dueCards.length} position${dueCards.length === 1 ? ' is' : 's are'} ready.` : 'A clear board.'}</h2><p>{dueCards.length ? 'Up to 5 due positions per session. Recall first; hints and reveals are recorded honestly.' : cards.length ? 'Your next reviews are scheduled. Add critical moments or lines when you finish studying.' : 'Add engine-confirmed mistakes or a prepared opening line. The queue stays grounded in your own study.'}</p><Button variant="primary" icon="play" onClick={beginSession} disabled={!dueCards.length}>Start session</Button></section><section className="panel schedule-panel"><div className="panel-heading"><div><p className="eyebrow">REVIEW SCHEDULE</p><h2>Due cards</h2></div><Pill>{cards.length} saved</Pill></div>{cards.length ? <div className="schedule-list">{cards.slice(0, 6).map((item) => <div className="schedule-item" key={item.id}><span className="schedule-status"><Icon name={new Date(item.dueAt) <= new Date() ? 'clock' : 'check'} size={14}/></span><span><strong>{item.sourceName || item.name || item.sourceType}</strong><small>{item.sourceType === 'critical' ? `${item.label} · move ${Math.ceil(item.ply / 2)}` : item.sourceType === 'engine-position' ? 'Analysis board position' : `Move ${Math.ceil(item.ply / 2)} · ${item.color === 'w' ? 'White' : 'Black'} to move`}</small></span><span className="schedule-date">{item.retiredAt ? 'Paused · line changed' : new Date(item.dueAt) <= new Date() ? 'Due now' : shortDate(item.dueAt)}</span></div>)}</div> : <EmptyState icon="clock" title="No cards yet" description="Cards are created from your engine reviews and preparation lines." action={<Button onClick={() => setShowAddSources(true)}>Choose a source</Button>} />}</section></div>}
    {enginePositions.length > 0 && <p className="classification-note">{enginePositions.length} engine-analyzed board position{enginePositions.length === 1 ? '' : 's'} available for practice.</p>}
  </>;
}

function boardTreeFromParsed(parsed) {
  return parsed.root;
}

export function BoardLabView({ onSaveGame, onAnalyzeBoard, onSaveEnginePosition, onCancelAnalysis, engineStatus, engineName, analysisState, engineDownload, currentInfo }) {
  const treeRef = useRef(null);
  const [fen, setFen] = useState(new Chess().fen());
  const [cursor, setCursor] = useState(null);
  const [revision, setRevision] = useState(0);
  const [fenInput, setFenInput] = useState('');
  const [pgnInput, setPgnInput] = useState('');
  const [orientation, setOrientation] = useState(() => readBoardPreferences().orientation);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [searching, setSearching] = useState(false);
  const analysisBusy = ['starting', 'downloading', 'analyzing'].includes(analysisState);
  const [multi, setMulti] = useState(2);
  const [limit, setLimit] = useState(12);
  const [fileName, setFileName] = useState('Untitled study');
  const [mobilePanel, setMobilePanel] = useState('moves');
  const fenRef = useRef(fen);
  fenRef.current = fen;
  const revisionRef = useRef(revision);
  revisionRef.current = revision;
  if (!treeRef.current) treeRef.current = { id: 'root', san: '', fen: new Chess().fen(), comment: '', nags: [], children: [], parent: null, ply: 0, headers: {} };
  const currentTree = treeRef.current;
  const currentNode = currentTree ? findNode(currentTree, cursor || currentTree.id) : null;
  const activeLine = currentNode ? pathToNode(currentNode).slice(1) : [];
  const lines = analysis?.fen === fen && analysis.revision === revision && analysis.depth === limit && analysis.multipv === multi ? analysis.variations : [];

  const newTree = (rootFen, rootHeaders = {}) => ({ id: 'root', san: '', fen: rootFen, comment: '', nags: [], children: [], parent: null, ply: 0, headers: rootHeaders });
  const onNewGame = () => { if (searching) onCancelAnalysis?.(); const root = newTree(STANDARD_START_FEN); treeRef.current = root; setCursor(root.id); setFen(root.fen); setAnalysis(null); setFeedback('New game started.'); setError(''); setFileName('Untitled study'); setRevision((value) => value + 1); };
  const onMove = (move) => {
    if (searching) { onCancelAnalysis?.(); setSearching(false); }
    if (liveChess?.isGameOver()) { setFeedback(boardMessage); return; }
    const parent = findNode(treeRef.current, cursor || 'root');
    const chess = chessAtNode(treeRef.current, parent);
    let result;
    try { result = chess.move({ from: move.from, to: move.to, promotion: move.promotion }); } catch { return; }
    let node = parent.children.find((child) => child.san === result.san);
    if (!node) {
      node = { id: makeId('ply'), san: result.san, fen: chess.fen(), from: result.from, to: result.to, color: result.color, comment: '', nags: [], children: [], parent, ply: parent.ply + 1, move: result };
      parent.children.push(node);
    }
    setCursor(node.id); setFen(node.fen); setAnalysis(null); setError(''); setFeedback(''); setRevision((value) => value + 1);
  };
  const goTo = (node) => { if (!node) return; if (searching) { onCancelAnalysis?.(); setSearching(false); } setCursor(node.id); setFen(node.fen); setAnalysis(null); setFeedback(''); setRevision((value) => value + 1); };
  const undo = () => goTo(currentNode?.parent);
  const redo = () => goTo(currentNode?.children?.[0]);
  const setPosition = (value) => {
    if (searching) { onCancelAnalysis?.(); setSearching(false); }
    try {
      const next = new Chess(value.trim());
      const root = newTree(next.fen()); treeRef.current = root; setCursor(root.id); setFen(next.fen()); setAnalysis(null); setError(''); setFeedback('FEN loaded as a new study position.'); setRevision((revision) => revision + 1);
    } catch (issue) { setError(`Invalid FEN: ${issue.message}`); }
  };
  const importPgn = () => {
    if (searching) onCancelAnalysis?.();
    try {
      const parsed = parsePgnTree(pgnInput);
      treeRef.current = boardTreeFromParsed(parsed); setCursor(parsed.root.children[0]?.id || parsed.root.id); setFen(parsed.root.children[0]?.fen || parsed.startFen); setAnalysis(null); setError(''); setFeedback(`${parsed.mainline.length} mainline plies loaded. Variations are available at their branch points.`); setFileName(parsed.headers.Event || parsed.headers.White ? `${parsed.headers.White || 'White'} vs ${parsed.headers.Black || 'Black'}` : 'Imported study'); setRevision((revision) => revision + 1);
    } catch (issue) { setError(issue.message); }
  };
  const exportPgn = () => {
    if (!treeRef.current?.children?.length) { setError('Make a legal move before exporting PGN.'); return; }
    const header = { Event: fileName, ...treeRef.current.headers, Result: studyMainlineResult(treeRef.current) };
    const pgn = serializePgnTree({ root: treeRef.current }, header);
    const blob = new Blob([pgn], { type: 'application/x-chess-pgn' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${fileName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'study'}.pgn`; anchor.click(); URL.revokeObjectURL(url);
    setFeedback('PGN exported with the saved variations.'); setError('');
  };
  const copyFen = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable. Select the FEN text and copy it manually.');
      await navigator.clipboard.writeText(fen);
      setFeedback('FEN copied to clipboard.'); setError('');
    } catch (issue) { setError(issue.message); }
  };
  const saveStudy = async () => {
    try {
      const pgn = serializePgnTree({ root: treeRef.current }, { Event: fileName, Result: studyMainlineResult(treeRef.current) });
      await onSaveGame(pgn, fileName);
      setFeedback('Study saved to your library.'); setError('');
    } catch (issue) { setError(issue.message); }
  };
  const replayEngineLine = (line) => {
    if (!line?.pv?.length || searching) return;
    const positions = variationPositions(fen, line.pv);
    if (positions.length !== line.pv.length + 1) { setError('This engine line could not be replayed legally. Analyze the position again.'); return; }
    let parent = currentNode;
    let first;
    const chess = chessAtNode(currentTree, currentNode);
    for (const uci of line.pv) {
      const legal = chess.moves({ verbose: true }).find((move) => variationUci(move) === uci);
      const move = chess.move({ from: legal.from, to: legal.to, promotion: legal.promotion });
      let node = parent.children.find((child) => child.san === move.san);
      if (!node) {
        node = { id: makeId('ply'), san: move.san, fen: chess.fen(), from: move.from, to: move.to, color: move.color, comment: '', nags: [], children: [], parent, ply: parent.ply + 1, move };
        parent.children.push(node);
      }
      first ||= node;
      parent = node;
    }
    goTo(first);
    setFeedback('Stockfish variation added to the move tree. Use the board controls to replay it, or save the study.');
  };
  const runAnalysis = async () => {
    if (liveChess.isGameOver()) { setAnalysis(null); setFeedback(boardMessage); setError(''); return; }
    const targetFen = fen;
    const targetRevision = revisionRef.current;
    const targetDepth = limit, targetMulti = multi;
    setSearching(true); setAnalysis(null); setError(''); setFeedback('');
    try {
      const result = await onAnalyzeBoard(targetFen, { depth: targetDepth, multipv: targetMulti });
      if (fenRef.current !== targetFen || revisionRef.current !== targetRevision) { setError('The position changed while Stockfish was searching. Run analysis again for the current board.'); return; }
      const variations = (result.variations || []).filter((line) => line.depth > 0 && line.pv?.length > 0 && line.score && variationPositions(targetFen, line.pv).length > 1);
      if (!variations.length) throw new Error('Stockfish returned no legal continuation for this position. Check the position and try again.');
      setAnalysis({ fen: targetFen, revision: targetRevision, depth: targetDepth, multipv: targetMulti, variations });
    } catch (issue) { setError(issue.message); }
    finally { setSearching(false); }
  };
  const saveLinePosition = async (line) => {
    if (!line?.pv?.[0] || !lines.includes(line)) return;
    const chess = new Chess(fen);
    const move = chess.moves({ verbose: true }).find((item) => variationUci(item) === line.pv[0]);
    if (!move) return;
    await onSaveEnginePosition({ fen, targetUci: line.pv[0], targetSan: move.san, score: line.score, engineName, line: line.pv, name: 'Analysis board position' });
    setFeedback(`${move.san} saved as an engine-confirmed training position.`);
  };
  const currentMoves = currentNode?.children || [];
  const liveChess = useMemo(() => chessAtNode(currentTree, currentNode), [fen, revision]);
  const sideToMove = liveChess.turn() === 'w' ? 'White' : 'Black';
  const boardMessage = liveChess.isCheckmate() ? `${sideToMove} is checkmated.` : liveChess.isStalemate() ? 'Draw by stalemate.' : liveChess.isThreefoldRepetition() ? 'Threefold repetition — a draw can be claimed.' : liveChess.isDrawByFiftyMoves() ? 'Fifty-move rule — a draw can be claimed.' : liveChess.isInsufficientMaterial() ? 'Draw by insufficient material.' : liveChess.isCheck() ? `${sideToMove} to move · check` : `${sideToMove} to move`;
  const terminalPosition = liveChess.isGameOver();
  const positionLabel = activeLine.length ? `Ply ${activeLine.length}` : currentTree.fen === STANDARD_START_FEN ? 'Starting position' : 'Loaded position';
  const boardBadge = liveChess.isCheckmate() ? 'Checkmate' : liveChess.isStalemate() ? 'Stalemate' : terminalPosition ? 'Draw' : liveChess.isCheck() ? 'Check' : 'Ready';
  return <>
    <SectionTitle eyebrow="ANALYSIS BOARD" title="Explore a position." description="Play moves, explore alternatives, and ask Stockfish." action={<div className="review-title-actions"><Button icon="rotate" onClick={onNewGame}>New board</Button><Button icon="download" onClick={exportPgn}>Export PGN</Button></div>} />
    {analysisState === 'downloading' && <div className="analysis-progress board-download-progress"><div className="progress-copy"><span>Downloading Stockfish 18</span><strong>{engineDownload?.percent ?? 0}%</strong></div><div className="progress-track"><span style={{ width: `${engineDownload?.percent ?? 0}%` }}/></div><small>7.3 MB lite WASM · cached on this device for offline analysis</small></div>}{searching && analysisState === 'analyzing' && <div className="analysis-progress board-download-progress"><div className="progress-copy"><span>Local engine search</span><strong>{currentInfo?.depth ? `Depth ${currentInfo.depth}` : 'Running'}</strong></div><div className="progress-track"><span className="progress-indeterminate"/></div><small>{currentInfo?.nodes ? `${currentInfo.nodes.toLocaleString()} nodes` : 'Searching in a Web Worker'}</small></div>}
    <div className="board-status board-lab-status"><span className={`turn-dot${terminalPosition ? ' draw-dot' : ''}`}/>{boardMessage}<span className="board-status-ply">{positionLabel}</span></div>
    {error && <div className="inline-error"><Icon name="spark"/>{error}<button onClick={() => setError('')} aria-label="Dismiss error"><Icon name="close" size={14}/></button></div>}
    <div className="board-lab-layout" data-mobile-panel={mobilePanel}>
      <section className="panel board-lab-board">
        <div className="player-row"><span className={`player-avatar player-${orientation === 'w' ? 'black' : 'white'}`}>{orientation === 'w' ? '♚' : '♔'}</span><div><strong>{orientation === 'w' ? 'Black pieces' : 'White pieces'}</strong><small>Study position</small></div></div>
        <ChessBoard fen={fen} startFen={currentTree.fen} historyMoves={activeLine.map((node) => node.san)} interactive={!liveChess.isGameOver()} onMove={onMove} orientation={orientation} onOrientationChange={setOrientation} lastMove={currentNode?.move ? { from: currentNode.move.from, to: currentNode.move.to } : null}/>
        <div className="player-row player-row-bottom"><span className={`player-avatar player-${orientation === 'w' ? 'white' : 'black'}`}>{orientation === 'w' ? '♔' : '♚'}</span><div><strong>{orientation === 'w' ? 'White pieces' : 'Black pieces'}</strong><small>{liveChess.moves().length ? 'Legal moves · promotion · castling · en passant' : 'No legal moves'}</small></div><Pill>{boardBadge}</Pill></div>
        <div className="board-controls"><IconTextButton label="Undo" icon="back" onClick={undo} disabled={!currentNode?.parent}/><IconTextButton label="Previous move" icon="chevron" onClick={() => goTo(currentNode?.parent)} disabled={!currentNode?.parent}/><span className="ply-counter">{activeLine.length} plies · {currentMoves.length} continuation{currentMoves.length === 1 ? '' : 's'}</span><IconTextButton label="Continue main line" icon="forward" onClick={redo} disabled={!currentMoves.length || liveChess.isGameOver()}/></div>
        <div className="mobile-board-panels" role="group" aria-label="Study panels">{[["moves", "Moves"], ["engine", "Engine"], ["tools", "FEN / PGN"]].map(([key, label]) => <button key={key} type="button" aria-pressed={mobilePanel === key} onClick={() => setMobilePanel(key)}>{label}</button>)}</div>
        <div className="lab-move-tree"><div className="lab-tree-heading"><strong>Move tree</strong><small>{fileName}</small></div>{activeLine.length ? <div className="lab-ply-list"><button className="lab-ply-root" onClick={() => goTo(currentTree)}>Start</button>{activeLine.map((node, index) => <button key={node.id} className={`lab-ply${node.id === cursor ? ' selected' : ''}`} onClick={() => goTo(node)}><small>{Math.floor(index / 2) + 1}{index % 2 ? '…' : '.'}</small>{node.san}{node.children.length > 1 && <span className="branch-count">+{node.children.length - 1}</span>}</button>)}</div> : <p className="small-empty">Tap a piece, then its destination. Or drag to move.</p>}{currentMoves.length > 1 && <div className="variation-branches"><span>Continue from here</span>{currentMoves.map((node, index) => <button key={node.id} className={node.id === cursor ? 'selected' : ''} onClick={() => goTo(node)}><small>{index === 0 ? 'Main' : `Var ${index}`}</small>{node.san}</button>)}</div>}</div>
      </section>
      <aside className="board-lab-side">
        <section className="panel lab-engine-panel">
          <div className="panel-heading"><div><p className="eyebrow">POSITION ANALYSIS</p><h2>Ask Stockfish 18</h2></div><span className={`engine-status-dot engine-${engineStatus}`}/></div>
          <div className="engine-option-row">
            <label>Depth<select disabled={analysisBusy || terminalPosition} value={limit} onChange={(event) => setLimit(Number(event.target.value))}><option value="10">10 · quick</option><option value="12">12 · standard</option><option value="16">16 · thorough</option></select></label>
            <label>Lines<select disabled={analysisBusy || terminalPosition} value={multi} onChange={(event) => setMulti(Number(event.target.value))}><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></label>
          </div>
          <Button variant="primary" icon={searching ? 'stop' : 'play'} onClick={runAnalysis} disabled={searching || analysisBusy || terminalPosition}>{terminalPosition ? 'Position over' : searching ? 'Searching…' : analysisBusy ? 'Engine busy' : 'Analyze position'}</Button>
          {searching && <Button variant="ghost" onClick={() => { onCancelAnalysis?.(); setSearching(false); }}>Cancel search</Button>}
          {terminalPosition ? <div className="engine-terminal" role="status"><strong>{boardMessage}</strong><span>No engine score is shown for a finished position.</span></div> : lines.length > 0 ? <div className="engine-lines">{lines.map((line) => { const chess = new Chess(fen); const move = chess.moves({ verbose: true }).find((item) => variationUci(item) === line.pv[0]); return <div className="engine-line" key={line.multipv}><div className="engine-line-top"><Pill tone={line.multipv === 1 ? 'good' : 'neutral'}>{formatScore(line.score)}</Pill><strong>{move?.san || line.pv[0]}</strong><small>d{line.depth}</small><IconButton label="Add this line to training" icon="training" onClick={() => saveLinePosition(line)}/></div><p>{line.san}</p><button className="text-link engine-replay" onClick={() => replayEngineLine(line)}>Replay in move tree</button></div>; })}</div> : <p className="engine-hint">Analyze this position on your device. First use downloads 7.3 MB; then analysis works offline.</p>}
          <p className="engine-footnote"><Icon name="shield" size={13}/>{engineName || 'Stockfish 18 lite'} · 1 worker · 32 MB hash</p>
        </section>
        <section className="panel position-tools"><div className="mobile-file-actions"><Button icon="rotate" onClick={onNewGame}>New board</Button><Button icon="download" onClick={exportPgn}>Export PGN</Button></div><div className="panel-heading"><div><p className="eyebrow">POSITION TOOLS</p><h2>FEN &amp; PGN</h2></div></div><label>Current FEN<div className="input-with-button"><input value={fen} readOnly aria-label="Current FEN"/><Button onClick={copyFen}>Copy</Button></div></label><form onSubmit={(event) => { event.preventDefault(); setPosition(fenInput); setFenInput(''); }}><label>Load FEN<div className="input-with-button"><input value={fenInput} onChange={(event) => setFenInput(event.target.value)} placeholder="Paste a legal FEN…"/><Button type="submit">Load</Button></div></label></form><label>Import PGN with variations<textarea value={pgnInput} onChange={(event) => setPgnInput(event.target.value)} rows={4} placeholder="Paste a game or study with (variations)"/></label><Button icon="upload" onClick={importPgn} disabled={!pgnInput.trim()}>Load PGN study</Button><Button icon="save" onClick={saveStudy} disabled={!treeRef.current?.children?.length}>Save line to library</Button></section></aside></div>
    {feedback && <div className="inline-success" role="status"><Icon name="check"/>{feedback}<button onClick={() => setFeedback('')} aria-label="Dismiss message"><Icon name="close" size={14}/></button></div>}
    <p className="ethics-note"><Icon name="shield" size={14}/> Use analysis for study and completed games; never use engine assistance during active competitive play.</p>
  </>;
}

function IconButton({ label, icon, onClick }) { return <button className="icon-button" type="button" aria-label={label} title={label} onClick={onClick}><Icon name={icon} size={16}/></button>; }
function findNode(root, id) { if (!root) return null; if (root.id === id) return root; for (const child of root.children || []) { const node = findNode(child, id); if (node) return node; } return null; }
function pathToNode(node) { const path = []; for (let cursor = node; cursor; cursor = cursor.parent) path.push(cursor); return path.reverse(); }
function chessAtNode(root, node) {
  if (!root || !node) return new Chess();
  const chess = new Chess(root.fen);
  for (const move of pathToNode(node).slice(1)) chess.move(move.san, { strict: true });
  return chess;
}

export function TournamentView({ initialRecordId, records, onCreateTournament, onCreateOpponent, onAddRound, onUpdateRound, onDeleteTournament, onNavigate, onOpenGame }) {
  const tournaments = records.filter((record) => record.kind === 'tournament');
  const opponents = records.filter((record) => record.kind === 'opponent');
  const games = records.filter((record) => record.kind === 'game');
  const reviews = records.filter((record) => record.kind === 'review');
  const [selectedId, setSelectedId] = useState(tournaments.find((item) => item.id === initialRecordId)?.id || tournaments[0]?.id || '');
  const [showTournamentForm, setShowTournamentForm] = useState(false);
  const [showOpponentForm, setShowOpponentForm] = useState(false);
  const [tournamentName, setTournamentName] = useState('');
  const [tournamentDate, setTournamentDate] = useState('');
  const [venue, setVenue] = useState('');
  const [opponentName, setOpponentName] = useState('');
  const [opponentNotes, setOpponentNotes] = useState('');
  const [roundOpponent, setRoundOpponent] = useState('');
  const [roundNumber, setRoundNumber] = useState('1');
  const [roundColor, setRoundColor] = useState('w');
  const [roundNotes, setRoundNotes] = useState('');
  const [formError, setFormError] = useState('');
  const openedOpponentRef = useRef(null);
  useEffect(() => { if (openedOpponentRef.current) { openedOpponentRef.current.scrollIntoView({ block: 'center', behavior: 'instant' }); openedOpponentRef.current.focus({ preventScroll: true }); } }, [initialRecordId]);
  const selected = tournaments.find((item) => item.id === selectedId) || tournaments[0];

  const createTournament = async (event) => {
    event.preventDefault();
    if (!tournamentName.trim()) return;
    const record = { id: makeId('tournament'), kind: 'tournament', name: cleanText(tournamentName, 120), date: tournamentDate, venue: cleanText(venue, 120), rounds: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    try { await onCreateTournament(record); setSelectedId(record.id); setTournamentName(''); setTournamentDate(''); setVenue(''); setShowTournamentForm(false); setFormError(''); } catch (error) { setFormError(error.message); }
  };
  const createOpponent = async (event) => {
    event.preventDefault();
    if (!opponentName.trim()) return;
    const record = { id: makeId('opponent'), kind: 'opponent', name: cleanText(opponentName, 100), notes: cleanText(opponentNotes, 2_000), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    try { await onCreateOpponent(record); setOpponentName(''); setOpponentNotes(''); setShowOpponentForm(false); setFormError(''); }
    catch (error) { setFormError(error.message); }
  };
  const addRound = async (event) => {
    event.preventDefault();
    if (!selected || !roundOpponent.trim()) { setFormError('Choose an opponent and a tournament first.'); return; }
    const round = { id: makeId('round'), number: cleanText(roundNumber, 16), opponent: cleanText(roundOpponent, 100), color: roundColor, status: 'planned', notes: cleanText(roundNotes, 2_000), tasks: [{ id: makeId('task'), label: 'Review opponent games', done: false }, { id: makeId('task'), label: 'Rehearse a prepared line', done: false }], createdAt: new Date().toISOString() };
    try { await onAddRound(selected.id, round); setRoundNumber(String((selected.rounds?.length || 0) + 2)); setRoundNotes(''); setFormError(''); }
    catch (error) { setFormError(error.message); }
  };
  const updateTask = (round, task, done) => onUpdateRound(selected.id, round.id, { taskId: task.id, done }).catch((error) => setFormError(error.message));
  return <>
    <SectionTitle eyebrow="TOURNAMENT WORKSPACE" title="Take your preparation with you." description="Organize opponents, rounds, color, notes, and the study work for each event." action={<div className="review-title-actions"><Button icon="plus" onClick={() => setShowOpponentForm((value) => !value)}>Add opponent</Button><Button variant="primary" icon="trophy" onClick={() => setShowTournamentForm((value) => !value)}>New tournament</Button></div>} />
    {(showTournamentForm || showOpponentForm) && <div className="form-grid form-grid-2">{showTournamentForm && <form className="panel quick-form" onSubmit={createTournament}><div className="panel-heading"><div><p className="eyebrow">NEW EVENT</p><h2>Tournament details</h2></div></div><label>Name<input required value={tournamentName} onChange={(event) => setTournamentName(event.target.value)} maxLength={120} placeholder="e.g. Taipei Open"/></label><label>Start date<input type="date" value={tournamentDate} onInput={(event) => setTournamentDate(event.currentTarget.value)} onChange={(event) => setTournamentDate(event.target.value)}/></label><label>Venue<input value={venue} onChange={(event) => setVenue(event.target.value)} maxLength={120}/></label><div className="form-actions"><Button type="submit" variant="primary">Create event</Button></div></form>}{showOpponentForm && <form className="panel quick-form" onSubmit={createOpponent}><div className="panel-heading"><div><p className="eyebrow">OPPONENT NOTEBOOK</p><h2>Add a player</h2></div></div><label>Name<input required value={opponentName} onChange={(event) => setOpponentName(event.target.value)} maxLength={100}/></label><label>Notes<textarea value={opponentNotes} onChange={(event) => setOpponentNotes(event.target.value)} rows={3} maxLength={2_000} placeholder="Only notes you have actually recorded…"/></label><div className="form-actions"><Button type="submit" variant="primary">Save opponent</Button></div></form>}</div>}
    {formError && <p className="inline-error">{formError}</p>}
    {tournaments.length ? <div className="tournament-layout"><aside className="panel tournament-list-panel"><div className="panel-heading"><div><p className="eyebrow">YOUR EVENTS</p><h2>Tournaments</h2></div><Pill>{tournaments.length}</Pill></div><div className="tournament-list">{tournaments.map((item) => <button key={item.id} className={`tournament-select${(selected?.id || selectedId) === item.id ? ' active' : ''}`} onClick={() => setSelectedId(item.id)}><span className="tournament-mark"><Icon name="trophy" size={17}/></span><span><strong>{item.name}</strong><small>{item.date ? shortDate(item.date) : 'Date not set'} · {item.rounds?.length || 0} rounds</small></span><Icon name="chevron" size={14}/></button>)}</div></aside>
      {selected && <section className="panel tournament-detail"><div className="tournament-heading"><div><Pill tone="warm">{selected.date ? shortDate(selected.date) : 'Date not set'}</Pill><h2>{selected.name}</h2><p>{selected.venue || 'Venue not set'}{selected.rounds?.length ? ` · ${selected.rounds.length} rounds` : ''}</p></div><button className="icon-button danger-icon" aria-label="Delete tournament" title="Delete tournament" onClick={() => onDeleteTournament(selected)}><Icon name="trash"/></button></div>
        {opponents.length > 0 ? <form className="add-round-form" onSubmit={addRound}><div className="round-form-heading"><strong>Add a round</strong><small>Round details live with this event.</small></div><div className="round-form-fields"><label>Round<input value={roundNumber} onChange={(event) => setRoundNumber(event.target.value)} required maxLength={16} placeholder="1"/></label><label>Opponent<select required value={roundOpponent} onChange={(event) => setRoundOpponent(event.target.value)}><option value="">Choose opponent</option>{opponents.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></label><label>Color<select value={roundColor} onChange={(event) => setRoundColor(event.target.value)}><option value="w">White</option><option value="b">Black</option></select></label><Button type="submit" variant="primary" icon="plus">Add round</Button></div><label>Preparation note<textarea rows={2} value={roundNotes} onChange={(event) => setRoundNotes(event.target.value)} maxLength={2_000} placeholder="A question or plan for this round…"/></label></form> : <div className="opponent-prompt"><p>Save opponents in your notebook before scheduling a round.</p><Button onClick={() => setShowOpponentForm(true)}>Add first opponent</Button></div>}
        <div className="round-list">{selected.rounds?.length ? [...selected.rounds].sort((a, b) => Number(a.number) - Number(b.number)).map((round) => { const related = games.find((game) => game.opponent?.toLowerCase() === round.opponent.toLowerCase() || game.white?.toLowerCase() === round.opponent.toLowerCase() || game.black?.toLowerCase() === round.opponent.toLowerCase()); const relatedReview = related && reviews.find((review) => review.gameId === related.id); let prepMatch = ''; if (related) { try { const actual = parsePgn(related.pgn); const candidates = records.filter((record) => record.kind === 'repertoire' && record.color === round.color && record.startFen === actual.startFen); const best = candidates.map((line) => ({ line, matched: line.moves.findIndex((san, index) => actual.mainline[index]?.san !== san) < 0 ? line.moves.length : line.moves.findIndex((san, index) => actual.mainline[index]?.san !== san) })).filter((item) => item.matched > 0).sort((a, b) => b.matched - a.matched)[0]; prepMatch = best ? `Prepared line played: ${best.matched} of ${best.line.moves.length} plies · ${best.line.name}.` : candidates.length ? 'No saved opening line matched the game.' : 'No saved line for this color and starting position.'; } catch { prepMatch = 'The imported game could not be compared with saved lines.'; } } return <article className="round-card" key={round.id}><div className="round-number">R{round.number}</div><div className="round-card-main"><div className="round-card-heading"><div><h3>{round.opponent}</h3><small>{round.color === 'w' ? 'White' : 'Black'} · {related ? `${related.result} · game imported` : 'No matched game in library'}</small></div><select value={round.status} onChange={(event) => onUpdateRound(selected.id, round.id, { status: event.target.value }).catch((error) => setFormError(error.message))} aria-label={`Round ${round.number} status`}><option value="planned">Planned</option><option value="prepared">Prepared</option><option value="played">Played</option></select></div>{round.notes && <p className="round-notes">{round.notes}</p>}{related && round.status === 'played' && <div className="post-match"><span><Icon name="review" size={14}/> Post-match comparison</span><small>{prepMatch}</small><small>{relatedReview?.moves?.length ? `${relatedReview.moves.filter((move) => ['Mistake','Blunder','Missed win'].includes(move.label)).length} mistakes or blunders recorded in saved analysis.` : 'Import and analyze the completed game to add engine-grounded notes.'}</small>{relatedReview && <Button onClick={() => onOpenGame(related.id)}>Open review</Button>}</div>}<div className="round-tasks">{(round.tasks || []).map((task) => <label key={task.id} className={task.done ? 'task-done' : ''}><input type="checkbox" checked={task.done} onChange={(event) => updateTask(round, task, event.target.checked)}/><span>{task.label}</span></label>)}</div></div></article>}) : <EmptyState icon="trophy" title="Your first round goes here" description="Add an opponent, set the color, and make the preparation tasks concrete." />}</div>
      </section>}</div> : <EmptyState icon="trophy" title="Make the event your container" description="Create a tournament, add your opponents, then connect preparation, round notes, and post-match reviews." action={<Button icon="trophy" variant="primary" onClick={() => setShowTournamentForm(true)}>Create a tournament</Button>} />}
    {opponents.length > 0 && <section className="panel opponent-notebook"><div className="panel-heading"><div><p className="eyebrow">PLAYER NOTES</p><h2>Opponent notebook</h2></div><Pill>{opponents.length} saved</Pill></div><div className="opponent-grid">{opponents.map((item) => { const sampleCount = games.filter((game) => game.opponent?.toLowerCase() === item.name.toLowerCase() || game.white?.toLowerCase() === item.name.toLowerCase() || game.black?.toLowerCase() === item.name.toLowerCase()).length; return <div className="opponent-card" key={item.id} ref={item.id === initialRecordId ? openedOpponentRef : null} tabIndex={item.id === initialRecordId ? -1 : undefined}><span className="player-avatar">{item.name[0]?.toUpperCase()}</span><div><strong>{item.name}</strong><small>{sampleCount} imported game{sampleCount === 1 ? '' : 's'} · {item.notes ? 'Notes saved' : 'No notes yet'}</small>{typeof item.notes === "string" && item.notes && <p className="opponent-note-text">{item.notes}</p>}</div><button className="text-link" onClick={() => onNavigate('prep')}>Prep map <Icon name="chevron" size={13}/></button></div>; })}</div></section>}
  </>;
}

const KIND_FILTERS = [
  ['all', 'Everything'], ['game', 'Games'], ['review', 'Reviews'], ['opponent', 'Opponents'], ['repertoire', 'Repertoire'], ['training', 'Training'], ['tournament', 'Tournaments'],
];

function recordTitle(record) {
  switch (record.kind) {
    case 'game': return record.name || `${record.white || 'White'} vs ${record.black || 'Black'}`;
    case 'review': return `Review · ${record.gameName || record.gameId}`;
    case 'opponent': return record.name;
    case 'repertoire': return record.name;
    case 'training': return record.name || record.sourceName || 'Training position';
    case 'tournament': return record.name;
    default: return 'Saved record';
  }
}

function recordDetails(record) {
  if (record.kind === 'game') return `${record.opening || record.event || 'Opening not tagged'} · ${record.moveCount} plies · ${resultLabel(record.result)}`;
  if (record.kind === 'review') return `${record.moves?.length || 0} positions analyzed · ${record.complete ? 'Complete' : 'Interrupted'}`;
  if (record.kind === 'opponent') return record.notes || 'Opponent notebook entry';
  if (record.kind === 'repertoire') return `${record.color === 'w' ? 'White' : 'Black'} · ${record.moves?.slice(0, 8).join(' ')}`;
  if (record.kind === 'training') return `${record.retiredAt ? 'Paused · line changed' : record.sourceType === 'critical' ? record.label : 'Prepared line'} · due ${shortDate(record.dueAt)}`;
  if (record.kind === 'tournament') return `${record.rounds?.length || 0} rounds · ${record.date ? shortDate(record.date) : 'Date not set'}`;
  return '';
}

export function LibraryView({ records, onExportBackup, onRestoreBackup, onDelete, onOpenGame, onNavigate, storageUsage, storageError }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const backupInput = useRef(null);
  const searchInput = useRef(null);
  useEffect(() => {
    const searchShortcut = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !document.body.classList.contains('dialog-open')) { event.preventDefault(); searchInput.current?.focus(); }
    };
    document.addEventListener('keydown', searchShortcut);
    return () => document.removeEventListener('keydown', searchShortcut);
  }, []);
  const visible = records.filter((record) => (filter === 'all' || record.kind === filter) && (!query.trim() || `${recordTitle(record)} ${recordDetails(record)} ${JSON.stringify(record)}`.toLowerCase().includes(query.trim().toLowerCase())));
  const groupedCount = records.reduce((all, record) => ({ ...all, [record.kind]: (all[record.kind] || 0) + 1 }), {});
  const restoreFile = async (file) => { if (!file) return; await onRestoreBackup(file); if (backupInput.current) backupInput.current.value = ''; };
  return <>
    <SectionTitle eyebrow="PERSONAL LIBRARY" title="Your study, kept on this device." description="Search, export, and protect your games, reviews, opponents, lines, training cards, and tournaments." action={<div className="review-title-actions"><Button icon="download" onClick={onExportBackup}>Export backup</Button><Button icon="upload" variant="primary" onClick={() => backupInput.current?.click()}>Restore backup</Button><input ref={backupInput} className="visually-hidden" type="file" accept="application/json,.json" aria-label="Choose Chessdesk backup" onChange={(event) => restoreFile(event.target.files?.[0])}/></div>} />
    {storageError && <div className="inline-error"><Icon name="spark"/>{storageError}</div>}
    <section className="storage-strip"><div><span className="storage-icon"><Icon name="shield"/></span><span><strong>Private by default</strong><small>Your chess data stays in this browser’s IndexedDB.</small></span></div><div className="storage-usage"><strong>{storageUsage?.usage != null ? `${(storageUsage.usage / 1024 / 1024).toFixed(1)} MB used` : `${records.length} records`}</strong><small>{storageUsage?.quota ? `${(storageUsage.quota / 1024 / 1024).toFixed(0)} MB site storage budget` : 'Storage quota is browser-managed'}</small></div></section>
    <section className="panel library-panel"><div className="library-toolbar"><label className="library-search"><Icon name="search"/><input ref={searchInput} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search games, notes, opening lines…" aria-label="Search your library"/><kbd>Ctrl / ⌘ K</kbd></label><div className="library-kind-filters">{KIND_FILTERS.map(([key, label]) => <button className={filter === key ? 'active' : ''} key={key} onClick={() => setFilter(key)}>{label}<span>{key === 'all' ? records.length : groupedCount[key] || 0}</span></button>)}</div></div>
      {visible.length ? <div className="library-record-list">{visible.map((record) => <article className="library-record" key={record.id}><span className={`library-record-icon record-${record.kind}`}><Icon name={({ game: 'review', review: 'spark', opponent: 'search', repertoire: 'book', training: 'training', tournament: 'trophy' })[record.kind] || 'library'} size={17}/></span><button className="library-record-main" onClick={() => record.kind === "game" ? onOpenGame(record.id) : record.kind === "review" ? onOpenGame(record.gameId) : onNavigate(({ training: "training", repertoire: "clash", opponent: "tournament", tournament: "tournament" })[record.kind], record.id)} aria-label={`Open ${record.kind === "game" || record.kind === "review" ? "game review" : "workspace"}: ${recordTitle(record)}`}><strong>{recordTitle(record)}</strong><small>{recordDetails(record)}</small></button><span className="library-record-date">{shortDate(record.updatedAt || record.createdAt)}</span>{record.kind === 'game' && <Pill>{record.result || '*'}</Pill>}<button className="icon-button danger-icon" onClick={() => onDelete(record)} aria-label={`Delete ${recordTitle(record)}`} title="Delete record"><Icon name="trash" size={15}/></button></article>)}</div> : <EmptyState icon={query || filter !== 'all' ? 'search' : 'library'} title={query || filter !== 'all' ? 'No matching records' : 'Your library is ready'} description={query || filter !== 'all' ? 'Try a different search or filter.' : 'Import a game, save a line, or create a tournament. Everything stays local.'} />}
    </section>
    <div className="backup-note"><Icon name="shield" size={16}/><p><strong>Make a backup before changing devices.</strong><br/>Backups are versioned and validated before restore. Restore replaces the library as one transaction, so an invalid file cannot partially overwrite your saved work.</p></div>
  </>;
}
