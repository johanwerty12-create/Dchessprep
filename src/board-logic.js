const FILES = 'abcdefgh';
export const DEFAULT_BOARD_PREFERENCES = { palette: 'sage', coordinates: true, destinations: true, orientation: 'w' };
export function readBoardPreferences() {
  try { return normalizeBoardPreferences(JSON.parse(localStorage.getItem('chessdesk-board') || '{}')); }
  catch { return { ...DEFAULT_BOARD_PREFERENCES }; }
}
export function normalizeBoardPreferences(value) {
  return {
    palette: ['sage', 'walnut', 'slate'].includes(value?.palette) ? value.palette : 'sage',
    coordinates: value?.coordinates !== false,
    destinations: value?.destinations !== false,
    orientation: value?.orientation === 'b' ? 'b' : 'w',
  };
}
export function saveBoardPreferences(value) {
  try { localStorage.setItem('chessdesk-board', JSON.stringify(normalizeBoardPreferences(value))); } catch { /* remain usable if storage is blocked */ }
}
export function squareAtPoint(x, y, rect, orientation = 'w') {
  if (!rect.width || !rect.height || x < rect.left || y < rect.top || x >= rect.left + rect.width || y >= rect.top + rect.height) return null;
  const col = Math.floor((x - rect.left) / rect.width * 8);
  const row = Math.floor((y - rect.top) / rect.height * 8);
  return `${FILES[orientation === 'b' ? 7 - col : col]}${orientation === 'b' ? row + 1 : 8 - row}`;
}
export function squareCenter(square, orientation = 'w') {
  const col = FILES.indexOf(square[0]), row = 8 - Number(square[1]);
  return { x: (orientation === 'b' ? 7 - col : col) * 100 + 50, y: (orientation === 'b' ? 7 - row : row) * 100 + 50 };
}
export function toggleAnnotation(items, from, to) {
  const key = `${from}:${to}`;
  return items.some((item) => `${item.from}:${item.to}` === key)
    ? items.filter((item) => `${item.from}:${item.to}` !== key)
    : [...items.slice(-31), { from, to }];
}
