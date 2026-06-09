import { useState, useMemo } from 'react'
import modelsData from '../data/models.json'

// ─── design tokens ────────────────────────────────────────────────────────────
const C = {
  bg:       '#0f0f0f',
  surface:  '#1a1a1a',
  card:     '#1e1e1e',
  border:   '#2a2a2a',
  border2:  '#383838',
  text:     '#e5e5e5',
  muted:    '#888',
  dim:      '#555',
  accent:   '#00d4aa',
  accentDim:'#00d4aa22',
}

const TAG_STYLE = {
  coding:     { bg: '#0f2e24', text: '#4ade80', border: '#166534' },
  reasoning:  { bg: '#1e1b4b', text: '#a5b4fc', border: '#3730a3' },
  vision:     { bg: '#0c1a2e', text: '#60a5fa', border: '#1d4ed8' },
  speed:      { bg: '#1a2e0f', text: '#86efac', border: '#15803d' },
  agents:     { bg: '#2d0f2e', text: '#e879f9', border: '#7e22ce' },
  writing:    { bg: '#2e1f0f', text: '#fbbf24', border: '#b45309' },
  multimodal: { bg: '#2e150f', text: '#f97316', border: '#c2410c' },
  math:       { bg: '#2e0f0f', text: '#f87171', border: '#b91c1c' },
  embedding:  { bg: '#1a1a1a', text: '#a1a1aa', border: '#3f3f46' },
}

const PROVIDER_STYLE = {
  'Anthropic':        { bg: '#1e1433', text: '#c084fc' },
  'OpenAI':           { bg: '#0f2e1e', text: '#4ade80' },
  'OpenAI (OSS)':     { bg: '#0f2e1e', text: '#34d399' },
  'Google':           { bg: '#0c1a2e', text: '#60a5fa' },
  'Meta':             { bg: '#2e1f0f', text: '#fb923c' },
  'xAI':              { bg: '#1a1a1a', text: '#e5e5e5' },
  'DeepSeek':         { bg: '#0f2e2e', text: '#2dd4bf' },
  'Mistral':          { bg: '#2e1a0f', text: '#f97316' },
  'Qwen (Alibaba)':   { bg: '#2e2a0f', text: '#facc15' },
  'Microsoft':        { bg: '#0c1a2e', text: '#38bdf8' },
  'Moonshot':         { bg: '#0f1a2e', text: '#818cf8' },
  'Nomic':            { bg: '#1a1a1a', text: '#a1a1aa' },
}

const ALL_TAGS = ['coding','reasoning','vision','speed','agents','writing','multimodal','math','embedding']

const GPU_OPTIONS = [
  'Any',
  'GTX 1060 (6GB)',
  'GTX 1660 Ti (6GB)',
  'GTX 1080 Ti (11GB)',
  'RTX 3060 (12GB)',
  'RTX 3080 (10GB)',
  'RTX 3080 Ti (12GB)',
  'RTX 3090 (24GB)',
  'RTX 4070 Ti (16GB)',
  'RTX 4090 (24GB)',
  'Arc A380 (6GB)',
  'Arc A770 (16GB)',
  'RTX 6000 Ada (48GB)',
  'A5000 (24GB)',
  'A6000 (48GB)',
  'A100 (80GB)',
  'H100 (80GB)',
  'iGPU (shared)',
  'CPU',
]

// ─── helpers ──────────────────────────────────────────────────────────────────
function reliabilityDots(score) {
  if (score === null) return <span style={{ color: C.dim, fontSize: 11 }}>unknown</span>
  return (
    <span style={{ letterSpacing: 1 }}>
      {[1,2,3,4,5].map(i => (
        <span key={i} style={{ color: i <= score ? '#00d4aa' : C.dim, fontSize: 13 }}>●</span>
      ))}
    </span>
  )
}

function staleWarning(last_verified) {
  if (!last_verified) return null
  const [y, mo] = last_verified.split('-').map(Number)
  const verified = new Date(y, mo - 1)
  const now = new Date()
  const months = (now.getFullYear() - verified.getFullYear()) * 12 + (now.getMonth() - verified.getMonth())
  if (months > 4) return <span title={`Last verified: ${last_verified}`} style={{ color: '#f59e0b', fontSize: 11 }}>⚠ {last_verified}</span>
  return <span style={{ color: C.dim, fontSize: 11 }}>✓ {last_verified}</span>
}

// ─── components ───────────────────────────────────────────────────────────────

