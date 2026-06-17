#!/usr/bin/env node
// Guardrail: fail loudly if a secret-leaking pattern reaches client code.
//
// Born from the 2026-06 incident where api/config.py shipped the raw
// ANTHROPIC_API_KEY to the browser and got scraped (~$850 in a day). The rule
// is simple and absolute: secrets and the browser must never meet. Anything
// that calls Anthropic from a page, or hands a key to the frontend, is a bug.
//
// Runs in build.sh (fails the Vercel deploy) and as a pre-commit hook.
// To intentionally allow a flagged line, append a `secrets-scan-ok` comment.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const ROOT = process.cwd();
const SELF = 'scripts/scan-secrets.mjs';
const SKIP_DIRS = new Set([
  'node_modules', 'dist', '.git', '.vercel', '.vercel_python_packages',
  'claude-chief-of-staff', '.githooks', 'scripts', '.claude',
]);
const SCAN_EXT = new Set(['.html', '.js', '.mjs', '.cjs', '.ts', '.jsx', '.tsx', '.py']);

// Each rule: (relPath, line) -> message | null
const RULES = [
  {
    id: 'hardcoded-key',
    test: (_p, line) => /sk-ant-[A-Za-z0-9_-]{16,}/.test(line),
    msg: 'Hardcoded Anthropic API key. Keys belong in env vars, never in source.',
  },
  {
    id: 'browser-key-header',
    test: (p, line) => p.endsWith('.html') && /x-api-key/i.test(line),
    msg: 'Anthropic key used in browser code (x-api-key in an .html file). Call a server-side proxy instead.',
  },
  {
    id: 'direct-browser-access',
    test: (_p, line) => /anthropic-dangerous-direct-browser-access/.test(line),
    msg: 'Direct browser access to Anthropic. This exposes the key to every visitor. Proxy server-side.',
  },
];

// File-level rule: an api/ endpoint that reads a key env var AND emits a JSON
// `key:` field — the exact shape of the deleted config.py leak.
function fileLevelKeyReturn(relPath, content, lines) {
  if (!relPath.startsWith('api/')) return null;
  if (!/(ANTHROPIC|GEMINI|OPENAI|OPENROUTER)_API_KEY/.test(content)) return null;
  const idx = lines.findIndex(l => /["']key["']\s*:/.test(l) && !l.includes('secrets-scan-ok'));
  if (idx === -1) return null;
  return { id: 'key-returning-endpoint', line: idx + 1,
    msg: 'Endpoint appears to return an API key to the client (reads *_API_KEY and emits a "key" field). Never send keys to the frontend.' };
}

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = relative(ROOT, full);
    if (SKIP_DIRS.has(name)) continue;
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (SCAN_EXT.has(extname(name)) && rel !== SELF) out.push(rel);
  }
}

const files = [];
walk(ROOT, files);

const violations = [];
for (const rel of files) {
  let content;
  try { content = readFileSync(join(ROOT, rel), 'utf8'); } catch { continue; }
  const lines = content.split('\n');
  lines.forEach((line, i) => {
    if (line.includes('secrets-scan-ok')) return;
    for (const rule of RULES) {
      if (rule.test(rel, line)) {
        violations.push({ file: rel, line: i + 1, id: rule.id, msg: rule.msg, snippet: line.trim().slice(0, 120) });
      }
    }
  });
  const fl = fileLevelKeyReturn(rel, content, lines);
  if (fl) violations.push({ file: rel, line: fl.line, id: fl.id, msg: fl.msg, snippet: (lines[fl.line - 1] || '').trim().slice(0, 120) });
}

if (violations.length === 0) {
  console.log(`secrets scan: clean (${files.length} files checked)`);
  process.exit(0);
}

console.error('\n✗ SECRET-LEAK GUARDRAIL FAILED — do not deploy/commit this:\n');
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}  [${v.id}]`);
  console.error(`    ${v.msg}`);
  console.error(`    > ${v.snippet}\n`);
}
console.error('Fix: keep the key on the server (proxy the call). If this is a false positive, append a `secrets-scan-ok` comment to the line.\n');
process.exit(1);
