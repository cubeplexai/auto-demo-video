/**
 * Record a DemoScript to webm + meta.json + clicks.json.
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
 * @param {{ scriptPath: string, outDir: string, env?: object }} opts
 */
export async function recordScript(opts) {
  const script = readJson(opts.scriptPath)
  const outDir = opts.outDir
  const videoDir = resolve(outDir, 'raw-video')
  const screensDir = resolve(outDir, 'screens')
  ensureDir(videoDir)
  ensureDir(screensDir)

  const adapter = await loadAdapter(script.adapter || 'generic-web', {
    cwd: opts.cwd || process.cwd(),
  })
  const email =
    process.env[script.auth?.emailEnv || 'DEMO_EMAIL'] ||
    process.env.DEMO_EMAIL
  const password =
    process.env[script.auth?.passwordEnv || 'DEMO_PASSWORD'] ||
    process.env.DEMO_PASSWORD

  // Credentials optional if adapter uses storageState-only / SSO / custom auth
  const requireCreds = process.env.ADV_REQUIRE_CREDS !== '0'
  if (requireCreds && (!email || !password) && !storageStateIfPresent(
    script.auth?.storageState
      ? resolve(opts.cwd || process.cwd(), script.auth.storageState)
      : '',
  )) {
    throw new Error(
      'Set DEMO_EMAIL / DEMO_PASSWORD (or auth env keys), or provide auth.storageState. ' +
        'Set ADV_REQUIRE_CREDS=0 to skip this check.',
    )
  }

  const statePath = script.auth?.storageState
    ? resolve(opts.cwd || process.cwd(), script.auth.storageState)
    : resolve(outDir, '..', 'storage-state.json')

  const headless = process.env.HEADLESS !== '0'
  const browser = await chromium.launch({
    headless,
    slowMo: Number(process.env.SLOW_MO || 0),
  })

  const context = await browser.newContext({
    viewport: script.viewport || { width: 1920, height: 1080 },
    recordVideo: {
      dir: videoDir,
      size: script.viewport || { width: 1920, height: 1080 },
    },
    locale: 'en-US',
    ...(storageStateIfPresent(statePath)
      ? { storageState: statePath }
      : {}),
  })

  const page = await context.newPage()
  const t0 = Date.now()
  resetClickLog(t0)
  const log = []
  const mark = (name, extra = {}) => {
    const entry = { t: (Date.now() - t0) / 1000, name, ...extra }
    log.push(entry)
    console.log(`[record] +${entry.t.toFixed(1)}s  ${name}`)
  }

  const ctx = {
    baseUrl: script.baseUrl,
    cinematic: script.cinematic,
    agentTimeoutMs: Number(process.env.AGENT_TIMEOUT_MS || 300_000),
    screensDir,
    adapter,
    mark,
    log: (m) => console.log(`[record] ${m}`),
  }

  try {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('theme', 'light')
      } catch {
        /* ignore */
      }
    })

    mark('session:start')
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
    mark('session:ready')

    await context.storageState({ path: statePath })
    await installCamera(page)
    await page.screenshot({ path: resolve(screensDir, '00-landed.png') })

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
    await page.screenshot({ path: resolve(screensDir, 'error.png') }).catch(() => {})
    console.error('[record] FAILED', err)
    await context.close()
    await browser.close()
    writeJson(resolve(outDir, 'meta.json'), {
      ok: false,
      scriptId: script.id,
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
  writeJson(resolve(outDir, 'latest-pointer.json'), { meta: resolve(outDir, 'meta.json') })
  console.log(`[record] wrote ${resolve(outDir, 'meta.json')}`)
  console.log(`[record] video ${masterVideo}`)
  return meta
}
