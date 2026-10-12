import test from 'node:test';
import assert from 'node:assert/strict';
import { squareAtPoint, squareCenter, normalizeBoardPreferences, toggleAnnotation } from '../src/board-logic.js';

test('pointer mapping and annotation coordinates agree on all squares in both orientations', () => {
  const rect = { left: 20, top: 30, width: 320, height: 320 };
  for (const orientation of ['w', 'b']) for (const file of 'abcdefgh') for (let rank = 1; rank <= 8; rank++) {
    const square = `${file}${rank}`, point = squareCenter(square, orientation);
    assert.equal(squareAtPoint(rect.left + point.x / 800 * rect.width, rect.top + point.y / 800 * rect.height, rect, orientation), square);
  }
  assert.equal(squareAtPoint(20, 30, rect), 'a8');
  assert.equal(squareAtPoint(20, 30, rect, 'b'), 'h1');
  for (const [x, y] of [[19, 30], [340, 30], [20, 350], [20, 29]]) assert.equal(squareAtPoint(x, y, rect), null);
});
test('board settings recover safely from malformed or obsolete stored values', () => {
  assert.deepEqual(normalizeBoardPreferences(null), { palette: 'sage', coordinates: true, destinations: true, orientation: 'w' });
  assert.deepEqual(normalizeBoardPreferences({ palette: 'unsafe', orientation: 'x', coordinates: false, destinations: false }), { palette: 'sage', coordinates: false, destinations: false, orientation: 'w' });
  assert.equal(normalizeBoardPreferences({ palette: 'walnut', orientation: 'b' }).orientation, 'b');
});
test('arrows and circles toggle exactly and stay bounded without changing chess data', () => {
  const items = toggleAnnotation([], 'e2', 'e4');
  assert.deepEqual(items, [{ from: 'e2', to: 'e4' }]);
  assert.deepEqual(toggleAnnotation(items, 'e2', 'e4'), []);
  assert.deepEqual(toggleAnnotation([], 'f7', 'f7'), [{ from: 'f7', to: 'f7' }]);
  let many = [];
  for (let i = 0; i < 100; i++) many = toggleAnnotation(many, String(i), String(i));
  assert.equal(many.length, 32);
});
