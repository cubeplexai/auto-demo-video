import { test } from 'node:test'
import assert from 'node:assert/strict'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildEditPlan } from '../src/edit/edit.mjs'

const tmp = resolve('runs-test-edit')

test('buildEditPlan compresses long scenes', () => {
  mkdirSync(tmp, { recursive: true })
  const metaPath = resolve(tmp, 'meta.json')
  writeFileSync(
    metaPath,
    JSON.stringify({
      ok: true,
      outDir: tmp,
      masterVideo: resolve(tmp, 'fake.webm'),
      title: 't',
      log: [
        { t: 0, name: 'session' },
        { t: 5, name: 'scene:a' },
        { t: 80, name: 'scene:b' },
        { t: 100, name: 'done' },
      ],
      clicks: [{ t: 70, x: 10, y: 10, label: 'send' }],
      captions: [{ startSec: 5, endSec: 12, text: 'Hello' }],
    }),
  )

  const { plan } = buildEditPlan({
    metaPath,
    outDir: resolve(tmp, 'edit'),
    targetDurationSec: 60,
  })

  assert.ok(plan.segments.length >= 2)
  assert.ok(plan.segments.some((s) => s.speed > 1), 'expected sped-up wait segment')
  const est = plan.segments.reduce(
    (a, s) => a + (s.endSec - s.startSec) / (s.speed || 1),
    0,
  )
  assert.ok(est <= 70, `est duration ${est} should be near target`)

  rmSync(tmp, { recursive: true, force: true })
})
