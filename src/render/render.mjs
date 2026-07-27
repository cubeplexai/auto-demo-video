/**
 * Render edit-plan → final mp4 via ffmpeg-static.
 * Cuts segments, applies speed, optional fade, endcard, burn captions.
 */
import { spawnSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { writeFileSync, existsSync, copyFileSync } from 'node:fs'
import ffmpegPath from 'ffmpeg-static'
import { chromium } from 'playwright'
import { ensureDir, readJson, writeJson } from '../util/fs.mjs'

/**
 * @param {{ planPath: string, outDir: string, exportPath?: string }} opts
 */
export async function renderPlan(opts) {
  const plan = readJson(opts.planPath)
  const ffmpeg = ffmpegPath
  if (!ffmpeg || !existsSync(ffmpeg)) {
    throw new Error('ffmpeg-static missing — run npm install')
  }

  const outDir = opts.outDir
  const work = resolve(outDir, 'compose')
  ensureDir(work)

  const src = plan.source.video
  if (!src || !existsSync(src)) throw new Error(`source video missing: ${src}`)

  // Normalize source to mp4
  const sessionMp4 = resolve(work, 'session.mp4')
  run(ffmpeg, [
    '-y',
    '-i',
    src,
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-an',
    sessionMp4,
  ])

  const parts = []
  let i = 0
  for (const seg of plan.segments) {
    const part = resolve(work, `part-${String(i).padStart(3, '0')}.mp4`)
    const dur = seg.endSec - seg.startSec
    const speed = seg.speed && seg.speed > 0 ? seg.speed : 1
    const args = [
      '-y',
      '-ss',
      String(seg.startSec),
      '-i',
      sessionMp4,
      '-t',
      String(dur),
    ]
    if (speed !== 1) {
      // setpts for video speed
      args.push('-filter:v', `setpts=${(1 / speed).toFixed(4)}*PTS`)
    } else {
      args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p')
    }
    if (speed !== 1) {
      args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p')
    }
    args.push('-an', part)
    run(ffmpeg, args)
    parts.push(part)
    i++
  }

  // Endcard
  if (plan.endcard?.enabled !== false) {
    const endPng = resolve(work, 'endcard.png')
    await renderEndcardPng(endPng, plan.endcard || {})
    const endMp4 = resolve(work, 'endcard.mp4')
    run(ffmpeg, [
      '-y',
      '-loop',
      '1',
      '-i',
      endPng,
      '-t',
      String(plan.endcard?.durationSec || 3.5),
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-vf',
      'scale=1920:1080',
      '-an',
      endMp4,
    ])
    parts.push(endMp4)
  }

  const listFile = resolve(work, 'concat.txt')
  writeFileSync(listFile, parts.map((p) => `file '${p}'`).join('\n') + '\n')
  const concatMp4 = resolve(work, 'highlights.mp4')
  run(ffmpeg, [
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    listFile,
    '-c',
    'copy',
    concatMp4,
  ])

  // Captions
  const srtPath = resolve(outDir, 'final.en.srt')
  writeFileSync(srtPath, toSrt(plan.captions || []))

  const burned = resolve(outDir, 'final.mp4')
  if ((plan.captions || []).length) {
    const srtEsc = srtPath.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'")
    run(ffmpeg, [
      '-y',
      '-i',
      concatMp4,
      '-vf',
      `subtitles='${srtEsc}':force_style='FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,BorderStyle=3,Outline=1,Shadow=0,MarginV=48'`,
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-an',
      burned,
    ])
  } else {
    copyFileSync(concatMp4, burned)
  }

  const clean = resolve(outDir, 'final-clean.mp4')
  copyFileSync(concatMp4, clean)

  if (opts.exportPath) {
    ensureDir(dirname(opts.exportPath))
    copyFileSync(burned, opts.exportPath)
  }

  const result = {
    ok: true,
    final: burned,
    clean,
    srt: srtPath,
    planPath: opts.planPath,
  }
  writeJson(resolve(outDir, 'render.json'), result)
  console.log(`[render] ${burned}`)
  return result
}

function run(bin, argv) {
  console.log('[ffmpeg]', argv.slice(0, 12).join(' '), argv.length > 12 ? '…' : '')
  const r = spawnSync(bin, argv, { stdio: 'inherit' })
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${argv.join(' ')}`)
}

function toSrt(entries) {
  return entries
    .map((e, idx) => {
      return `${idx + 1}\n${fmt(e.startSec)} --> ${fmt(e.endSec)}\n${e.text}\n`
    })
    .join('\n')
}

function fmt(sec) {
  const s = Math.max(0, Number(sec) || 0)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  const whole = Math.floor(r)
  const ms = Math.round((r - whole) * 1000)
  return `${pad(h)}:${pad(m)}:${pad(whole)},${String(ms).padStart(3, '0')}`
}

function pad(n) {
  return String(n).padStart(2, '0')
}

async function renderEndcardPng(outPng, endcard) {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
  const title = endcard.title || 'Demo'
  const subtitle = endcard.subtitle || ''
  const cta = endcard.cta || ''
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"/>
<style>
html,body{margin:0;height:100%;background:#0B1220;color:#F8FAFC;
  font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;}
.wrap{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;}
h1{font-size:56px;margin:0;letter-spacing:-0.03em;}
p{font-size:28px;opacity:.85;margin:0;text-align:center;max-width:1100px;}
.cta{font-size:24px;opacity:.7;}
.accent{color:#5B9DFF;}
</style></head><body><div class="wrap">
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(subtitle)}</p>
  <p class="cta">${escapeHtml(cta)}</p>
</div></body></html>`)
  await page.screenshot({ path: outPng })
  await browser.close()
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
