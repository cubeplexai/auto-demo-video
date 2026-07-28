#!/usr/bin/env node
/**
 * auto-demo-video CLI
 *
 *   adv plan   --scenario path [--code-root path] [--out runs/x]
 *   adv record --script path [--out runs/x/record]
 *   adv edit   --meta path [--out runs/x/edit] [--target-sec 90]
 *   adv render --plan path [--out runs/x/render] [--export path]
 *   adv polish --meta path | --video path [--clicks path] [--out dir] [--export path]
 *   adv all    --scenario path [--code-root path] [--out runs/x] [--polish]
 */
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { loadEnvFile, ensureDir } from '../src/util/fs.mjs'
import { planFromScenario } from '../src/plan/plan.mjs'
import { recordScript } from '../src/record/record.mjs'
import { buildEditPlan } from '../src/edit/edit.mjs'
import { renderPlan } from '../src/render/render.mjs'
import { polishFromMeta, polishRecording } from '../src/polish/polish.mjs'

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
      if (!script) {
        die(
          'usage: adv record --script <script.json> [--out dir] [--include-auth|--no-include-auth]',
        )
      }
      const out = resolve(flag('--out', resolve(process.cwd(), 'runs', 'record')))
      ensureDir(out)
      let includeAuth
      if (has('--include-auth')) includeAuth = true
      if (has('--no-include-auth')) includeAuth = false
      await recordScript({
        scriptPath: resolve(script),
        outDir: out,
        cwd: process.cwd(),
        includeAuth,
      })
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
    case 'polish': {
      // FocuSee-like packaging: post-zoom from clicks + window chrome on wallpaper
      const meta = flag('--meta')
      const video = flag('--video')
      if (!meta && !video) {
        die(
          'usage: adv polish --meta <meta.json> | --video <mp4|webm> [--clicks clicks.json] [--out dir] [--export path] [--no-zoom] [--no-chrome]',
        )
      }
      const out = resolve(flag('--out', resolve(process.cwd(), 'runs', 'polish')))
      const options = {
        exportPath: flag('--export') ? resolve(flag('--export')) : undefined,
        options: {
          skipZoom: has('--no-zoom'),
          skipChrome: has('--no-chrome'),
          zoomScale: Number(flag('--zoom-scale', '2')),
        },
      }
      if (meta) {
        await polishFromMeta(resolve(meta), out, options)
      } else {
        await polishRecording({
          videoPath: resolve(video),
          clicksPath: flag('--clicks') ? resolve(flag('--clicks')) : undefined,
          outDir: out,
          exportPath: options.exportPath,
          options: options.options,
        })
      }
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
        exportPath: resolve(base, 'final-cut.mp4'),
      })

      let finalPath = resolve(base, 'final-cut.mp4')
      if (has('--polish') || process.env.ADV_POLISH === '1') {
        const polishOut = resolve(base, '05-polish')
        // Polish the raw record (best clicks fidelity), not the already-cut reel
        await polishFromMeta(resolve(recordOut, 'meta.json'), polishOut, {
          exportPath: resolve(base, 'final.mp4'),
        })
        finalPath = resolve(base, 'final.mp4')
      } else {
        // Without polish, final is the highlight cut
        const { copyFileSync } = await import('node:fs')
        copyFileSync(finalPath, resolve(base, 'final.mp4'))
        finalPath = resolve(base, 'final.mp4')
      }

      console.log(`[adv] done → ${finalPath}`)
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
  record  --script <script.json> [--out <dir>] [--include-auth|--no-include-auth]
  edit    --meta <meta.json> [--out <dir>] [--target-sec 90]
  render  --plan <edit-plan.json> [--out <dir>] [--export <mp4>]
  polish  --meta <meta.json> | --video <file> [--clicks <json>] [--export <mp4>]
          [--no-zoom] [--no-chrome] [--zoom-scale 2]
  all     --scenario <file> [--out <dir>] [--target-sec 90] [--polish]

  Recording window: by default login + adapter setup are NOT filmed; video starts
  after session is ready. Use --include-auth (or ADV_INCLUDE_AUTH=1 / script
  record.includeAuth: true) to film from login. Optional ADV_START_URL / script
  record.startUrl deep-links after setup before the camera rolls.

  Polish (FocuSee-like): post zoom from clicks.json + floating rounded window on
  gradient wallpaper. Use after record (or on any video+clicks).

Env (config.env or shell):
  BASE_URL  DEMO_EMAIL  DEMO_PASSWORD  DEMO_OTP  REDIS_URL
  HEADLESS  AGENT_TIMEOUT_MS  COMPOSER_PLACEHOLDER  DEMO_CTA  ADV_REQUIRE_CREDS
  ADV_INCLUDE_AUTH  ADV_START_URL

Examples:
  adv plan --scenario /path/to/product/demos/scenario.yaml --code-root /path/to/product
  adv all  --scenario ./demos/scenario.yaml --out runs/demo1

Product-specific adapters live in the product repo, e.g.:
  adapter: ./demos/adapter.mjs
`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
