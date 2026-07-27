#!/usr/bin/env node
/**
 * auto-demo-video CLI
 *
 *   adv plan   --scenario path [--code-root path] [--out runs/x]
 *   adv record --script path [--out runs/x/record]
 *   adv edit   --meta path [--out runs/x/edit] [--target-sec 90]
 *   adv render --plan path [--out runs/x/render] [--export path]
 *   adv all    --scenario path [--code-root path] [--out runs/x]
 */
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { loadEnvFile, ensureDir } from '../src/util/fs.mjs'
import { planFromScenario } from '../src/plan/plan.mjs'
import { recordScript } from '../src/record/record.mjs'
import { buildEditPlan } from '../src/edit/edit.mjs'
import { renderPlan } from '../src/render/render.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

// Load local env if present
for (const p of [
  resolve(process.cwd(), 'config.env'),
  resolve(process.cwd(), '.env'),
  resolve(root, 'config.env'),
]) {
  loadEnvFile(p)
}

const args = process.argv.slice(2)
const cmd = args[0] || 'help'

function flag(name, fallback) {
  const i = args.indexOf(name)
  if (i >= 0) return args[i + 1]
  const pref = `${name}=`
  const hit = args.find((a) => a.startsWith(pref))
  return hit ? hit.slice(pref.length) : fallback
}

function has(name) {
  return args.includes(name)
}

async function main() {
  switch (cmd) {
    case 'plan': {
      const scenario = flag('--scenario')
      if (!scenario) die('usage: adv plan --scenario <file> [--code-root dir] [--out dir]')
      const out = resolve(flag('--out', resolve(process.cwd(), 'runs', 'plan')))
      const r = planFromScenario({
        scenarioPath: resolve(scenario),
        outDir: out,
        codeRoot: flag('--code-root') ? resolve(flag('--code-root')) : undefined,
        adapter: flag('--adapter'),
      })
      console.log(`[adv] script → ${r.scriptPath}`)
      console.log(`[adv] agent prompt → ${r.promptPath}`)
      break
    }
    case 'record': {
      const script = flag('--script')
      if (!script) die('usage: adv record --script <script.json> [--out dir]')
      const out = resolve(flag('--out', resolve(process.cwd(), 'runs', 'record')))
      ensureDir(out)
      await recordScript({ scriptPath: resolve(script), outDir: out })
      break
    }
    case 'edit': {
      const meta = flag('--meta')
      if (!meta) die('usage: adv edit --meta <meta.json> [--out dir] [--target-sec 90]')
      const out = resolve(flag('--out', resolve(process.cwd(), 'runs', 'edit')))
      buildEditPlan({
        metaPath: resolve(meta),
        outDir: out,
        targetDurationSec: Number(flag('--target-sec', '90')),
      })
      break
    }
    case 'render': {
      const plan = flag('--plan')
      if (!plan) die('usage: adv render --plan <edit-plan.json> [--out dir] [--export path]')
      const out = resolve(flag('--out', resolve(process.cwd(), 'runs', 'render')))
      await renderPlan({
        planPath: resolve(plan),
        outDir: out,
        exportPath: flag('--export') ? resolve(flag('--export')) : undefined,
      })
      break
    }
    case 'all': {
      const scenario = flag('--scenario')
      if (!scenario) die('usage: adv all --scenario <file> [--code-root dir] [--out runs/job]')
      const base = resolve(flag('--out', resolve(process.cwd(), 'runs', stamp())))
      ensureDir(base)

      const planned = planFromScenario({
        scenarioPath: resolve(scenario),
        outDir: resolve(base, '01-plan'),
        codeRoot: flag('--code-root') ? resolve(flag('--code-root')) : undefined,
        adapter: flag('--adapter'),
      })

      const recordOut = resolve(base, '02-record')
      const meta = await recordScript({
        scriptPath: planned.scriptPath,
        outDir: recordOut,
      })

      const editOut = resolve(base, '03-edit')
      const edited = buildEditPlan({
        metaPath: resolve(recordOut, 'meta.json'),
        outDir: editOut,
        targetDurationSec: Number(flag('--target-sec', '90')),
      })

      const renderOut = resolve(base, '04-render')
      await renderPlan({
        planPath: edited.planPath,
        outDir: renderOut,
        exportPath: resolve(base, 'final.mp4'),
      })

      console.log(`[adv] done → ${base}/final.mp4`)
      console.log(`[adv] meta source duration ~${meta.log?.at?.(-1)?.t ?? '?'}s`)
      break
    }
    case 'help':
    default:
      printHelp()
      if (cmd !== 'help') process.exitCode = 1
  }
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

function die(msg) {
  console.error(msg)
  process.exit(1)
}

function printHelp() {
  console.log(`auto-demo-video (adv) — scenario → script → record → edit → render

Commands:
  plan    --scenario <yaml|json> [--code-root <dir>] [--out <dir>] [--adapter name]
  record  --script <script.json> [--out <dir>]
  edit    --meta <meta.json> [--out <dir>] [--target-sec 90]
  render  --plan <edit-plan.json> [--out <dir>] [--export <mp4>]
  all     --scenario <file> [--code-root <dir>] [--out <dir>] [--target-sec 90]

Env (config.env or shell):
  BASE_URL  DEMO_EMAIL  DEMO_PASSWORD  DEMO_OTP  REDIS_URL
  WORKSPACE_NAMES  FORBIDDEN_WORKSPACES  HEADLESS  AGENT_TIMEOUT_MS
  COMPOSER_PLACEHOLDER  DEMO_CTA

Examples:
  adv plan --scenario examples/cubeplex/scenario.yaml --code-root ../cubeplex/frontend
  adv all  --scenario examples/cubeplex/scenario.yaml --out runs/demo1
`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
