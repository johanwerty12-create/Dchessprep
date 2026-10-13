const ACCEPTANCE_IMPORTS = [
  ["../../src/db.js", "./app-db.js"],
  ["../../src/practice.js", "./practice.js"],
  ["../../scripts/browser-check-utils.js", "./browser-check-utils.js"],
];

export function rewriteAcceptanceSource(source) {
  let rewritten = source;
  for (const [sourcePath, stagedPath] of ACCEPTANCE_IMPORTS) {
    if (!rewritten.includes(sourcePath)) {
      throw new Error(`Browser acceptance source is missing the expected import ${sourcePath}.`);
    }
    rewritten = rewritten.replaceAll(sourcePath, stagedPath);
  }
  return rewritten;
}

export function rewriteReleaseSource(source) {
  const paths = [
    ["../../src/engine.js", "./engine.js"],
    ["../../src/domain.js", "./domain.js"],
  ];
  let rewritten = source;
  for (const [sourcePath, stagedPath] of paths) {
    if (!rewritten.includes(sourcePath)) {
      throw new Error(`Release browser source is missing the expected import ${sourcePath}.`);
    }
    rewritten = rewritten.replaceAll(sourcePath, stagedPath);
  }
  return rewritten;
}

export async function withWindowConfirm(windowRef, confirmHandler, action) {
  const originalConfirm = windowRef.confirm;
  windowRef.confirm = confirmHandler;
  try {
    return await action();
  } finally {
    windowRef.confirm = originalConfirm;
  }
}
