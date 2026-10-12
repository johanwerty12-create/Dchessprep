import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
const luminance = (hex) => {
  const [r,g,b] = hex.slice(1).match(/../g).map((v) => parseInt(v,16)/255).map((v) => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4);
  return .2126*r + .7152*g + .0722*b;
};
const contrast = (a,b) => { const values=[luminance(a),luminance(b)].sort((x,y)=>y-x); return (values[0]+.05)/(values[1]+.05); };
test('coordinate foreground/background colors retain text contrast across board palettes', () => {
  const lastRule = (selector) => [...css.matchAll(new RegExp(selector + ' \\{([^}]+)\\}', 'g'))].at(-1)[1];
  const dark = lastRule('\\.square-dark \\.coord'), light = lastRule('\\.square-light \\.coord');
  const color = (rule, property) => rule.match(new RegExp('(?:^|;)\\s*' + property + ':\\s*(#[a-fA-F0-9]{6})'))[1];
  assert.ok(contrast(color(dark,'color'), color(dark,'background')) >= 4.5);
  for (const [,background] of css.matchAll(/--board-light:\s*(#[a-fA-F0-9]{6})/g)) assert.ok(contrast(color(light,'color'), background) >= 4.5);
});
