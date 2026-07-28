import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildZoomTimeline } from '../src/polish/zoom-timeline.mjs'

test('buildZoomTimeline fills full + zoom segments', () => {
  const segs = buildZoomTimeline(
    [
      { t: 5, x: 100, y: 200, label: 'a' },
      { t: 20, x: 900, y: 500, label: 'b' },
    ],
    { durationSec: 30, viewport: { width: 1920, height: 1080 }, scale: 2 },
  )
  assert.ok(segs.length >= 3)
  assert.equal(segs[0].kind, 'full')
  assert.ok(segs.some((s) => s.kind === 'zoom' && s.x === 100))
  assert.ok(segs.at(-1).endSec === 30 || segs.at(-1).endSec === 30.0)
})

test('left-edge click keeps finite crop coords', () => {
  const segs = buildZoomTimeline([{ t: 2, x: 50, y: 300 }], {
    durationSec: 10,
    viewport: { width: 1920, height: 1080 },
  })
  const z = segs.find((s) => s.kind === 'zoom')
  assert.ok(z)
  assert.ok(z.x >= 0 && z.x <= 1920)
})
