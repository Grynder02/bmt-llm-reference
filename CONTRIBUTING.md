# Contributing to BMT LLM Reference

The source of truth is one file: **`data/models.json`**

All PRs that modify it get automatically validated by CI before merge. If the schema check fails, the PR won't merge. That's intentional — it keeps the data clean.

---

## Adding or updating a model

1. Fork the repo
2. Edit `data/models.json`
3. Add your entry following the schema below (or update an existing one)
4. Open a PR — CI runs automatically

---

## Field reference

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | ✅ | Unique. Include size/variant in name e.g. "Qwen 3 7B" |
| `provider` | string | ✅ | Company name |
| `type` | `"cloud"` or `"local"` | ✅ | |
| `tags` | array | ✅ | From: `coding reasoning vision speed agents writing multimodal math embedding` |
| `desc` | string | ✅ | 1–3 sentences. What it's actually good for. No marketing copy. |
| `api_string` | string | ✅ | Exact API model string or `ollama pull` command |
| `free_tier` | boolean | ✅ | `true` if a meaningful free tier exists (OpenRouter free, open-weight, etc.) |
| `openrouter_id` | string or null | | OpenRouter model ID if available |
| `vram_gb` | number or null | | VRAM at the default/recommended quant. Local models only. |
| `vram_note` | string or null | | Quant level the vram_gb refers to |
| `moe` | boolean | ✅ | Mixture of Experts architecture |
| `active_params_b` | number or null | | Active params at inference time (MoE models) |
| `total_params_b` | number or null | | Total parameter count |
| `quants` | array or null | | Array of `{ type, vram_gb }` objects. Local models only. |
| `gpu_tiers` | array or null | | Named GPUs this model runs clean on (fits fully in VRAM) |
| `arc_tested` | boolean or null | | `true` if confirmed working on Intel Arc / iGPU. `false` if tested and broken. `null` if untested. |
| `context_k` | number | ✅ | Advertised max context in thousands of tokens |
| `reliable_context_k` | number | ✅ | Context length where quality is actually solid (often much less than max) |
| `tool_reliability` | 1–5 or null | | 1=unusable, 3=works with prompt tuning, 5=rock solid. Subjective but useful. |
| `swe_bench` | number or null | | SWE-bench Verified score (%) |
| `gpqa_diamond` | number or null | | GPQA Diamond score (%) |
| `updated` | string | ✅ | When the model was released/updated. Format: `YYYY-MM` |
| `last_verified` | string | ✅ | When you last confirmed this entry is accurate. Format: `YYYY-MM`. CI warns if > 6 months old. |

---

## Quant table format

```json
"quants": [
  { "type": "Q2_K",   "vram_gb": 3  },
  { "type": "Q4_K_M", "vram_gb": 6  },
  { "type": "Q5_K_M", "vram_gb": 7  },
  { "type": "Q8_0",   "vram_gb": 9  }
]
```

Only include quants that are actually available. Don't guess VRAM numbers — measure or cite a source.

---

## Arc/Intel iGPU testing

If you've run a model on Arc (A770, A380, etc.) or Intel integrated graphics (Core Ultra iGPU):
- Set `arc_tested: true` if it ran correctly via IPEX-LLM or llama.cpp SYCL backend
- Set `arc_tested: false` if you tested and it didn't work
- Leave `arc_tested: null` if you haven't tried

Note any Arc-specific quirks in the `desc` field.

---

## Tool reliability rating

Rate 1–5 based on actual use with tool/function calling:

- **5** — Calls tools correctly on the first try, rare hallucinated params, handles multi-tool sequences cleanly
- **4** — Generally reliable, occasional format drift with complex schemas
- **3** — Works but needs prompt tuning; struggles with nested schemas
- **2** — Unreliable, frequent hallucinated calls or dropped params
- **1** — Basically unusable for tool calling

Set `null` if you haven't tested tool calling.

---

## What makes a good PR

✅ You've actually run the model and can verify the data  
✅ VRAM numbers come from a real measurement at the stated quant  
✅ `last_verified` is set to the current month  
✅ `desc` is honest — don't copy the marketing card  
✅ `reliable_context_k` is lower than `context_k` unless you've verified quality holds  

❌ Don't add a model just because it exists — add it because you have something useful to say about it  
❌ Don't inflate `tool_reliability` — this is the field people actually depend on for agent work  
❌ Don't guess at VRAM numbers  

---

## Embedding as a widget

Deploy to Vercel (one click from GitHub) then embed anywhere:

```html
<iframe
  src="https://your-vercel-url.vercel.app"
  width="100%"
  height="700"
  frameborder="0"
  style="border-radius: 12px; border: 1px solid #2a2a2a;"
></iframe>
```

The widget auto-updates when `main` merges — no manual redeploy needed.
