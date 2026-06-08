# BMT LLM Reference

> Community-maintained LLM model reference — cloud + local, VRAM by quant, GPU tier filter, tool-call reliability, Arc/Intel tested, free-tier flag, MoE flag, reliable vs max context.

**Nobody else has all of this in one place.** Most lists give you a benchmark table or a VRAM number. This gives you what you actually need to pick and deploy a model.

---

## What's in it

**For every model:**
- Capability tags: `coding` `reasoning` `vision` `speed` `agents` `writing` `multimodal` `math` `embedding`
- Free tier flag (OpenRouter free, open-weight, etc.)
- MoE vs dense flag + active/total param count
- Reliable context vs advertised max context (different numbers, both matter)
- Tool/function calling reliability (1–5, community-rated)
- SWE-bench and GPQA Diamond benchmarks where available
- Last verified date with staleness warning

**For local models additionally:**
- VRAM by quantization (Q2/Q4/Q5/Q8 side by side)
- Named GPU tiers — which specific GPUs run it clean
- Intel Arc / iGPU tested flag
- `ollama pull` command

**Widget features:**
- Filter by cloud/local, capability tag, free-tier, MoE, Arc-tested
- GPU model picker — dims models that don't fit your card
- Expand cards for quant table, GPU list, API strings, OpenRouter ID

---

## Embedding

```html
<iframe
  src="https://bmt-llm-reference.vercel.app"
  width="100%"
  height="700"
  frameborder="0"
  style="border-radius: 12px;"
></iframe>
```

---

## How models get in

**Two paths:**

### 1. Nightly auto-scraper (`.github/workflows/nightly-scrape.yml`)
Runs at 3am UTC daily. Hits OpenRouter `/models`, Ollama library, and HuggingFace trending. Any model not already in the dataset gets written to `data/auto-discovered.json` and a **draft PR** opens automatically.

Auto-discovered entries have:
- `last_verified: "UNVERIFIED"` — CI blocks these from merging into `models.json`
- `null` for all fields that need human input (VRAM, quants, GPU tiers, tool reliability, reliable context, Arc tested)
- A placeholder description

**To promote an auto entry into the verified dataset:** fill in the null fields, write a real description, set `last_verified` to the current month, move the entry into `models.json`, and push. CI validates on every commit.

### 2. Community PRs
Edit `data/models.json` directly. See [CONTRIBUTING.md](./CONTRIBUTING.md) for field definitions and what makes a good vs bad submission.

## CI gates

Every PR runs:
- JSON Schema validation (ajv)
- Duplicate name check
- UNVERIFIED entry rejection — auto-discovered entries cannot be merged into `models.json` without a real `last_verified` date
- Stale entry warning (> 6 months since last_verified)
- Full widget build check

---

## Stack

- Data: `data/models.json` (single source of truth)
- Schema: `schema/model.schema.json` (JSON Schema draft-07)
- CI: GitHub Actions — ajv validation + dupe check + stale warning
- Widget: React + Vite, deploys to Vercel
- License: CC BY 4.0

---

*Built by [@Grynder02](https://github.com/Grynder02) / BeastModeTechnologies under Fortunara, Inc.*