function QuantTable({ quants }) {
  if (!quants || quants.length === 0) return null
  return (
    <div style={{ marginTop: 8, borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
      <div style={{ fontSize: 10, color: C.dim, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Quantizations</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {quants.map(q => (
          <div key={q.type} style={{
            background: C.surface, border: `1px solid ${C.border2}`,
            borderRadius: 4, padding: '2px 7px', fontSize: 11,
            display: 'flex', gap: 5, alignItems: 'center'
          }}>
            <span style={{ color: C.muted, fontFamily: 'monospace' }}>{q.type}</span>
            <span style={{ color: C.accent, fontWeight: 600 }}>{q.vram_gb}GB</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function GpuTiers({ tiers }) {
  if (!tiers || tiers.length === 0) return null
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ fontSize: 10, color: C.dim, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Runs on</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
        {tiers.map(g => (
          <span key={g} style={{
            fontSize: 10, padding: '2px 6px',
            background: '#0f1f0f', color: '#4ade80',
            border: '1px solid #166534', borderRadius: 3
          }}>{g}</span>
        ))}
      </div>
    </div>
  )
}

function ModelCard({ m, selectedGpu }) {
  const [expanded, setExpanded] = useState(false)
  const ps = PROVIDER_STYLE[m.provider] || { bg: '#1a1a1a', text: '#aaa' }

  const gpuMatch = selectedGpu === 'Any' || (m.gpu_tiers && m.gpu_tiers.some(g => g.includes(selectedGpu.split(' ')[0])))

  return (
    <div style={{
      background: C.card,
      border: `1px solid ${gpuMatch && selectedGpu !== 'Any' ? '#166534' : C.border}`,
      borderRadius: 10,
      padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 8,
      opacity: (!gpuMatch && selectedGpu !== 'Any') ? 0.35 : 1,
      transition: 'opacity 0.15s, border-color 0.15s',
      cursor: 'pointer',
    }} onClick={() => setExpanded(e => !e)}>

      {/* top row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.text, lineHeight: 1.3 }}>
          {m.name}
          {m.moe && <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 5px', background: '#2d1a0f', color: '#fb923c', border: '1px solid #c2410c', borderRadius: 3 }}>MoE</span>}
          {m.arc_tested && <span style={{ marginLeft: 5, fontSize: 10, padding: '1px 5px', background: '#0c1420', color: '#38bdf8', border: '1px solid #0369a1', borderRadius: 3 }}>Arc ✓</span>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 100, background: ps.bg, color: ps.text, fontWeight: 500, whiteSpace: 'nowrap' }}>
            {m.provider}
          </span>
          {m.free_tier && (
            <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 100, background: '#0f2e1e', color: '#4ade80', border: '1px solid #166534' }}>
              FREE tier
            </span>
          )}
        </div>
      </div>

      {/* desc */}
      <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>{m.desc}</div>

      {/* tags */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {m.tags.map(t => {
          const ts = TAG_STYLE[t] || {}
          return (
            <span key={t} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: ts.bg, color: ts.text, border: `1px solid ${ts.border}` }}>
              {t}
            </span>
          )
        })}
      </div>

      {/* quick stats row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
        {m.vram_gb !== null && (
          <div>
            <div style={{ fontSize: 10, color: C.dim, marginBottom: 1 }}>VRAM</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.accent }}>{m.vram_gb}GB <span style={{ fontWeight: 400, color: C.muted, fontSize: 11 }}>({m.vram_note})</span></div>
          </div>
        )}
        {m.context_k && (
          <div>
            <div style={{ fontSize: 10, color: C.dim, marginBottom: 1 }}>Max ctx</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{m.context_k}K</div>
          </div>
        )}
        {m.reliable_context_k && (
          <div>
            <div style={{ fontSize: 10, color: C.dim, marginBottom: 1 }}>Reliable ctx</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#fbbf24' }}>{m.reliable_context_k}K</div>
          </div>
        )}
        {m.swe_bench !== null && (
          <div>
            <div style={{ fontSize: 10, color: C.dim, marginBottom: 1 }}>SWE-bench</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#a5b4fc' }}>{m.swe_bench}%</div>
          </div>
        )}
        {m.gpqa_diamond !== null && (
          <div>
            <div style={{ fontSize: 10, color: C.dim, marginBottom: 1 }}>GPQA ◆</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#c084fc' }}>{m.gpqa_diamond}%</div>
          </div>
        )}
        {m.moe && m.active_params_b !== null && (
          <div>
            <div style={{ fontSize: 10, color: C.dim, marginBottom: 1 }}>Active / Total</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#fb923c' }}>{m.active_params_b}B / {m.total_params_b}B</div>
          </div>
        )}
        {!m.moe && m.total_params_b !== null && (
          <div>
            <div style={{ fontSize: 10, color: C.dim, marginBottom: 1 }}>Params</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.muted }}>{m.total_params_b}B</div>
          </div>
        )}
        <div>
          <div style={{ fontSize: 10, color: C.dim, marginBottom: 2 }}>Tool reliability</div>
          {reliabilityDots(m.tool_reliability)}
        </div>
      </div>

      {/* expanded section */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
          <QuantTable quants={m.quants} />
          <GpuTiers tiers={m.gpu_tiers} />

          <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {m.openrouter_id && (
              <div>
                <div style={{ fontSize: 10, color: C.dim, marginBottom: 2 }}>OpenRouter ID</div>
                <code style={{ fontSize: 11, color: '#60a5fa', background: '#0c1a2e', padding: '2px 6px', borderRadius: 3 }}>{m.openrouter_id}</code>
              </div>
            )}
            <div>
              <div style={{ fontSize: 10, color: C.dim, marginBottom: 2 }}>{m.type === 'local' ? 'Pull command' : 'API model string'}</div>
              <code style={{ fontSize: 11, color: C.accent, background: C.surface, padding: '2px 6px', borderRadius: 3 }}>{m.api_string}</code>
            </div>
          </div>

          <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ fontSize: 10, color: C.dim }}>Last verified:</div>
            {staleWarning(m.last_verified)}
          </div>
        </div>
      )}

      <div style={{ fontSize: 10, color: C.dim, textAlign: 'right', marginTop: -4 }}>
        {expanded ? '▲ less' : '▼ more'}
      </div>
    </div>
  )
}

// ─── main app ─────────────────────────────────────────────────────────────────
export default function App() {
  const [q, setQ]                 = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [tagFilter, setTagFilter]  = useState('all')
  const [gpuFilter, setGpuFilter]  = useState('Any')
  const [freeOnly, setFreeOnly]    = useState(false)
  const [moeOnly, setMoeOnly]      = useState(false)
  const [arcOnly, setArcOnly]      = useState(false)

  const models = modelsData.models

  const filtered = useMemo(() => {
    const lq = q.toLowerCase()
    return models.filter(m => {
      if (lq && !m.name.toLowerCase().includes(lq) &&
          !m.provider.toLowerCase().includes(lq) &&
          !m.desc.toLowerCase().includes(lq) &&
          !m.tags.some(t => t.includes(lq))) return false
      if (typeFilter === 'cloud' && m.type !== 'cloud') return false
      if (typeFilter === 'local' && m.type !== 'local') return false
      if (tagFilter !== 'all' && !m.tags.includes(tagFilter)) return false
      if (freeOnly && !m.free_tier) return false
      if (moeOnly && !m.moe) return false
      if (arcOnly && m.arc_tested !== true) return false
      return true
    })
  }, [q, typeFilter, tagFilter, gpuFilter, freeOnly, moeOnly, arcOnly, models])

  const cloud = filtered.filter(m => m.type === 'cloud')
  const local = filtered.filter(m => m.type === 'local')

  const btnStyle = (active) => ({
    fontSize: 12, padding: '5px 12px',
    border: `1px solid ${active ? C.accent : C.border2}`,
    borderRadius: 100, cursor: 'pointer', fontWeight: 500,
    background: active ? C.accentDim : 'transparent',
    color: active ? C.accent : C.muted,
    transition: 'all .15s',
  })

  const toggleStyle = (active) => ({
    fontSize: 11, padding: '4px 10px',
    border: `1px solid ${active ? '#fbbf24' : C.border2}`,
    borderRadius: 100, cursor: 'pointer',
    background: active ? '#2e2a0f' : 'transparent',
    color: active ? '#fbbf24' : C.muted,
    transition: 'all .15s',
  })

  return (
    <div style={{ background: C.bg, minHeight: '100vh', padding: '20px 16px', color: C.text }}>

      {/* header */}
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ marginBottom: 20, borderBottom: `1px solid ${C.border}`, paddingBottom: 16 }}>

          {/* title row */}
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text }}>BMT LLM Reference</h1>
              <span style={{ fontSize: 12, color: C.dim }}>June 2026 · {models.length} models</span>
            </div>
            <a
              href="https://github.com/Grynder02/bmt-llm-reference"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 12, color: C.muted,
                padding: '4px 10px',
                border: `1px solid ${C.border2}`,
                borderRadius: 6,
                textDecoration: 'none',
                flexShrink: 0,
                transition: 'color 0.15s, border-color 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = C.accent; e.currentTarget.style.borderColor = C.accent }}
              onMouseLeave={e => { e.currentTarget.style.color = C.muted; e.currentTarget.style.borderColor = C.border2 }}
            >
              <svg height="14" width="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
              </svg>
              GitHub
            </a>
          </div>

          <p style={{ fontSize: 12, color: C.dim, marginBottom: 14 }}>
            Cloud + local models · VRAM by quant · GPU tier filter · tool-call reliability · Arc/iGPU tested · free-tier flag · MoE flag · reliable vs max context
          </p>

          {/* search */}
          <input
            value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search models, providers, capabilities..."
            style={{
              width: '100%', padding: '9px 14px', fontSize: 13,
              border: `1px solid ${C.border2}`, borderRadius: 8,
              background: C.surface, color: C.text, marginBottom: 12, outline: 'none',
            }}
          />

          {/* type filter */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {['all','cloud','local'].map(f => (
              <button key={f} onClick={() => setTypeFilter(f)} style={btnStyle(typeFilter === f)}>
                {f === 'all' ? 'All types' : f === 'cloud' ? '☁ Cloud' : '⬛ Local'}
              </button>
            ))}
            <div style={{ width: 1, background: C.border2, margin: '0 4px' }} />
            {ALL_TAGS.map(t => (
              <button key={t} onClick={() => setTagFilter(tagFilter === t ? 'all' : t)} style={btnStyle(tagFilter === t)}>
                {t}
              </button>
            ))}
          </div>

          {/* toggles row */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <button onClick={() => setFreeOnly(f => !f)} style={toggleStyle(freeOnly)}>FREE tier only</button>
            <button onClick={() => setMoeOnly(f => !f)} style={toggleStyle(moeOnly)}>MoE only</button>
            <button onClick={() => setArcOnly(f => !f)} style={toggleStyle(arcOnly)}>Arc/Intel tested</button>
            <div style={{ marginLeft: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: C.dim }}>GPU filter:</span>
              <select value={gpuFilter} onChange={e => setGpuFilter(e.target.value)} style={{
                fontSize: 12, padding: '4px 8px', background: C.surface,
                color: C.text, border: `1px solid ${C.border2}`, borderRadius: 6, cursor: 'pointer',
              }}>
                {GPU_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <span style={{ fontSize: 12, color: C.dim, marginLeft: 'auto' }}>{filtered.length} shown</span>
          </div>
        </div>

        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', color: C.muted, padding: '3rem', fontSize: 14 }}>No models match. Clear some filters.</div>
        )}

        {/* VRAM tier quick ref — local only */}
        {(typeFilter === 'local' || typeFilter === 'all') && local.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>VRAM tier guide</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {[
                { label: '≤6GB', desc: '3–4B models (Phi-4 Mini, Gemma E4B, R1 7B)', color: '#4ade80' },
                { label: '8–12GB', desc: '7–12B class (Qwen 3 7B, Llama 8B, Nemo 12B)', color: '#60a5fa' },
                { label: '14–20GB', desc: '20–24B (Mistral Small, gpt-oss 20B)', color: '#a5b4fc' },
                { label: '22–24GB', desc: '27–32B (Qwen 3.6 27B, R1 32B, Kimi K2.6)', color: '#c084fc' },
                { label: '43–55GB', desc: '70B class + Llama 4 Scout (2x GPU)', color: '#fb923c' },
                { label: '96GB+', desc: 'Llama 4 Maverick (multi-GPU)', color: '#f87171' },
              ].map(t => (
                <div key={t.label} style={{ background: C.surface, border: `1px solid ${C.border2}`, borderRadius: 6, padding: '5px 10px', fontSize: 11 }}>
                  <span style={{ fontWeight: 700, color: t.color }}>{t.label}</span>
                  <span style={{ color: C.muted, marginLeft: 6 }}>{t.desc}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* cloud section */}
        {cloud.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '8px 0 10px' }}>
              ☁ Cloud / Frontier — {cloud.length} models
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 10, marginBottom: 24 }}>
              {cloud.map(m => <ModelCard key={m.name+m.provider} m={m} selectedGpu={gpuFilter} />)}
            </div>
          </>
        )}

        {/* local section */}
        {local.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '8px 0 10px' }}>
              ⬛ Local / Self-hosted (Ollama · LM Studio · llama.cpp) — {local.length} models
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 10, marginBottom: 24 }}>
              {local.map(m => <ModelCard key={m.name+m.provider} m={m} selectedGpu={gpuFilter} />)}
            </div>
          </>
        )}

        {/* footer */}
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14, fontSize: 11, color: C.dim, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <span>BMT LLM Reference · github.com/Grynder02/bmt-llm-reference · CC BY 4.0</span>
          <span>PRs welcome — edit <code style={{ color: C.muted }}>data/models.json</code> · CI validates schema automatically</span>
        </div>
      </div>
    </div>
  )
}
