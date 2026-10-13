import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluationBarModel } from '../src/analysis-ui.js';

test('evaluation bar converts side-to-move scores to White without changing the engine score', () => {
  const model = evaluationBarModel({ kind: 'cp', value: 120, perspective: 'b' }, 'b');
  assert.equal(model.state, 'scored');
  assert.equal(model.label, '-1.2');
  assert.equal(model.whiteShare, 42.5);
  assert.match(model.description, /Black \+1\.2 pawns/);
  assert.match(model.description, /not a win chance/);
});

test('mate scores stay categorical and use the engine score perspective', () => {
  const win = evaluationBarModel({ kind: 'mate', value: 3, perspective: 'b' }, 'b');
  assert.deepEqual({ state: win.state, label: win.label, whiteShare: win.whiteShare }, { state: 'black-mate', label: '−M3', whiteShare: 0 });
  assert.match(win.description, /forced mate for Black in 3/);
  assert.equal(evaluationBarModel({ kind: 'mate', value: 0, perspective: 'w' }, 'w').whiteShare, null);
});

test('terminal wins and draws use outcome states, never arbitrary engine numbers', () => {
  assert.deepEqual(evaluationBarModel(null, 'b', { winner: 'w' }), {
    state: 'white-win', label: 'White wins · checkmate', description: 'Terminal checkmate. White won.', whiteShare: 100,
  });
  const draw = evaluationBarModel(null, 'w', { winner: null, label: 'Draw by stalemate' });
  assert.equal(draw.state, 'draw');
  assert.equal(draw.label, 'Draw by stalemate');
  assert.equal(draw.whiteShare, 50);
  assert.equal(evaluationBarModel(null).whiteShare, null, 'an unanalyzed position does not look like an equal engine score');
});

test('centipawn visualization is clipped and not expressed as a win probability', () => {
  assert.equal(evaluationBarModel({ kind: 'cp', value: 1600, perspective: 'w' }).whiteShare, 100);
  assert.equal(evaluationBarModel({ kind: 'cp', value: -1600, perspective: 'w' }).whiteShare, 0);
  assert.equal(evaluationBarModel({ kind: 'cp', value: 0, perspective: 'w' }).whiteShare, 50);
});
