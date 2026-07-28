/**
 * Build zoom intervals from clicks.json (+ optional scene marks).
 *
 * Each click produces a zoom-in / hold / zoom-out window around (x, y).
 * Coordinates are page pixels at recording viewport size.
 */

/**
 * @param {Array<{ t: number, x: number, y: number, label?: string, cam?: object }>} clicks
 * @param {{
 *   durationSec: number
 *   viewport: { width: number, height: number }
 *   scale?: number
 *   preSec?: number
 *   holdSec?: number
 *   postSec?: number
 *   minGapSec?: number
 * }} opts
 * @returns {Array<{ startSec: number, endSec: number, kind: 'full'|'zoom', x?: number, y?: number, scale?: number, label?: string }>}
 */
export function buildZoomTimeline(clicks, opts) {
  const durationSec = opts.durationSec
  const vw = opts.viewport?.width || 1920
  const vh = opts.viewport?.height || 1080
  const scale = opts.scale ?? 2
  const preSec = opts.preSec ?? 0.45
  const holdSec = opts.holdSec ?? 0.9
  const postSec = opts.postSec ?? 0.4
  const minGapSec = opts.minGapSec ?? 0.35

  const events = (clicks || [])
    .filter((c) => Number.isFinite(c.t) && Number.isFinite(c.x) && Number.isFinite(c.y))
    .sort((a, b) => a.t - b.t)

  /** @type {Array<{ startSec: number, endSec: number, kind: string, x?: number, y?: number, scale?: number, label?: string }>} */
  const zoomWindows = []
  for (const c of events) {
    const start = Math.max(0, c.t - preSec)
    const end = Math.min(durationSec, c.t + holdSec + postSec)
    // Prefer cam focus if present (already edge-clamped in capture)
    const x = c.cam?.screenX != null
      ? c.x // still use page x for crop math; cam is for debug
      : c.x
    const y = c.y
    zoomWindows.push({
      startSec: start,
      endSec: end,
      kind: 'zoom',
      x: clamp(x, 0, vw),
      y: clamp(y, 0, vh),
      scale,
      label: c.label || 'click',
    })
  }

  // Merge overlapping zoom windows (keep last focus point)
  const merged = []
  for (const w of zoomWindows) {
    const prev = merged[merged.length - 1]
    if (prev && w.startSec <= prev.endSec + minGapSec) {
      prev.endSec = Math.max(prev.endSec, w.endSec)
      prev.x = w.x
      prev.y = w.y
      prev.label = `${prev.label}+${w.label}`
    } else {
      merged.push({ ...w })
    }
  }

  // Fill gaps with full-frame segments
  const segments = []
  let cursor = 0
  for (const z of merged) {
    if (z.startSec > cursor + 0.05) {
      segments.push({
        startSec: round(cursor),
        endSec: round(z.startSec),
        kind: 'full',
      })
    }
    segments.push({
      ...z,
      startSec: round(Math.max(cursor, z.startSec)),
      endSec: round(z.endSec),
    })
    cursor = z.endSec
  }
  if (cursor < durationSec - 0.05) {
    segments.push({
      startSec: round(cursor),
      endSec: round(durationSec),
      kind: 'full',
    })
  }
  if (!segments.length) {
    segments.push({ startSec: 0, endSec: round(durationSec), kind: 'full' })
  }
  return segments
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n))
}

function round(n) {
  return Math.round(n * 1000) / 1000
}
