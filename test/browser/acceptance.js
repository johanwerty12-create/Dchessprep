import { listRecords } from '../../src/db.js';
import { duePracticeCards } from '../../src/practice.js';
import { withWindowConfirm } from '../../scripts/browser-check-utils.js';
const output = document.querySelector('#output');
const log = (s) => output.textContent += s + '\n';
const check = (ok, s) => { if (!ok) throw new Error(s); log('PASS ' + s); };
const wait = async (condition) => { const t = performance.now(); while (!await condition()) { if (performance.now() - t > 240000) throw new Error('Timed out awaiting acceptance condition'); await new Promise((r) => setTimeout(r, 25)); } };
const canonicalRecords = (records) => JSON.stringify([...records].sort((a, b) => a.id.localeCompare(b.id)));
document.querySelector('#run').onclick = async () => {
  document.querySelector('#run').disabled = true;
  try {
    check((await listRecords()).length === 0, 'empty disposable origin; no existing library overwritten');
    const frame = document.createElement('iframe'); frame.style.cssText = 'display:block;width:1280px;height:900px;max-width:100%'; frame.src = '/'; document.body.append(frame);
    await new Promise((r) => frame.onload = r);
    const win = frame.contentWindow, doc = win.document;
    const paint = () => new Promise((r) => win.requestAnimationFrame(() => win.requestAnimationFrame(r)));
    const visible = (e) => e.getClientRects().length > 0;
    const button = (text) => [...doc.querySelectorAll('button')].find((b) => visible(b) && (b.textContent.trim() === text || b.getAttribute('aria-label') === text));
    const click = async (text) => { await wait(() => button(text) && !button(text).disabled); button(text).click(); await paint(); };
    const field = (label) => [...doc.querySelectorAll('label')].find((l) => visible(l) && l.textContent.trim().startsWith(label))?.querySelector('input,select,textarea') || doc.querySelector(`[aria-label="${label}"]`);
    const fill = async (label, value) => { const e = field(label); if (!e) throw new Error('Missing field: ' + label); const proto = e.tagName === 'TEXTAREA' ? win.HTMLTextAreaElement.prototype : e.tagName === 'SELECT' ? win.HTMLSelectElement.prototype : win.HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(e, value); e.dispatchEvent(new win.Event('input', { bubbles: true })); e.dispatchEvent(new win.Event('change', { bubbles: true })); await paint(); };
    const move = async (from, to) => { doc.querySelector(`[data-square="${from}"]`).click(); await paint(); doc.querySelector(`[data-square="${to}"]`).click(); await paint(); };
    const boardAnnouncement = () => doc.querySelector('.board-lab-board .board-wrap [role="status"].visually-hidden')?.textContent.trim() || '';
    const expectBoardAnnouncement = (phrase, label) => check(boardAnnouncement().includes(phrase), label + ` (announcement: ${boardAnnouncement()})`);
    const expectNoStaleMoveAnnouncement = (label) => check(!boardAnnouncement().includes('Played '), label + ` (announcement: ${boardAnnouncement()})`);
    const nav = async (name) => { await click(name); win.scrollTo(0, 0); await paint(); };
    await wait(() => button('Tournament workspace') || button('More workspaces'));
    // Works at either an ordinary desktop viewport or phone-sized harness page.
    const workspace = async (name) => { if (!button(name) && button('More workspaces')) await click('More workspaces'); await nav(name); };
    await workspace('Tournament workspace'); await click('Add opponent');
    await fill('Name', 'QA Acceptance Black'); await fill('Notes', 'Observed PGNs only.'); await click('Save opponent');
    await click('New tournament'); await fill('Name', 'QA Acceptance Open'); await fill('Start date', '2026-10-20'); await fill('Venue', 'Disposable QA'); await click('Create event');
    let tournament = (await listRecords()).find((r) => r.kind === 'tournament');
    check(tournament.date === '2026-10-20', 'tournament calendar date is saved');
    await fill('Opponent', 'QA Acceptance Black'); await fill('Preparation note', 'Rehearse the White Reti line.'); await click('Add round');
    const boxes = [...doc.querySelectorAll('.round-tasks input')]; boxes[0].click(); boxes[1].click(); await paint();
    await wait(async () => { const r = (await listRecords()).find((r) => r.kind === 'tournament'); return r.rounds[0].tasks.filter((t) => t.done).length === 2; });
    check(true, 'rapid task toggles both persist');
    const status = doc.querySelector('[aria-label="Round 1 status"]'); Object.getOwnPropertyDescriptor(win.HTMLSelectElement.prototype, 'value').set.call(status, 'prepared'); status.dispatchEvent(new win.Event('change', { bubbles: true })); await paint();
    await click('New tournament'); await fill('Name', 'QA Acceptance Other'); await click('Create event');
    await workspace('Personal library'); await fill('Search your library', 'QA Acceptance Open'); await click('Open workspace: QA Acceptance Open');
    check(doc.querySelector('.tournament-heading h2').textContent === 'QA Acceptance Open', 'library selects the requested tournament among multiple events');
    check(doc.querySelector('.opponent-note-text')?.textContent === 'Observed PGNs only.', 'saved notebook notes are readable');
    await workspace('Game review'); await click('Import PGN');
    await fill('PGN', '[Event "QA Acceptance Scholar"]\n[Date "????.??.??"]\n[White "QA Acceptance Player"]\n[Black "QA Acceptance Black"]\n[Result "1-0"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0');
    await fill('Saved name', 'QA Acceptance Scholar'); await fill('Opponent name', 'QA Acceptance Black'); await fill('Opponent’s color', 'b'); await click('Validate & save');
    const retiBatch = '[Event "QA Acceptance Reti A"]\n[White "QA Acceptance Player"]\n[Black "QA Acceptance Black"]\n[Result "*"]\n\n1. Nf3 d5 2. g3 Nf6 3. Bg2 g6 4. O-O Bg7 *\n\n[Event "QA Acceptance Reti B"]\n[White "QA Acceptance Player"]\n[Black "QA Acceptance Black"]\n[Result "*"]\n\n1. g3 d5 2. Nf3 Nf6 3. Bg2 g6 4. O-O Bg7 *';
    await click('Import game'); await fill('PGN', retiBatch);
    await fill('Opponent name', 'QA Acceptance Black'); await fill('Opponent’s color', 'b'); await click('Validate & save');
    check((await listRecords()).filter((r) => r.kind === 'game').length === 3, 'several legal games imported');
    await wait(() => !doc.querySelector('[role="dialog"]')); await click('Import game'); await fill('PGN', retiBatch);
    await fill('Opponent name', 'QA Acceptance Black'); await fill('Opponent’s color', 'b'); await click('Validate & save');
    await wait(() => doc.body.textContent.includes('No new games saved. 2 exact duplicates were already in your library.'));
    check((await listRecords()).filter((r) => r.kind === 'game').length === 3, 're-imported multi-game PGN reports both duplicates and keeps one copy of each');
    // IndexedDB commits before the import handler finishes refreshing React state.
    // Wait for the dialog to close before issuing a navigation action.
    await wait(() => !doc.querySelector('[role="dialog"]')); await paint();
    await workspace('Prep map'); await wait(() => doc.body.textContent.includes('Observed opening lines'));
    check(doc.body.textContent.includes('Transposes with'), 'actual Reti move orders show transpositions');
    await workspace('Personal library');
    doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
    check(doc.activeElement?.getAttribute('aria-label') === 'Search your library', 'Ctrl-K focuses library search');
    await fill('Search your library', 'QA Acceptance Scholar'); await click('Open game review: QA Acceptance Scholar');
    const panel = button('Analyze'); if (panel) await click('Analyze'); await click('Analyze full game');
    const started = performance.now(); await wait(async () => (await listRecords()).some((r) => r.kind === 'review' && r.complete));
    log('Real full-game engine review: ' + Math.round(performance.now() - started) + 'ms (includes persistence).');
    let records = await listRecords(); const game = records.find((r) => r.name === 'QA Acceptance Scholar'); const review = records.find((r) => r.kind === 'review' && r.gameId === game.id);
    check(review.moves.at(-1).label === 'Best' && review.moves.at(-1).whiteScore.kind === 'terminal', 'Scholar final move and saved terminal score agree');
    if (button('Key moments')) await click('Key moments');
    const practice = button('Practice all'); practice.click(); practice.click(); await paint();
    const expected = review.moves.filter((m) => ['Inaccuracy','Mistake','Blunder','Missed win'].includes(m.label)).length;
    await wait(async () => (await listRecords()).filter((r) => r.kind === 'training' && r.gameId === game.id).length === expected);
    await wait(() => doc.body.textContent.includes('already in practice')); records = await listRecords();
    check(records.filter((r) => r.gameId === game.id && r.kind === 'training').length === expected && new Set(records.filter((r) => r.gameId === game.id && r.kind === 'training').map((r) => r.ply)).size === expected, 'rapid practice additions have one card per game/ply');
    await workspace('Repertoire clash'); await click('Add a prepared line'); await fill('Line name', 'QA Acceptance Reti'); await fill('PGN line', '1. Nf3 d5 2. g3 Nf6 3. Bg2 g6 4. O-O Bg7 *'); await click('Save line');
    await wait(() => doc.body.textContent.includes('1 exact · 1 transposed'));
    check(true, 'repertoire compares exact and transposed games');
    await click('Practice this line');
    const first = duePracticeCards(await listRecords())[0]; await click('Start session'); await move(first.targetUci.slice(0,2), first.targetUci.slice(2,4));
    await wait(async () => (await listRecords()).find((r) => r.id === first.id)?.practiceLog?.length === 1);
    check(true, 'practice attempt is persisted');
    await workspace('Repertoire clash'); await click('Edit QA Acceptance Reti'); await fill('Line name', 'QA Acceptance Reti Renamed'); await click('Save changes');
    await wait(async () => (await listRecords()).some((r) => r.kind === 'repertoire' && r.name === 'QA Acceptance Reti Renamed'));
    records = await listRecords(); const line = records.find((r) => r.kind === 'repertoire');
    check(records.filter((r) => r.sourceLineId === line.id).every((c) => c.sourceName === line.name && !c.retiredAt), 'rename preserves active practice identities');
    await click('Edit QA Acceptance Reti Renamed'); await fill('PGN line', '1. Nf3 d5 *'); await click('Save changes');
    await wait(async () => (await listRecords()).filter((r) => r.sourceLineId === line.id && r.retiredAt).length === 3);
    records = await listRecords(); check(records.filter((r) => r.sourceLineId === line.id && r.retiredAt).length === 3, 'removed repertoire positions pause with records preserved');
    await workspace('Analysis board');
    if (button('FEN / PGN')) await click('FEN / PGN'); await click('New board'); if (button('Moves')) await click('Moves');
    check(doc.querySelectorAll('.piece-svg').length === 32, 'premium SVG pieces are rendered');
    const before = doc.querySelector('[aria-label="Current FEN"]').value; await move('e2','e5'); check(doc.querySelector('[aria-label="Current FEN"]').value === before, 'illegal destination does not change the position');
    await move('e2','e4'); check(doc.querySelectorAll('.square-last').length === 2, 'last-move highlights follow a legal move'); expectBoardAnnouncement('Played e4', 'a legal move is announced once with its SAN');
    await click('Undo'); expectBoardAnnouncement('Starting position', 'undo announces the restored starting position'); expectNoStaleMoveAnnouncement('undo clears the previous move announcement');
    await move('e2','e4'); expectBoardAnnouncement('Played e4', 'move announcement is restored after undo'); await click('New board'); expectBoardAnnouncement('Starting position', 'reset announces the new starting position'); expectNoStaleMoveAnnouncement('reset clears the previous move announcement');
    await click('Flip chessboard'); check(doc.querySelector('.square').dataset.square === 'h1', 'flip changes rendered orientation'); await click('Flip chessboard');
    await click('Draw arrows and circles'); await move('e2','e4'); check(doc.querySelectorAll('.board-annotations line').length === 1, 'annotation mode draws an arrow without changing chess'); await move('e2','e4'); check(doc.querySelectorAll('.board-annotations line').length === 0, 'repeating an arrow toggles it off'); await click('Finish drawing annotations');
    if (button('FEN / PGN')) await click('FEN / PGN'); await fill('Load FEN', '7k/P7/8/8/8/8/8/7K w - - 0 1'); await click('Load'); expectBoardAnnouncement('Loaded position', 'FEN load announces the loaded position'); expectNoStaleMoveAnnouncement('FEN load clears the previous move announcement'); if (button('Moves')) await click('Moves'); await move('a7','a8'); await click('Promote to queen'); check(doc.querySelector('[data-square="a8"]').getAttribute('aria-label').includes('white queen'), 'promotion changes the legal board'); expectBoardAnnouncement('Played a8=Q', 'promotion announces the selected legal move');
    if (button('FEN / PGN')) await click('FEN / PGN'); await fill('Import PGN with variations', '1. e4 (1. d4 d5) e5 *'); await click('Load PGN study'); expectBoardAnnouncement('Ply 1, after e4', 'PGN loading announces the selected first position'); expectNoStaleMoveAnnouncement('PGN loading clears the previous move announcement'); if (button('Moves')) await click('Moves'); await click('Start'); expectBoardAnnouncement('Starting position', 'move-history navigation to the start is announced'); expectNoStaleMoveAnnouncement('move-history navigation clears the previous move announcement'); const branch = [...doc.querySelectorAll('.variation-branches button')].find((b) => b.textContent.includes('d4')); branch.click(); await paint(); check(doc.querySelector('[data-square="d4"]').getAttribute('aria-label').includes('white pawn'), 'imported side variation can be navigated'); expectBoardAnnouncement('Ply 1, after d4', 'variation navigation announces the selected move');
    for (const width of [320,390]) { frame.style.width = width + 'px'; frame.style.height = '844px'; win.scrollTo(0,0); await paint(); const rects = [...doc.querySelectorAll('.square')].map((e) => e.getBoundingClientRect()); check(rects.length === 64 && rects.every((r) => Math.abs(r.width-r.height) < .1), width + 'px board has 64 equal squares'); check(doc.documentElement.scrollWidth === doc.documentElement.clientWidth, width + 'px has no page overflow'); }
    await workspace('Personal library'); await fill('Search your library', 'QA Acceptance');
    check(doc.querySelectorAll('.library-record').length > 0, 'library search still reaches saved study');
    // Capture the real UI export Blob, then pass files through the actual restore input.
    let exported; const createUrl = win.URL.createObjectURL;
    win.URL.createObjectURL = (blob) => { exported = blob; return createUrl.call(win.URL,blob); };
    await click('Export backup'); await wait(() => exported); const backup = JSON.parse(await exported.text()); win.URL.createObjectURL = createUrl;
    check(backup.records.length === (await listRecords()).length, 'actual export contains every saved record');
    const current = (await listRecords()).find((r) => r.id === game.id); check(current.name === 'QA Acceptance Scholar' && current.pgn.includes('Qxf7#'), 'deletion identity and legal game confirmed');
    await withWindowConfirm(win, (message) => { if (!message.includes('QA Acceptance Scholar')) throw new Error('Unexpected destructive action'); return true; }, async () => {
      await click('Delete QA Acceptance Scholar');
      await wait(async () => !(await listRecords()).some((r) => r.id === game.id));
    });
    records = await listRecords(); check(!records.some((r) => r.gameId === game.id), 'only identified game and its linked reviews/training are removed'); check(records.some((r) => r.kind === 'tournament') && records.some((r) => r.kind === 'repertoire'), 'unrelated tournament and repertoire remain');
    const restore = async (text) => { const input = doc.querySelector('[aria-label="Choose Chessdesk backup"]'); const dt = new win.DataTransfer(); dt.items.add(new win.File([text],'qa-backup.json',{type:'application/json'})); input.files = dt.files; input.dispatchEvent(new win.Event('change',{bubbles:true})); await paint(); };
    const remaining = canonicalRecords(await listRecords());
    await restore('{broken'); await wait(() => doc.querySelector('.global-error'));
    check(canonicalRecords(await listRecords()) === remaining, 'malformed JSON restore leaves native IndexedDB records unchanged');
    const dismissError = async () => { doc.querySelector('.global-error button[aria-label="Dismiss error"]')?.click(); await paint(); };
    await dismissError();
    const duplicateBackup = { ...backup, records: [...backup.records, { ...backup.records[0] }] };
    await restore(JSON.stringify(duplicateBackup));
    await wait(() => doc.querySelector('.global-error')?.textContent.includes('duplicate record ID'));
    check(canonicalRecords(await listRecords()) === remaining, 'structurally malformed backup is rejected before native IndexedDB writes');
    await dismissError();
    const objectStorePrototype = win.IDBObjectStore.prototype, originalPut = objectStorePrototype.put;
    let injectedPutCount = 0, restoreTransactionInterrupted = false;
    objectStorePrototype.put = function(value, ...args) {
      const request = Reflect.apply(originalPut, this, [value, ...args]);
      if (this.transaction?.db?.name === 'chessdesk-local' && ++injectedPutCount === 2) {
        restoreTransactionInterrupted = true;
        this.transaction.abort();
        throw new win.DOMException('Injected quota failure during restore.', 'QuotaExceededError');
      }
      return request;
    };
    try {
      await withWindowConfirm(win, (message) => message.startsWith('Replace the local library'), async () => {
        await restore(JSON.stringify(backup));
        await wait(() => doc.querySelector('.global-error'));
      });
    } finally { objectStorePrototype.put = originalPut; }
    check(restoreTransactionInterrupted, 'restore exercised a native IndexedDB transaction interruption after writes were queued');
    check(canonicalRecords(await listRecords()) === remaining, 'interrupted native IndexedDB restore preserves every pre-existing record');
    await dismissError();
    await withWindowConfirm(win, (message) => { if (!message.startsWith('Replace the local library')) throw new Error('Unexpected confirm'); return true; }, async () => {
      await restore(JSON.stringify(backup));
      await wait(async () => (await listRecords()).length === backup.records.length);
    });
    records = await listRecords();
    check(canonicalRecords(records) === canonicalRecords(backup.records), 'actual restore preserves exact games, reviews, opponents, repertoire, tournaments and training records');
    frame.contentWindow.location.reload(); await new Promise((r) => frame.onload = r); await wait(() => frame.contentDocument.querySelector('.daily-practice'));
    check(frame.contentDocument.body.textContent.includes('recalled without help'), 'returning later restores personal recall progress');
    log('COMPLETE: browser UI/IndexedDB acceptance passed. Input and touch events are automated, not physical-device evidence.');
  } catch (error) { log('FAIL ' + error.message); }
};
