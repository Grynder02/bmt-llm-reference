#!/usr/bin/env node
/**
 * BMT LLM Reference — Nightly Model Scraper
 * 
 * Hits Ollama library + OpenRouter /models APIs, compares against
 * existing models.json entries, and writes a new-models.json file
 * with any additions using the full schema with nulls for unverified fields.
 * 
 * GitHub Actions then opens a draft PR so a human can fill in the gaps
 * before merging into the verified dataset.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const MODELS_PATH = path.join(__dirname, '../data/models.json');
const OUTPUT_PATH = path.join(__dirname, '../data/auto-discovered.json');
const LOG_PATH    = path.join(__dirname, '../data/scrape-log.json');

// ── helpers ──────────────────────────────────────────────────────────────────

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'bmt-llm-reference/scraper' } }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse failed for ${url}: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error(`Timeout: ${url}`)); });
  });
}

function ym() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

function blankModel(overrides = {}) {
  return {
    name:               overrides.name        || null,
    provider:           overrides.provider    || null,
    type:               overrides.type        || null,
    tags:               overrides.tags        || [],
    desc:               overrides.desc        || "⚠ Auto-discovered — description needed. Edit before merging.",
    api_string:         overrides.api_string  || null,
    free_tier:          overrides.free_tier   ?? null,
    openrouter_id:      overrides.openrouter_id || null,
    vram_gb:            null,
    vram_note:          null,
    moe:                overrides.moe         ?? false,
    active_params_b:    overrides.active_params_b || null,
    total_params_b:     overrides.total_params_b  || null,
    quants:             null,
    gpu_tiers:          null,
    arc_tested:         null,
    context_k:          overrides.context_k   || null,
    reliable_context_k: null,
    tool_reliability:   null,
    swe_bench:          null,
    gpqa_diamond:       null,
    updated:            overrides.updated     || ym(),
    last_verified:      "UNVERIFIED",
    _source:            overrides._source     || "auto",
    _needs_review:      true,
  };
}

// ── tag inference from model name/description ─────────────────────────────

function inferTags(name, desc = '') {
  const s = (name + ' ' + desc).toLowerCase();
  const tags = [];
  if (/embed|embedding|e5|bge|nomic|sentence/.test(s))          tags.push('embedding');
  if (/coder|code|starcoder|deepseek-coder|qwen.*coder/.test(s)) tags.push('coding');
  if (/reason|r1|think|chain.of.thought|math|o\d/.test(s))      tags.push('reasoning');
  if (/vision|vl|llava|visual|image|multimodal|bakllava/.test(s)) tags.push('vision');
  if (/flash|fast|mini|tiny|small|lite|nano/.test(s))            tags.push('speed');
  if (/math|math|aime|competition/.test(s))                      tags.push('math');
  if (/instruct|chat|assistant/.test(s) && !tags.length)         tags.push('writing');
  return tags.length ? [...new Set(tags)] : ['writing'];
}

function inferProvider(name, orProvider = '') {
  const s = (name + ' ' + orProvider).toLowerCase();
  if (/anthropic|claude/.test(s))   return 'Anthropic';
  if (/openai|gpt|o1|o3|o4/.test(s)) return 'OpenAI';
  if (/google|gemini|gemma/.test(s)) return 'Google';
  if (/meta|llama/.test(s))          return 'Meta';
  if (/mistral|mixtral/.test(s))     return 'Mistral';
  if (/deepseek/.test(s))            return 'DeepSeek';
  if (/qwen|alibaba/.test(s))        return 'Qwen (Alibaba)';
  if (/microsoft|phi/.test(s))       return 'Microsoft';
  if (/xai|grok/.test(s))            return 'xAI';
  if (/moonshot|kimi/.test(s))       return 'Moonshot';
  if (/nomic/.test(s))               return 'Nomic';
  if (/cohere/.test(s))              return 'Cohere';
  if (/01\.ai|yi/.test(s))           return '01.AI';
  if (/nvidia|nemotron/.test(s))     return 'NVIDIA';
  if (orProvider) return orProvider;
  return 'Unknown';
}

// ── scrapers ─────────────────────────────────────────────────────────────────

async function scrapeOllama() {
  console.log('→ Scraping Ollama library...');
  const results = [];
  try {
    // Ollama doesn't have a public JSON API for the full library,
    // but the search endpoint returns paginated results
    const pages = [
      'https://ollama.com/api/tags?limit=100&offset=0',
      'https://ollama.com/api/tags?limit=100&offset=100',
      'https://ollama.com/api/tags?limit=100&offset=200',
    ];
    
    for (const url of pages) {
      try {
        const data = await get(url);
        const models = data.models || data.results || [];
        for (const m of models) {
          const name = m.name || m.model || '';
          if (!name) continue;
          results.push({
            name,
            pulls: m.pull_count || 0,
            tags: m.tags || [],
            desc: m.description || '',
            updated: m.updated_at ? m.updated_at.slice(0,7) : ym(),
          });
        }
      } catch (e) {
        console.warn(`  Ollama page failed: ${url} — ${e.message}`);
      }
    }

    // Fallback: try the library search endpoint
    if (results.length === 0) {
      const search = await get('https://ollama.com/api/models?q=&sort=downloads&limit=100');
      const models = search.models || search.results || [];
      for (const m of models) {
        const name = m.name || m.namespace_model || '';
        if (!name) continue;
        results.push({
          name,
          pulls: m.pull_count || 0,
          desc: m.description || '',
          updated: m.updated_at ? m.updated_at.slice(0,7) : ym(),
        });
      }
    }
  } catch (e) {
    console.warn(`  Ollama scrape failed: ${e.message}`);
  }
  console.log(`  Found ${results.length} Ollama entries`);
  return results;
}

async function scrapeOpenRouter() {
  console.log('→ Scraping OpenRouter /models...');
  const results = [];
  try {
    const data = await get('https://openrouter.ai/api/v1/models');
    const models = data.data || [];
    for (const m of models) {
      const id = m.id || '';
      const name = m.name || id.split('/').pop() || '';
      if (!name || !id) continue;

      // Parse context window
      let context_k = null;
      if (m.context_length) context_k = Math.round(m.context_length / 1000);

      // Detect MoE from description
      const isMoe = /mixture.of.experts|moe|\bmoe\b/i.test(m.description || '');

      // Parse param count from name/description
      let total_params_b = null;
      const paramMatch = (m.name + ' ' + (m.description||'')).match(/(\d+(?:\.\d+)?)\s*[Bb](?:\s|$|,|-)/);
      if (paramMatch) total_params_b = parseFloat(paramMatch[1]);

      // Free tier: pricing input === "0"
      const isFree = m.pricing?.prompt === '0' || m.pricing?.prompt === 0;

      const providerName = (m.id||'').split('/')[0] || '';

      results.push({
        id,
        name,
        provider: providerName,
        desc: m.description || '',
        context_k,
        isMoe,
        total_params_b,
        isFree,
        updated: ym(),
      });
    }
  } catch (e) {
    console.warn(`  OpenRouter scrape failed: ${e.message}`);
  }
  console.log(`  Found ${results.length} OpenRouter entries`);
  return results;
}

async function scrapeHuggingFaceTrending() {
  console.log('→ Scraping HuggingFace trending text-generation models...');
  const results = [];
  try {
    // HF API: trending models, text-generation task, sorted by likes/downloads
    const url = 'https://huggingface.co/api/models?pipeline_tag=text-generation&sort=downloads&direction=-1&limit=50&full=false';
    const data = await get(url);
    for (const m of data) {
      const id = m.modelId || m.id || '';
      if (!id) continue;
      const name = id.split('/').pop() || id;
      const provider = id.split('/')[0] || 'Unknown';
      results.push({
        id,
        name,
        provider,
        downloads: m.downloads || 0,
        likes: m.likes || 0,
        updated: m.lastModified ? m.lastModified.slice(0,7) : ym(),
      });
    }
  } catch (e) {
    console.warn(`  HuggingFace scrape failed: ${e.message}`);
  }

  // Also grab trending embedding models
  try {
    const url = 'https://huggingface.co/api/models?pipeline_tag=sentence-similarity&sort=downloads&direction=-1&limit=20&full=false';
    const data = await get(url);
    for (const m of data) {
      const id = m.modelId || m.id || '';
      if (!id) continue;
      const name = id.split('/').pop() || id;
      results.push({
        id, name,
        provider: id.split('/')[0] || 'Unknown',
        downloads: m.downloads || 0,
        likes: m.likes || 0,
        isEmbedding: true,
        updated: m.lastModified ? m.lastModified.slice(0,7) : ym(),
      });
    }
  } catch (e) {
    console.warn(`  HuggingFace embedding scrape failed: ${e.message}`);
  }

  console.log(`  Found ${results.length} HuggingFace entries`);
  return results;
}

// ── dedup + merge ─────────────────────────────────────────────────────────────

function normalizeKey(name) {
  return String(name || '').toLowerCase()
    .replace(/^[^:]+:\s+/, '')                    // drop "Provider: " prefix (OpenRouter display names use ": "; Ollama size tags like "gpt-oss:20b" have no space and must survive)
    .replace(/\([^)]*\)/g, ' ')                   // drop parenthetical annotations like "(MoE)"
    .replace(/[-_.:/\s]+/g, ' ')                  // unify separators BEFORE word-stripping so \b works
    .replace(/\b(instruct|instruction|chat|it|hf|gguf|awq|gptq|fp8|fp16|bf16)\b/g, ' ')
    .replace(/\bq\d\w*\b/g, ' ')                  // quant tokens (q4, q4_k_m, q8_0) as whole words only
    .replace(/[^a-z0-9]/g, '');
}

// Keys for every way a model is commonly referred to: display name plus the
// last path segment of its OpenRouter/HF id (e.g. "meta-llama/llama-3.3-70b").
function keysFor(m) {
  const keys = [];
  const nameKey = normalizeKey(m.name);
  if (nameKey) keys.push(nameKey);
  const id = m.openrouter_id || m.api_string || m.id || '';
  const idTail = String(id).split('/').pop();
  const idKey = normalizeKey(idTail);
  if (idKey) keys.push(idKey);
  return keys;
}

function buildKnownKeys(models) {
  const known = new Set();
  for (const m of models) for (const k of keysFor(m)) known.add(k);
  return known;
}

// Exact key match only. The old substring check (ek.includes(nk)) collapsed
// distinct versions — "Opus 4.8" normalized to a superstring of "Opus 4",
// so every new release of a known family was silently skipped.
function alreadyKnown(model, knownKeys) {
  const keys = keysFor(model);
  if (keys.length === 0) return true; // unusable name — treat as noise
  return keys.some(k => knownKeys.has(k));
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n=== BMT LLM Reference — Nightly Scraper ===\n');

  // Load existing models
  const existing = JSON.parse(fs.readFileSync(MODELS_PATH, 'utf8'));
  const existingModels = existing.models;
  console.log(`Existing verified models: ${existingModels.length}`);

  // Load previously auto-discovered (so we don't re-add)
  let prevAuto = { models: [] };
  if (fs.existsSync(OUTPUT_PATH)) {
    try { prevAuto = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8')); }
    catch (e) { console.warn('Could not read previous auto-discovered.json'); }
  }
  // Known = verified models + everything previously auto-discovered.
  // Track keys in a Set so dedup is exact-match and also covers duplicates
  // between sources within this same run (a model on both OpenRouter and
  // Ollama gets added once, by whichever source hits first).
  const knownKeys = buildKnownKeys([...existingModels, ...prevAuto.models]);

  const newEntries = [];
  const log = { date: new Date().toISOString(), sources: {}, new_count: 0 };

  function claim(m) {
    if (alreadyKnown(m, knownKeys)) return false;
    for (const k of keysFor(m)) knownKeys.add(k);
    return true;
  }

  // ── OpenRouter ──
  const orModels = await scrapeOpenRouter();
  log.sources.openrouter = { found: orModels.length, added: 0 };
  for (const m of orModels) {
    // Skip obvious noise: very short names, test models, etc
    if (m.name.length < 3) continue;
    if (/test|demo|example|preview-\d{8}/.test(m.name.toLowerCase())) continue;
    if (!claim(m)) continue;

    const entry = blankModel({
      name:          m.name,
      provider:      inferProvider(m.name, m.provider),
      type:          'cloud',
      tags:          inferTags(m.name, m.desc),
      desc:          m.desc ? m.desc.slice(0, 200) + (m.desc.length > 200 ? '…' : '') : blankModel().desc,
      api_string:    m.id,
      free_tier:     m.isFree,
      openrouter_id: m.id,
      moe:           m.isMoe,
      total_params_b: m.total_params_b,
      context_k:     m.context_k,
      updated:       m.updated,
      _source:       'openrouter',
    });
    newEntries.push(entry);
    log.sources.openrouter.added++;
  }

  // ── Ollama ──
  const ollamaModels = await scrapeOllama();
  log.sources.ollama = { found: ollamaModels.length, added: 0 };
  for (const m of ollamaModels) {
    if (m.name.length < 3) continue;
    if (!claim(m)) continue;

    const entry = blankModel({
      name:       m.name,
      provider:   inferProvider(m.name),
      type:       'local',
      tags:       inferTags(m.name, m.desc),
      desc:       m.desc ? m.desc.slice(0, 200) : blankModel().desc,
      api_string: `ollama pull ${m.name}`,
      free_tier:  true,
      updated:    m.updated,
      _source:    'ollama',
    });
    newEntries.push(entry);
    log.sources.ollama.added++;
  }

  // ── HuggingFace ──
  const hfModels = await scrapeHuggingFaceTrending();
  log.sources.huggingface = { found: hfModels.length, added: 0 };
  for (const m of hfModels) {
    // Only include models with meaningful download counts to filter noise
    if ((m.downloads || 0) < 10000 && (m.likes || 0) < 50) continue;
    if (!claim(m)) continue;

    const entry = blankModel({
      name:       m.name,
      provider:   inferProvider(m.name, m.provider),
      type:       'local',
      tags:       m.isEmbedding ? ['embedding'] : inferTags(m.name),
      desc:       `⚠ Auto-discovered from HuggingFace (${(m.downloads||0).toLocaleString()} downloads). Description needed.`,
      api_string: `huggingface: ${m.id}`,
      free_tier:  true,
      updated:    m.updated,
      _source:    'huggingface',
    });
    newEntries.push(entry);
    log.sources.huggingface.added++;
  }

  log.new_count = newEntries.length;

  console.log(`\n✅ New entries found: ${newEntries.length}`);
  console.log(`   OpenRouter: +${log.sources.openrouter?.added || 0}`);
  console.log(`   Ollama:     +${log.sources.ollama?.added || 0}`);
  console.log(`   HuggingFace:+${log.sources.huggingface?.added || 0}`);

  // Accumulate: keep everything previously discovered and append this run's
  // finds. Writing only the new entries here (the old behavior) wiped the
  // backlog of unreviewed discoveries on every run.
  const combined = [...prevAuto.models, ...newEntries];

  const output = {
    _note: "Auto-discovered models. Fields with null need human verification before merging into models.json. DO NOT merge entries with last_verified: 'UNVERIFIED'.",
    generated: new Date().toISOString(),
    count: combined.length,
    models: combined,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));

  console.log(`\nWrote ${combined.length} entries (${newEntries.length} new) to data/auto-discovered.json`);

  // Exit code 2 if no new models (so CI can skip PR creation)
  if (newEntries.length === 0) {
    console.log('No new models found — skipping PR.');
    process.exit(2);
  }
  process.exit(0);
}

main().catch(e => { console.error('Scraper fatal error:', e); process.exit(1); });
