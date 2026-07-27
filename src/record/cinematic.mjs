/**
 * In-page cinematic camera for demo recordings.
 *
 * Framing (not naive transform-origin-at-cursor):
 *   At scale S, the camera shows a W/S × H/S window of the page.
 *   Ideal window is centered on the focus point, then **clamped** into
 *   [0, W−viewW] × [0, H−viewH]. Near the left sidebar the window pins to
 *   x=0 (hugs the left edge); same for right / top / bottom.
 *
 * Motion: ease into that crop via scale+translate, click ripple, hold, ease out.
 */

const DEFAULTS = {
  scale: 2,
  zoomInMs: 480,
  zoomOutMs: 420,
  preClickHoldMs: 140,
  postClickHoldMs: 320,
  cursorTravelMs: 220,
  enabled: true,
}

/** @type {{ t: number, x: number, y: number, label?: string, cam?: object }[]} */
export const clickLog = []

let t0 = Date.now()
export function resetClickLog(startMs = Date.now()) {
  clickLog.length = 0
  t0 = startMs
}

/**
 * Inject camera CSS + controller. Replaces older versions automatically.
 */
export async function installCamera(page) {
  await page.evaluate(() => {
    const VERSION = 3
    if (window.__demoCam?.version === VERSION) return

    // Tear down previous install if any
    document.getElementById('demo-cam-style')?.remove()
    document.getElementById('demo-cam-ripple')?.remove()
    document.getElementById('demo-cam-cursor')?.remove()
    document.documentElement.classList.remove('demo-cam-active')
    document.documentElement.style.removeProperty('--demo-cam-t')

    const style = document.createElement('style')
    style.id = 'demo-cam-style'
    style.textContent = `
      html.demo-cam-active {
        overflow: hidden !important;
      }
      /*
       * Camera model: transform-origin top-left (0,0).
       * transform: scale(S) translate(-camX, -camY)
       *   → right-to-left: translate first, then scale.
       * Visible window in page coords: [camX, camX+W/S] × [camY, camY+H/S].
       */
      html.demo-cam-active body {
        transition: transform var(--demo-cam-dur, 480ms) cubic-bezier(0.22, 1, 0.36, 1);
        transform-origin: 0 0;
        transform: var(--demo-cam-t, scale(1) translate(0px, 0px));
        will-change: transform;
      }
      #demo-cam-ripple {
        position: fixed;
        left: 0; top: 0;
        pointer-events: none;
        z-index: 2147483646;
        border-radius: 50%;
        width: 14px; height: 14px;
        margin-left: -7px; margin-top: -7px;
        border: 2.5px solid rgba(37, 99, 235, 0.95);
        background: rgba(59, 130, 246, 0.28);
        box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.45);
        opacity: 0;
        transform: scale(0.35);
      }
      #demo-cam-ripple.demo-cam-pop {
        animation: demo-cam-pop 560ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }
      @keyframes demo-cam-pop {
        0%   { transform: scale(0.35); opacity: 0.95; box-shadow: 0 0 0 0 rgba(59,130,246,.5); }
        55%  { transform: scale(2.8);  opacity: 0.45; box-shadow: 0 0 0 14px rgba(59,130,246,0); }
        100% { transform: scale(4.2);  opacity: 0;    box-shadow: 0 0 0 22px rgba(59,130,246,0); }
      }
      #demo-cam-cursor {
        position: fixed;
        left: 0; top: 0;
        z-index: 2147483647;
        width: 22px; height: 22px;
        margin-left: -2px; margin-top: -1px;
        pointer-events: none;
        opacity: 0;
        filter: drop-shadow(0 1px 2px rgba(0,0,0,.4));
        transition: left var(--demo-cursor-ms, 220ms) cubic-bezier(0.22, 1, 0.36, 1),
                    top var(--demo-cursor-ms, 220ms) cubic-bezier(0.22, 1, 0.36, 1),
                    opacity 120ms ease;
      }
      #demo-cam-cursor.demo-cam-visible { opacity: 1; }
      #demo-cam-cursor.demo-cam-press { transform: scale(0.88); }
    `
    document.documentElement.appendChild(style)

    const ripple = document.createElement('div')
    ripple.id = 'demo-cam-ripple'
    document.documentElement.appendChild(ripple)

    const cursor = document.createElement('div')
    cursor.id = 'demo-cam-cursor'
    cursor.innerHTML = `
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 3L20 12L12 14L9 21L4 3Z" fill="white" stroke="#0f172a" stroke-width="1.4" stroke-linejoin="round"/>
      </svg>`
    document.documentElement.appendChild(cursor)

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

    /**
     * Clamp a focus point into a scale-S camera window.
     * Ideal: center on (fx, fy). Result: top-left of the visible window in page coords.
     * Edge rule: if focus is near left, camX → 0 (window hugs left); same for other edges.
     */
    function frameForFocus(fx, fy, scale) {
      const W = window.innerWidth
      const H = window.innerHeight
      const s = Math.max(1.01, Number(scale) || 2)
      const viewW = W / s
      const viewH = H / s

      let camX = fx - viewW / 2
      let camY = fy - viewH / 2

      // Soft edge bias: when focus sits in outer 20% of the frame, pull harder toward that edge
      // (in addition to hard clamp). Keeps sidebar targets visually "against" the side.
      const edgeBandX = W * 0.2
      const edgeBandY = H * 0.2
      if (fx < edgeBandX) {
        // Lerp camX toward 0 based on how far into the left band we are
        const t = 1 - fx / edgeBandX // 1 at x=0, 0 at band edge
        camX = camX * (1 - t) + 0 * t
      } else if (fx > W - edgeBandX) {
        const t = (fx - (W - edgeBandX)) / edgeBandX
        camX = camX * (1 - t) + (W - viewW) * t
      }
      if (fy < edgeBandY) {
        const t = 1 - fy / edgeBandY
        camY = camY * (1 - t) + 0 * t
      } else if (fy > H - edgeBandY) {
        const t = (fy - (H - edgeBandY)) / edgeBandY
        camY = camY * (1 - t) + (H - viewH) * t
      }

      // Hard clamp — never show past the page bounds
      camX = Math.max(0, Math.min(camX, Math.max(0, W - viewW)))
      camY = Math.max(0, Math.min(camY, Math.max(0, H - viewH)))

      return {
        camX,
        camY,
        viewW,
        viewH,
        scale: s,
        // Where the focus lands on screen after transform (viewport px)
        screenX: (fx - camX) * s,
        screenY: (fy - camY) * s,
        pinned: {
          left: camX <= 0.5,
          right: camX >= W - viewW - 0.5,
          top: camY <= 0.5,
          bottom: camY >= H - viewH - 0.5,
        },
      }
    }

    function applyTransform(camX, camY, scale) {
      const root = document.documentElement
      // CSS applies right-to-left: translate then scale
      root.style.setProperty(
        '--demo-cam-t',
        `scale(${scale}) translate(${-camX}px, ${-camY}px)`,
      )
    }

    /**
     * Map a page/layout point → current viewport coords under the active camera.
     * Inverse: screenToPage. Both needed when already zoomed (e.g. composer → send).
     */
    function pageToScreen(x, y) {
      const c = window.__demoCam
      if (!c || c.scale <= 1.01) return { x, y }
      return {
        x: (x - c.camX) * c.scale,
        y: (y - c.camY) * c.scale,
      }
    }

    function screenToPage(sx, sy) {
      const c = window.__demoCam
      if (!c || c.scale <= 1.01) return { x: sx, y: sy }
      return {
        x: sx / c.scale + c.camX,
        y: sy / c.scale + c.camY,
      }
    }

    /**
     * Element center in **page/layout** coordinates (pre-camera), even if body is zoomed.
     * getBoundingClientRect is always viewport/screen space after CSS transforms.
     */
    function elementPageCenter(el) {
      const r = el.getBoundingClientRect()
      const sx = r.left + r.width / 2
      const sy = r.top + r.height / 2
      return screenToPage(sx, sy)
    }

    window.__demoCam = {
      version: VERSION,
      ready: true,
      scale: 1,
      camX: 0,
      camY: 0,
      frameForFocus,
      pageToScreen,
      screenToPage,
      elementPageCenter,

      async moveCursor(pageX, pageY, ms = 220) {
        const el = document.getElementById('demo-cam-cursor')
        if (!el) return
        const { x, y } = pageToScreen(pageX, pageY)
        document.documentElement.style.setProperty('--demo-cursor-ms', `${ms}ms`)
        el.classList.add('demo-cam-visible')
        el.style.left = `${x}px`
        el.style.top = `${y}px`
        await sleep(ms + 20)
      },

      async zoomIn(fx, fy, scale = 2, ms = 480) {
        const frame = frameForFocus(fx, fy, scale)
        const root = document.documentElement
        root.classList.add('demo-cam-active')
        root.style.setProperty('--demo-cam-dur', `${ms}ms`)

        // Ensure we start from identity if coming from rest
        if (this.scale <= 1.01) {
          applyTransform(0, 0, 1)
          void document.body.offsetHeight
        }

        applyTransform(frame.camX, frame.camY, frame.scale)
        this.scale = frame.scale
        this.camX = frame.camX
        this.camY = frame.camY
        this.lastFrame = frame

        // Keep cursor on the focus as the camera moves
        const el = document.getElementById('demo-cam-cursor')
        if (el) {
          // After zoom, focus sits at screenX/screenY — animate cursor there during zoom
          document.documentElement.style.setProperty('--demo-cursor-ms', `${ms}ms`)
          el.style.left = `${frame.screenX}px`
          el.style.top = `${frame.screenY}px`
        }

        await sleep(ms + 30)
        return frame
      },

      async clickEffect(pageX, pageY) {
        const { x, y } = pageToScreen(pageX, pageY)
        const ripple = document.getElementById('demo-cam-ripple')
        const cursor = document.getElementById('demo-cam-cursor')
        if (ripple) {
          ripple.style.left = `${x}px`
          ripple.style.top = `${y}px`
          ripple.classList.remove('demo-cam-pop')
          void ripple.offsetHeight
          ripple.classList.add('demo-cam-pop')
        }
        if (cursor) {
          cursor.style.left = `${x}px`
          cursor.style.top = `${y}px`
          cursor.classList.add('demo-cam-press')
          await sleep(90)
          cursor.classList.remove('demo-cam-press')
        } else {
          await sleep(90)
        }
      },

      async zoomOut(ms = 420) {
        const root = document.documentElement
        root.style.setProperty('--demo-cam-dur', `${ms}ms`)
        applyTransform(0, 0, 1)
        this.scale = 1
        this.camX = 0
        this.camY = 0
        this.lastFrame = null
        await sleep(ms + 30)
        root.classList.remove('demo-cam-active')
        root.style.removeProperty('--demo-cam-t')
      },

      hideCursor() {
        document.getElementById('demo-cam-cursor')?.classList.remove('demo-cam-visible')
      },
    }
  })
}

