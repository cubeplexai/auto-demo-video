/**
 * Build an EditPlan from record meta + clicks.
 *
 * Heuristics:
 * - Prefer scenes marked highlight (from script captions / log scene:*).
 * - Keep ~2–4s before scene end as payoff (drop long agent waits mid-scene).
 * - Keep short windows around cinematic clicks.
 * - Speed up pure wait gaps when building ffmpeg filter (speed > 1).
 */
import { resolve } from 'node:path'
import { readJson, writeJson, ensureDir } from '../util/fs.mjs'

/**
 * @param {{ metaPath: string, outDir: string, targetDurationSec?: number }} opts
 */
export function buildEditPlan(opts) {
  const meta = readJson(opts.metaPath)
  if (!meta.ok) throw new Error('meta.ok=false — refuse to edit failed take')

  const target = opts.targetDurationSec ?? Number(process.env.TARGET_DURATION_SEC || 90)
  const log = meta.log || []
  const clicks = meta.clicks || []
  const totalSec = log.find((e) => e.name === 'done')?.t || log.at(-1)?.t || 60

  const sceneMarks = log.filter((e) => String(e.name).startsWith('scene:'))
  const segments = []

  if (sceneMarks.length === 0) {
    // fallback: head + mid + tail
    segments.push(
      { startSec: 0, endSec: Math.min(12, totalSec), speed: 1, label: 'open', transition: 'cut' },
      {
        startSec: Math.max(0, totalSec * 0.35),
        endSec: Math.min(totalSec, totalSec * 0.35 + 20),
        speed: 1,
        label: 'mid',
        transition: 'fade',
      },
      {
        startSec: Math.max(0, totalSec - 18),
        endSec: totalSec,
        speed: 1,
        label: 'close',
        transition: 'cut',
      },
    )
  } else {
    for (let i = 0; i < sceneMarks.length; i++) {
      const start = sceneMarks[i].t
      const end = i + 1 < sceneMarks.length ? sceneMarks[i + 1].t : totalSec
      const dur = end - start
      const id = String(sceneMarks[i].name).replace(/^scene:/, '')

      // Opening beat of scene (setup)
      const headEnd = Math.min(end, start + Math.min(6, dur * 0.25))
      if (headEnd - start > 0.8) {
        segments.push({
          startSec: round(start),
          endSec: round(headEnd),
          speed: 1,
          label: `${id}:head`,
          transition: i === 0 ? 'cut' : 'fade',
        })
      }

      // Payoff: last portion of scene (skip long middle wait)
      if (dur > 14) {
        const payStart = Math.max(headEnd, end - Math.min(14, dur * 0.35))
        // Mid wait: optional sped-up bridge
        if (payStart - headEnd > 8) {
          segments.push({
            startSec: round(headEnd),
            endSec: round(payStart),
            speed: 4,
            label: `${id}:wait`,
            transition: 'cut',
          })
        }
        segments.push({
          startSec: round(payStart),
          endSec: round(end),
          speed: 1,
          label: `${id}:payoff`,
          transition: 'cut',
        })
      } else if (end - headEnd > 0.5) {
        segments.push({
          startSec: round(headEnd),
          endSec: round(end),
          speed: 1,
          label: `${id}:body`,
          transition: 'cut',
        })
      }
    }
  }

  // Reinforce click moments (merge if overlap)
  for (const c of clicks) {
    const a = Math.max(0, c.t - 1.2)
    const b = Math.min(totalSec, c.t + 2.0)
    if (!segments.some((s) => overlaps(s.startSec, s.endSec, a, b))) {
      segments.push({
        startSec: round(a),
        endSec: round(b),
        speed: 1,
        label: `click:${c.label || 'x'}`,
        transition: 'cut',
      })
    }
  }

  segments.sort((a, b) => a.startSec - b.startSec)
  const merged = mergeSegments(segments)
  const trimmed = fitTargetDuration(merged, target)

  // Re-time captions onto highlight timeline
  const captions = retimeCaptions(meta.captions || [], trimmed)

  const plan = {
    source: {
      video: meta.masterVideo,
      meta: opts.metaPath,
      clicks: resolve(meta.outDir || '', 'clicks.json'),
    },
    targetDurationSec: target,
    sourceDurationSec: totalSec,
    segments: trimmed,
    endcard: {
      enabled: true,
      durationSec: 3.5,
      title: meta.title || 'Product demo',
      subtitle: 'Recorded with auto-demo-video',
      cta: process.env.DEMO_CTA || '',
    },
    captions,
  }

  ensureDir(opts.outDir)
  const planPath = resolve(opts.outDir, 'edit-plan.json')
  writeJson(planPath, plan)
  console.log(`[edit] ${trimmed.length} segments → ${planPath}`)
  console.log(
    `[edit] est. duration ~${estDuration(trimmed).toFixed(1)}s (target ${target}s)`,
  )
  return { plan, planPath }
}

function round(n) {
  return Math.round(n * 100) / 100
}

function overlaps(a0, a1, b0, b1) {
  return a0 < b1 && b0 < a1
}

function mergeSegments(segs) {
  if (!segs.length) return []
  const out = [{ ...segs[0] }]
  for (let i = 1; i < segs.length; i++) {
    const prev = out[out.length - 1]
    const cur = segs[i]
    if (cur.startSec <= prev.endSec + 0.35 && cur.speed === prev.speed) {
      prev.endSec = Math.max(prev.endSec, cur.endSec)
      prev.label = `${prev.label}+${cur.label}`
    } else {
      out.push({ ...cur })
    }
  }
  return out
}

function estDuration(segs) {
  return segs.reduce((acc, s) => acc + (s.endSec - s.startSec) / (s.speed || 1), 0)
}

function fitTargetDuration(segs, target) {
  let d = estDuration(segs)
  if (d <= target * 1.05) return segs
  // Drop wait segments first
  let next = segs.filter((s) => !String(s.label).includes(':wait') || s.speed === 1)
  d = estDuration(next)
  if (d <= target * 1.1) return next
  // Increase speed on long segments
  next = next.map((s) => {
    const len = s.endSec - s.startSec
    if (len > 10 && s.speed === 1) return { ...s, speed: 1.5 }
    return s
  })
  // Truncate from end until under target
  while (estDuration(next) > target && next.length > 2) {
    next.pop()
  }
  return next
}

function retimeCaptions(captions, segments) {
  // Map original time → highlight timeline by walking segments
  const out = []
  let cursor = 0
  for (const seg of segments) {
    const rawDur = seg.endSec - seg.startSec
    const outDur = rawDur / (seg.speed || 1)
    for (const c of captions) {
      const mid = (c.startSec + c.endSec) / 2
      if (mid >= seg.startSec && mid <= seg.endSec) {
        const local = (mid - seg.startSec) / (seg.speed || 1)
        out.push({
          startSec: round(cursor + Math.max(0, local - 1.5)),
          endSec: round(cursor + Math.min(outDur, local + 2.5)),
          text: c.text,
          lang: c.lang || 'en',
        })
      }
    }
    cursor += outDur
  }
  return out
}
