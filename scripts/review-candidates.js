#!/usr/bin/env node
/**
 * BMT LLM Reference — Candidate Sanity Reviewer
 *
 * Compares the candidates branch's data/auto-discovered.json against the
 * baseline copy (main) and sanity-checks ONLY the newly added entries:
 *   - required fields present and correctly typed
 *   - values in plausible ranges (context_k, param counts)
 *   - no duplicate names/ids within the new entries
 *   - no duplicates against models.json or previously discovered entries
 *
 * Usage: node scripts/review-candidates.js <baseline-auto-discovered.json>
 *   (baseline = main's copy; pass /dev/null if main has none yet)
 *
 * Exit codes: 0 = clean (safe to auto-merge), 1 = issues found (human review),
 * 3 = structural failure (bad JSON / wrong shape — never auto-merge).
 * Writes a markdown report to stdout.
 */

const fs = require('fs');
const path = require('path');

// Keep in sync with normalizeKey()/keysFor() in scrape-models.js
function normalizeKey(name) {
  return String(name || '').toLowerCase()
    .replace(/^[^:]+:\s+/, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[-_.:/\s]+/g, ' ')
    .replace(/\b(instruct|instruction|chat|it|hf|gguf|awq|gptq|fp8|fp16|bf16)\b/g, ' ')
    .replace(/\bq\d\w*\b/g, ' ')
    .replace(/[^a-z0-9]/g, '');
}

function keysFor(m) {
  const keys = [];
  const nameKey = normalizeKey(m.name);
  if (nameKey) keys.push(nameKey);
  const id = m.openrouter_id || m.api_string || m.id || '';
  const idKey = normalizeKey(String(id).split('/').pop());
  if (idKey) keys.push(idKey);
  return [...new Set(keys)];
}

function fail(msg) {
  console.log(`## ❌ Structural failure\n\n${msg}\n\nDo not merge; investigate the scraper.`);
  process.exit(3);
}

const baselinePath = process.argv[2];
const candidatePath = path.join(__dirname, '../data/auto-discovered.json');

let candidate;
try {
  candidate = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
} catch (e) {
  fail(`data/auto-discovered.json is not valid JSON: ${e.message}`);
}
if (!Array.isArray(candidate.models)) fail('auto-discovered.json has no models[] array');
if (typeof candidate.count === 'number' && candidate.count !== candidate.models.length) {
  fail(`count field (${candidate.count}) does not match models[] length (${candidate.models.length})`);
}

let baseline = { models: [] };
if (baselinePath && fs.existsSync(baselinePath)) {
  try {
    const parsed = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    if (Array.isArray(parsed.models)) baseline = parsed;
  } catch { /* no usable baseline — treat every entry as new */ }
}

const verified = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/models.json'), 'utf8')).models;

// Guard: the accumulating file must never shrink — a shrink means the backlog
// was wiped (the exact regression the 2026-07-14 scraper fix addressed).
if (candidate.models.length < baseline.models.length) {
  fail(`auto-discovered.json SHRANK from ${baseline.models.length} to ${candidate.models.length} entries — the unreviewed backlog would be lost.`);
}

const baselineKeys = new Set(baseline.models.flatMap(keysFor));
const knownKeys = new Set([...verified, ...baseline.models].flatMap(keysFor));

const newEntries = candidate.models.filter(m => !keysFor(m).some(k => baselineKeys.has(k)));

const VALID_TYPES = new Set(['cloud', 'local']);
const VALID_SOURCES = new Set(['openrouter', 'ollama', 'huggingface', 'auto']);

const issues = [];
const seenNewKeys = new Map();
const seenNewIds = new Map();