function mergeOpts(opts = {}) {
  return { ...DEFAULTS, ...opts }
}

/**
 * Zoom toward locator with edge-aware framing, click with ripple, zoom back out.
 * @param {import('playwright').Page} page
 * @param {import('playwright').Locator} locator
 */
/**
 * Locator center in page/layout coords. Correct even when camera is already zoomed
 * (Playwright boundingBox / getBoundingClientRect are viewport-space after CSS transform).
 */
async function focusPagePoint(page, locator) {
  const handle = await locator.elementHandle()
  if (!handle) return null
  try {
    return await handle.evaluate((el) => {
      if (!window.__demoCam?.elementPageCenter) {
        const r = el.getBoundingClientRect()
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
      }
      return window.__demoCam.elementPageCenter(el)
    })
  } finally {
    await handle.dispose().catch(() => {})
  }
}

export async function cinematicClick(page, locator, opts = {}) {
  const o = mergeOpts(opts)
  if (!o.enabled) {
    await locator.click()
    return
  }

  await installCamera(page)
  await locator.scrollIntoViewIfNeeded().catch(() => {})

  // Page-space focus (not raw boundingBox — that double-counts the camera when already zoomed)
  const pt = await focusPagePoint(page, locator)
  if (!pt) {
    await locator.click()
    return
  }
  const { x, y } = pt

  const frame = await page.evaluate(
    async ({ x, y, scale, zoomInMs, cursorTravelMs, preClickHoldMs }) => {
      await window.__demoCam.moveCursor(x, y, cursorTravelMs)
      const f = await window.__demoCam.zoomIn(x, y, scale, zoomInMs)
      await new Promise((r) => setTimeout(r, preClickHoldMs))
      return f
    },
    {
      x,
      y,
      scale: o.scale,
      zoomInMs: o.zoomInMs,
      cursorTravelMs: o.cursorTravelMs,
      preClickHoldMs: o.preClickHoldMs,
    },
  )

  clickLog.push({
    t: (Date.now() - t0) / 1000,
    x,
    y,
    label: o.label || 'click',
    cam: frame
      ? {
          camX: frame.camX,
          camY: frame.camY,
          scale: frame.scale,
          pinned: frame.pinned,
          screenX: frame.screenX,
          screenY: frame.screenY,
        }
      : undefined,
  })

  // Ripple at true page-space target (mapped to screen for overlay)
  await Promise.all([
    page.evaluate(({ x, y }) => window.__demoCam.clickEffect(x, y), { x, y }),
    locator.click({ timeout: 15_000 }),
  ])

  await page.waitForTimeout(o.postClickHoldMs)

  if (!o.stayZoomed) {
    await page.evaluate(async (ms) => window.__demoCam.zoomOut(ms), o.zoomOutMs)
    if (!o.keepCursor) {
      await page.evaluate(() => window.__demoCam.hideCursor())
    }
  }
}

