/**
 * Generate static wallpaper + rounded window chrome assets (Playwright).
 */
import { chromium } from 'playwright'
import { resolve } from 'node:path'
import { ensureDir } from '../util/fs.mjs'

/**
 * @param {string} outDir
 * @param {{
 *   width?: number
 *   height?: number
 *   contentWidth?: number
 *   contentHeight?: number
 *   radius?: number
 *   wallpaper?: 'gradient' | 'solid'
 *   bgColor?: string
 * }} opts
 */
export async function generateChromeAssets(outDir, opts = {}) {
  const W = opts.width ?? 1920
  const H = opts.height ?? 1080
  const cw = opts.contentWidth ?? 1600
  const ch = opts.contentHeight ?? 900
  const radius = opts.radius ?? 16
  const padX = Math.floor((W - cw) / 2)
  const padY = Math.floor((H - ch) / 2)

  ensureDir(outDir)
  const wallpaperPath = resolve(outDir, 'wallpaper.png')
  const maskPath = resolve(outDir, 'window-mask.png')
  const framePath = resolve(outDir, 'window-frame.png')

  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H } })

    // Wallpaper
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"/>
<style>
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;}
body{
  background:
    radial-gradient(ellipse 90% 70% at 20% 30%, #5b8def 0%, transparent 55%),
    radial-gradient(ellipse 80% 60% at 80% 70%, #7c5cbf 0%, transparent 50%),
    radial-gradient(ellipse 70% 50% at 50% 100%, #2a6f97 0%, transparent 45%),
    linear-gradient(145deg, #1a2744 0%, #0c1222 40%, #152238 100%);
}
</style></head><body></body></html>`)
    await page.screenshot({ path: wallpaperPath, type: 'png' })

    // Alpha mask for rounded content (white = visible)
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"/>
<style>
html,body{margin:0;width:${W}px;height:${H}px;background:#000;overflow:hidden;}
.win{
  position:absolute;left:${padX}px;top:${padY}px;width:${cw}px;height:${ch}px;
  background:#fff;border-radius:${radius}px;
}
</style></head><body><div class="win"></div></body></html>`)
    await page.screenshot({ path: maskPath, type: 'png' })

    // Soft shadow frame (transparent center)
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"/>
<style>
html,body{margin:0;width:${W}px;height:${H}px;background:transparent;overflow:hidden;}
.shadow{
  position:absolute;left:${padX}px;top:${padY}px;width:${cw}px;height:${ch}px;
  border-radius:${radius}px;
  box-shadow:
    0 25px 80px rgba(0,0,0,.55),
    0 8px 24px rgba(0,0,0,.35),
    0 0 0 1px rgba(255,255,255,.08);
}
/* punch hole so only shadow ring remains — actually we need shadow outside.
   Use filter on empty box with border */
.frame{
  position:absolute;left:${padX - 2}px;top:${padY - 2}px;
  width:${cw + 4}px;height:${ch + 4}px;
  border-radius:${radius + 2}px;
  box-shadow:
    0 30px 90px rgba(0,0,0,.6),
    0 10px 28px rgba(0,0,0,.4);
  border:1px solid rgba(255,255,255,.1);
  pointer-events:none;
}
.hole{
  position:absolute;left:${padX}px;top:${padY}px;width:${cw}px;height:${ch}px;
  border-radius:${radius}px;background:transparent;
}
</style></head><body>
  <div class="frame"></div>
</body></html>`, { waitUntil: 'load' })
    // Transparent screenshot for shadow is flaky; skip separate frame, bake shadow into wallpaper pass.
    // Keep framePath as optional thin border overlay
    await page.screenshot({ path: framePath, type: 'png', omitBackground: true })
  } finally {
    await browser.close()
  }

  return {
    wallpaperPath,
    maskPath,
    framePath,
    layout: { W, H, cw, ch, padX, padY, radius },
  }
}
