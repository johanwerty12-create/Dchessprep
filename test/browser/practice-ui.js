import { listRecords, putRecords } from './app-db.js';
import { makeBackup, validateBackup } from './domain.js';
const output = document.querySelector('#output');
const log = (s) => output.textContent += s + '\n';
const check = (ok, s) => { if (!ok) throw new Error(s); log('PASS ' + s); };
const wait = async (condition) => { const start = performance.now(); while (!await condition()) { if (performance.now() - start > 15000) throw new Error('Timed out waiting for UI'); await new Promise((r) => setTimeout(r, 20)); } };
document.querySelector('#run').onclick = async () => {
  document.querySelector('#run').disabled = true;
  try {
    check((await listRecords()).length === 0, 'origin is empty; existing libraries are never overwritten');
    const now = Date.now();
    const fixtures = Array.from({ length: 6 }, (_, i) => ({ id: `practice-qa-${i}`, kind: 'training', sourceType: 'repertoire', sourceName: `QA prepared move ${i + 1}`, name: `QA prepared move ${i + 1}`, color: 'w', ply: 1,
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', targetUci: 'e2e4', targetSan: 'e4', dueAt: new Date(now - 60000 + i * 1000).toISOString(), createdAt: new Date(now).toISOString() }));
    await putRecords(fixtures);
    const frame = document.createElement('iframe'); frame.style.cssText = 'width:390px;height:844px;display:block'; frame.src = '/'; document.body.append(frame);
    await new Promise((r) => frame.onload = r);
    const win = frame.contentWindow, doc = win.document;
    const paint = () => new Promise((r) => win.requestAnimationFrame(() => win.requestAnimationFrame(r)));
    const click = async (text) => { const button = [...doc.querySelectorAll('button')].find((b) => b.textContent.trim() === text && b.getClientRects().length); check(button && !button.disabled, text + ' is usable'); button.click(); await paint(); };
    await wait(() => doc.querySelector('button[aria-label="Train"]'));
    doc.querySelector('button[aria-label="Train"]').click(); await paint(); await click('Start session');
    check(doc.body.textContent.includes('OF 5'), 'session is capped at five of six due positions');
    const move = async (from, to) => { doc.querySelector(`[data-square="${from}"]`).click(); await paint(); doc.querySelector(`[data-square="${to}"]`).click(); await paint(); };
    const original = win.IDBObjectStore.prototype.put;
    try {
      win.IDBObjectStore.prototype.put = function(value, ...args) { if (value.kind === 'training') throw new win.DOMException('Injected full storage', 'QuotaExceededError'); return original.call(this, value, ...args); };
      await move('e2', 'e4'); await wait(() => doc.body.textContent.includes('Retry saving attempt'));
      check(!doc.body.textContent.includes('Result saved'), 'quota failure does not falsely complete the position');
      check((await listRecords()).every((r) => !r.practiceLog), 'failed write leaves all schedules and logs unchanged');
    } finally { win.IDBObjectStore.prototype.put = original; }
    await click('Retry saving attempt'); await wait(() => doc.body.textContent.includes('Result saved'));
    check((await listRecords()).find((r) => r.id === fixtures[0].id).practiceLog.length === 1, 'retry saves exactly one attempt');
    await click('Next position'); await click('Show a piece hint'); await move('e2', 'e4'); await wait(() => doc.body.textContent.includes('Result saved'));
    await click('Next position'); await move('b2', 'b3');
    check(!doc.querySelector('.training-feedback').textContent.includes('e4'), 'unsuccessful attempt does not reveal the answer');
    await move('e2', 'e4'); await wait(() => doc.body.textContent.includes('Result saved'));
    await click('Next position'); await click('Show solution'); await wait(() => doc.body.textContent.includes('Result saved'));
    await click('Next position'); await move('e2', 'e4'); await wait(() => doc.body.textContent.includes('Result saved'));
    await click('Finish session');
    check(doc.body.textContent.includes('All 5 results saved'), 'session completion reports five persisted results');
    check(doc.body.textContent.includes('Practice next 1'), 'remaining due position is available in another short session');
    const records = await listRecords();
    const outcomes = fixtures.slice(0, 5).map((f) => records.find((r) => r.id === f.id).practiceLog[0].outcome);
    check(JSON.stringify(outcomes) === JSON.stringify(['recalled', 'assisted', 'missed', 'revealed', 'recalled']), 'real IndexedDB records distinguish unaided, hinted, missed and revealed results');
    check(records.find((r) => r.id === fixtures[1].id).lastQuality === 2, 'hint did not earn full recall credit');
    check(!records.find((r) => r.id === fixtures[5].id).practiceLog, 'sixth card was untouched');
    check(validateBackup(JSON.parse(JSON.stringify(makeBackup(records)))).length === 6, 'actual practice logs survive backup serialization and validation');
    frame.contentWindow.location.reload(); await new Promise((r) => frame.onload = r);
    await wait(() => frame.contentDocument.querySelector('.daily-practice'));
    check(frame.contentDocument.querySelector('.daily-practice').textContent.includes('2 recalled without help'), 'Today restores saved recall progress after reload');
    log('Completed. All data belongs to this disposable QA origin; no database was cleared.');
  } catch (error) { log('FAIL ' + error.message); }
};