newEntries.forEach((m) => {
  const problems = [];
  const label = typeof m.name === 'string' && m.name ? m.name : '(unnamed entry)';

  if (typeof m.name !== 'string' || m.name.trim().length < 3) problems.push('name missing or shorter than 3 chars');
  // eslint-disable-next-line no-control-regex
  if (typeof m.name === 'string' && /[\x00-\x1f\x7f]/.test(m.name)) problems.push('name contains control characters');
  if (typeof m.provider !== 'string' || !m.provider) problems.push('provider missing');
  if (!VALID_TYPES.has(m.type)) problems.push(`type is ${JSON.stringify(m.type)}, expected "cloud" or "local"`);
  if (!Array.isArray(m.tags) || m.tags.length === 0 || m.tags.some(t => typeof t !== 'string')) problems.push('tags missing or not a non-empty string array');
  if (typeof m.desc !== 'string' || !m.desc.trim()) problems.push('desc missing');
  if (typeof m.updated !== 'string' || !/^\d{4}-\d{2}$/.test(m.updated)) problems.push(`updated is ${JSON.stringify(m.updated)}, expected YYYY-MM`);
  if (m.last_verified !== 'UNVERIFIED') problems.push(`last_verified is ${JSON.stringify(m.last_verified)} — auto entries must be UNVERIFIED`);
  if (m._needs_review !== true) problems.push('_needs_review is not true');
  if (!VALID_SOURCES.has(m._source)) problems.push(`_source is ${JSON.stringify(m._source)}`);
  if (!(m.free_tier === null || typeof m.free_tier === 'boolean')) problems.push('free_tier must be boolean or null');
  if (typeof m.moe !== 'boolean') problems.push('moe must be boolean');
  if (!(m.context_k === null || (typeof m.context_k === 'number' && m.context_k > 0 && m.context_k <= 20000))) problems.push(`context_k out of range: ${JSON.stringify(m.context_k)}`);
  for (const f of ['total_params_b', 'active_params_b']) {
    if (!(m[f] == null || (typeof m[f] === 'number' && m[f] > 0 && m[f] <= 5000))) problems.push(`${f} out of range: ${JSON.stringify(m[f])}`);
  }
  for (const f of ['api_string', 'openrouter_id']) {
    if (!(m[f] == null || (typeof m[f] === 'string' && m[f].length > 0))) problems.push(`${f} must be a non-empty string or null`);
  }

  // duplicates among the new entries themselves
  for (const k of keysFor(m)) {
    if (seenNewKeys.has(k)) problems.push(`duplicate of new entry "${seenNewKeys.get(k)}" (key: ${k})`);
    else seenNewKeys.set(k, label);
  }
  const id = m.openrouter_id || null;
  if (id) {
    if (seenNewIds.has(id)) problems.push(`duplicate openrouter_id ${id} (also on "${seenNewIds.get(id)}")`);
    else seenNewIds.set(id, label);
  }

  // duplicates against verified models.json or the previously discovered backlog
  if (keysFor(m).some(k => knownKeys.has(k))) problems.push('duplicates an entry already in models.json or the existing backlog — scraper dedup miss');

  if (problems.length) issues.push({ name: label, problems });
});

// ── report ──
console.log(`## Candidate sanity review\n`);
console.log(`- Entries in file: ${candidate.models.length} (baseline ${baseline.models.length})`);
console.log(`- New entries reviewed: ${newEntries.length}`);
console.log(`- Flagged: ${issues.length}\n`);

if (newEntries.length === 0) {
  console.log('No new entries relative to baseline — nothing to review.');
  process.exit(0);
}

if (issues.length === 0) {
  console.log(`✅ All ${newEntries.length} new entries pass sanity checks (required fields, types, ranges, no duplicates).`);
  console.log('\nNew entries:');
  for (const m of newEntries) console.log(`- ${m.name} \`${m._source}\``);
  process.exit(0);
}

console.log(`### ⚠️ ${issues.length} entr${issues.length === 1 ? 'y needs' : 'ies need'} human review\n`);
for (const i of issues) {
  console.log(`**${i.name}**`);
  for (const p of i.problems) console.log(`- ${p}`);
  console.log('');
}
const clean = newEntries.length - issues.length;
if (clean > 0) console.log(`(${clean} other new entr${clean === 1 ? 'y' : 'ies'} passed all checks.)`);
process.exit(1);
