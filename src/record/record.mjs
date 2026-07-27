/**
 * Record a DemoScript to webm + meta.json + clicks.json.
 *
 * Recording window (when the camera rolls):
 * - includeAuth=false (default): login + adapter.afterLogin run *without* video,
 *   then a new context starts recordVideo for demo scenes only.
 * - includeAuth=true: single context records from login through the end.
 *
 * Override: script.record.includeAuth, --include-auth / --no-include-auth, ADV_INCLUDE_AUTH=1|0
 */
import { chromium } from 'playwright'
import { resolve } from 'node:path'
import {
  ensureDir,
  writeJson,
  readJson,
  existsSync,
  readdirSync,
  copyFileSync,
} from '../util/fs.mjs'
import { ensureSession, storageStateIfPresent } from './auth.mjs'
import { runSteps } from './steps.mjs'
import { installCamera, resetClickLog, clickLog } from './cinematic.mjs'
import { loadAdapter } from '../adapters/index.mjs'

/**
 * @param {{
 *   scriptPath: string
 *   outDir: string
 *   cwd?: string
 *   includeAuth?: boolean
 * }} opts
 */
export async function recordScript(opts) {
  const script = readJson(opts.scriptPath)
  const outDir = opts.outDir
  const cwd = opts.cwd || process.cwd()
  const videoDir = resolve(outDir, 'raw-video')
  const screensDir = resolve(outDir, 'screens')
  ensureDir(videoDir)
  ensureDir(screensDir)

  const adapter = await loadAdapter(script.adapter || 'generic-web', { cwd })
  const email =
    process.env[script.auth?.emailEnv || 'DEMO_EMAIL'] || process.env.DEMO_EMAIL
  const password =
    process.env[script.auth?.passwordEnv || 'DEMO_PASSWORD'] ||
    process.env.DEMO_PASSWORD

  const statePath = script.auth?.storageState
    ? resolve(cwd, script.auth.storageState)
    : resolve(outDir, '..', 'storage-state.json')

  const requireCreds = process.env.ADV_REQUIRE_CREDS !== '0'
  if (
    requireCreds &&
    (!email || !password) &&
    !storageStateIfPresent(statePath)
  ) {
    throw new Error(
      'Set DEMO_EMAIL / DEMO_PASSWORD (or auth env keys), or provide auth.storageState. ' +
        'Set ADV_REQUIRE_CREDS=0 to skip this check.',
    )
  }

  const includeAuth = resolveIncludeAuth(script, opts)
  const viewport = script.viewport || { width: 1920, height: 1080 }
  const headless = process.env.HEADLESS !== '0'
  const browser = await chromium.launch({
    headless,
    slowMo: Number(process.env.SLOW_MO || 0),
  })

  const log = []
  let t0 = Date.now()
  const mark = (name, extra = {}) => {
    const entry = { t: (Date.now() - t0) / 1000, name, ...extra }
    log.push(entry)
    console.log(`[record] +${entry.t.toFixed(1)}s  ${name}`)
  }

  let page
  let context
  let landingUrl = script.baseUrl

  try {
    // ── Setup (auth + adapter) ─────────────────────────────────────
    if (includeAuth) {
      // Record from the first navigation (legacy / explicit)
      context = await browser.newContext({
        viewport,
        locale: 'en-US',
        recordVideo: { dir: videoDir, size: viewport },
        ...(storageStateIfPresent(statePath) ? { storageState: statePath } : {}),
      })
      page = await context.newPage()
      await applyInitScripts(page)
      t0 = Date.now()
      resetClickLog(t0)
      mark('session:start', { includeAuth: true })
      landingUrl = await runAuth(page, {
        script,
        adapter,
        email,
        password,
      })
      mark('session:ready')
      await context.storageState({ path: statePath })
    } else {
      // Silent setup — no recordVideo
      console.log('[record] setup without video (login / adapter / workspace)')
      const setupCtx = await browser.newContext({
        viewport,
        locale: 'en-US',
        ...(storageStateIfPresent(statePath) ? { storageState: statePath } : {}),
      })
      const setupPage = await setupCtx.newPage()
      await applyInitScripts(setupPage)
      mark('setup:start', { includeAuth: false })
      landingUrl = await runAuth(setupPage, {
        script,
        adapter,
        email,
        password,
      })
      mark('setup:ready', { url: landingUrl })
      await setupCtx.storageState({ path: statePath })
      await setupPage.screenshot({ path: resolve(screensDir, '00-setup.png') })
      await setupCtx.close()

      // Fresh context: camera rolls here
      context = await browser.newContext({
        viewport,
        locale: 'en-US',
        recordVideo: { dir: videoDir, size: viewport },
        storageState: statePath,
      })
      page = await context.newPage()
      await applyInitScripts(page)
      t0 = Date.now()
      resetClickLog(t0)
      mark('record:start', { url: landingUrl })
      await page.goto(landingUrl, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(600)
    }

    await installCamera(page)
    await page.screenshot({ path: resolve(screensDir, '00-landed.png') })

    const ctx = {
      baseUrl: script.baseUrl,
      cinematic: script.cinematic,
      agentTimeoutMs: Number(process.env.AGENT_TIMEOUT_MS || 300_000),
      screensDir,
      adapter,
      mark,
      log: (m) => console.log(`[record] ${m}`),
    }

    for (const scene of script.scenes || []) {
      mark(`scene:${scene.id}`, { title: scene.title })
      await runSteps(page, scene.steps || [], ctx)
      await page
        .screenshot({ path: resolve(screensDir, `${scene.id}.png`) })
        .catch(() => {})
    }

    mark('done')
  } catch (err) {
    mark('error', { message: String(err) })
    if (page) {
      await page
        .screenshot({ path: resolve(screensDir, 'error.png') })
        .catch(() => {})
    }
    console.error('[record] FAILED', err)
    if (context) await context.close().catch(() => {})
    await browser.close()
    writeJson(resolve(outDir, 'meta.json'), {
      ok: false,
      scriptId: script.id,
      includeAuth,
      log,
      clicks: [...clickLog],
    })
    throw err
  }

  const videoPath = await page.video()?.path()
  await context.close()
  await browser.close()

  const rawFiles = existsSync(videoDir)
    ? readdirSync(videoDir).filter((f) => f.endsWith('.webm'))
    : []
  let masterVideo = videoPath
  if (rawFiles.length) {
    masterVideo = resolve(videoDir, 'session.webm')
    copyFileSync(resolve(videoDir, rawFiles[0]), masterVideo)
  }

  const meta = {
    ok: true,
    scriptId: script.id,
    scenarioId: script.scenarioId,
    title: script.title,
    includeAuth,
    outDir,
    masterVideo,
    rawFiles,
    log,
    clicks: [...clickLog],
    captions: script.captions,
    cinematic: script.cinematic,
    viewport: script.viewport,
    adapter: script.adapter,
  }
  writeJson(resolve(outDir, 'meta.json'), meta)
  writeJson(resolve(outDir, 'clicks.json'), clickLog)
  writeJson(resolve(outDir, 'latest-pointer.json'), {
    meta: resolve(outDir, 'meta.json'),
  })
  console.log(`[record] wrote ${resolve(outDir, 'meta.json')}`)
  console.log(`[record] video ${masterVideo} (includeAuth=${includeAuth})`)
  return meta
}

/**
 * Default: do NOT film login/setup (includeAuth=false).
 * Priority: opts.includeAuth > ADV_INCLUDE_AUTH > script.record.includeAuth > false
 */
function resolveIncludeAuth(script, opts) {
  if (typeof opts.includeAuth === 'boolean') return opts.includeAuth
  const env = process.env.ADV_INCLUDE_AUTH
  if (env === '1' || env === 'true') return true
  if (env === '0' || env === 'false') return false
  if (typeof script.record?.includeAuth === 'boolean') {
    return script.record.includeAuth
  }
  return false
}

async function applyInitScripts(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('theme', 'light')
    } catch {
      /* ignore */
    }
  })
}

async function runAuth(page, { script, adapter, email, password }) {
  await ensureSession(page, {
    baseUrl: script.baseUrl,
    email: email || '',
    password: password || '',
    demoOtp: process.env.DEMO_OTP,
    redisUrl: process.env.REDIS_URL,
    loginPath: adapter.loginPath,
    isAuthed: adapter.isAuthed,
    readyUrlTest: adapter.readyUrlTest,
    skipLogin: adapter.skipLogin,
    afterLogin: async (p, cfg) => {
      if (adapter.afterLogin) {
        await adapter.afterLogin(p, {
          ...cfg,
          script,
          adapterOptions: script.adapterOptions || {},
        })
      }
    },
  })
  // Optional explicit start URL after setup (e.g. deep link into a feature)
  const startUrl = script.record?.startUrl || process.env.ADV_START_URL
  if (startUrl) {
    const url = startUrl.startsWith('http')
      ? startUrl
      : `${script.baseUrl.replace(/\/$/, '')}${startUrl}`
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(500)
  }
  return page.url()
}
