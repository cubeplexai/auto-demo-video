/**
 * Execute script steps against a Playwright page.
 */
import {
  cinematicClick,
  cinematicFocus,
  cinematicReset,
  installCamera,
} from './cinematic.mjs'

export async function runSteps(page, steps, ctx) {
  for (const step of steps) {
    ctx.mark?.(`step:${step.id || step.kind}`, { kind: step.kind })
    await runStep(page, step, ctx)
  }
}

async function runStep(page, step, ctx) {
  const cam = {
    enabled: ctx.cinematic?.enabled !== false && step.cinematic !== false,
    scale: ctx.cinematic?.scale ?? 2,
    zoomInMs: ctx.cinematic?.zoomInMs ?? 480,
    zoomOutMs: ctx.cinematic?.zoomOutMs ?? 420,
    typeDelayMs: ctx.cinematic?.typeDelayMs ?? 14,
    label: step.id || step.kind,
  }
  page._demoCam = cam

  switch (step.kind) {
    case 'navigate': {
      const url = step.url?.startsWith('http')
        ? step.url
        : `${ctx.baseUrl.replace(/\/$/, '')}${step.url || '/'}`
      await page.goto(url, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(800)
      if (cam.enabled) await installCamera(page)
      break
    }
    case 'click': {
      const loc = resolveLocator(page, step)
      await cinematicClick(page, loc, cam)
      break
    }
    case 'type': {
      const loc = resolveLocator(page, step)
      if (cam.enabled) await cinematicFocus(page, loc, cam)
      else await loc.click()
      await loc.fill('')
      const delay = cam.typeDelayMs ?? 14
      if (delay > 0 && step.text) {
        await loc.pressSequentially(step.text, { delay })
      } else if (step.text) {
        await loc.fill(step.text)
      }
      if (cam.enabled) await cinematicReset(page, cam)
      break
    }
    case 'send_message': {
      await sendMessage(page, step.prompt || step.text || '', cam, {
        adapter: ctx.adapter,
        stepPlaceholders: step.placeholders,
      })
      break
    }
    case 'wait_idle': {
      const timeout = step.ms || ctx.agentTimeoutMs || 300_000
      const loader = page.getByTestId('loading-indicator')
      try {
        await loader.waitFor({ state: 'visible', timeout: 15_000 })
      } catch {
        /* may finish fast */
      }
      try {
        await loader.waitFor({ state: 'hidden', timeout })
      } catch {
        ctx.log?.('wait_idle timeout — continuing')
      }
      break
    }
    case 'wait_ms': {
      await page.waitForTimeout(step.ms || 1000)
      break
    }
    case 'screenshot': {
      const path = step.path || `${ctx.screensDir}/${step.id || 'shot'}.png`
      await page.screenshot({ path, fullPage: false })
      break
    }
    case 'open_panel': {
      const candidates = [
        step.selector && page.locator(step.selector),
        step.name && page.getByRole('button', { name: new RegExp(step.name, 'i') }),
        step.name && page.getByRole('tab', { name: new RegExp(step.name, 'i') }),
        step.name && page.getByRole('link', { name: new RegExp(step.name, 'i') }),
      ].filter(Boolean)
      for (const loc of candidates) {
        try {
          if (await loc.first().isVisible({ timeout: 1000 })) {
            await cinematicClick(page, loc.first(), {
              ...cam,
              label: step.id || 'panel',
            })
            return
          }
        } catch {
          /* try next */
        }
      }
      break
    }
    case 'assert_text': {
      await page.getByText(step.text || '', { exact: false }).first().waitFor({
        state: 'visible',
        timeout: step.ms || 15_000,
      })
      break
    }
    case 'custom': {
      if (ctx.adapter?.custom?.[step.custom]) {
        await ctx.adapter.custom[step.custom](page, step, ctx)
      } else {
        throw new Error(`Unknown custom step: ${step.custom}`)
      }
      break
    }
    default:
      throw new Error(`Unknown step kind: ${step.kind}`)
  }
}

function resolveLocator(page, step) {
  if (step.selector) return page.locator(step.selector).first()
  if (step.role && step.name) {
    return page.getByRole(step.role, { name: new RegExp(step.name, 'i') }).first()
  }
  if (step.name) {
    return page.getByRole('button', { name: new RegExp(step.name, 'i') }).first()
  }
  if (step.text) return page.getByText(step.text).first()
  throw new Error(`Step ${step.id}: need selector, role+name, or text`)
}

async function sendMessage(page, text, cam, ctx) {
  await installCamera(page)
  // Placeholders: step override → env → adapter → generic fallbacks (no product names)
  const placeholders = [
    ...(Array.isArray(ctx?.stepPlaceholders) ? ctx.stepPlaceholders : []),
    process.env.COMPOSER_PLACEHOLDER,
    ...(ctx?.adapter?.composerPlaceholders || []),
    'Message',
    'Type a message',
    'Send a message',
  ].filter(Boolean)

  let input = null
  for (const ph of placeholders) {
    const loc = page.getByPlaceholder(ph)
    if (await loc.isVisible().catch(() => false)) {
      input = loc
      break
    }
  }
  if (!input) {
    input = page.locator('textarea, [contenteditable="true"]').first()
  }

  await cinematicFocus(page, input, { ...cam, label: 'composer' })
  await input.fill('')
  const delay = cam.typeDelayMs ?? 14
  if (delay > 0) await input.pressSequentially(text, { delay })
  else await input.fill(text)
  await page.waitForTimeout(300)

  const sendBtn = page.getByTestId('send-button')
  if (await sendBtn.isVisible().catch(() => false)) {
    await cinematicClick(page, sendBtn, { ...cam, label: 'send' })
  } else {
    await input.press('Enter')
    await cinematicReset(page, cam)
  }
}
