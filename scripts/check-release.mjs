import { spawn } from 'node:child_process';

const checks = [
  ['Automated regression tests', ['test']],
  ['Clean production build', ['run', 'build']],
  ['Initial-route performance budgets', ['run', 'check:budget']],
  ['Authentic Stockfish 18 engine verification', ['run', 'verify:engine']],
  ['Piece asset licensing and offline coverage', ['run', 'check:assets']],
  ['Static deployment and offline-package checks', ['run', 'check:pages']],
];

for (const [label, args] of checks) {
  console.log(`\n=== ${label} ===`);
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error('Run this gate with `npm run check:release` so it can find the installed npm CLI.');
  const child = spawn(process.execPath, [npmCli, ...args], { stdio: 'inherit' });
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  if (code !== 0) {
    console.error(`Release gate failed: ${label} (exit ${code}).`);
    process.exitCode = typeof code === 'number' ? code : 1;
    break;
  }
}

if (!process.exitCode) console.log('\nAll automated local release gates passed. Real-browser/device acceptance remains a separate release gate.');
