/**
 * FocuSee-like polish: post zoom from clicks + window chrome on wallpaper.
 *
 * Input:  recorded session video + clicks.json + meta
 * Output: polished MP4 (rounded app window floating on gradient wallpaper)
 */
import { spawnSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { writeFileSync, existsSync, copyFileSync, readFileSync } from 'node:fs'
import ffmpegPath from 'ffmpeg-static'
import { ensureDir, readJson, writeJson } from '../util/fs.mjs'
import { buildZoomTimeline } from './zoom-timeline.mjs'
import { generateChromeAssets } from './chrome.mjs'

/**
 * @param {{
 *   videoPath: string
 *   clicksPath?: string
 *   metaPath?: string
 *   outDir: string
 *   exportPath?: string
 *   options?: {
 *     zoomScale?: number
 *     contentWidth?: number
 *     contentHeight?: number
 *     outputWidth?: number
 *     outputHeight?: number
 *     skipZoom?: boolean
 *     skipChrome?: boolean
 *   }
 * }} opts
 */
export async function polishRecording(opts) {
  const ffmpeg = ffmpegPath
  if (!ffmpeg || !existsSync(ffmpeg)) {
    throw new Error('ffmpeg-static missing — run npm install')
  }
  if (!existsSync(opts.videoPath)) {
    throw new Error(`video not found: ${opts.videoPath}`)
  }

  const outDir = opts.outDir
  const work = resolve(outDir, 'polish-work')
  ensureDir(work)

  const o = opts.options || {}
  const outW = o.outputWidth ?? 1920
  const outH = o.outputHeight ?? 1080
  const cw = o.contentWidth ?? 1600
  const ch = o.contentHeight ?? 900
  const zoomScale = o.zoomScale ?? 2

  const meta = opts.metaPath && existsSync(opts.metaPath) ? readJson(opts.metaPath) : {}
  const clicks =
    opts.clicksPath && existsSync(opts.clicksPath)
      ? readJson(opts.clicksPath)
      : meta.clicks || []

  const viewport = meta.viewport || { width: 1920, height: 1080 }
  const durationSec = probeDuration(ffmpeg, opts.videoPath)

  // 1) Normalize source → H.264
  const sessionMp4 = resolve(work, 'session.mp4')
  run(ffmpeg, [
    '-y',
    '-i',
    opts.videoPath,
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-an',
    sessionMp4,
  ])

  // 2) Zoom timeline from clicks
  const segments = o.skipZoom
    ? [{ startSec: 0, endSec: durationSec, kind: 'full' }]
    : buildZoomTimeline(clicks, {
        durationSec,
        viewport,
        scale: zoomScale,
      })
  writeJson(resolve(outDir, 'zoom-timeline.json'), { durationSec, segments })

  // 3) Render each segment at content size (cw x ch)
  const parts = []
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    const dur = Math.max(0.05, seg.endSec - seg.startSec)
    const part = resolve(work, `seg-${String(i).padStart(3, '0')}.mp4`)
    if (seg.kind === 'zoom' && seg.x != null && seg.y != null) {
      // Crop a window of size (vw/scale × vh/scale) centered on click, then scale to cw×ch
      const vw = viewport.width
      const vh = viewport.height
      const s = seg.scale || zoomScale
      const cropW = Math.floor(vw / s)
      const cropH = Math.floor(vh / s)
      let cropX = Math.floor(seg.x - cropW / 2)
      let cropY = Math.floor(seg.y - cropH / 2)
      cropX = Math.max(0, Math.min(cropX, vw - cropW))
      cropY = Math.max(0, Math.min(cropY, vh - cropH))
      // Edge bias for left/top (same spirit as capture camera)
      if (seg.x < vw * 0.2) cropX = 0
      if (seg.y < vh * 0.2) cropY = 0
      if (seg.x > vw * 0.8) cropX = vw - cropW
      if (seg.y > vh * 0.8) cropY = vh - cropH

      run(ffmpeg, [
        '-y',
        '-ss',
        String(seg.startSec),
        '-i',
        sessionMp4,
        '-t',
        String(dur),
        '-vf',
        `crop=${cropW}:${cropH}:${cropX}:${cropY},scale=${cw}:${ch}:flags=lanczos`,
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-an',
        part,
      ])
    } else {
      run(ffmpeg, [
        '-y',
        '-ss',
        String(seg.startSec),
        '-i',
        sessionMp4,
        '-t',
        String(dur),
        '-vf',
        `scale=${cw}:${ch}:force_original_aspect_ratio=decrease,pad=${cw}:${ch}:(ow-iw)/2:(oh-ih)/2`,
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-an',
        part,
      ])
    }
    parts.push(part)
  }

  const listFile = resolve(work, 'concat.txt')
  writeFileSync(listFile, parts.map((p) => `file '${p}'`).join('\n') + '\n')
  const zoomedMp4 = resolve(work, 'zoomed-content.mp4')
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
    zoomedMp4,
  ])

  // 4) Chrome assets
  let finalMp4 = zoomedMp4
  if (!o.skipChrome) {
    const chrome = await generateChromeAssets(work, {
      width: outW,
      height: outH,
      contentWidth: cw,
      contentHeight: ch,
    })
    const { padX, padY } = chrome.layout

    // Overlay content on wallpaper with rounded-corner alpha mask
    // Steps: scale content → apply mask alpha → overlay on wallpaper
    const masked = resolve(work, 'masked.mp4')
    // Create RGBA content then mask
    // [content][mask] -> alphamerge is for two gray; use geq or overlay with mask
    // Simpler approach: overlay content at pad, then multiply with rounded rect via maskedmerge
    finalMp4 = resolve(work, 'chrome-composite.mp4')
    // Pin stills to the content duration — bare -loop 1 without -t never ends.
    const dur = probeDuration(ffmpeg, zoomedMp4)
    run(ffmpeg, [
      '-y',
      '-loop',
      '1',
      '-t',
      String(dur),
      '-i',
      chrome.wallpaperPath,
      '-i',
      zoomedMp4,
      '-loop',
      '1',
      '-t',
      String(dur),
      '-i',
      chrome.maskPath,
      '-filter_complex',
      [
        // Place content on full canvas
        `[1:v]format=rgba,pad=${outW}:${outH}:${padX}:${padY}:color=0x00000000[c]`,
        // Mask: white rounded window on black → alpha
        `[2:v]format=gray[m]`,
        `[c][m]alphamerge[ca]`,
        `[0:v]format=rgba[bg]`,
        `[bg][ca]overlay=0:0:shortest=1,format=yuv420p[v]`,
      ].join(';'),
      '-map',
      '[v]',
      '-t',
      String(dur),
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-an',
      finalMp4,
    ])
  }

  const outFinal = resolve(outDir, 'polished.mp4')
  copyFileSync(finalMp4, outFinal)
  if (opts.exportPath) {
    ensureDir(dirname(opts.exportPath))
    copyFileSync(finalMp4, opts.exportPath)
  }

  const result = {
    ok: true,
    polished: outFinal,
    durationSec,
    segments: segments.length,
    clicks: clicks.length,
    zoomScale,
    chrome: !o.skipChrome,
  }
  writeJson(resolve(outDir, 'polish.json'), result)
  console.log(`[polish] ${outFinal} (${segments.length} segments, ${clicks.length} clicks)`)
  return result
}

