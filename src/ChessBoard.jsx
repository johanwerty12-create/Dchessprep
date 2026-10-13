import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { useModalFocus } from './useModalFocus.js';
import { readBoardPreferences, saveBoardPreferences, squareAtPoint, squareCenter, toggleAnnotation } from './board-logic.js';

const FILES = 'abcdefgh';
const EMPTY_MOVES = [];
const PIECE_NAMES = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };
const squares = Array.from({ length: 64 }, (_, i) => `${FILES[i % 8]}${8 - Math.floor(i / 8)}`);
const pieceLabel = (piece) => `${piece.color === 'w' ? 'white' : 'black'} ${PIECE_NAMES[piece.type]}`;
const pieceUrl = (piece) => `/pieces/chessnut/${piece.color}${piece.type.toUpperCase()}.svg`;

export function ChessBoard({ fen, onMove, interactive = false, orientation: suppliedOrientation, onOrientationChange, lastMove, checked = true, className = '', startFen, historyMoves = EMPTY_MOVES, suggestedMove = '', evaluationBar = null, positionRevision, positionAnnouncement = '' }) {
  const [preferences, setPreferences] = useState(readBoardPreferences);
  const [orientation, setOrientation] = useState(() => suppliedOrientation || readBoardPreferences().orientation);
  const [selected, setSelected] = useState('');
  const [focusSquare, setFocusSquare] = useState('a8');
  const [promotion, setPromotion] = useState(null);
  const [annotations, setAnnotations] = useState([]);
  const [drawMode, setDrawMode] = useState(false);
  const [drawStart, setDrawStart] = useState('');
  const [drag, setDrag] = useState(null);
  const [announcement, setAnnouncement] = useState('');
  const [arrowFrom, setArrowFrom] = useState('e2');
  const [arrowTo, setArrowTo] = useState('e4');
  const boardRef = useRef(null), pointerRef = useRef(null), promotionRef = useRef(null);
  const suppressClick = useRef(0), positionRef = useRef(fen);
  positionRef.current = fen;
  const positionKey = `${positionRevision ?? ''}\u001f${fen}\u001f${startFen || ''}\u001f${historyMoves.join('\u001e')}`;
  const positionKeyRef = useRef(positionKey);
  const pendingMoveAnnouncement = useRef(null);
  const arrowId = `arrow-${useId().replace(/:/g, '')}`;
  useModalFocus(Boolean(promotion), promotionRef, () => setPromotion(null));
  useEffect(() => { if (suppliedOrientation) setOrientation(suppliedOrientation); }, [suppliedOrientation]);
  useEffect(() => {
    const changed = positionKeyRef.current !== positionKey;
    positionKeyRef.current = positionKey;
    if (!changed) return;
    setSelected(''); setPromotion(null); setAnnotations([]); setDrawStart(''); setDrag(null); pointerRef.current = null;
    const pending = pendingMoveAnnouncement.current;
    pendingMoveAnnouncement.current = null;
    if (pending && pending.fen === fen && (pending.revision == null || pending.revision === positionRevision)) return;
    setAnnouncement(`Position: ${positionAnnouncement.trim() || 'changed'}`);
  }, [fen, positionKey, positionAnnouncement, positionRevision]);
  useEffect(() => { setSelected(''); setDrawStart(''); setDrag(null); pointerRef.current = null; }, [orientation]);
  const chess = useMemo(() => {
    try {
      const game = new Chess(startFen || new Chess().fen());
      for (const san of historyMoves) game.move(san, { strict: true });
      if (game.fen() === fen) return game;
      return new Chess(fen);
    } catch { try { return new Chess(fen); } catch { return new Chess(); } }
  }, [fen, startFen, historyMoves]);
  const terminal = useMemo(() => ({ gameOver: chess.isGameOver(), mate: chess.isCheckmate(), stalemate: chess.isStalemate(), draw: chess.isDraw(), check: chess.isCheck() }), [chess]);
  const canMove = interactive && !terminal.gameOver && !promotion;
  const suggestion = useMemo(() => {
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(suggestedMove)) return null;
    return chess.moves({ verbose: true }).find((move) => `${move.from}${move.to}${move.promotion || ''}` === suggestedMove) || null;
  }, [chess, suggestedMove]);
  const selectedMoves = useMemo(() => selected && canMove ? chess.moves({ square: selected, verbose: true }) : [], [chess, selected, canMove]);
  const legalTargets = new Set(selectedMoves.map((move) => move.to));
  const turn = chess.turn() === 'w' ? 'White' : 'Black';
  const status = terminal.mate ? `${turn} is checkmated` : terminal.stalemate ? 'Draw by stalemate' : terminal.draw ? 'Drawn position' : `${turn} to move${terminal.check ? ', check' : ''}`;
  const announcePlayedMove = (move) => {
    let nextFen = '';
    try {
      const next = new Chess(chess.fen());
      next.move({ from: move.from, to: move.to, ...(move.promotion ? { promotion: move.promotion } : {}) });
      nextFen = next.fen();
    } catch { /* The parent still owns move validation and the displayed position. */ }
    pendingMoveAnnouncement.current = { fen: nextFen, revision: Number.isInteger(positionRevision) ? positionRevision + 1 : null };
    onMove?.({ from: move.from, to: move.to, san: move.san, ...(move.promotion ? { promotion: move.promotion } : {}) });
    setAnnouncement(`Played ${move.san}`);
  };
  const savePreference = (patch) => {
    const next = { ...preferences, orientation, ...patch };
    setPreferences(next); saveBoardPreferences(next);
    if (patch.orientation) { setOrientation(patch.orientation); onOrientationChange?.(patch.orientation); }
  };
  const mark = (from, to) => { setAnnotations((current) => toggleAnnotation(current, from, to)); setAnnouncement(from === to ? `Mark toggled on ${from}` : `Arrow toggled from ${from} to ${to}`); };
  const chooseMove = (from, to, expectedFen = fen) => {
    if (!canMove || expectedFen !== positionRef.current) return false;
    const possible = chess.moves({ square: from, verbose: true }).filter((move) => move.to === to);
    if (!possible.length) { setAnnouncement(`No legal move from ${from} to ${to}`); return false; }
    if (possible.some((move) => move.promotion)) { setPromotion({ from, to, fen: expectedFen }); return true; }
    const move = possible[0];
    announcePlayedMove(move);
    setSelected(''); return true;
  };
  const activateSquare = (square) => {
    if (promotion) return;
    if (drawMode) { if (drawStart) { mark(drawStart, square); setDrawStart(''); } else { setDrawStart(square); setAnnouncement(`Mark from ${square}. Choose a destination.`); } return; }
    if (!canMove) return;
    if (selected && legalTargets.has(square)) { chooseMove(selected, square); return; }
    const piece = chess.get(square);
    if (piece?.color === chess.turn()) {
      setSelected(selected === square ? '' : square);
      setAnnouncement(`${pieceLabel(piece)} on ${square}. Legal destinations: ${chess.moves({ square, verbose: true }).map((m) => m.to).filter((v, i, all) => all.indexOf(v) === i).join(', ') || 'none'}`);
    } else { setSelected(''); setAnnouncement(`${square} is not a legal destination`); }
  };
  const onSquareKeyDown = (event, row, col) => {
    if (event.key === 'Escape') { setSelected(''); setDrawStart(''); setDrag(null); pointerRef.current = null; return; }
    const direction = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[event.key];
    if (direction) {
      event.preventDefault();
      const nextRow = Math.max(0, Math.min(7, row + direction[0]));
      const nextCol = Math.max(0, Math.min(7, col + direction[1]));
      const next = orientation === 'w' ? `${FILES[nextCol]}${8 - nextRow}` : `${FILES[7 - nextCol]}${nextRow + 1}`;
      boardRef.current?.querySelector(`[data-square="${next}"]`)?.focus();
    }
  };
  const pointerDown = (event, from) => {
    if (promotion || !event.isPrimary || ![0, 2].includes(event.button)) return;
    const annotate = drawMode || event.button === 2;
    if (!annotate && (!canMove || chess.get(from)?.color !== chess.turn())) return;
    pointerRef.current = { id: event.pointerId, from, fen, x: event.clientX, y: event.clientY, annotate, moved: false };
    if (annotate && event.button === 2) { event.preventDefault(); boardRef.current.setPointerCapture(event.pointerId); }
  };
  const pointerMove = (event) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId || pointer.fen !== positionRef.current) return;
    if (!pointer.moved && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) < 8) return;
    pointer.moved = true;
    boardRef.current.setPointerCapture(event.pointerId);
    const rect = boardRef.current.getBoundingClientRect();
    const to = squareAtPoint(event.clientX, event.clientY, rect, orientation);
    setDrag({ from: pointer.from, to, annotate: pointer.annotate, x: (event.clientX - rect.left) / rect.width * 100, y: (event.clientY - rect.top) / rect.height * 100 });
    if (!pointer.annotate) setSelected(pointer.from);
  };
  const pointerEnd = (event, cancel = false) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    pointerRef.current = null; setDrag(null);
    if (boardRef.current.hasPointerCapture(event.pointerId)) boardRef.current.releasePointerCapture(event.pointerId);
    if (cancel) { suppressClick.current = performance.now() + 250; return; }
    if (!pointer.moved && !pointer.annotate) return;
    if (!pointer.moved && drawMode && event.button !== 2) return;
    suppressClick.current = performance.now() + 250;
    const to = squareAtPoint(event.clientX, event.clientY, boardRef.current.getBoundingClientRect(), orientation);
    if (!to || pointer.fen !== positionRef.current) return;
    if (pointer.annotate) { mark(pointer.from, to); setDrawStart(''); }
    else chooseMove(pointer.from, to, pointer.fen);
  };
  const finishPromotion = (type) => {
    if (!promotion || promotion.fen !== positionRef.current || !interactive) { setPromotion(null); return; }
    const move = chess.moves({ square: promotion.from, verbose: true }).find((m) => m.to === promotion.to && m.promotion === type);
    if (move) announcePlayedMove(move);
    setPromotion(null); setSelected('');
  };
  const displayedMarks = drag?.annotate && drag.to ? [...annotations, { from: drag.from, to: drag.to }] : annotations;
  return <div className={`board-wrap palette-${preferences.palette} ${className}`}>
    <div className="board-toolbar" role="group" aria-label="Board tools">
      <button type="button" onClick={() => savePreference({ orientation: orientation === 'w' ? 'b' : 'w' })} aria-label="Flip chessboard">↻ <span>Flip</span></button>
      <button type="button" aria-pressed={drawMode} onClick={() => { setDrawMode(!drawMode); setDrawStart(''); setSelected(''); }} aria-label={drawMode ? 'Finish drawing annotations' : 'Draw arrows and circles'}>↗ <span>{drawMode ? 'Drawing' : 'Annotate'}</span></button>
      {annotations.length > 0 && <button type="button" onClick={() => setAnnotations([])} aria-label="Clear board annotations">Clear marks</button>}
      <details className="board-preferences"><summary>Board settings</summary><div>
        <label>Square colors<select value={preferences.palette} onChange={(e) => savePreference({ palette: e.target.value })}><option value="sage">Sage</option><option value="walnut">Walnut</option><option value="slate">Slate</option></select></label>
        <label><input type="checkbox" checked={preferences.coordinates} onChange={(e) => savePreference({ coordinates: e.target.checked })}/>Coordinates</label>
        <label><input type="checkbox" checked={preferences.destinations} onChange={(e) => savePreference({ destinations: e.target.checked })}/>Legal destinations</label>
      </div></details>
    </div>
    <div className={evaluationBar ? 'board-with-evaluation' : 'board-surface-container'}>
      {evaluationBar}
      <div className="board-surface">
      <div ref={boardRef} className={`chess-board${drawMode ? ' is-annotating' : ''}`} role="grid" aria-readonly={!interactive} aria-rowcount="8" aria-colcount="8" aria-label={`Chessboard, ${orientation === 'w' ? 'White' : 'Black'} at bottom`} aria-describedby={`${arrowId}-instructions`}
        onPointerMove={pointerMove} onPointerUp={(e) => pointerEnd(e)} onPointerCancel={(e) => pointerEnd(e, true)} onContextMenu={(e) => e.preventDefault()}>
        {Array.from({ length: 8 }, (_, row) => <div role="row" className="board-row" key={row}>{Array.from({ length: 8 }, (_, col) => {
          const actualRow = orientation === 'w' ? row : 7 - row, actualCol = orientation === 'w' ? col : 7 - col;
          const name = `${FILES[actualCol]}${8 - actualRow}`, piece = chess.get(name);
          const isLast = lastMove?.from === name || lastMove?.to === name;
          const isCheck = checked && terminal.check && piece?.type === 'k' && piece.color === chess.turn();
          return <button key={name} type="button" role="gridcell" aria-label={`${name}, ${piece ? pieceLabel(piece) : 'empty'}, ${turn} to move${isCheck ? ', in check' : ''}${legalTargets.has(name) ? ', legal destination' : ''}`}
            aria-selected={selected === name || drawStart === name} tabIndex={focusSquare === name ? 0 : -1} onFocus={() => setFocusSquare(name)} data-square={name}
            style={{ touchAction: drawMode || (canMove && piece?.color === chess.turn()) ? 'none' : 'pan-y' }}
            className={`square ${(actualRow + actualCol) % 2 ? 'square-dark' : 'square-light'}${selected === name || drawStart === name ? ' square-selected' : ''}${isLast ? ' square-last' : ''}${isCheck ? ' square-check' : ''}${drag?.to === name && !drag.annotate ? ' square-drop' : ''}`}
            onPointerDown={(e) => pointerDown(e, name)} onClick={(e) => { if (!e.detail || performance.now() > suppressClick.current) activateSquare(name); }} onKeyDown={(e) => onSquareKeyDown(e, row, col)}>
            {piece && <img className={`piece-svg${drag?.from === name && !drag.annotate ? ' piece-drag-source' : ''}`} src={pieceUrl(piece)} alt="" draggable={false} aria-hidden="true"/>}
            {preferences.destinations && legalTargets.has(name) && <span className={`move-hint${piece || selectedMoves.some((m) => m.to === name && m.flags.includes('e')) ? ' move-hint-capture' : ''}`} aria-hidden="true"/>}
            {preferences.coordinates && col === 0 && <span className="coord coord-rank" aria-hidden="true">{8 - actualRow}</span>}
            {preferences.coordinates && row === 7 && <span className="coord coord-file" aria-hidden="true">{FILES[actualCol]}</span>}
          </button>;
        })}</div>)}
      </div>
      <svg className="board-annotations" viewBox="0 0 800 800" aria-hidden="true"><defs><marker id={arrowId} markerWidth="4" markerHeight="4" refX="2.5" refY="2" orient="auto"><path d="M0 0 L4 2 L0 4 Z"/></marker><marker id={`${arrowId}-engine`} className="engine-marker" markerWidth="4" markerHeight="4" refX="2.5" refY="2" orient="auto"><path d="M0 0 L4 2 L0 4 Z"/></marker></defs>{displayedMarks.map(({ from, to }, i) => {
        const a = squareCenter(from, orientation), b = squareCenter(to, orientation);
        return from === to ? <circle key={i} cx={a.x} cy={a.y} r="40"/> : <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} markerEnd={`url(#${arrowId})`}/>;
      })}{suggestion && <line className="engine-suggestion" x1={squareCenter(suggestion.from, orientation).x} y1={squareCenter(suggestion.from, orientation).y} x2={squareCenter(suggestion.to, orientation).x} y2={squareCenter(suggestion.to, orientation).y} markerEnd={`url(#${arrowId}-engine)`}/>}</svg>
      {drag && !drag.annotate && chess.get(drag.from) && <img className="piece-drag-ghost" src={pieceUrl(chess.get(drag.from))} alt="" style={{ left: `${drag.x}%`, top: `${drag.y}%` }} aria-hidden="true"/>}
      {promotion && <div ref={promotionRef} className="promotion-shade" role="dialog" aria-modal="true" aria-label="Choose a promotion piece"><div className="promotion-card"><p>Choose your promotion</p><div className="promotion-options">{['q', 'r', 'b', 'n'].map((type) => <button key={type} type="button" className="promotion-choice" onClick={() => finishPromotion(type)} aria-label={`Promote to ${PIECE_NAMES[type]}`}><img src={pieceUrl({ color: chess.turn(), type })} alt=""/><span>{PIECE_NAMES[type]}</span></button>)}</div><button className="text-button" type="button" onClick={() => setPromotion(null)}>Cancel</button></div></div>}
      </div>
    </div>
    {drawMode && <div className="annotation-controls"><span>Tap two squares for an arrow; the same square for a circle.</span><div><label>From<select value={arrowFrom} onChange={(e) => setArrowFrom(e.target.value)}>{squares.map((s) => <option key={s}>{s}</option>)}</select></label><label>To<select value={arrowTo} onChange={(e) => setArrowTo(e.target.value)}>{squares.map((s) => <option key={s}>{s}</option>)}</select></label><button type="button" onClick={() => mark(arrowFrom, arrowTo)}>Mark position</button></div></div>}
    <p id={`${arrowId}-instructions`} className="visually-hidden">Arrow keys navigate squares. Enter or Space selects a piece and destination. Escape cancels selection. Use Annotate to draw without moving pieces.</p>
    <span className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">{announcement ? `${announcement}. ` : ''}{status}</span>
  </div>;
}
