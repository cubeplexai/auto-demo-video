/**
 * Generic login helpers. Product-specific workspace selection lives in adapters.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

export async function ensureSession(page, cfg) {
  await page.goto(`${cfg.baseUrl}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)

  if (cfg.readyUrlTest?.(page.url())) return

  if (!/login|sign-?in|auth/i.test(page.url()) && !cfg.forceLogin) {
    // Already somewhere useful?
    if (cfg.isAuthed?.(page.url())) return
  }

  await page.goto(`${cfg.baseUrl}${cfg.loginPath || '/login'}`, {
    waitUntil: 'domcontentloaded',
  })
  await fillCredentials(page, cfg.email, cfg.password)
  await page
    .getByRole('button', { name: /sign in|log in|continue/i })
    .first()
    .click()
  await page.waitForTimeout(2500)

  if (/verify-otp|otp/i.test(page.url())) {
    const code = await resolveOtp(cfg)
    if (!code) {
      throw new Error(
        'OTP required. Set DEMO_OTP or REDIS_URL (email_otp:{email} → code).',
      )
    }
    await fillOtp(page, code)
    await page.waitForTimeout(2000)
  }

  if (cfg.afterLogin) await cfg.afterLogin(page, cfg)
}

async function fillCredentials(page, email, password) {
  const emailBox = page
    .getByLabel(/^email$/i)
    .or(page.getByRole('textbox', { name: /email/i }))
    .first()
  const passBox = page
    .getByLabel(/^password$/i)
    .or(page.locator('input[type="password"]'))
    .first()
  await emailBox.fill(email)
  await passBox.fill(password)
}

async function fillOtp(page, code) {
  const multi = page.locator(
    'input[inputmode="numeric"], input[autocomplete="one-time-code"]',
  )
  const count = await multi.count()
  if (count >= 4) {
    for (let i = 0; i < Math.min(count, code.length); i++) {
      await multi.nth(i).fill(code[i] ?? '')
    }
  } else {
    await page.getByRole('textbox').first().fill(code)
  }
  const btn = page.getByRole('button', { name: /^verify$/i })
  if (await btn.isVisible().catch(() => false)) await btn.click()
}

async function resolveOtp(cfg) {
  if (cfg.demoOtp) return String(cfg.demoOtp).trim()
  if (!cfg.redisUrl) return null
  const key = `email_otp:${cfg.email}`
  for (let i = 0; i < 10; i++) {
    const r = spawnSync('redis-cli', ['-u', cfg.redisUrl, 'HGET', key, 'code'], {
      encoding: 'utf8',
    })
    const code = (r.stdout || '').trim()
    if (code && /^\d{4,8}$/.test(code)) return code
    await new Promise((res) => setTimeout(res, 500))
  }
  return null
}

export function storageStateIfPresent(path) {
  return path && existsSync(path) ? path : undefined
}