/**
 * Convenience: polish from a record meta.json
 */
export async function polishFromMeta(metaPath, outDir, options = {}) {
  const meta = readJson(metaPath)
  if (!meta.ok && meta.ok !== undefined) {
    throw new Error('meta.ok=false — refuse to polish failed take')
  }
  const video = meta.masterVideo
  if (!video || !existsSync(video)) {
    throw new Error(`masterVideo missing in meta: ${video}`)
  }
  const clicksPath = resolve(meta.outDir || dirname(metaPath), 'clicks.json')
  return polishRecording({
    videoPath: video,
    clicksPath: existsSync(clicksPath) ? clicksPath : undefined,
    metaPath,
    outDir,
    exportPath: options.exportPath,
    options: options.options || options,
  })
}

function probeDuration(ffmpeg, path) {
  const r = spawnSync(
    ffmpeg,
    ['-i', path],
    { encoding: 'utf8' },
  )
  const err = `${r.stderr || ''}${r.stdout || ''}`
  const m = err.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
  if (!m) return 60
  return (
    Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
  )
}

function run(bin, argv) {
  const short = argv.length > 14 ? [...argv.slice(0, 14), '…'] : argv
  console.log('[ffmpeg]', short.join(' '))
  const r = spawnSync(bin, argv, { stdio: 'inherit' })
  if (r.status !== 0) {
    throw new Error(`ffmpeg failed (${r.status}): ${argv.join(' ')}`)
  }
}
