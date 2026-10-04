import fs from 'node:fs';
import path from 'node:path';

const RELATIVE_CANDIDATES = [
  ['chrome-win64', 'chrome.exe'],
  ['chrome-win', 'chrome.exe'],
  ['chrome-headless-shell-win64', 'chrome-headless-shell.exe'],
];

export function resolveChromePath() {
  const explicit = process.env.CHROME_PATH;
  if (explicit && fs.existsSync(explicit)) return explicit;

  const root = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    entries = [];
  }

  const candidates = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const full = /^chromium-(\d+)$/.exec(entry.name);
    const shell = /^chromium_headless_shell-(\d+)$/.exec(entry.name);
    if (full) candidates.push({ build: +full[1], rank: 1, name: entry.name });
    else if (shell) candidates.push({ build: +shell[1], rank: 0, name: entry.name });
  }
  candidates.sort((a, b) => b.build - a.build || b.rank - a.rank);

  for (const candidate of candidates) {
    for (const rel of RELATIVE_CANDIDATES) {
      const exe = path.join(root, candidate.name, ...rel);
      if (fs.existsSync(exe)) return exe;
    }
  }

  return path.join(root, 'chromium', 'chrome-win64', 'chrome.exe');
}
