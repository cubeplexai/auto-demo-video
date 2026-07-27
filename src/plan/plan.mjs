/**
 * Planner: scenario (+ optional code hints) → record-ready script.
 *
 * Deterministic expansion from scenario steps + light code scan for
 * testids/placeholders. Emits planner-prompt.md for optional agent rewrite.
 */
import { resolve } from 'node:path'
import {
  ensureDir,
  readYamlOrJson,
  writeJson,
  writeText,
  existsSync,
  readdirSync,
  statSync,
  readFileSync,
} from '../util/fs.mjs'

const DEFAULT_VIEWPORT = { width: 1920, height: 1080 }

/**
 * @param {{ scenarioPath: string, outDir: string, codeRoot?: string, adapter?: string }} opts
 */
export function planFromScenario(opts) {
  const scenario = readYamlOrJson(opts.scenarioPath)
  const adapter = opts.adapter || scenario.adapter || 'generic-web'
  const codeHints = collectCodeHints(scenario, opts.codeRoot)

  const scenes = groupStepsIntoScenes(scenario.steps || [])
  const script = {
    id: `script-${scenario.id}-${stamp()}`,
    scenarioId: scenario.id,
    title: scenario.title || scenario.id,
    adapter,
    baseUrl: scenario.baseUrl || process.env.BASE_URL || 'http://127.0.0.1:3000',
    viewport: scenario.viewport || DEFAULT_VIEWPORT,
    auth: scenario.auth || {
      emailEnv: 'DEMO_EMAIL',
      passwordEnv: 'DEMO_PASSWORD',
      storageState: 'storage-state.json',
    },
    /** Free-form options passed to the external adapter (never interpreted by core). */
    adapterOptions: scenario.adapterOptions || {},
    record: scenario.record || {
      // Default: do not film login / adapter setup
      includeAuth: false,
      startUrl: scenario.startUrl,
    },
    cinematic: scenario.cinematic || {
      enabled: true,
      scale: 2,
      zoomInMs: 480,
      zoomOutMs: 420,
    },
    scenes,
    captions: buildPlaceholderCaptions(scenes),
    codeHints,
    plannerNotes: buildPlannerNotes(scenario, codeHints),
  }

  ensureDir(opts.outDir)
  const scriptPath = resolve(opts.outDir, 'script.json')
  writeJson(scriptPath, script)

  const promptPath = resolve(opts.outDir, 'planner-prompt.md')
  writeText(promptPath, buildAgentPrompt(scenario, script, codeHints))

  return { script, scriptPath, promptPath }
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

function groupStepsIntoScenes(steps) {
  const scenes = []
  let current = null
  for (const step of steps) {
    const sceneId = step.scene || step.group || step.id
    if (!current || current.id !== sceneId) {
      current = {
        id: sceneId,
        title: step.label || step.caption || sceneId,
        caption: step.caption || step.label || '',
        highlight: Boolean(step.highlight),
        narration: step.narration || '',
        steps: [],
      }
      scenes.push(current)
    }
    current.steps.push(normalizeStep(step))
    if (step.highlight) current.highlight = true
  }
  return scenes
}

function normalizeStep(step) {
  return {
    id: step.id,
    kind: step.kind,
    label: step.label,
    caption: step.caption,
    cinematic: step.cinematic !== false,
    highlight: Boolean(step.highlight),
    url: step.url,
    selector: step.selector,
    role: step.role,
    name: step.name,
    text: step.text,
    prompt: step.prompt,
    ms: step.ms,
    custom: step.custom,
  }
}

function collectCodeHints(scenario, codeRoot) {
  const hints = { testids: [], placeholders: [], roles: [], filesScanned: [] }
  const roots = []
  if (codeRoot && existsSync(codeRoot)) roots.push(codeRoot)
  for (const h of scenario.codeHints || []) {
    const p = codeRoot ? resolve(codeRoot, h) : resolve(h)
    if (existsSync(p)) roots.push(p)
  }
  for (const root of roots) scanTree(root, hints, 0)
  hints.testids = [...new Set(hints.testids)].slice(0, 80)
  hints.placeholders = [...new Set(hints.placeholders)].slice(0, 40)
  hints.roles = [...new Set(hints.roles)].slice(0, 40)
  return hints
}

function scanTree(dir, hints, depth) {
  if (depth > 6) return
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const name of entries) {
    if (['node_modules', '.git', 'dist', 'coverage', '.next'].includes(name)) {
      continue
    }
    const p = resolve(dir, name)
    let st
    try {
      st = statSync(p)
    } catch {
      continue
    }
    if (st.isDirectory()) {
      scanTree(p, hints, depth + 1)
      continue
    }
    if (!/\.(tsx?|jsx?|vue|svelte)$/.test(name)) continue
    let src
    try {
      src = readFileSync(p, 'utf8')
    } catch {
      continue
    }
    if (hints.filesScanned.length < 200) hints.filesScanned.push(p)
    for (const m of src.matchAll(/data-testid=["'`]([^"'`]+)["'`]/g)) {
      hints.testids.push(m[1])
    }
    for (const m of src.matchAll(/placeholder=["'`]([^"'`]+)["'`]/g)) {
      hints.placeholders.push(m[1])
    }
    for (const m of src.matchAll(/getByRole\(\s*['"]([^'"]+)['"]/g)) {
      hints.roles.push(m[1])
    }
  }
}

function buildPlaceholderCaptions(scenes) {
  let t = 0
  return scenes.map((s) => {
    const start = t
    const end = t + 8
    t = end
    return {
      startSec: start,
      endSec: end,
      text: s.caption || s.title || s.id,
      lang: 'en',
    }
  })
}

function buildPlannerNotes(scenario, hints) {
  return [
    `Scenario: ${scenario.id}`,
    `Adapter: ${scenario.adapter || 'generic-web'}`,
    `Steps: ${(scenario.steps || []).length}`,
    `Code files scanned: ${hints.filesScanned.length}`,
    `Sample testids: ${hints.testids.slice(0, 8).join(', ') || '(none)'}`,
  ].join('\n')
}

function buildAgentPrompt(scenario, script, hints) {
  return `# Planner brief — auto-demo-video

Refine this record script if selectors or captions need product-specific polish.
Do **not** invent product claims. Prefer real testids/placeholders from the code scan.

## Scenario
\`\`\`json
${JSON.stringify(scenario, null, 2)}
\`\`\`

## Draft script
\`\`\`json
${JSON.stringify(script, null, 2)}
\`\`\`

## Code scan hints
- testids: ${hints.testids.slice(0, 30).join(', ') || '—'}
- placeholders: ${hints.placeholders.slice(0, 15).join(', ') || '—'}

## Output
Overwrite \`script.json\` with a valid DemoScript (see schemas/script.schema.json).
Keep step kinds in the allowed enum. Mark highlight steps for the edit stage.
`
}