/**
 * Zoom in + click, remain zoomed (e.g. while typing in composer).
 */
export async function cinematicFocus(page, locator, opts = {}) {
  return cinematicClick(page, locator, { ...opts, stayZoomed: true, keepCursor: true })
}

/**
 * Ease back to full frame if still zoomed.
 */
export async function cinematicReset(page, opts = {}) {
  const o = mergeOpts(opts)
  if (!o.enabled) return
  await installCamera(page)
  await page.evaluate(async (ms) => {
    if (window.__demoCam) {
      await window.__demoCam.zoomOut(ms)
      window.__demoCam.hideCursor()
    }
  }, o.zoomOutMs)
}

/**
 * Zoom toward a point without clicking (highlight a region).
 */
export async function cinematicPeek(page, locator, opts = {}) {
  const o = mergeOpts(opts)
  if (!o.enabled) {
    await page.waitForTimeout(o.postClickHoldMs)
    return
  }
  await installCamera(page)
  const pt = await focusPagePoint(page, locator)
  if (!pt) return
  const { x, y } = pt
  await page.evaluate(
    async ({ x, y, scale, zoomInMs, hold, zoomOutMs }) => {
      await window.__demoCam.moveCursor(x, y, 180)
      await window.__demoCam.zoomIn(x, y, scale, zoomInMs)
      await new Promise((r) => setTimeout(r, hold))
      await window.__demoCam.zoomOut(zoomOutMs)
      window.__demoCam.hideCursor()
    },
    {
      x,
      y,
      scale: o.scale,
      zoomInMs: o.zoomInMs,
      hold: o.postClickHoldMs ?? 600,
      zoomOutMs: o.zoomOutMs,
    },
  )
}
